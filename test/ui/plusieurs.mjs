// Temps fort sur plusieurs jours : un premier et un dernier jour, montrés dans la fiche, la liste, la grille et le calendrier.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const errs = [];
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  const tab = async (t) => { await p.click(`[data-kui-tab="${t}"] >> visible=true`); await p.waitForTimeout(300); };
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
  await p.fill("#lg-mail", "julien@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
  await tab("ajouter");
  await p.click('#f-kind button[value="tf"]'); await p.waitForTimeout(200);
  ok(await p.isHidden("#f-finw"), `${w}px : un temps fort tient sur un jour par défaut`);
  await p.fill("#f-t", "Semaine séminaire");
  await p.click("#f-date"); await p.waitForTimeout(150); await p.click('#f-date-cal [data-cal-nav]:not([aria-label="Mois précédent"])'); await p.waitForTimeout(150);
  await p.click('#f-date-cal [data-cal-day$="-09"]'); const du = await p.$eval("#f-date", (x) => x.value);
  await p.click('label[for="f-plus"]'); await p.waitForTimeout(150);
  ok(await p.isVisible("#f-finw") && (await p.textContent("#f-date-l")) === "Du", `${w}px : « Sur plusieurs jours » montre Du / Au`);
  const au = await p.$eval("#f-fin", (x) => x.value);
  ok(Math.round((new Date(au) - new Date(du)) / 864e5) === 4, `${w}px : dernier jour proposé, une semaine de cinq jours (${du} → ${au})`);
  // le dernier jour avant le premier : refusé
  await p.click("#f-fin"); await p.waitForTimeout(150); await p.click(`#f-fin-cal [data-cal-day="${du}"]`);
  await p.click('[data-act="publish"]'); await p.waitForTimeout(300);
  ok(await p.isVisible("#f-fin-err"), `${w}px : un dernier jour pas après le premier est refusé`);
  await p.click("#f-fin"); await p.waitForTimeout(150); await p.click(`#f-fin-cal [data-cal-day="${au}"]`);
  await p.click('[data-act="publish"]'); await p.waitForTimeout(700);
  const it = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Semaine séminaire"));
  ok(it && it.date === du && it.fin === au, `${w}px : enregistré du ${it?.date} au ${it?.fin}`);
  const meta = await p.textContent(".hero-meta >> visible=true");
  ok(/Du \d+ au \d+ \S+/.test(meta), `${w}px : la fiche dit « ${meta.trim()} »`);
  await p.screenshot({ path: `${OUT}/plusieurs-fiche-${w}.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await tab("tf");
  const row = await p.textContent(`[data-open="${it.id}"] >> visible=true`);
  ok(/jusqu'au/.test(row), `${w}px : la liste des temps forts montre le dernier jour`);
  await p.screenshot({ path: `${OUT}/plusieurs-liste-${w}.png` });
  await tab("grille");
  const span = await p.$eval(`.blk[data-open="${it.id}"]`, (x) => x.style.gridColumn);
  ok(/\//.test(span), `${w}px : dans la grille, le bloc couvre ses semaines (${span})`);
  // l'agenda : chaque jour est marqué temps fort
  await tab("ajouter"); await p.click('#f-kind button[value="action"]'); await p.waitForTimeout(200);
  await p.click("#f-date"); await p.waitForTimeout(150);
  const month = du.slice(0, 7); let tries = 0;
  while (!(await p.$(`#f-date-cal [data-cal-day^="${month}"]`)) && tries++ < 12) { await p.click('#f-date-cal [data-cal-nav]:not([aria-label="Mois précédent"])'); await p.waitForTimeout(100); }
  const marked = await p.$$eval("#f-date-cal .cal-d.tf", (l) => l.map((x) => x.dataset.calDay));
  ok(marked.includes(du) && marked.includes(au) && marked.length >= 4, `${w}px : le calendrier marque les jours du temps fort (${marked.length})`);
  // modifier : redevenir un temps fort d'un jour
  await p.evaluate((id) => { location.hash = ""; }, it.id);
  await tab("tf"); await p.click(`[data-open="${it.id}"] >> visible=true`); await p.waitForTimeout(300);
  await p.click('[data-act="edit"] >> visible=true'); await p.waitForTimeout(300);
  ok(await p.isChecked("#e-plus"), `${w}px : la modification reprend les deux jours`);
  await p.click('label[for="e-plus"]'); await p.click('[data-act="save"]'); await p.waitForTimeout(700);
  const it2 = await p.evaluate((id) => window.__fake.db.items.find((x) => x.id === id), it.id);
  ok(!it2.fin, `${w}px : redevenu un temps fort d'un jour`);
  const j = await p.evaluate((id) => window.__fake.db.journal.filter((x) => x.item === id && x.kind === "modif").pop(), it.id);
  ok(j && "fin" in j.diff, `${w}px : l'historique note le changement`);
  const hist = await p.textContent(".hist >> visible=true").catch(() => "");
  ok(/Du \d+/i.test(hist) && /Modification : date/.test(hist), `${w}px : l'historique l'écrit en toutes lettres`);
}
ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Plusieurs jours : tout est bon");
process.exit(fails ? 1 : 0);
