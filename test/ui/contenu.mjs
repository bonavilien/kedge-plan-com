// Cycle de vie des actions, temps forts et sujets (QA) : chaque vérification décrit le comportement attendu.
// Un FAIL = un défaut constaté. Usage : node test/ui/serve.mjs 8802 & node test/ui/contenu.mjs /tmp/out
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `40000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: "2026-10-01T10:00:00.000Z", ...o });

async function session(vp, extra = {}) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, timezoneId: "Europe/Paris", ...extra });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  return p;
}
async function seed(p, items, links = []) {
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(([items, links]) => { const f = window.__fake; f.db.items.push(...items); f.db.links.push(...links); f.save(); }, [items, links]);
}
async function login(p, who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
const fake = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const tab = async (p, t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
const topv = (p) => p.locator(".view.pushed").last();
const open = async (p, id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(400); };
const noNotify = async (p) => { if (await p.isVisible(".alert-wrap.show")) { await p.click(".alert .acts button:first-child"); await p.waitForTimeout(200); } };

const Y2 = [["Installer", "2027-09-01", "2027-10-31"], ["Considérer", "2027-11-01", "2027-12-31"], ["Préférer", "2028-01-01", "2028-03-31"], ["Convertir", "2028-04-01", "2028-05-31"], ["Décider", "2028-06-01", "2028-07-15"],
  ["Installer", "2028-09-01", "2028-10-31"], ["Considérer", "2028-11-01", "2028-12-31"]].map(([nom, du, au], i) => ({ n: 6 + i, nom, du, au, lib: nom }));
async function seedP(p, items, periods) { await seed(p, items); if (periods) await p.evaluate((ps) => { const f = window.__fake; f.db.periods.push(...ps); f.save(); }, periods); }

// A. retrait par erreur puis « Remettre » (ancien test 5 : le bouton s'appelle unretire)
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const a = it({ t: "Reel en production", date: "2026-10-29", svc: "rs", st: "production" });
  const p = await session(vp);
  await seed(p, [a]); await login(p, "stephane"); await open(p, a.id);
  await topv(p).locator('[data-act="retire"]').click(); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForTimeout(400);
  ok(await topv(p).locator('[data-act="unretire"]').count() === 1, `${vp.width}px : « Remettre cette action » proposé après un retrait`);
  await topv(p).locator('[data-act="unretire"]').click(); await p.waitForTimeout(500);
  const st = (await fake(p)).items.find((x) => x.id === a.id).st;
  ok(st === "production", `${vp.width}px : remise en place, le statut d'avant (En production) revient : st=${st}`);
  await p.context().close();
}

// B. date dans le trou entre deux années (16 juil. – 31 août) : où la voit-on ?
{
  const p = await session({ width: 390, height: 844 });
  await p.clock.install({ time: new Date("2027-08-20T10:00:00+02:00") });
  const a = it({ t: "Post rentrée anticipée", date: "2027-08-25", svc: "rp" });
  await seedP(p, [a], Y2); await login(p, "aurelie");
  const head = await p.textContent(".ph-t");
  const vis = await p.locator("#v-periode >> text=Post rentrée anticipée").count();
  ok(vis > 0, `le 20 août, une action du 25 août (dans 5 jours) est visible sur l'écran Ma période par défaut (« ${head.trim()} », visible=${vis})`);
  await p.context().close();
  const q = await session({ width: 1280, height: 800 });
  await q.clock.install({ time: new Date("2027-08-20T10:00:00+02:00") });
  const tf = it({ kind: "tf", t: "Pré-rentrée", date: "2027-08-28", svc: "chef", m: [] });
  await seedP(q, [tf, { ...a, tf: tf.id }], Y2); await login(q, "julien");
  await q.evaluate(() => document.querySelector('[data-act="meeting"]')?.click()); await q.waitForTimeout(500);
  const mt = await q.locator("#meeting").innerText().catch(() => "");
  ok(/Pré-rentrée/.test(mt), "réunion du 20 août : le temps fort du 28 août (dans 8 jours) apparaît");
  await q.screenshot({ path: `${OUT}/b-reunion-aout.png` });
  await q.context().close();
}

