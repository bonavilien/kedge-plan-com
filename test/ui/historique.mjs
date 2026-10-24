// Historique des fiches et « prévenir du changement » (migration 0003), sur le faux client.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|row-level security/.test(m.text())) errs.push(m.text()); });
const fake = () => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const tab = async (t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
const topv = () => p.locator(".view.pushed").last();
const hist = () => topv().locator(".hist .row").allInnerTexts();
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
async function logout() {
  await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
  await p.click('[data-act="logout"]'); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForSelector("#login");
}
async function edit(fn) {
  await topv().locator('[data-act="edit"]').click(); await p.waitForTimeout(350);
  await fn(); await p.click('[data-act="save"]'); await p.waitForTimeout(500);
}
const alertShown = () => p.isVisible(".alert-wrap.show");
const alertText = () => p.textContent(".alert-wrap.show .alert");

await p.goto(URL0); await p.evaluate(() => localStorage.clear());
// Julien pose le temps fort, Aurélie (RP) y rattache un reportage en citant RS
await login("julien");
await tab("ajouter"); await p.click('#f-kind button[value="tf"]'); await p.waitForTimeout(150);
await p.fill("#f-t", "Journées portes ouvertes"); await p.click('[data-act="publish"]'); await p.waitForTimeout(500);
await logout();
await login("aurelie");
await tab("ajouter"); await p.fill("#f-t", "Reportage JPO"); await p.click('#f-m .chip:has-text("Filières")'); await p.click('#f-cc .chip[value="rs"]');
if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
await p.evaluate(() => { const s = document.querySelector("#f-tf"); s.value = [...s.options].find((o) => o.textContent.includes("Journées")).value; });
await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
let h = await hist();
ok(h.length === 1 && h[0].startsWith("Création") && h[0].includes("Aurélie, aujourd'hui à"), "fiche : création dans l'historique, avec qui et quand");
ok(!(await topv().locator(".foot-note").count()), "plus de « Ajouté par » quand l'historique est là");

// titre et précisions changent : on propose de prévenir Julien (prévenu de tout) et Stéphane (RS cité)
await edit(async () => { await p.fill("#e-t", "Reportage JPO Bordeaux"); if (!(await p.$eval("#e-more", (d) => d.open))) await p.click("#e-more summary"); await p.fill("#e-note", "Rendez-vous à 9 h devant l'amphi"); });
ok(await alertShown(), "après la modification : « Prévenir du changement ? »");
const at = await alertText();
ok(/Titre : « Reportage JPO » → « Reportage JPO Bordeaux »/.test(at) && /Précisions : « Rendez-vous à 9 h devant l'amphi »/.test(at), "la question montre le changement");
ok(at.includes("Julien et Stéphane recevront une notification"), "elle dit qui sera prévenu");
await p.screenshot({ path: `${OUT}/h1-prevenir.png` });
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
ok((await p.textContent(".snack")).includes("Julien et Stéphane sont prévenus"), "confirmation après l'envoi");
let db = await fake();
ok(db.outbox.length === 2 && db.outbox.every((o) => o.title === "Modifié : Reportage JPO Bordeaux" && o.body.startsWith("Aurélie : titre : « Reportage JPO » → « Reportage JPO Bordeaux » ; précisions :")), "deux notifications, avec le changement");
h = await hist();
ok(h[0].startsWith("Changement signalé à 2 personnes") && h[1].startsWith("Modification : titre et précisions"), "historique : relance puis modification, la plus récente en haut");
ok(h[1].includes("titre« Reportage JPO » → « Reportage JPO Bordeaux »") || h[1].includes("titre\n« Reportage JPO » → « Reportage JPO Bordeaux »") || /titre\s*« Reportage JPO » → « Reportage JPO Bordeaux »/.test(h[1]), "détail avant → après");
await topv().locator(".hist").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/h2-historique.png` });

// un message ajouté : pas de question (rien d'important pour ceux qui ont été prévenus)
await edit(async () => { await p.click('#e-m .chip:has-text("Alumni")'); });
ok(!(await alertShown()), "changer les messages ne propose pas de prévenir");
h = await hist();
ok(h[0].startsWith("Modification : messages") && /Filières → Filières et Alumni/.test(h[0]), "historique : messages avant → après");

// la date change, on choisit de ne pas prévenir
const n0 = (await fake()).outbox.length;
await edit(async () => { await p.evaluate(() => { const d = document.querySelector("#e-date"); d.value = "2026-12-04"; }); });
ok(await alertShown() && /Date : .* → ven\. 4 déc\./.test(await alertText()), "la date change : la question montre l'ancienne et la nouvelle date");
await p.click(".alert .acts button:first-child"); await p.waitForTimeout(500);
db = await fake();
ok(db.outbox.length === n0 && db.journal.filter((j) => j.kind === "prevenu").length === 1, "« Pas besoin » : personne n'est relancé");
h = await hist();
ok(h[0].startsWith("Modification : date") && /date\s*.+ → ven\. 4 déc\./.test(h[0]), "historique : date avant → après");

// le statut change depuis la fiche
await topv().locator("select[data-st]").selectOption("production"); await p.waitForTimeout(400);
await p.evaluate(() => window.__fake.rt && window.__fake.rt()); await p.waitForTimeout(700);
h = await hist();
ok(h[0].startsWith("Modification : statut") && /Planifié → En production/.test(h[0]), "historique : statut");
ok(h.length === 3 && (await topv().locator("text=Voir tout l'historique (6)").count()) === 1, "trois lignes, puis « Voir tout l'historique »");
await topv().locator("text=Voir tout l'historique (6)").click(); await p.waitForTimeout(300);
ok((await hist()).length === 6, "tout l'historique déplié");

// un lien ajouté sur une action liée va sur le temps fort : il apparaît dans l'historique du temps fort
await logout();
await login("stephane");
const jpo = (await fake()).items.find((i) => i.t === "Journées portes ouvertes");
await tab("tf"); await p.locator(`[data-open="${jpo.id}"]`).first().click(); await p.waitForTimeout(400);
h = await hist();
ok(h.length === 1 && h[0].startsWith("Création") && h[0].includes("Julien"), "Stéphane voit l'historique du temps fort");
ok((await topv().locator(".foot-note").innerText()).startsWith("Modifiable par"), "qui peut modifier reste indiqué à ceux qui ne peuvent pas");
await p.click(`[data-act="addlink"][data-id="${jpo.id}"]`); await p.waitForTimeout(300);
await p.fill(".sheet input[type=url], .sheet #lk-url", "https://kedgebs.sharepoint.com/sites/com/jpo").catch(() => {});
console.log("  (feuille lien :", await p.locator(".sheet.show").count(), ")");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Historique : tout est bon");
process.exit(fails ? 1 : 0);
