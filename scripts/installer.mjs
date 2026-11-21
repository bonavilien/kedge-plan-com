// Installation d'une copie en un clic. Ce robot tourne sur les serveurs de GitHub, dans la copie (fork), lancé par
// .github/workflows/installer.yml. La page site/installer.html a d'abord créé la copie, rangé les clés dans le
// secret chiffré KPLAN_INSTALLATION, puis lancé le robot. Il crée la base Supabase, l'installe, crée le premier
// compte (pilote), installe les fonctions (notifications, Mettre à jour, Asana/Trello), branche le site, puis
// efface le secret. Chaque étape se relance sans risque : ce qui est déjà fait est sauté.
//   node scripts/installer.mjs <base|tables|connexion|compte|fonctions|site|ranger>
// Le secret KPLAN_INSTALLATION est un JSON : { supabase, github, email, mdp, prenom }.
// Pour les tests : KPLAN_API_SUPABASE, KPLAN_API_GITHUB, KPLAN_HOTE (https://{ref}.supabase.co) remplacent les adresses,
// KPLAN_PAUSE raccourcit les attentes.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const etape = process.argv[2];
const env = (k) => (process.env[k] || "").trim();
const SB = env("KPLAN_API_SUPABASE") || "https://api.supabase.com";
const GH = env("KPLAN_API_GITHUB") || "https://api.github.com";
const hote = (ref) => (env("KPLAN_HOTE") || "https://{ref}.supabase.co").replace("{ref}", ref);
const REPO = env("GITHUB_REPOSITORY");
const [OWNER, NOM_DEPOT] = REPO.split("/");
const SITE = `https://${(OWNER || "").toLowerCase()}.github.io/${NOM_DEPOT}/`;
const ETAT = path.join(env("RUNNER_TEMP") || ROOT, "kplan-installation.json");
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const say = (m) => console.log(`· ${m}`);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms * (Number(env("KPLAN_PAUSE")) || 1)));

/* les erreurs deviennent des annotations GitHub : la page les lit et les affiche telles quelles */
const TITRES = { base: "Créer la base", tables: "Installer les tables", connexion: "Régler la connexion", compte: "Créer ton compte", fonctions: "Fonctions", site: "Brancher le site", ranger: "Ranger les clés" };
const echec = (msg) => { console.log(`::error title=${TITRES[etape] || "Installation"}::${msg.replace(/\r?\n/g, " ")}`); process.exit(1); };
const alerte = (msg) => console.log(`::warning title=${TITRES[etape] || "Installation"}::${msg.replace(/\r?\n/g, " ")}`);

let I = {};
try { I = JSON.parse(process.env.KPLAN_INSTALLATION || "{}"); } catch (e) { echec("Le secret KPLAN_INSTALLATION est illisible. Relance l'installation depuis la page Installer."); }
for (const k of ["supabase", "github", "mdp"]) if (I[k]) console.log(`::add-mask::${I[k]}`);
if (!REPO) echec("GITHUB_REPOSITORY manque : ce robot tourne dans GitHub Actions.");
if (etape !== "ranger" && (!I.supabase || !I.github)) echec("Les clés manquent (secret KPLAN_INSTALLATION). Relance l'installation depuis la page Installer.");

const lireEtat = () => { try { return JSON.parse(fs.readFileSync(ETAT, "utf8")); } catch (e) { return {}; } };
const ecrireEtat = (o) => fs.writeFileSync(ETAT, JSON.stringify({ ...lireEtat(), ...o }));
const sortie = (k, v) => { if (env("GITHUB_OUTPUT")) fs.appendFileSync(env("GITHUB_OUTPUT"), `${k}=${v}\n`); };

