// Sauvegarde complète de la base du plan de com, en lecture seule : rien n'est modifié dans Supabase.
//   SUPABASE_ACCESS_TOKEN=… node scripts/sauvegarde.mjs <référence du projet> [dossier]
// Écrit un fichier kplan-<date>-<heure>.json avec toutes les tables de l'appli, la liste des comptes
// (identifiant, adresse, date : jamais les mots de passe) et la liste des migrations déjà faites.
// Le dossier par défaut est HORS du dépôt (~/kedge-plan-com-sauvegardes) : le dépôt est public,
// une sauvegarde contient les vraies données et ne doit jamais y être rangée.
// Pour vérifier une sauvegarde sans rien écrire : node scripts/sauvegarde.mjs --verifier <fichier>
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

if (args[0] === "--verifier") {
  const f = args[1];
  if (!f) { console.error("Usage : node scripts/sauvegarde.mjs --verifier <fichier>"); process.exit(1); }
  const o = JSON.parse(fs.readFileSync(f, "utf8"));
  let ok = true;
  for (const [t, v] of Object.entries(o.tables)) {
    const bon = sha(JSON.stringify(v.lignes)) === v.empreinte && v.lignes.length === v.nombre;
    console.log(`${bon ? "ok  " : "FAUX"} ${t} : ${v.lignes.length} ligne(s)`);
    ok = ok && bon;
  }
  console.log(ok ? `Sauvegarde du ${o.quand} intacte.` : "La sauvegarde est abîmée.");
  process.exit(ok ? 0 : 1);
}

const [ref, dir = path.join(os.homedir(), "kedge-plan-com-sauvegardes")] = args;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !TOKEN) { console.error("Usage : SUPABASE_ACCESS_TOKEN=… node scripts/sauvegarde.mjs <référence du projet> [dossier]"); process.exit(1); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cible = path.resolve(dir);
if (cible === ROOT || cible.startsWith(ROOT + path.sep)) { console.error("Refusé : le dossier de sauvegarde est dans le dépôt, qui est public. Choisis un dossier ailleurs."); process.exit(1); }

const API = `https://api.supabase.com/v1/projects/${ref}`;
async function sql(query) {
  const r = await fetch(API + "/database/query", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Lecture refusée : ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

// Tout se lit en une seule requête : la sauvegarde est cohérente
// même si quelqu'un modifie une fiche pendant qu'elle se fait.
const noms = (await sql("select tablename from pg_tables where schemaname = 'public' order by tablename")).map((r) => r.tablename);
if (!noms.length) throw new Error("Aucune table trouvée : mauvaise référence de projet ?");
const morceaux = noms.map((t) => `'${t}', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public."${t}" x)`);
morceaux.push(`'_comptes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at) order by created_at), '[]'::jsonb) from auth.users)`);
morceaux.push(`'_migrations', (select coalesce(jsonb_agg(to_jsonb(m) order by name), '[]'::jsonb) from kplan_private.migrations m)`);
const [{ tout }] = await sql(`select jsonb_build_object(${morceaux.join(", ")}) as tout`);

const quand = new Date();
const tables = {};
for (const [t, lignes] of Object.entries(tout)) tables[t] = { nombre: lignes.length, empreinte: sha(JSON.stringify(lignes)), lignes };
const out = { appli: "Plan de com KEDGE", projet: ref, quand: quand.toISOString(), tables };

fs.mkdirSync(cible, { recursive: true });
const p2 = (n) => String(n).padStart(2, "0");
const nom = `kplan-${quand.getFullYear()}-${p2(quand.getMonth() + 1)}-${p2(quand.getDate())}-${p2(quand.getHours())}h${p2(quand.getMinutes())}.json`;
const fichier = path.join(cible, nom);
fs.writeFileSync(fichier, JSON.stringify(out, null, 1));

console.log(`Sauvegarde écrite : ${fichier} (${Math.round(fs.statSync(fichier).size / 1024)} Ko)`);
for (const [t, v] of Object.entries(tables)) console.log(`· ${t} : ${v.nombre} ligne(s)`);
console.log("Rien n'a été modifié dans la base. Garde ce fichier hors du dépôt.");
