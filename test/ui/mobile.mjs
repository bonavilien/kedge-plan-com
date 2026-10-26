// Téléphone : cinq onglets en bas (Ajouter devient un + en haut), grille semaine par semaine ; l'ordinateur garde la grille et le menu complet.
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
  ok(!(await p.$("#gwrap")) && (await p.$$(".pw")).length > 0, `${w}px : la grille se lit semaine par semaine`);
  ok(await p.isVisible("#pw-now") && /Cette semaine/.test(await p.textContent("#pw-now")), `${w}px : la semaine en cours est marquée`);
  ok(!(await p.$('.pw [data-open="' + ID(3) + '"]')), `${w}px : les semaines passées sont repliées`);
  ok(await p.$(`#pw-now .blk[data-open="${ID(2)}"]`) && /RP/.test(await p.textContent("#pw-now .pw-s")), `${w}px : l'action est rangée sous son service`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w, `${w}px : rien ne déborde en largeur (${sw})`);
  if (await p.$('[data-act="gpast"]')) { await p.click('[data-act="gpast"]'); await p.waitForTimeout(250); ok(await p.$(`.pw [data-open="${ID(3)}"]`), `${w}px : « Voir les semaines passées » les déplie`); }
  ok((await p.$$(`.pw .blk[data-open="${ID(1)}"]`)).length >= 2, `${w}px : un temps fort sur plusieurs jours apparaît dans chacune de ses semaines`);
  await p.click('.pg-nav [data-i="1"]'); await p.waitForTimeout(300);
  ok(await p.$eval('.pg-nav [data-i="1"]', (x) => x.getAttribute("aria-pressed")) === "true" && !(await p.$("#pw-now")), `${w}px : on passe à la période suivante`);
  await p.click(`.pw .blk >> nth=0`).catch(() => {}); await p.waitForTimeout(400);
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
  ok(await p.$("#gwrap") && !(await p.$(".pw")), "1440px : la grille reste un tableau");
  await p.context().close();
}
ok(!errs.length, `pas d'erreur JS ${errs.join(" | ")}`);
await b.close();
process.exit(fails ? 1 : 0);