// C. sujet sur des périodes d'index ≥ 10 (3e année)
{
  const p = await session({ width: 1280, height: 800 });
  await seedP(p, [], Y2); await login(p, "julien");
  await tab(p, "ajouter"); await p.click('#f-kind button[value="sujet"]'); await p.waitForTimeout(150);
  for (const c of await p.locator('#f-per .chip[aria-pressed="true"]').all()) await c.click();
  await p.fill("#f-t", "Top UP 2028"); await p.click('#f-per .chip[value="9"]'); await p.click('#f-per .chip[value="10"]');
  await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
  const s = (await fake(p)).items.find((x) => x.t === "Top UP 2028");
  ok(s && s.date === "2028-06-01" && s.per.join() === "10,11", `sujet Décider 2028 + Installer 2028 : date ${s?.date} (attendu 2028-06-01), per ${s?.per}`);
  await p.context().close();
}

// D. modification concurrente : quelqu'un change la date pendant que je corrige le titre
{
  const a = it({ t: "CP salon", date: "2026-11-10", svc: "rp", cc: ["rs"] });
  const p = await session({ width: 390, height: 844 });
  await seed(p, [a]); await login(p, "aurelie"); await open(p, a.id);
  await topv(p).locator('[data-act="edit"]').click(); await p.waitForTimeout(300);
  await p.evaluate((id) => { const f = window.__fake, x = f.db.items.find((i) => i.id === id); x.date = "2026-11-17"; x.cc = ["rs", "video"]; f.save(); f.rt(); }, a.id);
  await p.waitForTimeout(900);
  await p.fill("#e-t", "CP salon (v2)"); await p.click('[data-act="save"]'); await p.waitForTimeout(600); await noNotify(p);
  const x = (await fake(p)).items.find((i) => i.id === a.id);
  ok(x.t === "CP salon (v2)" && x.date === "2026-11-17" && x.cc.join() === "rs,video", `titre enregistré, date et cc de l'autre gardés : ${x.t} / ${x.date} / ${x.cc}`);
  await p.waitForTimeout(800);
  ok(await topv(p).locator(".hero-meta").innerText().then((t) => /17 nov/.test(t)), "la fiche affiche la date de l'autre (17 nov.)");
  await p.context().close();
}

// E. Incontournable exclusif dans Modifier, dans les deux sens (1280 px)
{
  const a = it({ t: "Admissibles", date: "2026-11-12", svc: "rp", m: ["1"] });
  const p = await session({ width: 1280, height: 800 });
  await seed(p, [a]); await login(p, "aurelie"); await open(p, a.id);
  await topv(p).locator('[data-act="edit"]').click(); await p.waitForTimeout(300);
  await p.click('#e-m .chip[value="INC"]'); await p.waitForTimeout(100);
  ok((await p.locator('#e-m .chip[aria-pressed="true"]').evaluateAll((l) => l.map((c) => c.value))).join() === "INC", "Incontournable choisi : Filières se décoche");
  await p.click('#e-m .chip[value="3"]'); await p.waitForTimeout(100);
  ok((await p.locator('#e-m .chip[aria-pressed="true"]').evaluateAll((l) => l.map((c) => c.value))).join() === "3", "un message choisi : Incontournable se décoche");
  await p.click('[data-act="save"]'); await p.waitForTimeout(600); await noNotify(p);
  ok((await fake(p)).items.find((i) => i.id === a.id).m.join() === "3", "enregistré m=[3]");
  await p.context().close();
}

