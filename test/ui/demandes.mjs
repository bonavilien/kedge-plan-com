// Demandes d'éléments partagées par un temps fort et ses relais, sur le faux client.
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
// une action liée au temps fort JPO, publiée par la personne connectée
async function relaisJPO(titre) {
  await tab("ajouter"); await p.fill("#f-t", titre); await p.click('#f-m .chip:has-text("Filières")');
  if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
  await p.evaluate(() => { const s = document.querySelector("#f-tf"); s.value = [...s.options].find((o) => o.textContent.includes("Journées")).value; });
  await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
}
async function ask(type, to, quoi) {
  await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
  await p.click(`#ask-type .chip:has-text("${type}")`); await p.click(`#ask-to .chip:has-text("${to}")`);
  if (quoi) await p.fill("#ask-quoi", quoi);
}
const openJPO = async () => {
  const jpo = (await fake()).items.find((i) => i.t === "Journées portes ouvertes");
  await tab("tf"); await p.locator(`[data-open="${jpo.id}"]`).first().click(); await p.waitForTimeout(400);
};

await p.goto(URL0); await p.evaluate(() => localStorage.clear());
await login("julien");
await tab("ajouter"); await p.click('#f-kind button[value="tf"]'); await p.waitForTimeout(150);
await p.fill("#f-t", "Journées portes ouvertes"); await p.click('[data-act="publish"]'); await p.waitForTimeout(500);
await logout();

// Aurélie (RP) demande des visuels à la vidéo pour son reportage lié aux JPO
await login("aurelie");
await relaisJPO("Reportage JPO");
await ask("Visuels", "Vidéo", "Photos du campus en journée");
ok((await p.textContent(".sheet.show")).includes("Visible aussi sur le temps fort « Journées portes ouvertes » et ses relais."), "la feuille dit que la demande sera partagée avec le temps fort");
ok(!(await p.locator(".sheet.show .deja").count()), "rien de déjà demandé pour l'instant");
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
let r = await reqs();
ok(r.length === 1 && r[0].startsWith("Visuels : Photos du campus en journée") && /De Aurélie à Louise/.test(r[0]) && /Deadline/.test(r[0]), "la demande est sur la fiche du reportage");
ok((await topv().innerText()).includes("Partagées avec le temps fort « Journées portes ouvertes » et ses relais."), "la fiche dit qu'elle est partagée avec le temps fort");
await logout();

// Stéphane (RS) ouvre le temps fort : il voit la demande du reportage, avec le relais d'origine
await login("stephane");
await openJPO();
r = await reqs();
ok(r.length === 1 && r[0].startsWith("Reportage JPO\nVisuels : Photos du campus en journée"), "le temps fort montre la demande faite pour son relais, avec le relais nommé");
ok((await topv().innerText()).includes("Avec celles de ses relais."), "le temps fort dit d'où viennent les demandes");
await topv().locator(".rq").first().scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/d1-temps-fort.png` });

// il prépare sa propre action liée : la demande y est aussi, et la feuille montre ce qui est déjà demandé
await relaisJPO("Live Instagram JPO");
r = await reqs();
ok(r.length === 1 && r[0].startsWith("Reportage JPO\nVisuels"), "sa propre action liée montre la demande du reportage");
await ask("Contexte", "Julien");
const deja = await p.locator(".sheet.show .deja").innerText();
ok(/Déjà demandé/i.test(deja) && /Visuels : Photos du campus en journée/.test(deja) && /Vidéo · deadline .* · Reportage JPO/.test(deja), "la feuille montre ce qui est déjà demandé pour le temps fort");
await p.screenshot({ path: `${OUT}/d2-deja-demande.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
r = await reqs();
ok(r.length === 2, "deux demandes sur sa fiche : la sienne et celle du reportage");
await p.locator(".rq-for").first().click(); await p.waitForTimeout(400);
ok((await topv().locator(".hero-title").innerText()) === "Reportage JPO", "un appui sur le relais nommé ouvre sa fiche");
ok((await reqs()).some((t) => t.startsWith("Live Instagram JPO\nContexte")), "le reportage voit aussi la demande du live");
await logout();

// Louise (vidéo) retrouve la demande avec son temps fort et répond depuis le temps fort
await login("louise");
await tab("afaire");
const card = await p.locator(".todo").first().innerText();
ok(card.includes("Reportage JPO") && card.includes("Pour le temps fort « Journées portes ouvertes »"), "À faire : la demande dit pour quel temps fort");
await openJPO();
r = await reqs();
ok(r.length === 2, "le temps fort regroupe les deux demandes de ses relais");
const send = topv().locator('.rq [data-act="repondre"]');
ok((await send.count()) === 1, "Louise peut répondre à la demande qui la concerne, pas aux autres");
await p.screenshot({ path: `${OUT}/d3-reponse.png` });
await send.click(); await p.waitForTimeout(300); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
ok((await fake()).reqs.find((q) => q.type === "Visuels").st === "recue", "« Répondre » depuis le temps fort");
ok((await reqs()).some((t) => t.includes("Visuels") && t.includes("Reçu")), "la demande passe en « Reçu » pour tout le monde");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Demandes partagées : tout est bon");
process.exit(fails ? 1 : 0);
