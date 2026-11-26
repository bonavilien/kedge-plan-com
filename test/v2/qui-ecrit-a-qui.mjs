// 2.11.1 : dans la fiche, chaque message dit qui écrit à qui ; un message envoyé à plusieurs n'apparaît qu'une fois.
// Usage : (cd site && python3 -m http.server 8812) puis node test/v2/qui-ecrit-a-qui.mjs [dossier-captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.SITE || "http://localhost:8812/index.html", shots = process.argv[2];
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
for (const [w, hgt, nom, sombre] of [[1440, 900, "ordinateur", false], [390, 844, "telephone", false], [1440, 900, "sombre", true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, serviceWorkers: "block", deviceScaleFactor: 2, colorScheme: sombre ? "dark" : "light" });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: false };` }));
  await p.goto(base); await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0); await p.waitForTimeout(3000);
  const id = await p.evaluate(() => {
    const it = KP.store.items().find((i) => i.kind === "action" && !i.annule && KP.store.canEdit(i) && !KP.store.reqsOf(i.id).length);
    const ppl = KP.PEOPLE.filter((x) => x.role !== "lecteur"), me = KP.me().k, [a, c] = ppl.filter((x) => x.k !== me), t = Date.now();
    const S = KP.store;
    S.ask({ item: it.id, a: a.k, quoi: "Info", txt: "Tu vas couvrir ça ?", pour: "", quand: t - 9e6 }, true);
    S.ask({ item: it.id, a: c.k, quoi: "Info", txt: "On est d'accord, ce n'est pas dans les confs que tu as prévu de filmer ?", pour: "", quand: t - 8e6 }, true);
    S.ask({ item: it.id, de: c.k, a: a.k, quoi: "Info", txt: "Non je filme pas ça", pour: "", quand: t - 3e6 }, true);
    S.ask({ item: it.id, de: c.k, a: me, quoi: "Info", txt: "Non je filme pas ça", pour: "", quand: t - 3e6 + 800 }, true);
    const r1 = S.ask({ item: it.id, a: a.k, quoi: "Autre", txt: "Les photos du stand", pour: KP.addDays(KP.TODAY, 5), quand: t - 1e6 }, true);
    S.ask({ item: it.id, a: c.k, quoi: "Autre", txt: "Les photos du stand", pour: KP.addDays(KP.TODAY, 5), quand: t - 1e6 + 500 }, true);
    r1.fait = true; r1.rep = "C'est sur SharePoint";
    S.answer(r1.id, "C'est sur SharePoint");
    KP.go({ fiche: it.id }); return it.id;
  });
  await p.waitForSelector("#fiche .ph-msg"); await p.waitForTimeout(500);
  const n = await p.locator("#fiche .msgs .ph-msg").count();
  ok(n === 4, `${nom} : 6 lignes en base, 4 cartes (un message à deux personnes = une carte) [${n}]`);
  const h3 = await p.locator("#fiche .msgs h3").innerText();
  ok(/Messages · 4/.test(h3), `${nom} : le titre compte 4 messages`);
  const cards = await p.locator("#fiche .msgs .ph-msg").evaluateAll((l) => l.map((c) => ({ de: c.querySelector(".de")?.textContent, a: c.querySelector(".a")?.textContent, reps: c.querySelectorAll(".rep").length })));
  ok(cards.every((c) => c.de && c.a), `${nom} : chaque carte a un auteur et un destinataire`);
  ok(/ et /.test(cards[2].a) && /ça/.test(await p.locator("#fiche .msgs .ph-msg").nth(2).innerText()), `${nom} : la réponse à deux s'affiche une fois, adressée aux deux`);
  ok(cards[3].reps === 1 && / et /.test(cards[3].a), `${nom} : la demande à deux montre la réponse de celui qui a répondu`);
  if (shots) { await p.locator("#fiche .msgs").scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await p.locator("#fiche .msgs").screenshot({ path: `${shots}/messages-${nom}.png` }); }
  if (nom === "ordinateur") {
    await p.locator("#fiche .msgs .ph-msg").nth(3).locator("[data-act=req-drop]").click();
    ok(await p.locator("#fiche .msgs .ph-msg").count() === 4 && await p.evaluate((id) => KP.store.reqsOf(id).filter((r) => r.txt === "Les photos du stand").length, id) === 1, "Retirer enlève la demande encore en attente, la réponse déjà reçue reste");
  }
  ok(errs.length === 0, `${nom} : aucune erreur` + (errs.length ? " : " + errs.join(" | ") : ""));
  await ctx.close();
}
await b.close();
console.log(bad ? `Qui écrit à qui : ${bad} échec(s)` : "Qui écrit à qui : tout est bon"); process.exit(bad ? 1 : 0);
