// Demande à un chef nommé (migration 0014) : un service demande à Julien seulement, lui seul est prévenu, il répond.
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

const J = "00000000-0000-0000-0000-000000000001";
const chips = async () => (await p.locator("#ask-to .chip").allInnerTexts()).map((x) => x.trim());

// Aurélie (RP) demande le contexte à Julien
await login("aurelie");
const n0 = (await fake()).outbox.length;
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
let to = await chips();
ok(to[0] === "Julien" && !to.includes("Estelle") && to.includes("Resp. offre"), `RP : « Julien » en premier, Estelle sous « Resp. offre » (choix : ${to.join(", ")})`);
await p.click('#ask-type .chip:has-text("Contexte")'); await p.click('#ask-to .chip:text-is("Julien")');
await p.screenshot({ path: `${OUT}/c1-a-qui.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
ok((await p.textContent(".snack")).includes("Demande envoyée à Julien."), "confirmation : « Demande envoyée à Julien. »");
let db = await fake();
const q = db.reqs.find((x) => x.dest === J);
ok(q && q.st === "ouverte", "demande enregistrée pour Julien");
ok(JSON.stringify(db.outbox.slice(n0).map((x) => x.user_id)) === JSON.stringify([J]), "seul Julien est prévenu");
ok((await topv().locator(".rq").first().innerText()).includes("De Aurélie à Julien"), "fiche : « De Aurélie à Julien »");
await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
await p.click('#ask-type .chip:has-text("Contexte")'); await p.click('#ask-to .chip:text-is("Julien")'); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(300);
ok((await p.textContent("#ask-err")).includes("Déjà demandé à Julien"), "la même demande deux fois : « Déjà demandé à Julien »");
await p.goto(URL0); await p.waitForTimeout(600);
await tab("afaire");
ok((await p.textContent("#v-afaire")).includes("demandé à Julien"), "À faire d'Aurélie : « demandé à Julien »");
await logout();

// Estelle (chef, Resp. offre) : rien à faire, mais elle peut aussi demander à Julien
await login("estelle");
await tab("afaire");
ok(!(await p.textContent("#v-afaire")).includes("Webinar PGE"), "Estelle : la demande à Julien n'est pas dans son À faire");
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
to = await chips();
ok(to.includes("Julien") && !to.includes("Estelle"), `Estelle : « Julien » dans « À qui ? » (choix : ${to.join(", ")})`);
await p.goto(URL0); await p.waitForTimeout(600);
await logout();

// Julien la voit dans son À faire et répond
await login("julien");
await tab("afaire");
const card = p.locator(`#v-afaire .todo:has([data-r="${q.id}"])`);
ok((await card.count()) === 1 && (await card.innerText()).includes("Aurélie demande"), "À faire de Julien : « Aurélie demande… »");
await p.screenshot({ path: `${OUT}/c2-a-faire.png` });
await card.locator('[data-act="repondre"]').click(); await p.waitForTimeout(350);
ok((await p.textContent(".sheet.show")).includes("Aurélie demande"), "la feuille « Répondre »");
await p.fill("#rp-msg", "Le contexte est dans le dossier"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(600);
ok((await p.textContent(".snack")).includes("Notification envoyée à Aurélie."), "confirmation : « Notification envoyée à Aurélie. »");
db = await fake();
ok(db.reqs.find((x) => x.id === q.id).st === "recue", "réponse enregistrée");
await open(I); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
to = await chips();
ok(!to.includes("Julien") && to.includes("Moi (mémo)"), `Julien : pas lui-même, mais « Moi » (choix : ${to.join(", ")})`);

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Demande à un chef : tout est bon");
process.exit(fails ? 1 : 0);
