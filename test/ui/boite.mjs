// Page Notifications (migration 0016) : la cloche en haut à gauche, la liste des 7 derniers jours, effacer une ou toutes.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const I = "10000000-0000-0000-0000-000000000009";
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

for (const [w, h, name] of [[390, 844, "mobile"], [1440, 900, "ordinateur"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
  await p.evaluate(({ I, U1, U3, a, d }) => {
    const f = window.__fake;
    f.db.items.push({ id: I, kind: "action", t: "Webinar PGE", date: d, flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U3, at: a[0] });
    f.db.outbox.push(
      { id: 1, user_id: U1, title: "Nouvelle action", body: "Aurélie ajoute « Webinar PGE »", url: "#item=" + I, created_at: a[0] },
      { id: 2, user_id: U1, title: "Demande d'éléments", body: "Stéphane demande des visuels pour « JPO »", url: "#afaire", created_at: a[1] },
      { id: 3, user_id: U1, title: "Rappel J-7", body: "Salon Studyrama", url: "", created_at: a[2] },
      { id: 4, user_id: U1, title: "Trop vieille", body: "", url: "", created_at: a[3] },
      { id: 5, user_id: U3, title: "Pour Aurélie", body: "", url: "", created_at: a[0] });
    f.save();
  }, { I, U1: U(1), U3: U(3), a: [ago(1), ago(30), ago(24 * 5), ago(24 * 8)], d: plus(20) });
  await p.fill("#lg-mail", "julien@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);

  const bell = p.locator("#v-periode .nb-lead .bell-btn");
  ok(await bell.isVisible(), `${name} : la cloche est en haut à gauche`);
  const bb = await bell.boundingBox(), title = await p.locator("#v-periode .nb").boundingBox();
  ok(bb.x < title.x + 80 && bb.y < 70, `${name} : position ${Math.round(bb.x)},${Math.round(bb.y)}`);
  ok((await bell.locator(".bell-badge").innerText()) === "3", `${name} : pastille « 3 » (pas celle de plus de 7 jours ni celle d'Aurélie)`);
  ok(await p.locator('.tab[data-kui-tab="afaire"] svg path[d^="m4 6.5"]').count() === 1, `${name} : l'onglet À faire a sa nouvelle icône`);
  for (const t of ["tf", "grille", "afaire"]) { await p.$eval(`.tab[data-kui-tab="${t}"]`, (x) => x.click()); await p.waitForTimeout(200);
    ok(await p.locator(`#v-${t} .nb-lead .bell-btn`).isVisible(), `${name} : cloche aussi sur l'onglet ${t}`); }
  await p.screenshot({ path: `${OUT}/notif-${name}-onglet.png` });

  await p.locator("#v-afaire .bell-btn").click(); await p.waitForTimeout(450);
  const v = p.locator(".view.pushed").last();
  const txt = await v.innerText();
  ok(/Aujourd'hui/i.test(txt) && /Hier/i.test(txt) && /Nouvelle action/.test(txt) && /Rappel J-7/.test(txt), `${name} : liste groupée par jour`);
  ok(!/Trop vieille|Pour Aurélie/.test(txt), `${name} : ni les vieilles ni celles des autres`);
  ok(await v.locator(".nt.is-new").count() === 3, `${name} : les trois sont marquées nouvelles pendant la visite`);
  await p.screenshot({ path: `${OUT}/notif-${name}-liste.png` });
  await p.waitForTimeout(200);
  ok(!(await p.locator("#v-afaire .bell-badge").count()), `${name} : la pastille disparaît une fois la page ouverte`);
  ok(await p.evaluate(() => window.__fake.db.answers.some((a) => a.key === "notifs_vues")), `${name} : « déjà vues » enregistré`);

  // ouvrir une notification : la fiche s'ouvre, la liste reste derrière
  await v.locator('[data-notif="1"]').click(); await p.waitForTimeout(450);
  ok(/Webinar PGE/.test(await p.locator(".view.pushed").last().innerText()), `${name} : une notification ouvre sa fiche`);
  await p.locator(".view.pushed").last().locator(".back").click(); await p.waitForTimeout(400);

  // effacer une
  await p.locator('.view.pushed [data-act="unnotif"][data-n="3"]').click(); await p.waitForTimeout(300);
  ok(!/Rappel J-7/.test(await p.locator(".view.pushed").last().innerText()), `${name} : effacée de la liste`);
  ok(await p.evaluate(() => !!window.__fake.db.outbox.find((r) => r.id === 3).efface_at), `${name} : effacée dans la base`);
  // tout effacer
  await p.locator('.view.pushed [data-act="clearnotifs"]').click(); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForTimeout(400);
  ok(/Aucune notification/.test(await p.locator(".view.pushed").last().innerText()), `${name} : « Tout effacer » vide la liste`);
  ok(await p.evaluate(() => !window.__fake.db.outbox.find((r) => r.id === 5).efface_at), `${name} : celle d'Aurélie n'est pas touchée`);
  await p.screenshot({ path: `${OUT}/notif-${name}-vide.png` });
  // une nouvelle notification arrive : la pastille revient
  await p.locator(".view.pushed").last().locator(".back").click(); await p.waitForTimeout(400);
  await p.evaluate((U1) => { const f = window.__fake; f.db.outbox.push({ user_id: U1, title: "Blocage", body: "x", url: "#afaire" }); f.save(); f.rt?.(); }, U(1));
  await p.waitForTimeout(900);
  ok((await p.locator(".view:not([hidden]) .bell-badge").first().innerText().catch(() => "")) === "1", `${name} : une nouvelle arrive, pastille « 1 »`);
  // la notification #afaire ouvre l'onglet À faire
  await p.locator(".view:not([hidden]) .bell-btn").first().click(); await p.waitForTimeout(400);
  await p.locator(".view.pushed").last().locator(".nt-open").first().click(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById("app").dataset.tab === "afaire" && document.getElementById("app").dataset.pushed === "0"), `${name} : « #afaire » ouvre À faire`);
  ok(!errs.length, `${name} : aucune erreur ${errs.join(" | ")}`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} échec(s)` : "Tout est bon");
process.exit(fails ? 1 : 0);