async function appel(base, jeton, method, p, body, extra = {}) {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = { authorization: `Bearer ${jeton}`, ...(body && !form ? { "content-type": "application/json" } : {}), ...extra };
  let r;
  for (let essai = 0; ; essai++) {
    try { r = await fetch(base + p, { method, headers, body: body && !form ? JSON.stringify(body) : body }); }
    catch (e) { if (essai < 4) { await attendre(3000 * (essai + 1)); continue; } throw new Error(`${method} ${p} : ${e.message}`); }
    if ((r.status === 429 || r.status >= 502) && essai < 4) { await attendre(5000 * (essai + 1)); continue; }
    break;
  }
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
  if (!r.ok) { const e = new Error(`${method} ${p} : ${r.status} ${t.slice(0, 300)}`); e.status = r.status; e.texte = t; throw e; }
  return j;
}
const sb = async (method, p, body) => {
  try { return await appel(SB, I.supabase, method, p, body); }
  catch (e) { if (e.status === 401) echec("Supabase refuse ta clé. Vérifie qu'elle commence par sbp_ et qu'elle n'a pas été supprimée, puis relance."); throw e; }
};
const gh = async (method, p, body) => {
  try { return await appel(GH, I.github, method, p, body, { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }); }
  catch (e) { if (e.status === 401) echec("GitHub refuse ta clé. Elle a peut-être expiré : crée-en une nouvelle depuis la page Installer."); throw e; }
};

/* ---------- le projet Supabase : retrouvé par son nom (celui de la copie), sinon créé ---------- */
async function projet() {
  const e = lireEtat(); if (e.ref) return e.ref;
  const orgs = await sb("GET", "/v1/organizations");
  if (!orgs || !orgs.length) echec("Ton compte Supabase n'a pas encore d'organisation. Sur supabase.com, crée-en une (gratuite), puis relance.");
  const slugs = orgs.map((o) => o.slug || o.id);
  const tous = await sb("GET", "/v1/projects");
  const deja = (tous || []).find((p) => p.name === NOM_DEPOT && slugs.includes(p.organization_slug || p.organization_id));
  if (deja) { ecrireEtat({ ref: deja.ref || deja.id }); return deja.ref || deja.id; }
  return null;
}
async function sql(ref, query) { return sb("POST", `/v1/projects/${ref}/database/query`, { query }); }

