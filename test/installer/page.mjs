// La page Installer (site/installer.html) contre un faux GitHub : vérification des clés, copie de l'appli,
// réglages, secret chiffré (rouvert ici avec la clé privée du faux dépôt), lancement du robot, suivi des étapes,
// lien final ; puis un échec lisible et « Réessayer » ; un dépôt du même nom déjà pris ; le téléphone.
// Usage : (cd site && python3 -m http.server 8812) puis node test/installer/page.mjs [dossier des captures]
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { fauxGitHub } from "./faux-github.mjs";
const base = (process.env.SITE || "http://localhost:8812/index.html").replace(/index\.html$/, "") + "installer.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };

async function ouvrir(g, { mobile = false, theme = "light" } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: shots ? 2 : 1, colorScheme: theme, reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
  await p.addInitScript(() => { window.KPLAN_INSTALLER = { pause: 0.02 }; });
  await p.route("https://api.github.com/**", g.route);
  await p.goto(base);
  p.fermer = () => b.close();
  return p;
}
const remplir = async (p, o = {}) => {
  await p.fill("#gh", o.gh || "ghp_bon"); await p.waitForSelector("#gh-etat.ok");
  await p.fill("#sb", o.sb || "sbp_" + "a1b2c3d4e5".repeat(4)); await p.fill("#app", o.app ?? ""); await p.fill("#nom", "Executive Education");
  await p.fill("#prenom", "Claire"); await p.fill("#email", "claire.morel@exemple.fr"); await p.fill("#mdp", "Rentrée 2027 !");
};
const pas = (p) => p.$$eval("#pas li", (l) => l.map((x) => (x.className || "-") + ":" + x.querySelector("span:nth-child(2)").textContent.split(" ·")[0]));

/* ---------- le chemin heureux ---------- */
{
  const g = fauxGitHub(), p = await ouvrir(g);
  ok(await p.$eval("#go", (b) => b.disabled), "« Installer » attend les deux clés et l'adresse");
  ok((await p.getAttribute("#lien-gh", "href")) === "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Plan%20de%20com", "« Créer ma clé GitHub » ouvre la page pré-remplie (repo et workflow)");
  await p.fill("#gh", "ghp_faux"); await p.waitForSelector("#gh-etat.non");
  ok((await p.textContent("#gh-etat")).includes("Clé refusée"), "clé GitHub fausse : refusée tout de suite");
  await p.fill("#gh", "ghp_court"); await p.waitForFunction(() => document.querySelector("#gh-etat").textContent.includes("Il manque"));
  ok(true, "clé sans la case workflow : « Il manque les cases repo et workflow »");
  await p.fill("#sb", "abc");
  ok((await p.textContent("#sb-etat")).includes("commence par sbp_"), "clé Supabase mal copiée : le format est rappelé");
  await remplir(p);
  ok((await p.textContent("#gh-etat")).includes("Connecté : Claire-Kedge") && await p.$eval("#c-gh", (c) => c.classList.contains("ok")), "clé GitHub vérifiée : « Connecté : Claire-Kedge », pastille verte");
  ok(!(await p.$eval("#go", (b) => b.disabled)), "tout est rempli : « Installer » s'allume");
  if (shots) await p.screenshot({ path: `${shots}/1-formulaire.png`, fullPage: true });
  await p.click("#go");
  await p.waitForSelector("#pas li.en");
  if (shots) { await p.waitForFunction(() => document.querySelectorAll("#pas li.fait").length >= 3); await p.screenshot({ path: `${shots}/2-en-cours.png`, fullPage: true }); }
  await p.waitForSelector("#fin:not([hidden])", { timeout: 30000 });
  const l = await pas(p);
  ok(l.length === 9 && l.every((x) => x.startsWith("fait:")), "les neuf étapes passent au vert : " + l.map((x) => x.split(":")[1]).join(" / "));
  ok(g.fork && g.fork.name === "plan-de-com" && g.fork.default_branch_only === true, "l'appli est copiée dans le GitHub de Claire (plan-de-com)");
  ok(g.actions && g.actions.enabled === true && g.appels.includes("PUT /repos/Claire-Kedge/plan-de-com/actions/workflows/installer.yml/enable") && g.pages && g.pages.build_type === "workflow", "robot activé, GitHub Pages réglé sur GitHub Actions");
  ok(g.vars.KPLAN_NOM === "Executive Education" && !("KPLAN_APP" in g.vars), "variable de l'équipe posée (le nom par défaut n'en a pas besoin)");
  const s = g.secrets[0];
  ok(s && s.key_id === "k-42" && s.clair && s.clair.supabase === "sbp_" + "a1b2c3d4e5".repeat(4) && s.clair.github === "ghp_bon" && s.clair.email === "claire.morel@exemple.fr" && s.clair.mdp === "Rentrée 2027 !" && s.clair.prenom === "Claire", "les clés partent chiffrées dans le secret, et se rouvrent avec la clé du dépôt");
  ok(!g.appels.some((a) => /supabase/i.test(a)) && g.runs.length === 1, "la page ne parle qu'à GitHub, et lance le robot une fois");
  ok((await p.getAttribute("#ouvrir", "href")) === "https://claire-kedge.github.io/plan-de-com/" && (await p.textContent("#fin-mail")) === "claire.morel@exemple.fr" && (await p.textContent("#s-titre")) === "Ton appli est en ligne", "à la fin : « Ton appli est en ligne », le lien et l'adresse de connexion");
  if (shots) await p.screenshot({ path: `${shots}/3-fin.png`, fullPage: true });
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await p.fermer();
}

