// Quoi de neuf (2.10) et le guide Asana / Trello dans l'appli (base simulée).
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/nouveautes-ui.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };

async function open(email, version, theme = "light", vp = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: "block", deviceScaleFactor: shots ? 2 : 1, colorScheme: theme });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await ctx.addInitScript(([email, version]) => {
    window.__fakeRpc = { outils_actifs: () => [] };
    const t = setInterval(() => { if (window.__fake) { if (version !== null) { const pr = window.__fake.db.profiles.find((x) => email.startsWith("pilote") ? x.chef : email.startsWith("presse") ? x.svc === "rp" : email.startsWith("lecteur") ? x.visiteur : false); if (pr) pr.version = version; } clearInterval(t); } }, 1);
  }, [email, version]);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" })};` }));
  await p.route("**/functions/v1/export", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fonction: 3, outils: [] }) }));
  await p.goto(base);
  await p.waitForSelector("#login form");
  await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
  await p.waitForSelector("#login", { state: "detached" });
  await p.waitForTimeout(900);
  return p;
}
const shot = async (p, name, sel) => { if (shots) await p.locator(sel).screenshot({ path: `${shots}/${name}.png` }); };

// ---------- revenu après la 2.9.3 : la fenêtre Quoi de neuf ----------
let p = await open("pilote@example.com", "2.9.3");
ok(await p.locator("dialog.qn").isVisible(), "dernière visite en 2.9.3 : Quoi de neuf s'ouvre");
ok(await p.locator("dialog.qn .qn-c").count() === 2, "deux nouveautés : Asana / Trello, partenariats payants");
ok(await p.locator('dialog.qn [data-act="guide"]').count() === 1 && await p.locator('dialog.qn [data-act="qn-go"]').count() === 1, "un guide, un « Afficher »");
await shot(p, "1-quoi-de-neuf", "dialog.qn");
await p.click('dialog.qn [data-act="qn-go"]');
await p.waitForTimeout(300);
ok(await p.locator("dialog.qn").count() === 0 && await p.evaluate(() => KP.route.screen === "plan" && KP.route.type === "partenariat"), "Afficher : Le plan, filtré sur les partenariats payants");
ok((await p.locator(".tools").innerText()).includes("Partenariats payants"), "le filtre Type affiche « Partenariats payants »");
await shot(p, "2-plan-partenariats", "#main");
ok(!p.errs.length, "aucune erreur" + (p.errs[0] ? " : " + p.errs[0] : ""));

// ---------- Quoi de neuf → le guide ----------
p = await open("pilote@example.com", "2.9.0");
await p.click('dialog.qn [data-act="guide"]'); await p.waitForTimeout(300);
ok(await p.locator("dialog.qn").count() === 0 && await p.locator("dialog.gd").isVisible(), "Le guide : Quoi de neuf se ferme, le guide s'ouvre");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);

// ---------- pas de fenêtre : nouveau compte, ancienne V1, déjà à jour ----------
p = await open("pilote@example.com", "");
ok(await p.locator("dialog.qn").count() === 0, "premier passage : pas de Quoi de neuf");
p = await open("presse@example.com", "1.5.0");
ok(await p.locator("dialog.qn").count() === 0, "venu de la V1 : pas de Quoi de neuf (une refonte a sa présentation)");
const v = await p.evaluate(() => KP.VERSION.n);
p = await open("pilote@example.com", v);
ok(await p.locator("dialog.qn").count() === 0, "déjà sur cette version : rien");

