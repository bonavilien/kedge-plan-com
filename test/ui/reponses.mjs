// Demandes d'éléments (migration 0006) : retirer une demande, répondre avec un message et un document
// rangé sur le temps fort quand l'action y est liée, sinon sur la fiche.
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
const tab = async (t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.waitForTimeout(250); };
const topv = () => p.locator(".view.pushed").last();
const reqs = () => topv().locator(".rq").allInnerTexts();
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
async function action(titre, tf) {
  await tab("ajouter"); await p.fill("#f-t", titre); await p.click('#f-m .chip:has-text("Filières")');
  if (tf) {
    if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
    await p.evaluate(() => { const s = document.querySelector("#f-tf"); s.value = [...s.options].find((o) => o.textContent.includes("Journées")).value; });
  }
  await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
}
async function ask(type, to) {
  await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
  await p.click(`#ask-type .chip:has-text("${type}")`); await p.click(`#ask-to .chip:has-text("${to}")`);
  await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
}
const open = async (t) => { const it = (await fake()).items.find((i) => i.t === t); await p.evaluate((id) => { location.hash = "#item=" + id; }, it.id); await p.waitForTimeout(500); return it; };

await p.goto(URL0); await p.evaluate(() => localStorage.clear());
await login("julien");
await tab("ajouter"); await p.click('#f-kind button[value="tf"]'); await p.waitForTimeout(150);
await p.fill("#f-t", "Journées portes ouvertes"); await p.click('[data-act="publish"]'); await p.waitForTimeout(500);
await logout();

// Aurélie demande des visuels à la vidéo et du contexte à RS, puis retire la seconde demande
await login("aurelie");
await action("Reportage JPO", true);
await ask("Visuels", "Vidéo");
await ask("Contexte", "RS");
let r = await reqs();
ok(r.length === 2 && r.every((t) => t.includes("Retirer la demande")), "chaque demande d'Aurélie a « Retirer la demande »");
await topv().locator('.rq:has-text("Contexte") [data-act="unreq"]').click(); await p.waitForTimeout(300);
ok((await p.textContent(".alert-wrap.show .alert")).includes("Retirer la demande ?"), "on confirme avant de retirer");
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(500);
r = await reqs();
ok(r.length === 1 && r[0].includes("Visuels"), "la demande retirée disparaît de la fiche");
ok((await fake()).reqs.find((q) => q.type === "Contexte").st === "annulee", "elle est notée comme retirée");
await logout();
await login("stephane");
await tab("afaire");
ok(!(await p.locator('#v-afaire .todo:has-text("Contexte")').count()), "RS n'a plus la demande retirée dans À faire");
await logout();

// Louise répond depuis À faire : un message et un lien
await login("louise");
await tab("afaire");
await p.locator('#v-afaire .todo:has-text("Reportage JPO") [data-act="repondre"]').click(); await p.waitForTimeout(350);
const sh = await p.textContent(".sheet.show");
ok(sh.includes("Le document va sur le temps fort « Journées portes ouvertes » et se voit sur tous ses relais."), "la feuille dit où va le document");
await p.fill("#rp-url", "pas un lien"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(250);
ok(await p.isVisible("#rp-err"), "un lien qui n'en est pas un est refusé");
await p.fill("#rp-msg", "Les visuels validés sont dans le dossier JPO.");
await p.fill("#rp-url", "https://kedgebs.sharepoint.com/sites/com/visuels-jpo"); await p.fill("#rp-nom", "Visuels JPO");
await p.screenshot({ path: `${OUT}/r1-repondre.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(600);
let db = await fake();
const jpo = db.items.find((i) => i.t === "Journées portes ouvertes"), rep = db.items.find((i) => i.t === "Reportage JPO"), q = db.reqs.find((x) => x.type === "Visuels");
ok(q.st === "recue" && q.reponse === "Les visuels validés sont dans le dossier JPO." && q.repondu_par.endsWith("5"), "réponse enregistrée, signée par Louise");
const l = db.links.find((x) => x.nom === "Visuels JPO");
ok(l && l.item === jpo.id && l.req === q.id, "le document est rangé sur le temps fort, rattaché à la demande");
ok((await p.textContent(".snack")).includes("Notification envoyée à Aurélie"), "confirmation : notification envoyée à Aurélie");

// la réponse se voit sur le temps fort et sur l'action
await open("Journées portes ouvertes");
let t = (await reqs())[0];
ok(t.includes("Reçu") && t.includes("Les visuels validés sont dans le dossier JPO.") && t.includes("Visuels JPO") && t.includes("Louise"), "temps fort : la demande montre le message, le document et qui a répondu");
ok((await topv().locator('.lk:has-text("Visuels JPO")').count()) === 1, "temps fort : le document est dans Documents");
await topv().locator(".rq").first().scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/r2-temps-fort.png` });
await open("Reportage JPO");
t = (await reqs())[0];
ok(t.includes("Les visuels validés sont dans le dossier JPO.") && t.includes("Visuels JPO"), "action liée : même réponse");
ok((await topv().locator('.lk:has-text("Visuels JPO")').count()) === 1, "action liée : le document est aussi là");
ok((await topv().locator(".hist .row").first().innerText()).startsWith("Éléments envoyés : Visuels"), "historique de l'action : « Éléments envoyés »");
await logout();

// une action sans temps fort : le document va sur l'action elle-même
await login("aurelie");
await action("Interview solo", false);
await ask("Rushs", "Vidéo");
await logout();
await login("louise");
await tab("afaire");
await p.locator('#v-afaire .todo:has-text("Interview solo") [data-act="repondre"]').click(); await p.waitForTimeout(350);
ok((await p.textContent(".sheet.show")).includes("Le document va sur la fiche."), "sans temps fort : le document va sur la fiche");
await p.fill("#rp-url", "https://kedgebs.sharepoint.com/sites/com/rushs"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(600);
db = await fake();
const solo = db.items.find((i) => i.t === "Interview solo"), l2 = db.links.find((x) => x.url.endsWith("/rushs"));
ok(l2 && l2.item === solo.id && l2.nom === "Rushs", "document sur l'action, nommé d'après la demande");
ok(db.reqs.find((x) => x.type === "Rushs").st === "recue", "demande passée en reçu sans message");
await open("Interview solo");
ok(!(await topv().locator('[data-act="repondre"]').count()) && !(await topv().locator('[data-act="unreq"]').count()), "une demande reçue n'a plus ni Répondre ni Retirer");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Réponses : tout est bon");
process.exit(fails ? 1 : 0);
