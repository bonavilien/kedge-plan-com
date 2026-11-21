// Le robot d'installation (scripts/installer.mjs) de bout en bout, contre un faux Supabase et un faux GitHub,
// avec une vraie base Postgres locale : base créée à Paris, tables, connexion, premier compte pilote, secrets,
// fonctions, variables du site, config.js de la copie, secret effacé ; puis une relance complète (rien en double)
// et les messages d'erreur qu'une personne peut lire. Usage : node test/installer/robot.mjs   (Postgres local : voir PSQL)
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { demarrer, baseNeuve, requete } from "./faux-services.mjs";

let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const SUPA = "sbp_" + "0123456789abcdef".repeat(2) + "01234567";
const SECRET = { supabase: SUPA, github: "ghp_test", email: "Claire.Morel@exemple.fr", mdp: "Rentrée 2027 !", prenom: "Claire" };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kplan-installer-"));
const ETAPES = ["base", "tables", "connexion", "compte", "fonctions", "site", "ranger"];

/* le faux serveur tourne dans ce processus : le robot est lancé sans bloquer (spawn), sinon personne ne lui répond */
function robot(f, etape, secret = SECRET, extra = {}) {
  const out = path.join(tmp, "sortie.txt");
  const c = spawn("node", ["scripts/installer.mjs", etape], { env: { ...process.env, ...f.env, KPLAN_PAUSE: "0.01", RUNNER_TEMP: tmp, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: "claire-kedge/plan-de-com", KPLAN_INSTALLATION: typeof secret === "string" ? secret : JSON.stringify(secret), ...extra } });
  let txt = ""; c.stdout.on("data", (d) => (txt += d)); c.stderr.on("data", (d) => (txt += d));
  return new Promise((ok) => c.on("close", (code) => ok({ code, out: txt, erreur: (txt.match(/::error title=[^:]*::(.*)/) || [])[1] || "" })));
}
/* le robot se souvient de la base entre deux étapes d'un même lancement : on repart de zéro à chaque lancement */
const neuf = () => { fs.rmSync(path.join(tmp, "kplan-installation.json"), { force: true }); fs.rmSync(path.join(tmp, "sortie.txt"), { force: true }); };
async function tout(f, secret) {
  neuf();
  const res = []; for (const e of ETAPES) res.push([e, await robot(f, e, secret)]); return res;
}