// ---------- le guide depuis Mon profil ----------
await p.evaluate(() => KP.go({ screen: "reglages", set: "profil" })); await p.waitForSelector(".t-outils");
await p.click('[data-act="guide"][data-k="asana-trello"]'); await p.waitForSelector("dialog.gd");
const vis = async (sel) => p.locator(`dialog.gd ${sel}`).evaluateAll((l) => l.filter((x) => x.offsetParent !== null).length);
ok(await vis(".gd-a") > 0 && await vis(".gd-t") === 0, "Mon profil, « Guide » : le guide, version Asana");
await p.waitForTimeout(400);
ok(await p.locator("dialog.gd img").first().evaluate((i) => i.complete && i.naturalWidth > 0), "les captures se chargent");
await shot(p, "3-guide-asana", "dialog.gd");
await p.click('dialog.gd label:has(input[value="trello"])');
ok(await vis(".gd-t") > 0 && await vis(".gd-a") === 0, "bouton Trello : toutes les étapes passent sur Trello");
await p.locator("dialog.gd .gd-s").nth(1).scrollIntoViewIfNeeded();
await shot(p, "4-guide-trello", "dialog.gd");
await p.click("dialog.gd .gd-x"); await p.waitForTimeout(500);
ok(await p.locator("dialog.gd").count() === 0, "la croix ferme le guide");
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForTimeout(200);
ok(await p.locator(".qn-set .qn-c").count() === 6, "Réglages, Nouveautés et version : « À découvrir », les 6 dernières");
await shot(p, "5-a-propos", ".qn-set");
ok(!p.errs.length, "aucune erreur" + (p.errs[0] ? " : " + p.errs[0] : ""));

// ---------- téléphone, sombre ----------
p = await open("pilote@example.com", "2.9.3", "dark", { width: 390, height: 844 });
ok(await p.locator("dialog.qn").isVisible() && await p.evaluate(() => document.documentElement.scrollWidth <= 390), "téléphone : Quoi de neuf tient dans l'écran");
await shot(p, "6-quoi-de-neuf-tel", "dialog.qn");
await p.click('dialog.qn [data-act="guide"]'); await p.waitForSelector("dialog.gd");
ok(await p.locator("dialog.gd").evaluate((d) => d.getBoundingClientRect().width <= 390), "téléphone : le guide tient en largeur");
await shot(p, "7-guide-tel", "dialog.gd");

// ---------- selon la personne : le budget pour les chefs, rien à modifier pour un visiteur ----------
const titres = async (p) => p.locator("dialog.qn .qn-tx b").allInnerTexts();
p = await open("pilote@example.com", "2.4.0");
let t = await titres(p);
ok(t.length === 5 && t.includes("Budget par devis") && t[0] === "Synchronisation avec Asana et Trello", "chef revenu de la 2.4 : les 5 plus récentes, dont le budget");
await shot(p, "8-chef-depuis-2-4", "dialog.qn");
await p.click('dialog.qn [data-act="qn-go"] >> nth=1'); await p.waitForTimeout(300);
p = await open("presse@example.com", "2.4.0");
t = await titres(p);
ok(t.length === 5 && !t.includes("Budget par devis") && !t.includes("Suivi de l'outil") && t.includes("Barre de saisie sur l'accueil"), "service revenu de la 2.4 : pas de budget ni de suivi");
await shot(p, "9-service-depuis-2-4", "dialog.qn");
p = await open("lecteur@example.com", "2.4.0");
ok(await p.locator("dialog.qn").count() === 0, "compte visiteur (partagé) : aucune nouveauté");
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForTimeout(200);
ok(await p.locator(".qn-set").count() === 0, "visiteur : pas de « À découvrir » non plus");

// ---------- 2.10.1 : revenir sur l'onglet ne remontre pas la fenêtre ----------
p = await open("pilote@example.com", "2.9.3");
ok(await p.locator("dialog.qn").isVisible(), "la fenêtre s'ouvre une première fois");
await p.click('dialog.qn .btn.primary'); await p.waitForTimeout(800);
ok(await p.evaluate(() => window.__fake.db.profiles.find((x) => x.chef).version) === await p.evaluate(() => KP.VERSION.n), "la version vue est enregistrée dans le profil");
await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await p.waitForTimeout(1500);
ok(await p.locator("dialog.qn").count() === 0, "retour sur l'onglet (rechargement) : pas de nouvelle fenêtre");
await p.reload(); await p.waitForTimeout(2000);
ok(await p.locator("dialog.qn").count() === 0, "page rechargée : pas de nouvelle fenêtre");

await b.close();
console.log(bad ? `${bad} échec(s)` : "Quoi de neuf et guides : tout est bon");
process.exit(bad ? 1 : 0);
