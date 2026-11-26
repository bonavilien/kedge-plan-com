// 2.11 : le lien d'une fiche, ouvert sans être connecté : la fiche seule, en lecture, avec « Se connecter » (faux client Supabase).
// Usage : (cd site && python3 -m http.server 8812) puis node test/v2/fiche-publique.mjs [dossier-captures]
import fs from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.SITE || "http://localhost:8812/index.html", shots = process.argv[2];
const fake = fs.readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const TF = "b0000000-0000-0000-0000-000000000001", ACT = "b0000000-0000-0000-0000-000000000002", REL = "b0000000-0000-0000-0000-000000000003";
/* ce que rend la fonction fiche_publique (script 0040) pour deux fiches du faux client */
const fiches = {
  [ACT]: { id: ACT, kind: "action", t: "Invitation presse locale", date: "2027-02-01", flou: "", fin: null, periodes: [], svc: "Relations presse", partenariat: false, media: "", messages: ["Filières"], st: "planifie", lieu: "", rang: null, cible: null, report_de: "le 28 janv.",
    tf: { id: TF, t: "Journée portes ouvertes", date: "2027-02-06", flou: "", fin: null, lieu: "Campus de Bordeaux" }, relais: [], docs: [{ t: "Brief presse", url: "https://example.sharepoint.com/brief" }] },
  [TF]: { id: TF, kind: "tf", t: "Journée portes ouvertes", date: "2027-02-06", flou: "", fin: null, periodes: [], svc: "Chefs de projet", partenariat: false, media: "", messages: ["Recrutement"], st: "planifie", lieu: "Campus de Bordeaux", rang: null, cible: null, report_de: "",
    tf: null, relais: [{ id: ACT, t: "Invitation presse locale", date: "2027-02-01", flou: "", svc: "RP", st: "planifie" }, { id: REL, t: "Teaser de la journée", date: "2027-02-04", flou: "", svc: "RS", st: "confirmer" }], docs: [] },
};
async function page(opt = {}) {
  const ctx = await b.newContext({ viewport: opt.vp || { width: 1440, height: 900 }, serviceWorkers: "block", colorScheme: opt.dark ? "dark" : "light", deviceScaleFactor: shots ? 2 : 1 });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.addInitScript(() => sessionStorage.setItem("kplan-ouvert", "1"));
  if (!opt.sansFonction) await p.addInitScript((f) => { window.__fakeRpc = { fiche_publique: (a) => f[a.p_id] || null }; }, fiches);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: true, supabaseUrl: "http://faux", supabaseKey: "faux", visiteur: "lecteur@example.com", marque: { app: "Road to 7th", nom: "KEDGE", logo: "assets/road-to-7th.png", carre: true, symbole: "assets/road-to-7th-symbole.png" } };` }));
  return p;
}

let p = await page();
await p.goto(base + "#/plan?fiche=" + ACT); await p.waitForSelector("#publique .pub-t");
ok((await p.textContent(".pub-t")) === "Invitation presse locale", "sans compte, le lien ouvre la fiche");
ok(!(await p.$("#login")), "pas d'écran de connexion par-dessus");
ok(await p.isVisible("[data-pub-co]"), "un bouton « Se connecter »");
const txt = await p.textContent("#publique");
ok(/Relations presse/.test(txt) && /Filières/.test(txt) && /Journée portes ouvertes/.test(txt) && /Brief presse/.test(txt) && /Reporté/.test(txt), "service, messages, temps fort, lien, report");
ok(!(await p.$("#publique input, #publique textarea")), "rien à modifier");
ok((await p.title()).startsWith("Invitation presse locale"), "le titre de l'onglet");
if (shots) await p.screenshot({ path: `${shots}/1-action-1440.png` });
/* le temps fort, puis un de ses relais, sans compte */
await p.click("#publique .f-sec.from a"); await p.waitForFunction(() => document.querySelector(".pub-t").textContent === "Journée portes ouvertes");
ok((await p.$$("#publique a.mini")).length === 2, "le temps fort montre ses relais");
if (shots) await p.screenshot({ path: `${shots}/2-temps-fort-1440.png` });
await p.click(`#publique a.mini[href$="${REL}"]`); await p.waitForSelector("#login");
ok(true, "une fiche que la base ne donne pas : écran de connexion");
await p.goto(base + "#/plan?fiche=" + ACT); await p.reload(); await p.waitForSelector("#publique .pub-t");
/* se connecter, puis revenir */
await p.click("[data-pub-co]"); await p.waitForSelector("#login [data-retour]");
if (shots) { await p.waitForTimeout(1500); await p.screenshot({ path: `${shots}/3-connexion.png` }); }
await p.click("#login [data-retour]"); await p.waitForTimeout(500);
ok(!(await p.$("#login")) && (await p.isVisible("#publique")), "« Revenir à la fiche »");
await p.click("[data-pub-co]"); await p.waitForSelector("#login input[name=email]");
await p.fill("#login input[name=email]", "pilote@example.com"); await p.fill("#login input[name=password]", "test"); await p.click("#login [type=submit]");
await p.waitForSelector("#fiche:not([hidden]) .f-title"); await p.waitForTimeout(500);
ok(!(await p.$("#publique")), "connecté : la page publique disparaît");
ok((await p.inputValue("#fiche .f-title")) === "Invitation presse locale", "connecté : la vraie fiche est ouverte");
ok(p.errs.length === 0, "aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));
await p.context().close();

/* l'ancien format des notifications « #item=<id> » */
p = await page();
await p.goto(base + "#item=" + ACT); await p.waitForSelector("#publique .pub-t");
ok(true, "le lien d'une notification (#item=) aussi");
await p.context().close();

/* base sans le script 0040 : l'écran de connexion habituel */
p = await page({ sansFonction: true });
await p.goto(base + "#/plan?fiche=" + ACT); await p.waitForSelector("#login");
ok(!(await p.$("#publique")), "sans le script : écran de connexion, comme avant");
await p.context().close();
/* sans fiche dans l'adresse */
p = await page();
await p.goto(base + "#/accueil"); await p.waitForSelector("#login");
ok(!(await p.$("#publique")), "sans fiche dans l'adresse : écran de connexion");
await p.context().close();

/* téléphone et thème sombre */
p = await page({ vp: { width: 390, height: 844 } });
await p.goto(base + "#/plan?fiche=" + ACT); await p.waitForSelector("#publique .pub-t");
ok(await p.evaluate(() => document.getElementById("publique").scrollWidth <= 390), "téléphone : pas de défilement de côté");
if (shots) await p.screenshot({ path: `${shots}/4-action-390.png` });
await p.context().close();
p = await page({ dark: true });
await p.goto(base + "#/plan?fiche=" + TF); await p.waitForSelector("#publique .pub-t");
if (shots) await p.screenshot({ path: `${shots}/5-temps-fort-sombre.png` });
await p.context().close();

await b.close();
console.log(bad ? `${bad} échec(s)` : "fiche sans compte : tout est bon");
process.exit(bad ? 1 : 0);
