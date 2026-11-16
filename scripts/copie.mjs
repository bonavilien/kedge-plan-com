// Prépare une NOUVELLE base pour la V2 à partir de l'ancienne, sans rien modifier dans l'ancienne :
//   SUPABASE_ACCESS_TOKEN=… node scripts/copie.mjs <référence de l'ancienne base> <référence de la nouvelle>
// Étapes : 1. la nouvelle base reçoit le schéma de la V1 (migrations 0001 à 0018) ;
//          2. tout le contenu de l'ancienne y est recopié tel quel, comptes et mots de passe compris,
//             en une seule fois : soit tout est copié, soit rien ;
//          3. les migrations de la V2 (0019 et suivantes) passent par-dessus, comme elles l'auraient fait sur l'ancienne.
// L'ancienne base n'est que lue. Les abonnements aux notifications ne sont pas copiés : ils sont liés
// aux clés de l'ancienne base, chacun réactive les siennes dans Réglages.
// Ensuite : node scripts/setup.mjs <référence de la nouvelle> <adresse du site>  (notifications, connexion, config.js).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const [ancienne, nouvelle] = process.argv.slice(2);
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ancienne || !nouvelle || !TOKEN) { console.error("Usage : SUPABASE_ACCESS_TOKEN=… node scripts/copie.mjs <ancienne base> <nouvelle base>"); process.exit(1); }
if (ancienne === nouvelle) { console.error("Refusé : l'ancienne et la nouvelle base sont la même."); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const say = (m) => console.log(`· ${m}`);
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const DERNIERE_V1 = "0018";
const SANS = ["push_subs"]; // jamais copiées

async function sql(ref, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Base ${ref} : ${r.status} ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch (e) { return []; }
}
const un = async (ref, q) => Object.values((await sql(ref, q))[0])[0];

// ---------- 0. garde-fous : on ne copie que vers une base vide ----------
if (!(await un(ancienne, "select to_regclass('public.items') is not null as ok"))) throw new Error("L'ancienne base ne contient pas le plan de com : mauvaise référence ?");
const dejaTable = await un(nouvelle, "select to_regclass('public.items') is not null as ok");
const deja = dejaTable ? await un(nouvelle, "select (select count(*) from public.items) + (select count(*) from public.profiles) as n") : 0;
const fichiers = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
await sql(nouvelle, "create schema if not exists kplan_private; create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());");
async function migrer(garder) {
  const faites = new Set((await sql(nouvelle, "select name from kplan_private.migrations")).map((r) => r.name));
  for (const f of fichiers.filter(garder)) {
    if (faites.has(f)) continue;
    await sql(nouvelle, fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8") + `\ninsert into kplan_private.migrations (name) values (${lit(f)});`);
    say(`Nouvelle base, migration ${f} : faite`);
  }
}

if (Number(deja) > 0) {
  say("La nouvelle base contient déjà des données : la copie n'est pas refaite.");
} else {
  // ---------- 1. schéma de la V1 ----------
  await migrer((f) => f.slice(0, 4) <= DERNIERE_V1);

  // ---------- 2. lecture de l'ancienne base, en une seule requête ----------
  const tables = (await sql(ancienne, "select tablename from pg_tables where schemaname = 'public' order by tablename")).map((r) => r.tablename).filter((t) => !SANS.includes(t));
  const auth = ["users", "identities"];
  const presentes = [];
  for (const t of auth) if (await un(ancienne, `select to_regclass('auth.${t}') is not null as ok`)) presentes.push(t);
  const morceaux = [...tables.map((t) => ["public", t]), ...presentes.map((t) => ["auth", t])].map(([s, t]) => `'${s}.${t}', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ${s}."${t}" x)`);
  const tout = await un(ancienne, `select jsonb_build_object(${morceaux.join(", ")}) as tout`);
  say(`Ancienne base lue : ${Object.entries(tout).map(([t, l]) => `${t.replace("public.", "")} ${l.length}`).join(", ")}`);

  // ---------- 3. écriture dans la nouvelle, tout ou rien ----------
  // Les déclencheurs sont coupés le temps de la copie : aucune notification, aucune ligne d'historique en plus.
  const tag = "$k" + crypto.randomBytes(6).toString("hex") + "$";
  const json = JSON.stringify(tout);
  if (json.includes(tag)) throw new Error("Réessaie : marqueur déjà présent dans les données.");
  await sql(nouvelle, `begin;
set local session_replication_role = replica;
create temp table _copie on commit drop as select key as t, value as j from jsonb_each(${tag}${json}${tag}::jsonb);
do $do$
declare r record; cols text; seq text; c record;
begin
  -- les comptes d'abord, puis les tables de l'appli
  for r in select t, j from _copie order by (t not like 'auth.%'), t loop
    if to_regclass(r.t) is null then raise exception 'Table % absente de la nouvelle base', r.t; end if;
    if r.t like 'public.%' then execute format('delete from %s', r.t); end if;
    if jsonb_array_length(r.j) = 0 then continue; end if;
    select string_agg(quote_ident(a.attname), ', ') into cols from pg_attribute a
      where a.attrelid = r.t::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and r.j -> 0 ? a.attname;
    execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_recordset(null::%s, $1)', r.t, cols, cols, r.t) using r.j;
    -- les compteurs repartent après le plus grand numéro copié
    for c in select a.attname from pg_attribute a where a.attrelid = r.t::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence(r.t, c.attname);
      if seq is not null then execute format('select setval(%L, greatest((select max(%I) from %s), 1))', seq, c.attname, r.t); end if;
    end loop;
  end loop;
end $do$;
commit;`);
  say("Contenu recopié dans la nouvelle base");

  // ---------- 4. vérification : mêmes nombres de lignes des deux côtés ----------
  const compte = (noms) => `select jsonb_build_object(${noms.map((t) => `'${t}', (select count(*) from ${t})`).join(", ")}) as n`;
  const noms = Object.keys(tout);
  const a = await un(ancienne, compte(noms)), b = await un(nouvelle, compte(noms));
  const ecarts = noms.filter((t) => a[t] !== b[t]);
  if (ecarts.length) throw new Error(`Écart après copie : ${ecarts.map((t) => `${t} ${a[t]} contre ${b[t]}`).join(", ")}`);
  say("Vérifié : mêmes nombres de lignes dans les deux bases");
}

// ---------- 5. migrations de la V2 ----------
await migrer(() => true);
say("Migrations de la V2 passées sur la nouvelle base");
console.log(`\nTerminé. L'ancienne base n'a pas été modifiée.\nReste à lancer : node scripts/setup.mjs ${nouvelle} <adresse du site>`);