const etapes = {
  async base() {
    let ref = await projet();
    if (ref) say(`Base déjà créée (${ref})`);
    else {
      const orgs = await sb("GET", "/v1/organizations"), org = orgs[0].slug || orgs[0].id;
      const db_pass = crypto.randomBytes(24).toString("base64url");
      const corps = { name: NOM_DEPOT, organization_slug: org, db_pass };
      let p;
      try { p = await sb("POST", "/v1/projects", { ...corps, region_selection: { type: "specific", code: "eu-west-3" } }); }
      catch (e) {
        if (/limit|maximum|free/i.test(e.texte || "")) echec("Ton compte Supabase a déjà ses 2 projets gratuits. Mets-en un en pause (ou supprime-le) sur supabase.com, puis relance.");
        if (e.status !== 400 && e.status !== 422) throw e;
        try { p = await sb("POST", "/v1/projects", { ...corps, region: "eu-west-3" }); }
        catch (e2) { if (/limit|maximum|free/i.test(e2.texte || "")) echec("Ton compte Supabase a déjà ses 2 projets gratuits. Mets-en un en pause (ou supprime-le) sur supabase.com, puis relance."); throw e2; }
      }
      ref = p.ref || p.id; ecrireEtat({ ref });
      say(`Base créée à Paris (${ref})`);
    }
    // une base neuve met une à trois minutes à démarrer
    const fin = Date.now() + 10 * 60e3;
    for (;;) {
      const p = await sb("GET", `/v1/projects/${ref}`);
      if (p.status === "ACTIVE_HEALTHY") break;
      if (/INACTIVE|PAUS/.test(p.status)) echec("La base est en pause sur Supabase. Clique sur Restore project sur supabase.com, puis relance.");
      if (/FAILED|REMOVED/.test(p.status)) echec(`Supabase n'a pas pu démarrer la base (${p.status}). Supprime le projet ${NOM_DEPOT} sur supabase.com, puis relance.`);
      if (Date.now() > fin) echec("La base met trop de temps à démarrer. Relance dans quelques minutes : rien ne sera refait en double.");
      say(`La base démarre (${p.status})…`); await attendre(10e3);
    }
    for (let i = 0; ; i++) { try { await sql(ref, "select 1"); break; } catch (e) { if (i > 30) throw e; await attendre(5000); } }
    say("Base prête");
  },

  async tables() {
    const ref = await projet();
    await sql(ref, "create schema if not exists kplan_private; create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());");
    const faites = new Set((await sql(ref, "select name from kplan_private.migrations")).map((r) => r.name));
    const fichiers = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
    for (const f of fichiers) {
      if (faites.has(f)) continue;
      try { await sql(ref, fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8") + `\ninsert into kplan_private.migrations (name) values (${lit(f)}) on conflict do nothing;`); }
      catch (e) { echec(`Le script ${f} n'est pas passé : ${(e.texte || e.message).slice(0, 200)}. Envoie ce message à l'auteur de l'appli.`); }
      say(`${f} : fait`);
    }
    say(`${fichiers.length} scripts en place`);
  },

  async connexion() {
    const ref = await projet();
    await sb("PATCH", `/v1/projects/${ref}/config/auth`, { disable_signup: true, password_min_length: 8, site_url: SITE, uri_allow_list: SITE });
    say(`Connexion : pas d'inscription libre, adresse du site ${SITE}`);
  },

  async compte() {
    const ref = await projet();
    const cles = async () => (await sb("GET", `/v1/projects/${ref}/api-keys?reveal=true`)) || [];
    let k = await cles();
    for (const type of ["publishable", "secret"]) {
      if (k.some((x) => x.type === type && x.api_key)) continue;
      if (type === "publishable" && k.some((x) => x.name === "anon" && x.api_key)) continue;
      if (type === "secret" && k.some((x) => x.name === "service_role" && x.api_key)) continue;
      await sb("POST", `/v1/projects/${ref}/api-keys`, { type, name: "default", ...(type === "secret" ? { secret_jwt_template: { role: "service_role" } } : {}) });
      k = await cles();
    }
    const pub = (k.find((x) => x.type === "publishable" && x.api_key) || k.find((x) => x.name === "anon")).api_key;
    const sec = (k.find((x) => x.type === "secret" && x.api_key) || k.find((x) => x.name === "service_role")).api_key;
    console.log(`::add-mask::${sec}`);
    ecrireEtat({ pub });
    if (!I.email || !I.mdp) echec("L'adresse ou le mot de passe du premier compte manque. Relance l'installation depuis la page Installer.");
    // une clé secrète « sb_secret_ » va dans l'en-tête apikey ; l'ancienne clé service_role aussi dans Authorization
    const H = { "content-type": "application/json", apikey: sec, ...(/^eyJ/.test(sec) ? { authorization: `Bearer ${sec}` } : {}) };
    const auth = (method, p, body) => fetch(`${hote(ref)}/auth/v1${p}`, { method, headers: H, body: JSON.stringify(body) });
    let r;
    for (let i = 0; ; i++) {
      try { r = await auth("POST", "/admin/users", { email: I.email, password: I.mdp, email_confirm: true }); } catch (e) { r = { status: 0, text: async () => e.message }; }
      if ((r.status === 0 || r.status >= 500) && i < 20) { await attendre(6000); continue; }
      break;
    }
    if (!r.ok) {
      const t = await r.text();
      if (!/already|exists|registered/i.test(t)) echec(`Le compte n'a pas pu être créé : ${t.slice(0, 200)}`);
      // déjà créé à un premier essai : on remet le mot de passe choisi cette fois
      const [u] = await sql(ref, `select id from auth.users where lower(email) = lower(${lit(I.email)})`);
      if (u) await auth("PUT", `/admin/users/${u.id}`, { password: I.mdp });
      say("Compte déjà créé : mot de passe remis à jour");
    } else say(`Compte créé : ${I.email}`);
    if (I.prenom) await sql(ref, `update public.profiles set nom = ${lit(I.prenom.slice(0, 60))} where id = (select id from auth.users where lower(email) = lower(${lit(I.email)}))`);
    const [p] = await sql(ref, `select chef from public.profiles where id = (select id from auth.users where lower(email) = lower(${lit(I.email)}))`);
    say(p && p.chef ? "C'est le premier compte : il est pilote" : "Compte prêt");
  },

  async fonctions() {
    const ref = await projet();
    // notifications sur téléphone : clés VAPID, secret partagé avec la base (même chose que scripts/setup.mjs)
    const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
    const vapid = ecdh.getPublicKey().toString("base64url"), cron = crypto.randomBytes(32).toString("hex");
    await sb("POST", `/v1/projects/${ref}/secrets`, [
      { name: "VAPID_PUBLIC_KEY", value: vapid }, { name: "VAPID_PRIVATE_KEY", value: ecdh.getPrivateKey().toString("base64url") },
      { name: "CRON_SECRET", value: cron },
      // le bouton Mettre à jour : la clé GitHub et le nom de la copie
      { name: "GITHUB_TOKEN", value: I.github }, { name: "GITHUB_REPO", value: REPO },
    ]);
    ecrireEtat({ vapid });
    for (const [name, value] of [["kplan_push_url", `${hote(ref)}/functions/v1/push`], ["kplan_cron_secret", cron]]) {
      await sql(ref, `do $$ declare i uuid; begin
        select id into i from vault.secrets where name = ${lit(name)};
        if i is null then perform vault.create_secret(${lit(value)}, ${lit(name)}); else perform vault.update_secret(i, ${lit(value)}); end if;
      end $$;`);
    }
    say("Secrets rangés (notifications, bouton Mettre à jour)");
    const manque = [];
    for (const nom of ["push", "mise-a-jour", "export"]) {
      try {
        const form = new FormData();
        form.append("metadata", JSON.stringify({ name: nom, entrypoint_path: "index.ts", verify_jwt: false }));
        form.append("file", new Blob([fs.readFileSync(path.join(ROOT, "supabase/functions", nom, "index.ts"))], { type: "application/typescript" }), "index.ts");
        await sb("POST", `/v1/projects/${ref}/functions/deploy?slug=${nom}`, form);
        say(`Fonction ${nom} installée`);
      } catch (e) { manque.push(nom); console.log(`  ${nom} : ${e.message}`); }
    }
    // l'appli marche sans elles : on prévient sans bloquer
    if (manque.length) alerte(`Fonction${manque.length > 1 ? "s" : ""} pas installée${manque.length > 1 ? "s" : ""} : ${manque.join(", ")}. L'appli marche ; pour les ajouter à la main, voir DEPLOYER.md (étapes 6 et 7).`);
  },

  async site() {
    const ref = await projet(), e = lireEtat();
    let pub = e.pub;
    if (!pub) { const k = (await sb("GET", `/v1/projects/${ref}/api-keys?reveal=true`)) || []; pub = (k.find((x) => x.type === "publishable" && x.api_key) || k.find((x) => x.name === "anon") || {}).api_key; }
    if (!pub) echec("La clé publique de la base est introuvable. Relance l'installation.");
    const url = hote(ref);
    const vars = { KPLAN_SUPABASE_URL: url, KPLAN_SUPABASE_KEY: pub, ...(e.vapid ? { KPLAN_VAPID: e.vapid } : {}) };
    for (const [name, value] of Object.entries(vars)) {
      try { await gh("PATCH", `/repos/${REPO}/actions/variables/${name}`, { name, value }); }
      catch (err) { if (err.status !== 404) throw err; await gh("POST", `/repos/${REPO}/actions/variables`, { name, value }); }
    }
    sortie("url", url); sortie("key", pub); sortie("vapid", e.vapid || "");
    say(`Site branché sur ${url}`);
  },

  async ranger() {
    // la clé Supabase donne accès à tout le compte : elle ne reste pas dans GitHub
    if (!I.github) return say("Rien à ranger");
    try { await gh("DELETE", `/repos/${REPO}/actions/secrets/KPLAN_INSTALLATION`); say("Clés effacées de GitHub"); }
    catch (e) { if (e.status !== 404) alerte("Le secret KPLAN_INSTALLATION n'a pas pu être effacé : supprime-le dans Settings > Secrets and variables > Actions."); }
    say(`Ton appli : ${SITE}`);
  },
};

if (!etapes[etape]) echec(`Étape inconnue : ${etape}`);
try { await etapes[etape](); }
catch (e) { echec(`Erreur inattendue : ${(e.message || String(e)).slice(0, 300)}`); }
