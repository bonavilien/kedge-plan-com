// Ajouter : un brouillon pas encore publié garde tout (date, messages, options) quand on change d'onglet et qu'on revient.
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
  await p.fill("#lg-mail", "aurelie@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
  await tab("ajouter");
  await p.fill("#f-t", "Brouillon"); await p.click('#f-m .chip:has-text("Alumni")'); await p.click('#f-cc .chip:has-text("RS")');
  await p.click("#f-date"); await p.waitForTimeout(150); await p.click('#f-date-cal [data-cal-nav]:not([aria-label="Mois précédent"])'); await p.waitForTimeout(150);
  await p.click('#f-date-cal [data-cal-day$="-12"]'); const date = await p.$eval("#f-date", (x) => x.value);
  if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
  await p.fill("#f-note", "Précision importante"); await p.fill("#f-link", "https://kedgebs.sharepoint.com/b");
  await tab("grille"); await tab("periode");
  await p.evaluate(() => window.__fake.rt?.()); await p.waitForTimeout(800); // une mise à jour arrive pendant ce temps
  await tab("ajouter");
  const st = await p.evaluate(() => ({ t: document.querySelector("#f-t").value, date: document.querySelector("#f-date").value,
    m: [...document.querySelectorAll('#f-m .chip[aria-pressed="true"]')].map((x) => x.textContent.trim()), cc: [...document.querySelectorAll('#f-cc .chip[aria-pressed="true"]')].map((x) => x.textContent.trim()),
    more: document.querySelector("#f-more").open, note: document.querySelector("#f-note").value, link: document.querySelector("#f-link").value }));
  ok(st.t === "Brouillon" && st.date === date, `${w}px : titre et date gardés (${st.date})`);
  ok(st.m.includes("Alumni") && st.cc.includes("RS"), `${w}px : message et « Qui prévenir » gardés`);
  ok(st.more && st.note === "Précision importante" && st.link === "https://kedgebs.sharepoint.com/b", `${w}px : « Plus d'options » ouvert, précision et lien gardés`);
  await p.click('[data-act="publish"]'); await p.waitForTimeout(700);
  await tab("ajouter");
  ok((await p.$eval("#f-t", (x) => x.value)) === "", `${w}px : après publication, le formulaire repart à zéro`);
}
ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Brouillon : tout est bon");
process.exit(fails ? 1 : 0);
