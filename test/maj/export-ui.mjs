// Asana et Trello dans l'appli : chacun relie le sien dans Mon profil, bouton de la fiche (base et fonction simulées).
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/export-ui.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const I = (n) => "b0000000-0000-0000-0000-00000000000" + n;

/* o.actifs : outils déjà reliés ; o.lignes : fiches déjà envoyées ; o.fn : la fonction export (null = pas installée) */
async function open(email, o = {}, theme = "light", vp = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: "block", deviceScaleFactor: shots ? 2 : 1, colorScheme: theme });
  const p = await ctx.newPage(); p.errs = []; p.calls = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await ctx.addInitScript(([actifs, lignes]) => {
    window.__fakeRpc = { outils_actifs: () => actifs };
    const t = setInterval(() => { if (window.__fake) { window.__fake.db.exports = lignes; clearInterval(t); } }, 1);
  }, [o.actifs || [], o.lignes || []]);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" })};` }));
  await p.route("**/functions/v1/export", async (r) => {
    const c = JSON.parse(r.request().postData() || "{}"); p.calls.push(c);
    if (o.fn === null) return r.fulfill({ status: 404, body: "" });
    const rep = {
      lister: () => c.jeton === "faux" ? [502, { erreur: "jeton", message: "Asana refuse la clé : elle a expiré ou elle est mal recopiée." }] : [200, { choix: c.outil === "asana" ? [{ id: "p1", nom: "KEDGE · Plan de com PGE" }, { id: "p2", nom: "KEDGE · Événements" }] : [{ id: "l1", nom: "Com · À faire" }] }],
      relier: () => [200, { outil: c.outil, cible_nom: c.outil === "asana" ? (c.cible === "p2" ? "KEDGE · Événements" : "KEDGE · Plan de com PGE") : "Com · À faire" }],
      envoyer: () => [200, { item: c.item, outil: c.outil, ext_id: "t1", url: "https://app.asana.com/0/p1/t1", erreur: "" }],
      arreter: () => [200, { ok: true }],
      delier: () => [200, { ok: true }],
    }[c.action]();
    await r.fulfill({ status: rep[0], contentType: "application/json", body: JSON.stringify(rep[1]) });
  });
  await p.goto(base);
  await p.waitForSelector("#login form");
  await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
  await p.waitForSelector("#login", { state: "detached" });
  await p.waitForTimeout(150);
  return p;
}
const shot = async (p, name, sel = "#main") => { if (shots) await p.locator(sel).screenshot({ path: `${shots}/${name}.png` }); };
const fiche = async (p, id) => { await p.evaluate((id) => KP.go({ screen: "plan", fiche: id }), id); await p.waitForSelector("#fiche .f-top"); };
const btn = '#fiche [data-act="f-export"]';

// ---------- pilote : rien de relié, puis relier Asana ----------
let p = await open("pilote@example.com");
await fiche(p, I(3));
ok(await p.locator(btn).count() === 0, "rien de relié : pas de bouton sur la fiche");
await p.evaluate(() => KP.go({ screen: "reglages", set: "profil", fiche: "" }));
await p.waitForSelector(".t-outils");
ok(await p.locator(".t-outils .tr").count() === 2 && await p.locator('.t-outils [data-act="outil-relier"]').count() === 2, "Réglages, Mon profil : Asana et Trello, à relier");
await p.locator(".t-outils").scrollIntoViewIfNeeded();
await shot(p, "1-reglages-vide", ".t-outils >> xpath=..");
await p.click('.t-outils [data-act="outil-relier"][data-k="asana"]');
await p.waitForSelector("dialog .f-outil");
await p.click("dialog [data-go]");
ok(await p.locator("dialog [data-err]").isVisible() && (await p.locator("dialog [data-err]").innerText()).includes("La clé"), "sans clé : on le dit");
await p.fill("dialog [name=pat]", "faux"); await p.click("dialog [data-go]"); await p.waitForTimeout(100);
ok((await p.locator("dialog [data-err]").innerText()).includes("Asana refuse la clé"), "clé refusée : message de la fonction");
await p.fill("dialog [name=pat]", "2/1234"); await shot(p, "2-relier-cle", "dialog"); await p.click("dialog [data-go]");
await p.waitForSelector('dialog [data-etape="2"]:not([hidden])');
ok(await p.locator("dialog [name=cible] option").count() === 2, "étape 2 : les projets Asana");
await shot(p, "3-relier-projet", "dialog");
await p.click("dialog [data-go]");
await p.waitForSelector("dialog", { state: "detached" });
const rel = p.calls.find((c) => c.action === "relier");
ok(rel && rel.jeton === "2/1234" && rel.cible === "p1" && rel.site.endsWith("/index.html") && rel.app, "relier : clé, projet, adresse et nom de l'appli envoyés");
ok((await p.locator(".t-outils .tr").first().innerText()).includes("KEDGE · Plan de com PGE"), "Asana relié, son projet affiché");
await shot(p, "4-reglages-relie", ".t-outils >> xpath=..");

