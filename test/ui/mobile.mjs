// Téléphone : cinq onglets en bas (Ajouter devient un + en haut), calendrier en agenda semaine par semaine ; l'ordinateur garde le tableau et le menu complet.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const errs = [];
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ID = (n) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { flou: "", fin: null, per: [], cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", rang: null, cible: null, author: "00000000-0000-0000-0000-000000000001", at: "2026-09-15T10:00:00.000Z" };
const items = [
  { ...base, id: ID(1), kind: "tf", t: "Temps fort mobile", date: day(-8), fin: day(0), svc: "chef", m: [] },
  { ...base, id: ID(2), kind: "action", t: "Action RP mobile", date: day(1), svc: "rp" },
  { ...base, id: ID(3), kind: "action", t: "Action passée mobile", date: day(-21), svc: "rs" },
];
async function open(w, h, who) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate((items) => { const f = window.__fake; f.db.items.push(...items); f.save(); }, items);
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
  return p;
}
const tab = async (p, t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (x) => x.click()); await p.waitForTimeout(300); };

for (const [w, h] of [[360, 740], [390, 844]]) {
  const p = await open(w, h, "aurelie");
  const tabs = await p.$$eval(".tabbar .tab", (ts) => ts.filter((t) => t.offsetParent).map((t) => t.dataset.kuiTab));
  ok(tabs.length === 5 && !tabs.includes("ajouter"), `${w}px : cinq onglets en bas, sans Ajouter (${tabs.join(",")})`);
  const over = await p.$$eval(".tabbar .tab", (ts) => { const r = ts.filter((t) => t.offsetParent).map((t) => t.getBoundingClientRect()); return r.some((a, i) => i && a.left < r[i - 1].right - 1); });
  ok(!over, `${w}px : les onglets ne se chevauchent pas`);
  ok(await p.isVisible('#v-periode [data-act="goadd"]'), `${w}px : un + en haut de Ma période`);
  await p.click('#v-periode [data-act="goadd"]'); await p.waitForTimeout(300);
  ok(await p.isVisible("#v-ajouter #f-t"), `${w}px : le + ouvre le formulaire Ajouter`);
  await tab(p, "grille");
  ok(!(await p.$("#gwrap")) && (await p.$$(".pw-h")).length > 0, `${w}px : le calendrier se lit semaine par semaine`);
  ok(/Calendrier/.test(await p.textContent('.tab[data-kui-tab="grille"]')) && /Calendrier/.test(await p.textContent("#v-grille .large-title")), `${w}px : l'onglet s'appelle Calendrier`);
  ok(await p.isVisible("#pw-now") && /Cette semaine/.test(await p.textContent("#pw-now")), `${w}px : la semaine en cours est marquée`);
  ok(!(await p.$('#v-grille [data-open="' + ID(3) + '"]')), `${w}px : les semaines passées sont repliées`);
  ok(await p.$(`#pw-now .ag-row[data-open="${ID(2)}"]`) && /RP/.test(await p.textContent(`#pw-now [data-open="${ID(2)}"] .ag-who`)), `${w}px : l'action a sa ligne, avec son service, dans la semaine`);
  ok(!(await p.$$eval("#v-grille .pw, #v-grille .pw *", (es) => es.some((e) => { const s = getComputedStyle(e); return parseFloat(s.borderLeftWidth) > 1 || /inset \d+px 0px 0px/.test(s.boxShadow); }))), `${w}px : pas de liseré sur le côté`);
  const plus = await p.$eval('#v-periode .add-btn', (x) => { const r = x.getBoundingClientRect(), q = x.querySelector("svg").getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - (q.x + q.width / 2)) + Math.abs(r.y + r.height / 2 - (q.y + q.height / 2)); });
  ok(plus < 1, `${w}px : le + est centré dans son rond (écart ${plus.toFixed(1)} px)`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w, `${w}px : rien ne déborde en largeur (${sw})`);
  if (await p.$('[data-act="gpast"]')) { await p.click('[data-act="gpast"]'); await p.waitForTimeout(250); ok(await p.$(`#v-grille [data-open="${ID(3)}"]`), `${w}px : « Voir les semaines passées » les déplie`); }
  ok((await p.$$(`#v-grille .ag-row[data-open="${ID(1)}"]`)).length === 1 && (await p.$$(`#v-grille .pw-cont[data-open="${ID(1)}"]`)).length >= 1, `${w}px : un temps fort sur plusieurs jours : sa ligne la semaine où il commence, un rappel les suivantes`);
  await p.click('.pg-nav [data-i="1"]'); await p.waitForTimeout(300);
  ok(await p.$eval('.pg-nav [data-i="1"]', (x) => x.getAttribute("aria-pressed")) === "true" && !(await p.$("#pw-now")), `${w}px : on passe à la période suivante`);
  await p.click(`#v-grille .ag-row >> nth=0`).catch(() => {}); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/mobile-grille-${w}.png` });
  await p.context().close();
}
{
  const p = await open(390, 844, "nouveau");
  ok(!(await p.$('[data-act="goadd"]')), "390px : un compte sans service n'a pas de +");
  await p.context().close();
}
{
  const p = await open(1440, 900, "julien");
  ok(await p.isVisible('.tab[data-kui-tab="ajouter"]'), "1440px : Ajouter reste dans le menu");
  ok(!(await p.isVisible('#v-periode [data-act="goadd"]')), "1440px : pas de + en haut");
  await tab(p, "grille");
  ok(await p.$("#gwrap") && !(await p.$(".pw-h")) && /Calendrier/.test(await p.textContent('.tab[data-kui-tab="grille"]')), "1440px : le calendrier reste un tableau, sous le nom Calendrier");
  await p.context().close();
}
ok(!errs.length, `pas d'erreur JS ${errs.join(" | ")}`);
await b.close();
process.exit(fails ? 1 : 0);
