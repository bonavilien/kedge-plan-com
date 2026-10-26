// Round 2 : recalc()/newDay(), periodOf (trou -> période qui vient de finir), deux années, copil une année à la fois.
// node test/ui/serve.mjs 8804 puis node test/ui/periodes2.mjs <dossier des captures>
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg, extra = "") => { console.log(`${c ? "OK  " : "FAIL"} ${msg}${extra ? `  [${extra}]` : ""}`); if (!c) fails++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `40000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(2), at: "2026-08-01T10:00:00.000Z", ...o });
const SEED = [
  { n: 1, nom: "Installer", du: "2026-09-01", au: "2026-10-31", lib: "Sept. – oct. 2026" },
  { n: 2, nom: "Considérer", du: "2026-11-01", au: "2026-12-31", lib: "Nov. – déc. 2026" },
  { n: 3, nom: "Préférer", du: "2027-01-01", au: "2027-03-31", lib: "Janv. – mars 2027" },
  { n: 4, nom: "Convertir", du: "2027-04-01", au: "2027-05-31", lib: "Avril – mai 2027" },
  { n: 5, nom: "Décider", du: "2027-06-01", au: "2027-07-15", lib: "Juin – mi-juillet 2027" },
];
const NEXT = [
  { n: 6, nom: "Installer", du: "2027-09-01", au: "2027-10-31", lib: "Sept. – oct. 2027" },
  { n: 7, nom: "Considérer", du: "2027-11-01", au: "2027-12-31", lib: "Nov. – déc. 2027" },
  { n: 8, nom: "Préférer", du: "2028-01-01", au: "2028-03-31", lib: "Janv. – mars 2028" },
  { n: 9, nom: "Convertir", du: "2028-04-01", au: "2028-05-31", lib: "Avril – mai 2028" },
  { n: 10, nom: "Décider", du: "2028-06-01", au: "2028-07-15", lib: "Juin – mi-juillet 2028" },
];
// install : horloge qui avance (runFor) ; sinon figée
async function open(now, { vp = { width: 1440, height: 900 }, items = [], periods = SEED, who = "julien", install = false } = {}) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, timezoneId: "Europe/Paris", locale: "fr-FR" });
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  if (install) await p.clock.install({ time: new Date(now) }); else await p.clock.setFixedTime(new Date(now));
  const tick = async (ms) => { if (install) await p.clock.runFor(ms); else await p.waitForTimeout(ms); };
  p.tick = tick;
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(({ items, periods }) => { const f = window.__fake; f.db.periods = periods; f.db.items.push(...items); f.save(); }, { items, periods });
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  for (let i = 0; i < 40 && !(await p.evaluate(() => document.getElementById("brand").hidden)); i++) await tick(250);
  await tick(400);
  return p;
}
const close = (p) => p.context().close();
const title = (p) => p.textContent("#v-periode .ph-title");
const head = (p) => p.textContent("#v-periode .ph-t p");
const tab = async (p, t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.tick(300); };
const sync = async (p) => { await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.tick(1200); };

// 1. minuit sans recharger, horloge qui tourne
{
  console.log("\n# 1. 31 oct. 23:58 -> 1er nov. 00:01 (horloge qui tourne, aucun événement)");
  const p = await open("2026-10-31T23:58:00+01:00", { install: true });
  const t0 = await title(p), h0 = await head(p);
  await p.tick(4 * 60e3);
  const t1 = await title(p), h1 = await head(p);
  console.log("   ", t0, h0, "->", t1, h1);
  ok(/Considérer/.test(t1) && /encore 60 jours/.test(h1), "Ma période passe seule à Considérer à minuit", `${t1} · ${h1}`);
  ok(!p.errs.length, "pas d'erreur", p.errs.join("|"));
  await close(p);
}
{
  console.log("\n# 2. Minuit, l'utilisateur regarde Préférer : il y reste");
  const p = await open("2026-10-31T23:58:00+01:00", { install: true });
  await p.click('#v-periode [data-act="next"]'); await p.tick(400); await p.click('#v-periode [data-act="next"]'); await p.tick(400);
  const t0 = await title(p);
  await p.tick(4 * 60e3);
  const t1 = await title(p);
  ok(/Préférer/.test(t0) && /Préférer/.test(t1), "reste sur la période choisie", `${t0} -> ${t1}`);
  ok(/Revenir à Considérer/.test(await p.textContent("#v-periode")), "le lien « Revenir à » nomme la nouvelle période en cours");
  await close(p);
}
{
  console.log("\n# 3. Minuit, réunion ouverte");
  const p = await open("2026-10-31T23:58:00+01:00", { install: true });
  await p.click('.side-btn[data-act="meeting"]'); await p.tick(400);
  const m0 = await p.locator("#meeting .mp-h").allInnerTexts();
  await p.tick(4 * 60e3);
  const m1 = await p.locator("#meeting .mp-h").allInnerTexts();
  console.log("   ", m0.join(" / ").replace(/\n/g, " "), "->", m1.join(" / ").replace(/\n/g, " "));
  ok(/Considérer/.test(m1[0]) && /En cours/.test(m1[0]), "écran réunion ouvert : la période en cours suit minuit", m1.join(" / ").replace(/\n/g, " "));
  await close(p);
}
{
  console.log("\n# 4. Minuit, copil ouvert");
  const p = await open("2026-10-31T23:58:00+01:00", { install: true });
  await p.click('.side-btn[data-act="copil"]'); await p.tick(400);
  await p.tick(4 * 60e3);
  const c = (await p.locator(".cp-card .cp-tag").allInnerTexts());
  const date = await p.textContent("#copil .mt-title p");
  console.log("   ", c.join(" / "), "·", date);
  ok(c[0] === "Terminée" && /En cours/.test(c[1]), "copil ouvert : les étiquettes suivent minuit", c.join(" / "));
  ok(/1er novembre/i.test(date), "copil ouvert : la date du jour suit minuit", date);
  await close(p);
}
{
  console.log("\n# 5. Changement d'heure : nuit du 24 au 25 oct. 2026 et du 27 au 28 mars 2027");
  let p = await open("2026-10-24T23:58:00+02:00", { install: true });
  const a = await head(p); await p.tick(5 * 60e3); const bb = await head(p);
  ok(/encore 7 jours/.test(a) && /encore 6 jours/.test(bb), "25 oct. (heure d'hiver) : encore 7 -> 6 jours", `${a} -> ${bb}`);
  await p.tick(3 * 3600e3); ok(/encore 6 jours/.test(await head(p)), "après 3 h (passage à l'heure d'hiver) : toujours 6 jours", await head(p));
  await close(p);
  p = await open("2027-03-27T23:58:00+01:00", { install: true });
  const c = await head(p); await p.tick(5 * 60e3); const d = await head(p);
  ok(/encore 4 jours/.test(c) && /encore 3 jours/.test(d), "28 mars (heure d'été) : encore 4 -> 3 jours", `${c} -> ${d}`);
  await close(p);
}

// 6. le trou : une action à venir datée dans le trou
{
  console.log("\n# 6. Trou du 19 déc. au 3 janv., aujourd'hui 22 déc. ; une action et un temps fort le 30 déc.");
  const per = SEED.map((x) => ({ ...x })); per[1].au = "2026-12-18"; per[2].du = "2027-01-04";
  const act = it({ t: "Vœux vidéo", date: "2026-12-30", svc: "video" });
  const tf = it({ kind: "tf", t: "Réveillon campus", date: "2026-12-30", svc: "chef", m: [] });
  const rel = it({ t: "Relais réveillon", date: "2026-12-30", svc: "rs", tf: tf.id });
  const p = await open("2026-12-22T10:00:00+01:00", { periods: per, items: [act, tf, rel] });
  const t = await title(p), h = await head(p);
  console.log("   Ma période :", t, "·", h);
  ok(/Vœux vidéo/.test(await p.textContent("#v-periode")), "Ma période à l'ouverture montre l'action à venir dans 8 jours", `${t} · ${h}`);
  await p.click('.side-btn[data-act="meeting"]'); await p.tick(400);
  const mt = await p.textContent("#meeting .mt-main");
  ok(/Réveillon campus/.test(mt), "réunion pendant le trou : le temps fort du 30 déc. (à venir) apparaît", (await p.locator("#meeting .mp-h").allInnerTexts()).join(" / ").replace(/\n/g, " "));
  await p.screenshot({ path: `${OUT}/r6-reunion-trou.png` });
  await p.keyboard.press("Escape"); await p.tick(200);
  await p.click('.side-btn[data-act="copil"]'); await p.tick(400);
  const cards = (await p.locator(".cp-card").allInnerTexts()).map((s) => s.replace(/\n+/g, " | "));
  console.log("   copil :", cards[1], "//", cards[2]);
  ok(!(/Terminée/.test(cards[1]) && /à venir/.test(cards[1])), "copil : une carte « Terminée » n'annonce pas d'actions « à venir »", cards[1]);
  await p.keyboard.press("Escape"); await p.tick(200);
  await tab(p, "tf");
  const tft = await p.textContent("#v-tf");
  ok(/Réveillon campus/.test(tft), "Temps forts : le temps fort du trou est listé", "");
  await close(p);
}

// 7. deux années
{
  console.log("\n# 7. 2027-2028 créée ; 10 juillet 2027 (Décider en cours)");
  const items = [it({ kind: "tf", t: "Sujet Installer 27", date: "2027-09-01", per: [6], svc: "chef", m: [] }), it({ kind: "tf", t: "Sujet Installer 26", date: "2026-09-01", per: [1], svc: "chef", m: [] }),
    it({ t: "Action août", date: "2027-08-25", svc: "rs" }), it({ t: "Action sept 27", date: "2027-09-10" })];
  const p = await open("2027-07-10T10:00:00+02:00", { periods: [...SEED, ...NEXT], items });
  console.log("   Ma période :", await title(p), "·", await head(p));
  ok(/Décider 2026-27/.test(await title(p)), "titre avec l'année quand les noms se répètent", await title(p));
  await p.click('#v-periode [data-act="next"]'); await p.tick(400);
  ok(/Installer 2027-28/.test(await title(p)), "flèche suivante : Installer 2027-28", await title(p));
  const back = await p.textContent("#v-periode .back-now").catch(() => "");
  ok(!back || /2026-27/.test(back), "« Revenir à … » distingue l'année quand les noms se répètent", back.trim());
  ok(/Action sept 27/.test(await p.textContent("#v-periode")), "Installer 2027-28 contient l'action du 10 sept. 2027");
  // copil
  await p.click('.side-btn[data-act="copil"]'); await p.tick(400);
  let h1 = await p.textContent("#copil .mt-title h1"), n = await p.locator(".cp-card").count();
  ok(/2026-2027/.test(h1) && n === 5, "copil : année 2026-2027, 5 cartes", `${h1} · ${n}`);
  await p.keyboard.press("ArrowRight"); await p.tick(300);
  h1 = await p.textContent("#copil .mt-title h1"); n = await p.locator(".cp-card").count();
  const sel = await p.textContent(".cp-card.sel h2");
  ok(/2027-2028/.test(h1) && n === 5 && /Installer/.test(sel), "flèche droite depuis Décider : année 2027-2028, Installer sélectionnée", `${h1} · ${n} · ${sel}`);
  const focused = await p.evaluate(() => document.activeElement?.className);
  ok(/cp-card/.test(focused || ""), "le focus suit la carte (télécommande)", focused);
  await p.keyboard.press("ArrowLeft"); await p.tick(300);
  ok(/2026-2027/.test(await p.textContent("#copil .mt-title h1")), "flèche gauche : retour à 2026-2027");
  await p.screenshot({ path: `${OUT}/r7-copil.png` });
  await p.keyboard.press("Escape"); await p.tick(200);
  // calendrier : la même période que Ma période, nommée avec son année
  await tab(p, "grille");
  const gt = await p.textContent("#v-grille .ph-title");
  ok(/Installer 2027-28/.test(gt), "calendrier : même période que Ma période, l'année se distingue", gt);
  ok(/Sujet Installer 27/.test(await p.textContent("#v-grille")), "calendrier : le sujet de 2027-28 est dans « Toute la période »");
  await p.screenshot({ path: `${OUT}/r7-grille.png`, fullPage: false });
  ok(!p.errs.length, "pas d'erreur", p.errs.join("|"));
  await close(p);
}
{
  console.log("\n# 8. Swipe 390 px à travers deux années");
  const p = await open("2027-07-10T10:00:00+02:00", { periods: [...SEED, ...NEXT], vp: { width: 390, height: 844 } });
  const swipe = async (dx) => { const bx = await p.locator("#swipe").boundingBox(); const y = bx.y + 60, x = bx.x + bx.width / 2; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x + (dx * i) / 10, y + 2); await p.mouse.up(); await p.waitForTimeout(450); };
  await swipe(-250); const t1 = await title(p);
  ok(/Installer 2027-28/.test(t1), "swipe gauche depuis Décider 2026-27 : Installer 2027-28", t1);
  for (let i = 0; i < 6; i++) await swipe(-250);
  ok(/Décider 2027-28/.test(await title(p)), "bout : Décider 2027-28", await title(p));
  ok(await p.isDisabled('#v-periode [data-act="next"]'), "flèche suivante désactivée à la fin");
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, "390 px : 10 points, pas de défilement horizontal", `${over}`);
  await p.screenshot({ path: `${OUT}/r8-swipe-390.png` });
  await close(p);
}

// 9. périodes modifiées en temps réel
{
  console.log("\n# 9. Été 2027 : un chef ajoute 2027-28 pendant que l'appli est ouverte, l'utilisateur est sur Décider (période en cours d'avant)");
  const p = await open("2027-08-20T10:00:00+02:00");
  ok(/Décider/.test(await title(p)), "avant : Décider (dernière)", await title(p));
  await p.click('.side-btn[data-act="copil"]'); await p.tick(300); await p.keyboard.press("Escape"); await p.tick(200);
  await p.evaluate((nx) => { const f = window.__fake; f.db.periods.push(...nx); f.save(); }, NEXT);
  await sync(p);
  console.log("   après :", await title(p), "·", await head(p));
  // entre deux périodes, on reste sur celle qui vient de finir (ses actions d'août y sont classées) ; la suivante s'annonce
  ok(/Décider/.test(await title(p)) && /suivante commence le 1er septembre/.test(await head(p)), "après ajout : toujours Décider, qui annonce la suite", `${await title(p)} · ${await head(p)}`);
  await p.click('.side-btn[data-act="copil"]'); await p.tick(300);
  ok(/2026-2027/.test(await p.textContent("#copil .mt-title h1")), "copil rouvert : 2026-2027 jusqu'au début de la suivante", await p.textContent("#copil .mt-title h1"));
  await close(p);
}
{
  console.log("\n# 10. Une période insérée AVANT (n plus petit) pendant que l'utilisateur regarde Préférer");
  const per = SEED.map((x) => ({ ...x }));
  const a = it({ t: "Action Préférer", date: "2027-02-10" });
  const p = await open("2026-11-10T10:00:00+01:00", { periods: per, items: [a] });
  await p.click('#v-periode [data-act="next"]'); await p.tick(400);
  const t0 = await title(p);
  await p.evaluate(() => { const f = window.__fake; f.db.periods.unshift({ n: 0, nom: "Pré-rentrée", du: "2026-08-20", au: "2026-08-31", lib: "Fin août 2026" }); f.save(); });
  await sync(p);
  const t1 = await title(p);
  ok(t0 === t1, "la période regardée reste la même après rechargement", `${t0} -> ${t1}`);
  await close(p);
}
{
  console.log("\n# 11. Calendrier sur une autre période, puis 2027-28 ajoutée en temps réel");
  const p = await open("2027-03-10T10:00:00+01:00");
  await tab(p, "grille");
  await p.click('#v-grille [data-act="next"]'); await p.tick(400);
  const t0 = await p.textContent("#v-grille .ph-title");
  await p.evaluate((nx) => { const f = window.__fake; f.db.periods.push(...nx); f.save(); }, NEXT);
  await sync(p); await tab(p, "periode"); await tab(p, "grille");
  const t1 = await p.textContent("#v-grille .ph-title");
  ok(t1.trim().startsWith(t0.trim()), "la période regardée reste la même (son nom prend l'année quand 2027-28 arrive)", `${t0} -> ${t1}`);
  // la première période déplacée d'un mois plus tôt : G0 change, les semaines suivent
  await p.evaluate(() => { const f = window.__fake; f.db.periods[0].du = "2026-08-03"; f.save(); });
  await sync(p); await tab(p, "periode"); await tab(p, "grille");
  const w0 = await p.textContent("#v-grille .gt-r:not(.gt-head) .gt-w b, #v-grille .pw-h");
  console.log("   première semaine affichée après décalage de G0 :", w0);
  ok(await p.textContent("#v-grille .ph-title") === t1 && /\d/.test(w0 || ""), "après décalage de G0 : même période, semaines datées", w0);
  ok(!p.errs.length, "pas d'erreur", p.errs.join("|"));
  await close(p);
}

// 12. sujets et en-têtes ; largeurs avec deux années
for (const [w, h] of [[390, 844], [820, 1180], [1280, 800], [1920, 1080]]) {
  console.log(`\n# 12. deux années, ${w}x${h}`);
  const p = await open("2027-08-01T10:00:00+02:00", { periods: [...SEED, ...NEXT], vp: { width: w, height: h }, items: [it({ kind: "tf", t: "TF rentrée 2027", date: "2027-09-05", svc: "chef", m: [] }), it({ kind: "tf", t: "Sujet 2y", date: "2027-06-01", per: [5, 6], svc: "chef", m: [] })] });
  for (const t of ["periode", "tf", "grille"]) {
    await tab(p, t);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${w} px ${t} : pas de défilement horizontal`, `${over}`);
    await p.screenshot({ path: `${OUT}/r12-${w}-${t}.png` });
  }
  if (w >= 1024) {
    await p.click('.side-btn[data-act="copil"]'); await p.tick(400);
    const clip = await p.evaluate(() => [...document.querySelectorAll(".cp-card")].filter((x) => x.scrollWidth > x.clientWidth + 1).length);
    ok(!clip, `${w} px copil : aucune carte ne déborde`, String(clip));
    await p.screenshot({ path: `${OUT}/r12-${w}-copil.png` }); await p.keyboard.press("Escape");
    await p.click('.side-btn[data-act="meeting"]'); await p.tick(400);
    const mh = await p.locator("#meeting .mp-h").allInnerTexts();
    console.log("   réunion :", mh.join(" / ").replace(/\n/g, " "));
    await p.screenshot({ path: `${OUT}/r12-${w}-reunion.png` }); await p.keyboard.press("Escape");
  }
  ok(!p.errs.length, `${w} px : aucune erreur`, p.errs.join(" | "));
  await close(p);
}
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nPériodes round 2 : tout est bon");
process.exit(fails ? 1 : 0);
