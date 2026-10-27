// Demande à soi-même (migration 0013) : un chef se note des éléments à fournir lui-même, personne d'autre n'est prévenu.
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

// un service n'a pas « Moi »
await login("aurelie");
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
ok(!(await p.locator('#ask-to .chip:text-is("Moi")').count()), "RP : pas de « Moi » dans « À qui ? »");
await p.goto(URL0); await p.waitForTimeout(600);
await logout();

// Julien se note le programme à fournir
await login("julien");
const n0 = (await fake()).outbox.length;
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
ok((await p.locator('#ask-to .chip:text-is("Moi")').count()) === 1, "chef : « Moi » dans « À qui ? »");
await p.click('#ask-type .chip:has-text("Programme")'); await p.click('#ask-to .chip:text-is("Moi")');
await p.screenshot({ path: `${OUT}/m1-a-qui.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
ok((await p.textContent(".snack")).includes("Noté dans ton À faire."), "confirmation : « Noté dans ton À faire. »");
let db = await fake();
const q = db.reqs.find((x) => x.dest === "moi");
ok(q && q.st === "ouverte" && db.outbox.length === n0, "note enregistrée, personne de prévenu");
ok((await topv().locator(".rq").first().innerText()).includes("De Julien à Julien"), "fiche : « De Julien à Julien »");
await tab("afaire");
const card = p.locator(`#v-afaire .todo:has([data-r="${q.id}"])`);
ok((await card.count()) === 1 && (await card.innerText()).includes("À fournir toi-même : le programme."), "À faire : « À fournir toi-même : le programme. »");
ok(!(await p.textContent("#v-afaire")).includes("Tes demandes en attente"), "pas dans « Tes demandes en attente »");
ok((await p.locator('.tab[data-kui-tab="afaire"] .tab-badge').textContent()) === "1", "elle compte dans le badge À faire");
await p.screenshot({ path: `${OUT}/m2-a-faire.png` });
await card.locator('[data-act="repondre"]').click(); await p.waitForTimeout(350);
const sh = await p.textContent(".sheet.show");
ok(sh.includes("C'est fait") && sh.includes("À fournir toi-même : Programme."), "la feuille « C'est fait »");
await p.fill("#rp-msg", "Programme envoyé à l'équipe RP"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(600);
ok((await p.textContent(".snack")).includes("Noté comme fait."), "confirmation : « Noté comme fait. »");
db = await fake();
ok(db.reqs.find((x) => x.id === q.id).st === "recue" && db.outbox.length === n0, "marquée faite, toujours personne de prévenu");
await logout();

// Estelle ne la voit pas comme une chose à faire
await login("estelle");
await tab("afaire");
ok(!(await p.textContent("#v-afaire")).includes("Webinar PGE"), "Estelle : rien dans À faire");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Demande à soi-même : tout est bon");
process.exit(fails ? 1 : 0);
