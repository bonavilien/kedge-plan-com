// Fabrique supabase/installation.sql : toute la base en un seul collage, pour une nouvelle copie de l'appli.
// On le colle dans Supabase (SQL Editor, New query, Run) sur un projet neuf. Voir DEPLOYER.md, étape 3.
// Chaque script de supabase/migrations y est repris dans l'ordre et noté comme fait : le bouton « Mettre à jour »
// n'appliquera ensuite que les scripts plus récents.
// Usage : node scripts/installation.mjs            (écrit le fichier)
//         node scripts/installation.mjs --verifier (échoue si le fichier n'est pas à jour)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(ROOT, "supabase/migrations");
const out = path.join(ROOT, "supabase/installation.sql");
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

let sql = `-- =====================================================================
-- Plan de com : installation complète de la base, en une fois.
-- Sur un projet Supabase NEUF : SQL Editor, New query, coller tout ce fichier, Run.
-- Supabase peut prévenir d'opérations « destructives » : c'est normal, confirmer.
-- Fabriqué par scripts/installation.mjs à partir de supabase/migrations (${files.length} scripts, dernier : ${files[files.length - 1]}).
-- Ne pas le modifier à la main.
-- =====================================================================
begin;
create schema if not exists kplan_private;
create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());
do $$ begin
  if exists (select 1 from kplan_private.migrations) then
    raise exception 'Cette base est déjà installée : pour la mettre à jour, utilise le bouton « Mettre à jour » de l''appli (Réglages > Version).';
  end if;
end $$;
`;
for (const f of files) {
  sql += `\n-- ---------------------------------------------------------------------\n-- ${f}\n-- ---------------------------------------------------------------------\n`;
  sql += fs.readFileSync(path.join(dir, f), "utf8").replace(/\s+$/, "") + "\n";
  sql += `insert into kplan_private.migrations (name) values (${lit(f)});\n`;
}
sql += `\ncommit;\n-- Terminé. Étape suivante du guide : créer ton compte (Authentication > Add user). Le premier compte devient pilote.\n`;

if (process.argv.includes("--verifier")) {
  const now = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (now !== sql) { console.error("supabase/installation.sql n'est pas à jour : lance node scripts/installation.mjs"); process.exit(1); }
  console.log(`supabase/installation.sql à jour (${files.length} scripts).`);
} else {
  fs.writeFileSync(out, sql);
  console.log(`supabase/installation.sql écrit : ${files.length} scripts, ${Math.round(sql.length / 1024)} Ko.`);
}
