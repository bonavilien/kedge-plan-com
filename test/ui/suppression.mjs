// Supprimer pour de bon une fiche retirée (migration 0008), « À suivre » : la période suivante dans les 7 derniers jours d'une période,
// et sur ordinateur, le formulaire Ajouter qui reste utilisable avec la fiche ouverte en panneau.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
// le lundi 26 octobre 2026 : Installer finit le 31, Considérer commence le 1er novembre
await p.clock.setFixedTime(new Date("2026-10-26T09:00:00"));
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|row-level security/.test(m.text())) errs.push(m.text()); });
const fake = () => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const tab = async (t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
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
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`, I = (n) => `10000000-0000-0000-0000-00000000000${n}`;
const it = (n, t, date, svc, more = {}) => ({ id: I(n), kind: "action", t, date, flou: "", per: [], svc, cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(3), at: "2026-10-20T10:00:00Z", ...more });

await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
await p.evaluate((items) => { const d = window.__fake.db; d.items.push(...items);
  d.reqs.push({ id: "r1", item: items[1].id, asker: items[1].author, dest: "rs", type: "Visuels", quoi: "", pour: "2026-11-02", st: "ouverte", at: "2026-10-20T10:00:00Z" });
  window.__fake.save(); }, [
  it(1, "Salon Studyrama", "2026-11-20", "chef", { kind: "tf", m: [], author: U(1) }),
  it(2, "CP à supprimer", "2026-10-29", "rp"),
  it(3, "Relais du salon", "2026-11-18", "rp", { tf: I(1) }),
  it(4, "Interview du 3 novembre", "2026-11-03", "rp"),
  it(5, "Post RS du 4 novembre", "2026-11-04", "rs", { author: U(4) }),
  it(6, "Podcast fin novembre", "2026-11-25", "rp"),
]);

// ---------- À suivre ----------
await login("aurelie");
let per = await p.textContent("#v-periode");
const soonH = await p.textContent("#v-periode .soon-h").catch(() => "");
ok(/^À suivre/.test(soonH) && soonH.includes("Considérer, dès le 1er novembre"), "Ma période, 5 jours avant la fin : « À suivre · Considérer, dès le 1er novembre »");
ok(per.includes("Interview du 3 novembre") && !per.includes("Post RS du 4 novembre"), "À suivre suit le filtre « Mon service »");
ok(!per.includes("Podcast fin novembre"), "À suivre : seulement les deux premières semaines");
await p.screenshot({ path: `${OUT}/s1-a-suivre.png`, fullPage: true });

// ---------- Supprimer ----------
await open(I(2));
ok((await topv().locator('[data-act="delete"]').count()) === 0, "pas de « Supprimer » sur une action pas retirée");
await topv().locator('[data-act="retire"]').click(); await p.waitForTimeout(300); await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
ok((await topv().locator('[data-act="delete"]').count()) === 1, "action retirée : « Supprimer définitivement »");
await topv().locator('[data-act="delete"]').click(); await p.waitForTimeout(300);
ok((await p.textContent(".alert-wrap.show .alert")).includes("Impossible de revenir en arrière"), "on confirme avant de supprimer");
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(700);
let db = await fake();
ok(!db.items.some((x) => x.id === I(2)) && !db.reqs.some((q) => q.item === I(2)) && !db.journal.some((j) => j.item === I(2)), "l'action, sa demande et son historique sont supprimés");
ok(!(await p.textContent("#v-periode")).includes("CP à supprimer"), "elle a disparu de Ma période");
// une action RS : pas de « Supprimer » pour RP, même retirée
await p.evaluate((id) => { window.__fake.db.items.find((x) => x.id === id).st = "retire"; window.__fake.save(); }, I(5));
await p.reload(); await p.waitForTimeout(900); await open(I(5));
ok((await topv().locator('[data-act="delete"]').count()) === 0, "RP ne supprime pas une action RS retirée");
await logout();

// un chef supprime un temps fort retiré : le relais reste
await login("julien");
await open(I(1));
await topv().locator('[data-act="retire"]').click(); await p.waitForTimeout(300); await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
await topv().locator('[data-act="delete"]').click(); await p.waitForTimeout(300);
ok((await p.textContent(".alert-wrap.show .alert")).includes("Son relais reste, sans temps fort,"), "temps fort : la confirmation dit que le relais reste");
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(700);
db = await fake();
ok(!db.items.some((x) => x.id === I(1)) && db.items.find((x) => x.id === I(3)).tf === null, "temps fort supprimé, relais gardé sans temps fort");
await open(I(3));
ok((await topv().textContent(".hero")).includes("Relais du salon"), "la fiche du relais s'ouvre toujours");

// ---------- ordinateur : deux ajouts d'affilée, la fiche du premier ouverte en panneau ----------
await logout();
await p.setViewportSize({ width: 1440, height: 900 });
await login("aurelie");
await p.click('[data-kui-tab="ajouter"] >> visible=true'); await p.waitForTimeout(300);
const pub = async (t) => { await p.fill("#f-t", t, { timeout: 3000 }); await p.click('#f-m .chip:has-text("Filières")', { timeout: 3000 }); await p.click('[data-act="publish"]', { timeout: 3000 }); await p.waitForTimeout(700); };
await pub("Ordi 1");
// la vraie base renvoie chaque publication par le temps réel : l'écran se redessine
await p.evaluate(() => window.__fake.rt?.()); await p.waitForTimeout(1200);
ok(!(await p.$eval("#v-ajouter", (v) => v.inert)), "ordinateur : le formulaire Ajouter reste utilisable avec la fiche ouverte à droite");
await pub("Ordi 2").catch(() => {});
ok((await fake()).items.some((x) => x.t === "Ordi 2"), "ordinateur : la deuxième action se publie");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Suppression : tout est bon");
process.exit(fails ? 1 : 0);
