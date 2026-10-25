// compte sans profil : l'appli s'ouvre sans erreur JS. node test/ui/sansprofil.mjs (serveur sur 8801)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const q = await (await b.newContext()).newPage(); const errs = [];
q.on("pageerror", (e) => errs.push(e.message));
await q.goto("http://localhost:8790/test.html"); await q.evaluate(() => localStorage.clear()); await q.reload(); await q.waitForSelector("#login");
await q.evaluate(() => { const d = window.__fake.db; d.users.push({ id: "00000000-0000-0000-0000-0000000000d3", email: "sansprofil@kedgebs.com", password: "motdepasse" }); window.__fake.save(); });
await q.reload(); await q.waitForSelector("#login");
await q.fill("#lg-mail", "sansprofil@kedgebs.com"); await q.fill("#lg-pw", "motdepasse"); await q.click("#login button"); await q.waitForTimeout(1500);
console.log(errs.length ? "FAIL erreurs JS : " + errs.join(" | ") : "OK sans profil, pas d'erreur JS", "|", (/Bonjour [^.]*/.exec(await q.textContent("body")) || ["(pas de bonjour)"])[0]);
await b.close();
