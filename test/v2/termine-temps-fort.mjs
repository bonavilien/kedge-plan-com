// 2.9.3 : un temps fort ne se diffuse pas, son dernier état s'appelle « Terminé » ; les actions gardent « Diffusé » (démonstration, sans base).
// Usage : (cd site && python3 -m http.server 8812) puis node test/v2/termine-temps-fort.mjs [dossier-captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.SITE || "http://localhost:8812/index.html", shots = process.argv[2];
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: false };` }));
await p.goto(base); await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0); await p.waitForTimeout(3000);
const tf = await p.evaluate(() => KP.store.items().find((i) => i.kind === "tf" && !i.annule && i.st === "diffuse" && i.variant !== "sujet").id);
const ac = await p.evaluate(() => KP.store.items().find((i) => i.kind === "action" && !i.annule && i.st === "diffuse").id);
await p.evaluate((id) => KP.go({ fiche: id }), tf); await p.waitForSelector("#fiche [data-act=f-st]");
const seg = await p.locator("#fiche [data-act=f-st]").allInnerTexts();
ok(seg.includes("Terminé") && !seg.includes("Diffusé"), "fiche d'un temps fort : « Terminé » : " + seg.join(" / "));
if (shots) await p.screenshot({ path: `${shots}/1-fiche-temps-fort.png` });
await p.evaluate((id) => KP.go({ fiche: id }), ac); await p.waitForTimeout(400);
const seg2 = await p.locator("#fiche [data-act=f-st]").allInnerTexts();
ok(seg2.includes("Diffusé") && !seg2.includes("Terminé"), "fiche d'une action : « Diffusé »");
await p.evaluate(() => KP.go({ screen: "plan", vue: "liste", fiche: "" })); await p.waitForTimeout(600);
const pill = p.locator(`.row[data-id="${tf}"] .st .pill`).first();
if (await pill.count()) ok((await pill.innerText()).includes("Terminé"), "liste du plan : case « Terminé »");
const ed = p.locator(`.row[data-id="${tf}"] [data-act=row-st]`);
if (await ed.count()) { await ed.first().click(); await p.waitForTimeout(300); const m = await p.locator(".pop .pop-i").allInnerTexts(); ok(m.some((x) => x.includes("Terminé")) && !m.some((x) => x.includes("Diffusé")), "menu d'état : « Terminé »"); if (shots) await p.screenshot({ path: `${shots}/2-menu.png` }); await p.keyboard.press("Escape"); }
ok(await p.evaluate((id) => KP.pill(KP.store.get(id)).includes("Terminé"), tf), "pastille d'un temps fort");
ok(await p.evaluate((id) => KP.pill(KP.store.get(id)).includes("Diffusé"), ac), "pastille d'une action");
ok(errs.length === 0, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close(); process.exit(bad ? 1 : 0);
