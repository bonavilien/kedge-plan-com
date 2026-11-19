// « Copier le lien » d'une fiche : le titre cliquable, la date et le service (riche pour Teams et Outlook), et le texte simple avec l'adresse.
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/lien.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.SITE || "http://localhost:8812/index.html";
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: false };` }));
await p.addInitScript(() => sessionStorage.setItem("kplan-ouvert", "1"));
await p.goto(base); await p.waitForFunction(() => window.KP && KP.store && KP.store.items && KP.store.items().length > 0 && document.querySelector("main"));
const lire = () => p.evaluate(async () => { const [x] = await navigator.clipboard.read(); return { html: await (await x.getType("text/html")).text(), txt: await (await x.getType("text/plain")).text() }; });

// une action d'un service, puis un temps fort sur plusieurs jours
const cas = await p.evaluate(() => {
  const all = KP.store.items();
  const act = all.find((x) => x.kind !== "tf" && !x.variant && !x.flou && !x.annule && x.svc && KP.service(x.svc));
  const tf = all.find((x) => x.kind === "tf" && x.fin && x.fin !== x.date && !x.flou) || all.find((x) => x.kind === "tf");
  return [act, tf].map((x) => x && { id: x.id, t: x.t, court: (KP.service(x.svc) || {}).court, date: KP.dateShort(x), plage: x.fin ? KP.fmt.plage(x.date, x.fin) : "" });
});
for (const c of cas.filter(Boolean)) {
  await p.evaluate((id) => KP.go({ fiche: id }), c.id); await p.waitForSelector(`#fiche[data-id="${c.id}"]`);
  await p.click('#fiche [data-act="f-link"]'); await p.waitForTimeout(150);
  const { html, txt } = await lire(), url = await p.evaluate(() => location.href);
  const dom = await p.evaluate((html) => { const d = document.createElement("div"); d.innerHTML = html; const a = d.querySelector("a"); return { href: a && a.getAttribute("href"), lien: a && a.textContent, gras: !!(a && a.querySelector("b")), tout: d.textContent }; }, html);
  const tf = c.court === undefined && !!c.plage || /Temps fort/.test(dom.tout);
  ok(dom.href === url && dom.lien === c.t && dom.gras, `${tf ? "temps fort" : "action"} : le titre « ${c.t} » est le lien, en gras`);
  ok(tf ? dom.tout.includes("Temps fort") && dom.tout.includes(c.plage || c.date) : dom.tout.includes(c.date) && dom.tout.includes(c.court), `${tf ? "temps fort" : "action"} : la date et ${tf ? "« Temps fort »" : "le service"} à côté (${dom.tout})`);
  ok(txt.split("\n")[0] === dom.tout && txt.split("\n")[1] === url, `${tf ? "temps fort" : "action"} : en texte simple, la même ligne puis l'adresse`);
  ok(/Lien copié/.test(await p.textContent("#toast, .toast").catch(() => "")), "un petit mot confirme la copie");
}
ok(cas.filter(Boolean).length === 2, "une action et un temps fort testés");

// un titre avec des caractères spéciaux reste du texte
await p.evaluate(() => { const it = KP.store.items().find((x) => x.kind !== "tf"); KP.store.update(it.id, { t: 'Test <img src=x onerror="window.__xss=1"> & co' }); KP.go({ fiche: it.id }); });
await p.waitForTimeout(100); await p.click('#fiche [data-act="f-link"]'); await p.waitForTimeout(150);
const { html } = await lire();
ok(html.includes("&lt;img") && !html.includes("<img") && html.includes("&amp; co"), "un titre avec < > & est copié tel quel, sans devenir du code");

// sans presse-papiers riche : le texte simple suffit
await p.evaluate(() => { delete window.ClipboardItem; window.ClipboardItem = undefined; });
await p.click('#fiche [data-act="f-link"]'); await p.waitForTimeout(150);
const simple = await p.evaluate(() => navigator.clipboard.readText());
const here = await p.evaluate(() => location.href);
ok(simple.split("\n").length === 2 && simple.split("\n")[0].startsWith("Test <img") && simple.split("\n")[1] === here, "navigateur sans copie riche : le titre et l'adresse en texte");
ok(!errs.length, "aucune erreur : " + errs.join(" | "));
await b.close();
console.log(bad ? `Lien : ${bad} échec(s)` : "Lien : tout est bon");
process.exit(bad ? 1 : 0);
