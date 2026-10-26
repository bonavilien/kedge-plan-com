// Demande à la Direction du Programme (migration 0009) : un chef de projet la note pour lui-même et la marque reçue.
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
const open = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(500); };
const I = "10000000-0000-0000-0000-000000000001";
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
await p.evaluate(({ I, date }) => { window.__fake.db.items.push({ id: I, kind: "action", t: "Webinar PGE", date, flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: "00000000-0000-0000-0000-000000000003", at: new Date().toISOString() }); window.__fake.save(); }, { I, date: iso(20) });

// un service ne voit pas la Direction du Programme
await login("aurelie");
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
ok(!(await p.locator('#ask-to .chip:has-text("Direction du Programme")').count()), "RP : pas de « Direction du Programme » dans « À qui ? »");
await p.goto(URL0); await p.waitForTimeout(600);
await logout();

// Julien la note pour lui-même
await login("julien");
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
ok((await p.locator('#ask-to .chip:has-text("Direction du Programme")').count()) === 1, "chef : « Direction du Programme » dans « À qui ? »");
await p.click('#ask-type .chip:has-text("Programme")'); await p.click('#ask-to .chip:has-text("Direction du Programme")');
await p.screenshot({ path: `${OUT}/p1-a-qui.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
ok((await p.textContent(".snack")).includes("Noté : à demander à la Direction du Programme."), "confirmation : « Noté »");
let db = await fake();
const q = db.reqs.find((x) => x.dest === "programme");
ok(q && q.st === "ouverte", "demande enregistrée pour la Direction du Programme");
await tab("afaire");
const sent = await p.textContent("#v-afaire");
ok(sent.includes("Tes demandes en attente") && sent.includes("demandé à la Direction du Programme"), "À faire : dans « Tes demandes en attente »");
await p.locator(`#v-afaire [data-act="repondre"][data-r="${q.id}"]`).click(); await p.waitForTimeout(350);
ok((await p.textContent(".sheet.show")).includes("À demander à la Direction du Programme"), "la feuille « C'est reçu » rappelle à qui demander");
await p.fill("#rp-msg", "Programme validé par la direction"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(600);
db = await fake();
ok(db.reqs.find((x) => x.id === q.id).st === "recue", "Julien la marque reçue");
await open(I);
ok((await topv().locator(".rq").first().innerText()).includes("Programme validé par la direction"), "la fiche montre ce qui a été reçu");
await logout();

// Estelle ne la voit pas comme une demande à traiter
await login("estelle");
await tab("afaire");
ok(!(await p.textContent("#v-afaire")).includes("Webinar PGE"), "Estelle : rien dans À faire");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Direction du Programme : tout est bon");
process.exit(fails ? 1 : 0);
