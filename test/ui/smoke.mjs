import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
await p.goto("http://localhost:8790/test.html");
await p.evaluate(() => { localStorage.clear(); });
await p.reload();
await p.waitForSelector("#login");
await p.screenshot({ path: `${OUT}/s1-login.png` });
await p.fill("#lg-mail", "julien@kedgebs.com"); await p.fill("#lg-pw", "faux"); await p.click("#login button");
await p.waitForSelector("#lg-err:not([hidden])");
console.log("erreur:", await p.textContent("#lg-err"));
await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
await p.waitForFunction(() => document.getElementById("brand").hidden, null, { timeout: 5000 });
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/s2-periode.png` });
for (const t of ["tf", "media", "ajouter", "grille", "afaire"]) {
  await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/s3-${t}.png` });
}
console.log("erreurs:", errs.length ? errs.join("\n") : "aucune");
await b.close();