// F. documents de la famille : frère, temps fort, relais retiré ; retrait depuis le temps fort
{
  const tf = it({ kind: "tf", t: "Forum", date: "2026-11-20", svc: "chef", m: [] });
  const a = it({ t: "CP forum", date: "2026-11-18", svc: "rp", tf: tf.id }), b2 = it({ t: "Reel forum", date: "2026-11-19", svc: "rs", tf: tf.id }), c = it({ t: "Vidéo forum", date: "2026-11-19", svc: "video", tf: tf.id, st: "retire" });
  const L = (item, nom, author) => ({ id: crypto.randomUUID(), item, nom, url: "https://kedgebs.sharepoint.com/" + nom, author, at: "2026-10-01T10:00:00Z" });
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const p = await session(vp);
    await seed(p, [tf, a, b2, c], [L(tf.id, "Programme", U(1)), L(b2.id, "Script reel", U(4)), L(c.id, "Rushs vidéo", U(5))]);
    await login(p, "stephane"); await open(p, a.id);
    const txt = await topv(p).innerText();
    ok(/Programme/.test(txt) && /Script reel/.test(txt) && !/Rushs vidéo/.test(txt), `${vp.width}px : relais RP voit le doc du TF et du relais RS, pas celui du relais retiré`);
    ok(await topv(p).locator('.lk:has-text("Script reel") [data-act="unlink"]').count() === 1 && await topv(p).locator('.lk:has-text("Programme") [data-act="unlink"]').count() === 0, `${vp.width}px : Stéphane peut retirer son doc, pas celui de Julien`);
    await open(p, tf.id);
    await topv(p).locator('.lk:has-text("Script reel") [data-act="unlink"]').click(); await p.waitForTimeout(200);
    await p.click(".alert .acts button:last-child"); await p.waitForTimeout(500);
    const db = await fake(p);
    ok(!db.links.some((l) => l.nom === "Script reel") && !/Script reel/.test(await topv(p).innerText()), `${vp.width}px : doc du relais retiré depuis le temps fort`);
    await open(p, b2.id);
    const h = await topv(p).locator(".hist").innerText().catch(() => "");
    ok(/retiré/i.test(h), `${vp.width}px : l'historique du relais garde une trace du document retiré — « ${h.replace(/\n/g, " / ")} »`);
    await p.context().close();
  }
}

// G. action liée publiée avec un lien : où va le document, et l'historique de l'action
{
  const tf = it({ kind: "tf", t: "JPO", date: "2026-11-28", svc: "chef", m: [] });
  const p = await session({ width: 390, height: 844 });
  await seed(p, [tf]); await login(p, "aurelie");
  await tab(p, "ajouter"); await p.fill("#f-t", "CP JPO avec dossier"); await p.click('#f-m .chip:has-text("Alumni")');
  if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
  await p.selectOption("#f-tf", tf.id); await p.fill("#f-link", "https://kedgebs.sharepoint.com/dossier");
  await p.click('[data-act="publish"]'); await p.waitForTimeout(800);
  const db = await fake(p), act = db.items.find((x) => x.t === "CP JPO avec dossier");
  ok(act && db.links.some((l) => l.item === act.id), "le lien d'une action liée reste sur l'action");
  ok(/Document SharePoint/.test(await topv(p).innerText()), "la fiche de l'action montre le document");
  // détacher l'action : son document reste-t-il avec elle ?
  await topv(p).locator('[data-act="edit"]').click(); await p.waitForTimeout(300);
  await p.selectOption("#e-tf", ""); await p.click('[data-act="save"]'); await p.waitForTimeout(600); await noNotify(p);
  await open(p, act.id);
  ok(/Document SharePoint/.test(await topv(p).innerText()), "après détachement du temps fort, l'action garde le document qu'on avait posé avec elle");
  ok(p.errs.length === 0, "aucune erreur JS " + p.errs.join(" | "));
  await p.context().close();
}
console.log(fails ? `${fails} échec(s) = défauts constatés` : "tout est bon");
await b.close();
process.exit(fails ? 1 : 0);