/* ---------- une installation complète ---------- */
{
  baseNeuve("kplan_installer");
  const f = await demarrer({ base: "kplan_installer", supabase: SUPA });
  const res = await tout(f);
  for (const [e, r] of res) ok(r.code === 0, `étape ${e} : passée${r.code ? " — " + r.out.slice(-400) : ""}`);
  const pr = f.projets[0];
  ok(f.projets.length === 1 && pr.name === "plan-de-com" && pr.region === "eu-west-3" && pr.organization_slug === "perso", "base créée à Paris, au nom de la copie, dans l'organisation du compte");
  const n = requete("kplan_installer", "select count(*)::int as n from kplan_private.migrations").lignes[0].n, m = fs.readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).length;
  ok(n === m, `toutes les tables installées (${n} scripts sur ${m})`);
  ok(f.auth && f.auth.disable_signup === true && f.auth.site_url === "https://claire-kedge.github.io/plan-de-com/" && f.auth.password_min_length === 8, "connexion : pas d'inscription libre, adresse du site, 8 caractères");
  const p = requete("kplan_installer", "select nom, chef from public.profiles").lignes;
  ok(p.length === 1 && p[0].nom === "Claire" && p[0].chef === true, "premier compte créé, prénom Claire, pilote");
  ok(f.mdp === SECRET.mdp, "le mot de passe choisi est celui du compte");
  ok(f.secrets.GITHUB_TOKEN === "ghp_test" && f.secrets.GITHUB_REPO === "claire-kedge/plan-de-com" && /^[A-Za-z0-9_-]{80,}$/.test(f.secrets.VAPID_PUBLIC_KEY) && f.secrets.VAPID_PRIVATE_KEY && f.secrets.CRON_SECRET, "secrets : bouton Mettre à jour et notifications");
  const v = requete("kplan_installer", "select name, decrypted_secret from vault.decrypted_secrets order by name").lignes;
  ok(v.length === 4 && v.find((x) => x.name === "kplan_push_url").decrypted_secret.endsWith("/auth-abcdefghijklmnopqrst/functions/v1/push") && v.find((x) => x.name === "kplan_cron_secret").decrypted_secret === f.secrets.CRON_SECRET, "coffre de la base : adresse de la fonction push et secret partagé");
  const maj = Object.fromEntries(v.filter((x) => x.name.startsWith("kplan_maj")).map((x) => [x.name, x.decrypted_secret]));
  ok(maj.kplan_maj_url && maj.kplan_maj_url.endsWith("/auth-abcdefghijklmnopqrst/functions/v1/mise-a-jour") && /^[0-9a-f]{64}$/.test(maj.kplan_maj_secret), "coffre : adresse de la fonction mise-a-jour et secret de la nuit");
  requete("kplan_installer", "select kplan_private.maj_auto()");
  const nuit = requete("kplan_installer", "select url, body, headers from net.calls order by id desc limit 1").lignes[0];
  ok(nuit && nuit.url === maj.kplan_maj_url && nuit.body.action === "auto" && nuit.headers["x-kplan-auto"] === maj.kplan_maj_secret && requete("kplan_installer", "select count(*)::int as n from cron.job where jobname = 'kplan-mise-a-jour'").lignes[0].n === 1, "la nuit venue, la base appelle sa fonction mise-a-jour : la copie se met à jour seule");
  ok(["push", "mise-a-jour", "export"].every((x) => f.fonctions[x] && f.fonctions[x].verify_jwt === false && f.fonctions[x].entrypoint_path === "index.ts" && f.fonctions[x].taille > 2000), "trois fonctions installées, sans Verify JWT");
  ok(f.vars.KPLAN_SUPABASE_URL === "http://127.0.0.1:" + f.env.KPLAN_HOTE.split(":")[2].split("/")[0] + "/auth-abcdefghijklmnopqrst" && f.vars.KPLAN_SUPABASE_KEY === "sb_publishable_abc" && f.vars.KPLAN_VAPID === f.secrets.VAPID_PUBLIC_KEY, "variables du site : adresse, clé publique, clé des notifications");
  const sortie = fs.readFileSync(path.join(tmp, "sortie.txt"), "utf8");
  ok(/^key=sb_publishable_abc$/m.test(sortie) && /^url=/m.test(sortie) && /^vapid=.{80,}$/m.test(sortie), "le robot passe l'adresse et les clés à l'étape « Préparer le site »");
  ok(!f.secretsGh.KPLAN_INSTALLATION, "le secret des clés est effacé de GitHub");
  const visible = (t) => t.split("\n").filter((l) => !l.startsWith("::add-mask::")).join("\n");
  ok(!res.some(([, r]) => [SUPA, SECRET.mdp, "ghp_test", "sb_secret_xyz"].some((x) => visible(r.out).includes(x))) && res[0][1].out.includes(`::add-mask::${SUPA}`) && res[3][1].out.includes("::add-mask::sb_secret_xyz"), "aucune clé ni mot de passe en clair dans le journal (masqués)");

  // config.js de la copie, comme l'étape « Préparer le site » (config-copie.mjs) avec les sorties du robot
  const site = path.join(tmp, "site"); fs.cpSync("site", site, { recursive: true });
  const kv = Object.fromEntries(sortie.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const c = spawnSync("node", ["scripts/config-copie.mjs", site], { encoding: "utf8", env: { ...process.env, KPLAN_ORIGINE: "bonavilien/kedge-plan-com", GITHUB_REPOSITORY: "claire-kedge/plan-de-com", KPLAN_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", KPLAN_SUPABASE_KEY: kv.key, KPLAN_VAPID: kv.vapid, KPLAN_APP: "Plan de com", KPLAN_NOM: "Executive Education" } });
  const cfg = fs.readFileSync(path.join(site, "config.js"), "utf8");
  ok(c.status === 0 && cfg.includes('"supabaseKey": "sb_publishable_abc"') && cfg.includes(`"vapidPublicKey": "${kv.vapid}"`) && cfg.includes('"copie": true'), "config.js de la copie : base, clé publique, notifications, bouton Mettre à jour");

  /* ---------- relance complète : rien en double ---------- */
  f.secretsGh.KPLAN_INSTALLATION = 1;
  const res2 = await tout(f, { ...SECRET, mdp: "Autre mot de passe" });
  ok(res2.every(([, r]) => r.code === 0), "relance complète : toutes les étapes passent" + (res2.find(([, r]) => r.code) ? " — " + res2.find(([, r]) => r.code)[1].out.slice(-300) : ""));
  ok(f.projets.length === 1 && f.comptes === 1 && requete("kplan_installer", "select count(*)::int as n from public.profiles").lignes[0].n === 1, "relance : une seule base, un seul compte");
  ok(f.mdp === "Autre mot de passe" && res2[3][1].out.includes("mot de passe remis à jour"), "relance : le nouveau mot de passe remplace l'ancien");
  ok(res2[1][1].out.includes(`${m} scripts en place`) && !res2[1][1].out.includes(": fait"), "relance : aucune table refaite");
  await f.fermer();
}

/* ---------- ce qui peut coincer : des messages lisibles ---------- */
{
  baseNeuve("kplan_installer");
  const f = await demarrer({ base: "kplan_installer", supabase: SUPA, regionSelection: false });
  neuf();
  ok((await robot(f, "base")).code === 0 && f.projets[0].region === "eu-west-3", "Supabase sans « region_selection » : l'ancien champ « region » prend le relais");
  await f.fermer();
}
{
  const f = await demarrer({ base: "kplan_installer", supabase: SUPA });
  neuf(); let r = await robot(f, "base", { ...SECRET, supabase: "sbp_" + "f".repeat(40) });
  ok(r.code === 1 && r.erreur.startsWith("Supabase refuse ta clé"), "clé Supabase refusée : " + r.erreur);
  f.regler({ orgs: [] }); neuf(); r = await robot(f, "base");
  ok(r.code === 1 && r.erreur.includes("pas encore d'organisation"), "compte Supabase sans organisation : " + r.erreur);
  f.regler({ orgs: [{ id: "perso", slug: "perso", name: "Perso" }], limite: true }); neuf(); r = await robot(f, "base");
  ok(r.code === 1 && r.erreur.includes("2 projets gratuits"), "plus de projet gratuit : " + r.erreur);
  r = await robot(f, "base", { supabase: "", github: "" });
  ok(r.code === 1 && r.erreur.includes("Relance l'installation depuis la page Installer"), "secret absent : " + r.erreur);
  r = await robot(f, "base", "{pas du json");
  ok(r.code === 1 && r.erreur.includes("illisible"), "secret illisible : message clair");
  await f.fermer();
}
{
  // une base sans clés publishable/secret (projet ancien) : le robot les crée
  baseNeuve("kplan_installer");
  const f = await demarrer({ base: "kplan_installer", supabase: SUPA, sansCles: true });
  neuf();
  for (const e of ["base", "tables", "connexion"]) await robot(f, e);
  const r = await robot(f, "compte");
  ok(r.code === 0 && f.appels.filter((a) => a.endsWith("/api-keys") && a.startsWith("POST")).length >= 1 && f.comptes === 1, "clés absentes : créées, puis le compte");
  await f.fermer();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} échec(s)` : "Robot d'installation : tout est bon");
process.exit(bad ? 1 : 0);
