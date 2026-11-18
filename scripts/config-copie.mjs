// Réglages d'une copie de l'appli, écrits au moment de la publication (GitHub Actions, .github/workflows/pages.yml).
// Une copie (fork) ne modifie AUCUN fichier du dépôt : ses réglages vivent dans les variables GitHub du dépôt
// (Settings > Secrets and variables > Actions > Variables). Ainsi « Mettre à jour » récupère le code d'origine
// sans jamais tomber sur un conflit.
//   KPLAN_SUPABASE_URL   adresse de la base   https://xxxx.supabase.co           (obligatoire)
//   KPLAN_SUPABASE_KEY   clé publique          sb_publishable_… ou anon            (obligatoire)
//   KPLAN_NOM            nom affiché           « Ville de Lyon »                   (facultatif)
//   KPLAN_LOGO           adresse d'un logo blanc, PNG ou SVG                       (facultatif)
//   KPLAN_VISITEUR       adresse du compte visiteur                                (facultatif)
//   KPLAN_VAPID          clé publique des notifications sur téléphone              (facultatif)
// Sans KPLAN_SUPABASE_URL, rien n'est touché : c'est le dépôt d'origine, avec son site/config.js.
// Usage : node scripts/config-copie.mjs [dossier du site]   (les valeurs viennent de l'environnement)
import fs from "fs";
import path from "path";

const dir = process.argv[2] || "site";
const env = (k) => (process.env[k] || "").trim();
const url = env("KPLAN_SUPABASE_URL").replace(/\/+$/, ""), key = env("KPLAN_SUPABASE_KEY");
const origine = env("KPLAN_ORIGINE"), depot = env("GITHUB_REPOSITORY");

if (!url) {
  if (origine && depot && depot.toLowerCase() !== origine.toLowerCase()) {
    console.error(`::error::Cette copie n'est pas encore réglée. Ajoute les variables KPLAN_SUPABASE_URL et KPLAN_SUPABASE_KEY (Settings > Secrets and variables > Actions > Variables), puis relance la publication. Voir DEPLOYER.md, étape 4.`);
    process.exit(1);
  }
  console.log("Dépôt d'origine : site/config.js reste tel quel.");
  process.exit(0);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) { console.error(`::error::KPLAN_SUPABASE_URL doit ressembler à https://abcdefgh.supabase.co (reçu : ${url})`); process.exit(1); }
if (!key) { console.error("::error::Il manque la variable KPLAN_SUPABASE_KEY (la clé publique, « publishable » ou « anon »)."); process.exit(1); }
if (/^sb_secret_|service_role/i.test(key) || (/^eyJ/.test(key) && /service_role/.test(Buffer.from(key.split(".")[1] || "", "base64").toString()))) {
  console.error("::error::KPLAN_SUPABASE_KEY est la clé SECRÈTE. Mets la clé publique (« publishable » ou « anon ») : la secrète ne doit jamais être publiée.");
  process.exit(1);
}

const nom = env("KPLAN_NOM"), logo = env("KPLAN_LOGO");
const cfg = {
  brancher: true,
  supabaseUrl: url,
  supabaseKey: key,
  vapidPublicKey: env("KPLAN_VAPID"),
  visiteur: env("KPLAN_VISITEUR"),
  marque: { nom, logo },
  /* une copie : Réglages > Version propose « Mettre à jour » aux pilotes */
  copie: true,
};
fs.writeFileSync(path.join(dir, "config.js"), `// Écrit à la publication par scripts/config-copie.mjs, à partir des variables GitHub de ce dépôt. Rien de secret ici.\nwindow.KPLAN_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`);

/* le nom de l'appli installée sur téléphone et l'onglet du navigateur */
const titre = nom ? `Plan de com ${nom}` : "Plan de com";
const mf = path.join(dir, "manifest.webmanifest");
const m = JSON.parse(fs.readFileSync(mf, "utf8")); m.name = titre; fs.writeFileSync(mf, JSON.stringify(m, null, 2) + "\n");
const ix = path.join(dir, "index.html");
fs.writeFileSync(ix, fs.readFileSync(ix, "utf8").replace(/<title>[^<]*<\/title>/, `<title>${titre.replace(/[<&]/g, "")}</title>`));
console.log(`Copie réglée : ${url}${nom ? `, « ${nom} »` : ""}${logo ? ", logo personnalisé" : ""}.`);