// ---------- la fiche : envoyer, puis le menu ----------
await fiche(p, I(3));
ok(await p.locator(btn).count() === 1 && (await p.locator(btn).getAttribute("data-tip")) === "Envoyer dans Asana", "fiche : bouton « Envoyer dans Asana »");
await shot(p, "5-fiche-avant", "#fiche");
await p.click(btn); await p.waitForTimeout(150);
ok(p.calls.some((c) => c.action === "envoyer" && c.item === I(3) && c.outil === "asana"), "un clic : la fiche part dans Asana");
ok(await p.locator(btn + ".lie").count() === 1 && (await p.locator(btn).getAttribute("data-tip")) === "Synchronisé avec Asana", "bouton vert : synchronisé");
ok((await p.locator("#toasts").innerText()).includes("Dans Asana"), "message bref");
await shot(p, "6-fiche-synchro", "#fiche");
await p.click(btn);
const menu = await p.locator(".pop").innerText();
ok(menu.includes("Ouvrir dans Asana") && menu.includes("Ne plus synchroniser avec Asana"), "menu : ouvrir, ne plus synchroniser");
await shot(p, "7-fiche-menu", "body");
await p.click('.pop [data-v="arreter:asana"]'); await p.waitForTimeout(150);
ok(p.calls.some((c) => c.action === "arreter") && await p.locator(btn + ".lie").count() === 0, "ne plus synchroniser : le bouton redevient neutre");
ok(!p.errs.length, "aucune erreur JS (pilote) " + p.errs.join(" | "));

// ---------- deux outils : le clic ouvre un choix ----------
p = await open("pilote@example.com", { actifs: [{ outil: "asana", cible_nom: "KEDGE · Plan" }, { outil: "trello", cible_nom: "Com · À faire" }] }, "dark");
await fiche(p, I(2));
ok((await p.locator(btn).getAttribute("data-tip")) === "Envoyer dans Asana et Trello", "deux outils : un seul bouton");
await p.click(btn);
ok((await p.locator(".pop").innerText()).includes("Envoyer dans Trello"), "deux outils : on choisit");
await shot(p, "8-deux-outils-sombre", "body");

// ---------- chacun son outil ----------
const U = (n) => "a0000000-0000-0000-0000-00000000000" + n;
const lignes = [{ item: I(3), user_id: U(2), outil: "asana", url: "https://app.asana.com/0/p1/t1", erreur: "" }, { item: I(2), user_id: U(3), outil: "asana", url: "https://app.asana.com/0/p1/t9", erreur: "" }];
p = await open("presse@example.com", { actifs: [{ outil: "asana", cible_nom: "Aurélie · Presse" }], lignes });
await p.evaluate(() => KP.go({ screen: "reglages", set: "profil" })); await p.waitForSelector(".t-outils");
ok((await p.locator(".t-outils").innerText()).includes("Aurélie · Presse"), "un service relie son propre outil dans Mon profil");
await fiche(p, I(6)); /* fiche RS : Aurélie est aux RP */
ok(await p.locator(btn).count() === 1, "on peut envoyer n'importe quelle fiche dans son outil");
await fiche(p, I(3));
ok(await p.locator(btn + ".lie").count() === 1, "mes envois : bouton vert");
await fiche(p, I(2));
ok(await p.locator(btn + ".lie").count() === 0, "l'envoi d'un autre ne compte pas pour moi");
await p.click(btn); await p.waitForTimeout(150);
ok(p.calls.some((c) => c.action === "envoyer" && c.item === I(2)), "je l'envoie chez moi aussi");
p = await open("lecteur@example.com", { actifs: [{ outil: "asana", cible_nom: "KEDGE · Plan" }], lignes });
await fiche(p, I(3));
ok(await p.locator(btn).count() === 0, "lecture seule : pas de bouton");
await p.evaluate(() => KP.go({ screen: "reglages", set: "profil" })); await p.waitForTimeout(100);
ok(await p.locator(".t-outils").count() === 0, "lecture seule : pas de réglage");
p = await open("pilote@example.com", { actifs: [{ outil: "asana", cible_nom: "KEDGE · Plan" }], lignes: [{ item: I(3), user_id: U(1), outil: "asana", url: "x", erreur: "Asana refuse la clé" }] });
await fiche(p, I(3));
ok(await p.locator(btn + ".err").count() === 1 && (await p.locator(btn).getAttribute("data-tip")).includes("pas à jour"), "erreur de synchro : bouton rouge");

// ---------- base sans 0029, fonction absente ----------
p = await open("pilote@example.com", { fn: null });
await p.evaluate(() => { delete window.__fakeRpc.outils_actifs; KP.outils.charge(); });
await p.evaluate(() => KP.go({ screen: "reglages", set: "profil" })); await p.waitForTimeout(100);
ok((await p.locator(".t-outils >> xpath=..").innerText()).includes("0029"), "sans le script 0029 : on le dit");
await p.click('.t-outils [data-act="outil-relier"][data-k="trello"]');
await p.fill("dialog [name=key]", "a".repeat(32));
ok(await p.locator("dialog [data-jeton]").isVisible(), "Trello : lien « Mon jeton » dès que la clé est collée");
await p.fill("dialog [name=token]", "ATTA1"); await p.click("dialog [data-go]"); await p.waitForTimeout(150);
ok((await p.locator("dialog [data-err]").innerText()).includes("pas encore installée"), "fonction absente : message clair");

// ---------- téléphone : dans le menu « Plus » ----------
p = await open("pilote@example.com", { actifs: [{ outil: "asana", cible_nom: "KEDGE · Plan" }] }, "light", { width: 390, height: 844 });
await fiche(p, I(3));
await p.click('#fiche [data-act="f-more"]');
ok((await p.locator(".pop").innerText()).includes("Envoyer dans Asana"), "téléphone : dans le menu de la fiche");

await b.close();
console.log(bad ? `${bad} échec(s)` : "Asana et Trello dans l'appli : tout est bon");
process.exit(bad ? 1 : 0);