/* ---------- un échec lisible, puis « Réessayer » ---------- */
{
  const g = fauxGitHub({ echecs: ["Créer la base"] }), p = await ouvrir(g);
  await remplir(p, { app: "Plan de com Exec" }); await p.click("#go");
  await p.waitForSelector("#err:not([hidden])", { timeout: 30000 });
  const l = await pas(p);
  ok(l.find((x) => x.endsWith("Créer la base")).startsWith("rate:") && l.slice(0, 2).every((x) => x.startsWith("fait:")), "l'étape qui coince est en rouge, les précédentes restent vertes");
  ok((await p.textContent("#err-t")).startsWith("Ton compte Supabase a déjà ses 2 projets gratuits") && !(await p.textContent("#err-t")).includes("exit code"), "le message du robot s'affiche tel quel : " + await p.textContent("#err-t"));
  ok((await p.getAttribute("#detail", "href")).endsWith("/actions/runs/100") && (await p.textContent("#s-titre")) === "L'installation s'est arrêtée", "« Voir le détail sur GitHub » mène au bon lancement");
  ok(g.vars.KPLAN_APP === "Plan de com Exec", "un nom d'appli choisi devient la variable KPLAN_APP");
  if (shots) await p.screenshot({ path: `${shots}/4-echec.png`, fullPage: true });
  await p.click("#encore");
  await p.waitForSelector("#fin:not([hidden])", { timeout: 30000 });
  ok(g.runs.length === 2 && g.secrets.length === 2 && g.appels.filter((a) => a.endsWith("/forks")).length === 1, "« Réessayer » : clés rangées à nouveau, robot relancé, sans recopier l'appli");
  ok((await p.getAttribute("#ouvrir", "href")) === "https://claire-kedge.github.io/plan-de-com-exec/", "le dépôt prend le nom de l'appli : plan-de-com-exec");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await p.fermer();
}

/* ---------- un dépôt du même nom, qui n'est pas une copie ---------- */
{
  const g = fauxGitHub({ depotPris: true }), p = await ouvrir(g);
  await remplir(p); await p.click("#go");
  await p.waitForSelector("#err:not([hidden])");
  ok((await p.textContent("#err-t")).includes("Tu as déjà un dépôt « plan-de-com »") && !g.fork, "nom déjà pris par un autre dépôt : on demande de changer le nom, rien n'est touché");
  await p.fermer();
}

/* ---------- téléphone et sombre ---------- */
{
  const g = fauxGitHub(), p = await ouvrir(g, { mobile: true, theme: "dark" });
  await remplir(p);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "téléphone : rien ne dépasse en largeur");
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor === "rgb(15, 16, 18)"), "sombre : fond sombre");
  if (shots) await p.screenshot({ path: `${shots}/5-telephone-sombre.png`, fullPage: true });
  await p.fermer();
}

console.log(bad ? `${bad} échec(s)` : "Page Installer : tout est bon");
process.exit(bad ? 1 : 0);
