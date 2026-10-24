// Installe ou met à jour la base Supabase du plan de com, sans rien à copier-coller :
//   SUPABASE_ACCESS_TOKEN=… node scripts/setup.mjs <référence du projet> [adresse du site]
// Le jeton personnel (Supabase > Account > Access Tokens) reste dans l'environnement, jamais dans le dépôt.
// Étapes : migrations, secrets de la fonction push (clés VAPID, secret partagé), coffre de la base,
// réglages de connexion (pas d'inscription libre), déploiement de la fonction, puis site/config.js.
// On peut le relancer : ce qui est déjà fait est sauté.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const [ref, siteUrl = ""] = process.argv.slice(2);
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !TOKEN) { console.error("Usage : SUPABASE_ACCESS_TOKEN=… node scripts/setup.mjs <référence du projet> [adresse du site]"); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = `https://api.supabase.com/v1/projects/${ref}`;
const say = (m) => console.log(`· ${m}`);

async function api(method, p, body, headers = { "content-type": "application/json" }) {
  const r = await fetch(API + p, { method, headers: { authorization: `Bearer ${TOKEN}`, ...headers }, body: body && headers["content-type"] === "application/json" ? JSON.stringify(body) : body });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} : ${r.status} ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch (e) { return t; }
}
const sql = (query) => api("POST", "/database/query", { query });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- 1. projet ----------
const proj = await api("GET", "");
say(`Projet ${proj.name} (${proj.region}), état ${proj.status}`);
if (!/^eu-/.test(proj.region)) console.warn("  ATTENTION : le projet n'est pas hébergé en Europe.");

// ---------- 2. migrations, chacune une seule fois ----------
await sql(`create schema if not exists kplan_private; create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());`);
const done = new Set((await sql("select name from kplan_private.migrations")).map((r) => r.name));
for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) {
  if (done.has(f)) { say(`Migration ${f} : déjà faite`); continue; }
  await sql(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8") + `\ninsert into kplan_private.migrations (name) values (${lit(f)});`);
  say(`Migration ${f} : faite`);
}

// ---------- 3. clés des notifications et secret partagé ----------
const cfgPath = path.join(ROOT, "site/config.js");
let cfg = fs.readFileSync(cfgPath, "utf8");
const have = new Set((await api("GET", "/secrets")).map((s) => s.name));
let vapidPublic = (cfg.match(/vapidPublicKey: "([^"]*)"/) || [])[1] || "";
const secrets = [];
if (!vapidPublic || !have.has("VAPID_PRIVATE_KEY")) {
  // paire de clés P-256 au format attendu par les navigateurs (point public non compressé, en base64url)
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  vapidPublic = ecdh.getPublicKey().toString("base64url");
  secrets.push({ name: "VAPID_PUBLIC_KEY", value: vapidPublic }, { name: "VAPID_PRIVATE_KEY", value: ecdh.getPrivateKey().toString("base64url") });
  say("Clés VAPID créées");
}
const cronSecret = crypto.randomBytes(32).toString("hex");
secrets.push({ name: "CRON_SECRET", value: cronSecret });
await api("POST", "/secrets", secrets);
say("Secrets de la fonction push enregistrés");
const pushUrl = `https://${ref}.supabase.co/functions/v1/push`;
for (const [name, value] of [["kplan_push_url", pushUrl], ["kplan_cron_secret", cronSecret]]) {
  await sql(`do $$ declare i uuid; begin
    select id into i from vault.secrets where name = ${lit(name)};
    if i is null then perform vault.create_secret(${lit(value)}, ${lit(name)}); else perform vault.update_secret(i, ${lit(value)}); end if;
  end $$;`);
}
say("Coffre de la base à jour (adresse de la fonction, secret partagé)");

// ---------- 4. connexion : comptes créés par le chef de projet, pas d'inscription libre ----------
await api("PATCH", "/config/auth", { disable_signup: true, password_min_length: 8, ...(siteUrl ? { site_url: siteUrl, uri_allow_list: siteUrl } : {}) });
say("Connexion : inscription libre fermée, mot de passe de 8 caractères minimum");

// ---------- 5. fonction push ----------
try {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ name: "push", entrypoint_path: "index.ts", verify_jwt: false }));
  form.append("file", new Blob([fs.readFileSync(path.join(ROOT, "supabase/functions/push/index.ts"))], { type: "application/typescript" }), "index.ts");
  await api("POST", "/functions/deploy?slug=push", form, {});
  say("Fonction push déployée");
} catch (e) {
  console.warn(`  Fonction push pas déployée par l'API (${e.message}).\n  Autre chemin : SUPABASE_ACCESS_TOKEN=… npx supabase functions deploy push --project-ref ${ref} --no-verify-jwt --use-api`);
}

// ---------- 6. config.js : adresse et clé publique de la base ----------
const keys = await api("GET", "/api-keys?reveal=true");
const pub = keys.find((k) => k.type === "publishable") || keys.find((k) => k.name === "anon");
cfg = cfg.replace(/supabaseUrl: "[^"]*"/, `supabaseUrl: "https://${ref}.supabase.co"`)
  .replace(/supabaseKey: "[^"]*"/, `supabaseKey: "${pub.api_key}"`)
  .replace(/vapidPublicKey: "[^"]*"/, `vapidPublicKey: "${vapidPublic}"`);
fs.writeFileSync(cfgPath, cfg);
say("site/config.js rempli (clé publique seulement)");
console.log("\nTerminé. Reste à créer les comptes : Supabase > Authentication > Add user (cocher Auto Confirm),\npuis régler chaque personne dans l'appli : Profil > Équipe.");
