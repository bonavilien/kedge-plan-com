// Classement (SIGEM…) : saisi par un chef, avec le rang et l'objectif ; montré à part dans Ma période, la grille, la fiche, la réunion et le copil.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const errs = [];
const login = async (p, who) => {
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
};
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  const tab = async (t) => { await p.click(`[data-kui-tab="${t}"] >> visible=true`); await p.waitForTimeout(300); };
  await login(p, "julien");
  await tab("ajouter");
  await p.click('#f-kind button[value="classement"]'); await p.waitForTimeout(200);
  ok(await p.isHidden("#f-m") && await p.isVisible("#f-rang") && (await p.textContent("#f-date-l")) === "Publication", `${w}px : un classement a une date de publication, un rang, un objectif, pas de message`);
  await p.fill("#f-t", "SIGEM 2027");
  // date du jour + quelques jours : dans la période en cours
  await p.click("#f-date"); await p.waitForTimeout(150);
  const d0 = await p.$eval("#f-date", (x) => x.value);
  await p.fill("#f-rang", "0"); await p.fill("#f-cible", "7");
  await p.click('[data-act="publish"]'); await p.waitForTimeout(300);
  ok(await p.isVisible("#f-rk-err"), `${w}px : un rang à 0 est refusé`);
  await p.fill("#f-rang", "10");
  await p.screenshot({ path: `${OUT}/cls-form-${w}.png` });
  await p.click('[data-act="publish"]'); await p.waitForTimeout(700);
  const it = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Classement SIGEM 2027"));
  ok(it, `${w}px : « Classement » est ajouté devant le nom`);
  ok(it && it.kind === "classement" && it.rang === 10 && it.cible === 7 && it.svc === "chef" && it.date === d0, `${w}px : enregistré comme classement, 10e, objectif top 7`);
  ok(await p.isVisible(".hero-cls .rk-n >> visible=true") && /Classement/.test(await p.textContent(".hero-meta >> visible=true")), `${w}px : la fiche montre la médaille du rang et le badge Classement`);
  ok(/Top 7/.test(await p.textContent(".rk-g >> visible=true")), `${w}px : la fiche montre l'objectif`);
  await p.screenshot({ path: `${OUT}/cls-fiche-${w}.png` });
  // une action liée au classement
  await p.click('[data-act="addlinked"] >> visible=true'); await p.waitForTimeout(400);
  ok(await p.$eval("#f-tf", (s) => s.selectedOptions[0]?.parentElement.label) === "Classements", `${w}px : une action peut relayer le classement`);
  await p.fill("#f-t", "Post SIGEM"); await p.click('#f-m .chip >> nth=4');
  await p.click('[data-act="publish"]'); await p.waitForTimeout(700);
  const act = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Post SIGEM"));
  ok(act && act.tf === it.id, `${w}px : l'action est rattachée au classement`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  // Ma période : en tête, avec le rang
  await tab("periode");
  const soonTxt = await p.textContent(".soon >> visible=true").catch(() => "");
  // seulement les 7 derniers jours d'une période : ailleurs, pas de « À suivre »
  ok(!soonTxt || /SIGEM 2027/.test(soonTxt), `${w}px : en fin de période, « À suivre » annonce le classement`);
  for (let i = 0; i < 5 && !(await p.$(".cls-strip >> visible=true")); i++) { await p.click('[data-act="next"] >> visible=true'); await p.waitForTimeout(400); }
  const strip = await p.textContent(".cls-strip >> visible=true").catch(() => "");
  ok(/Classement SIGEM 2027/.test(strip) && /10e · objectif top 7/.test(strip), `${w}px : Ma période montre le classement avec le rang (« ${strip.replace(/\s+/g, " ").trim()} »)`);
  await p.screenshot({ path: `${OUT}/cls-periode-${w}.png` });
  // l'onglet Temps forts le montre, dans sa propre rubrique, avec sa pastille de date
  await tab("tf");
  ok(await p.$(`[data-open="${it.id}"] >> visible=true`) && /Classements/i.test(await p.textContent(".scroll >> visible=true")), `${w}px : l'onglet Temps forts a une rubrique Classements`);
  // la grille : sa ligne, sa pastille, son trait
  await tab("grille");
  ok(await p.$(`.lane-cls .blk.b-cls[data-open="${it.id}"]`) && await p.$(".cls-line"), `${w}px : la grille a une ligne Classements et un trait sur la semaine`);
  await p.screenshot({ path: `${OUT}/cls-grille-${w}.png` });
  if (w > 1000) {
    await p.evaluate(() => document.querySelector('[data-act="meeting"]')?.click()); await p.waitForTimeout(400);
    ok(await p.$(`.mx-tf.cls[data-mt-open="${it.id}"]`), `${w}px : la réunion montre le classement et ses relais`);
    await p.screenshot({ path: `${OUT}/cls-reunion-${w}.png` });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  }
  // modifier : le rang publié, noté dans l'historique
  await p.evaluate((id) => { location.hash = "#item=" + id; }, it.id); await p.waitForTimeout(500);
  await p.click('[data-act="edit"] >> visible=true'); await p.waitForTimeout(300);
  ok(await p.$eval("#e-rang", (x) => x.value) === "10", `${w}px : la modification reprend le rang`);
  await p.fill("#e-rang", "8"); await p.click('[data-act="save"]'); await p.waitForTimeout(700);
  const alertTxt = await p.textContent(".kui-alert, [role=alertdialog]").catch(() => "");
  ok(/10e · objectif top 7 → 8e · objectif top 7/.test(alertTxt || ""), `${w}px : on propose de prévenir du nouveau rang`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const j = await p.evaluate((id) => window.__fake.db.journal.filter((x) => x.item === id && x.kind === "modif").pop(), it.id);
  ok(j && JSON.stringify(j.diff.rang) === "[10,8]", `${w}px : l'historique note 10e → 8e`);
  // un responsable de service ne saisit pas de classement, mais le voit
  await login(p, "aurelie");
  await tab("ajouter");
  ok(!(await p.$('#f-kind button[value="classement"]')), `${w}px : un service n'a pas « Classement » dans Ajouter`);
  await p.evaluate(() => window.__fake.db.items.splice(0));
  await login(p, "julien");
  for (const t of ["Financial Times", "Classement Challenges"]) {
    await tab("ajouter"); await p.click('#f-kind button[value="classement"]'); await p.waitForTimeout(150); await p.fill("#f-t", t);
    await p.click('label[for="f-prec"]'); await p.waitForTimeout(100); await p.selectOption("#f-mois", new Date().toISOString().slice(0, 7));
    await p.click('[data-act="publish"]'); await p.waitForTimeout(500); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  }
  const names = await p.evaluate(() => window.__fake.db.items.map((x) => x.t).sort().join(" | "));
  ok(names === "Classement Challenges | Classement Financial Times", `${w}px : pas de « Classement » en double (${names})`);
  await tab("periode");
  const pills = await p.$$eval(".cls-strip .ag-row", (l) => l.map((r) => r.querySelector(".ag-date b")?.textContent.trim() || ""));
  ok(pills.length === 2 && pills.every(Boolean), `${w}px : chaque classement du mois a sa pastille (${pills.join(", ")})`);
  const gap = await p.evaluate(() => { const a = document.querySelector(".phead").getBoundingClientRect(), b = document.querySelector(".cls-strip").getBoundingClientRect(); return b.top - a.bottom; });
  ok(gap >= 10, `${w}px : les classements ne collent pas au bloc de la période (${Math.round(gap)} px)`);
  await p.evaluate(() => window.__fake.db.items.splice(0));
}
ok(!errs.length, `pas d'erreur JS ${errs.join(" | ")}`);
await b.close();
process.exit(fails ? 1 : 0);
