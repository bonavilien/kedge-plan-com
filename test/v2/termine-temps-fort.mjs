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
/* passé tout seul en « Terminé », et ça reste modifiable */
const auto = await p.evaluate(() => { const its = KP.store.items().filter((i) => i.kind === "tf" && !i.annule && KP.endOf(i) < KP.TODAY); return { n: its.length, pas: its.filter((i) => i.st !== "diffuse").map((i) => i.t) }; });
ok(auto.n > 0 && auto.pas.length === 0, `temps forts passés tous « Terminé » (${auto.n})` + (auto.pas.length ? " sauf " + auto.pas.join(", ") : ""));
const nouveau = await p.evaluate(() => { const it = KP.store.add({ kind: "tf", t: "Salon test", date: KP.addDays(KP.TODAY, -3), st: "prevu" }); return it.id; });
await p.waitForTimeout(200);
ok(await p.evaluate((id) => KP.store.get(id).st === "diffuse", nouveau), "un temps fort ajouté dans le passé passe en « Terminé »");
await p.evaluate((id) => KP.setStatus(id, "prevu"), nouveau); await p.waitForTimeout(200);
ok(await p.evaluate((id) => { KP.terminerPasses(); return KP.store.get(id).st === "prevu"; }, nouveau), "remis à « Prévu » à la main, il le reste");
const futur = await p.evaluate(() => KP.store.add({ kind: "tf", t: "Salon futur", date: KP.addDays(KP.TODAY, 3), st: "prevu" }).id);
await p.waitForTimeout(200);
ok(await p.evaluate((id) => KP.store.get(id).st === "prevu", futur), "un temps fort à venir ne bouge pas");
const actPassee = await p.evaluate(() => KP.store.items().some((i) => i.kind === "action" && !i.annule && KP.endOf(i) < KP.TODAY && i.st !== "diffuse"));
ok(actPassee, "les actions passées ne sont pas touchées");
/* la Réunion, Bilan : les temps forts n'y comptent pas comme diffusés */
await p.evaluate(() => KP.go({ screen: "reunion", tab: "bilan", fiche: "" })); await p.waitForTimeout(500);
const bil = await p.locator("main").innerText();
const nAct = await p.evaluate(() => { const per = KP.PERIODS.find((x) => x.k === KP.route.per); return KP.store.items().filter((i) => !i.annule && i.kind === "action" && i.st === "diffuse" && i.date >= per.du && i.date <= per.au).length; });
const somme = [...bil.matchAll(/(\d+) diffusées?/g)].reduce((a, m) => a + +m[1], 0);
ok(somme <= nAct && !/Salon test/.test(bil), `Bilan : ${somme} diffusées, seulement des actions (${nAct} au plus)`);
if (shots) await p.screenshot({ path: `${shots}/3-bilan.png` });
ok(errs.length === 0, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close(); process.exit(bad ? 1 : 0);
