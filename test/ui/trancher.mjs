// « À trancher en réunion » : un bouton sur les fiches (action, partenariat, temps fort) qui fait remonter le sujet dans l'écran réunion.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const iso = (d) => d.toISOString().slice(0, 10), plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `40000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: new Date().toISOString(), ...o });
const jpo = it({ kind: "tf", t: "Journées portes ouvertes", date: plus(10), svc: "chef", m: [] });
const cp = it({ t: "CP de rentrée", date: plus(5) });
const pay = it({ t: "Guide Prépa", date: plus(8), svc: "chef", partner: "major", m: ["4"] });
const items = [jpo, cp, pay];

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
await p.evaluate((items) => { const f = window.__fake; f.db.items.push(...items); f.db.partners.push({ k: "major", nom: "Major Prépa" }); f.save(); }, items);
const login = async (mail) => {
  await p.fill("#lg-mail", mail); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);
};
const fiche = () => p.locator(".view.pushed").last();
const open = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(400); };
await login("julien@kedgebs.com");

for (const [x, nom] of [[cp, "action"], [pay, "partenariat"], [jpo, "temps fort"]]) {
  await open(x.id);
  const btn = fiche().locator('[data-act="trancher"]');
  ok(await btn.isVisible(), `${nom} : bouton « Sujet à trancher » sur la fiche`);
  await btn.click(); await p.waitForTimeout(300);
  ok(await p.isVisible("#tr-why"), `${nom} : une feuille demande la raison (facultative)`);
  if (x !== jpo) await p.fill("#tr-why", x === cp ? "On garde la date   ou on décale ?" : "Payer ou pas la double page ?");
  if (x === cp) await p.screenshot({ path: `${OUT}/t0-feuille.png` });
  await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(400);
  const want = x === cp ? /À trancher\s*On garde la date ou on décale \?/ : x === pay ? /Payer ou pas/ : /À trancher\s*Sujet à trancher en réunion/;
  ok(want.test(await fiche().locator(".blk-group").innerText()) && !(await fiche().locator('[data-act="trancher"]').count()), `${nom} : la fiche affiche « Réunion · À trancher en réunion », le bouton disparaît`);
  if (x === cp) await p.screenshot({ path: `${OUT}/t1-fiche.png` });
}
const rows = await p.evaluate(() => window.__fake.db.blocks.filter((b) => b.why === "à trancher en réunion").length);
ok(rows === 1, "sans raison : le motif seul");
ok(await p.evaluate(() => window.__fake.db.blocks.some((b) => b.why === "à trancher en réunion : On garde la date ou on décale ?")), "avec raison : « à trancher en réunion : … », espaces resserrés");
// À faire : un sujet à trancher n'est pas un blocage
await p.evaluate(() => { location.hash = ""; }); await p.click('.side-btn[data-kui-tab="afaire"], .tab[data-kui-tab="afaire"] >> visible=true').catch(() => {}); await p.waitForTimeout(300);
ok(!/Blocages/.test(await p.locator("#v-afaire").innerText().catch(() => "")), "À faire : pas compté comme blocage");

await p.click('.side-btn[data-act="meeting"]'); await p.waitForTimeout(400);
const aside = () => p.locator(".mt-aside").innerText();
let a = await aside(); console.log("   " + a.split("\n").slice(0, 8).join(" | "));
ok(/À trancher\s*3/.test(a) && /CP de rentrée/.test(a) && /Guide Prépa/.test(a) && /Journées portes ouvertes/.test(a) && /On garde la date ou on décale \?/.test(a), "réunion : section « À trancher » avec les trois sujets");
ok(/Rien ne bloque/.test(a), "réunion : les sujets à trancher ne sont pas des blocages");
await p.hover('.ma-tr:has-text("CP de rentrée") .ma-item'); await p.waitForTimeout(200);
ok(await p.$eval('.ma-tr .ma-item', (e) => getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)"), "survol d'un sujet à trancher : pas de surbrillance, comme les autres lignes");
const ctb = await p.locator(".mt-aside .ma-item.ctb").allInnerTexts(); console.log("   contributions :", ctb.map((t) => t.replace(/\n+/g, " / ")).join(" | "));
ok(ctb.length === 3 && ctb.some((t) => /nouvelle action RP/.test(t)) && ctb.some((t) => /nouveau partenariat/.test(t)) && ctb.some((t) => /nouveau temps fort/.test(t)), "contributions : la nouvelle action, le nouveau partenariat et le nouveau temps fort");
await p.screenshot({ path: `${OUT}/t2-reunion.png` });
await p.locator('.ma-tr:has-text("CP de rentrée") .ma-ok').click(); await p.waitForTimeout(300);
a = await aside();
ok(/À trancher\s*2/.test(a) && !(await p.locator('.ma-tr:has-text("CP de rentrée")').count()), "« Tranché » le retire de la réunion");
await p.locator('.ma-tr:has-text("Guide Prépa") .ma-item').click(); await p.waitForTimeout(400);
ok(await p.isHidden("#meeting") && /Guide Prépa/.test(await fiche().innerText()), "un sujet ouvre sa fiche");
await fiche().locator('[data-act="untrancher"]').click(); await p.waitForTimeout(300);
ok(await fiche().locator('[data-act="trancher"]').isVisible(), "« Retirer » sur la fiche : le bouton revient");
await open(cp.id);
ok(await fiche().locator('[data-act="trancher"]').isVisible(), "un sujet tranché peut être remis à l'ordre du jour");

// un service peut proposer un sujet, même sur un partenariat qu'il ne modifie pas ; un visiteur non
await p.evaluate(() => { const f = window.__fake; f.db.session = null; f.save(); }); await p.goto(URL0); await p.waitForSelector("#login");
await login("aurelie@kedgebs.com");
await open(pay.id);
ok(await fiche().locator('[data-act="trancher"]').isVisible(), "un service voit le bouton sur un partenariat");
await fiche().locator('[data-act="trancher"]').click(); await p.waitForTimeout(300); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(400);
ok(await fiche().locator('[data-act="untrancher"]').isVisible(), "et peut retirer le sujet qu'il a proposé");
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/t3-fiche-390.png` });

ok(!errs.length, "aucune erreur JS" + (errs.length ? " : " + errs.join(" / ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "tout est bon");
process.exit(fails ? 1 : 0);
