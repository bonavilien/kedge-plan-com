// La page tutoriel (site/tutoriel.html) : six étapes, valeurs personnalisées, étapes cochées retenues, lisible sur téléphone.
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/tutoriel.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const url = (process.env.SITE || "http://localhost:8812/index.html").replace(/index\.html$/, "") + "tutoriel.html";
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(url);
ok(await p.locator(".step").count() === 6, "six étapes");
ok(await p.locator('[data-k="repo"]').first().textContent() === "ton-compte/plan-de-com", "valeurs d'exemple avant de taper");
await p.fill("#compte", "Ville-Exemple"); await p.fill("#copie", "plan de com");
ok(await p.locator('[data-k="repo"]').first().textContent() === "ville-exemple/plan-de-com", "GITHUB_REPO suit le compte et la copie (minuscules, sans espace)");
ok(await p.locator('[data-k="site"]').first().textContent() === "https://ville-exemple.github.io/plan-de-com/", "l'adresse du site suit aussi");
await p.locator("#etape-6 .vars .cp").nth(1).click();
ok(await p.evaluate(() => navigator.clipboard.readText()) === "GITHUB_REPO", "le bouton copie la valeur");
await p.check("#fait-1"); await p.check("#fait-3");
ok(await p.textContent("#prog-n") === "2" && await p.locator("#etape-1.ok").count() === 1, "étapes cochées : compteur et coche");
await p.reload();
ok(await p.isChecked("#fait-3") && await p.inputValue("#compte") === "Ville-Exemple", "rechargée : coches et copie retenues");
const liens = await p.$$eval("a[href^='http']", (as) => as.map((a) => [a.href, a.target]));
ok(liens.length > 4 && liens.every(([h, t]) => h.startsWith("https://") && t === "_blank"), "liens externes en https, dans un nouvel onglet");
ok(!errs.length, "aucune erreur : " + errs.join(" | "));
await ctx.close();

for (const theme of ["light", "dark"]) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme: theme });
  const q = await c.newPage(); await q.goto(url);
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `téléphone (${theme}) : rien ne dépasse sur le côté`);
  await c.close();
}
await b.close();
console.log(bad ? `Tutoriel : ${bad} échec(s)` : "Tutoriel : tout est bon");
process.exit(bad ? 1 : 0);
