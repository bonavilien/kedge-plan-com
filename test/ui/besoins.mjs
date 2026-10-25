// Besoins d'éléments, deadlines et rappels dans l'appli (2e campagne), au dim. 25 oct. 2026, 9 h Paris, sur le faux client.
// node test/ui/besoins.mjs [dossier captures]  (serveur : node test/ui/serve.mjs 8803)
// OK = attendu ; BUG = défaut constaté (le script continue) ; CORRIGÉ ? = défaut disparu. Le script n'échoue que sur les OK.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0, bugs = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const bug = (c, msg) => { console.log(`${c ? "BUG " : "CORRIGÉ ?"} ${msg}`); if (c) bugs++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `40000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: "2026-10-01T10:00:00Z", ...o });
const rq = (o) => ({ id: crypto.randomUUID(), quoi: "", st: "ouverte", at: "2026-10-20T10:00:00Z", ...o });
const jpo = it({ kind: "tf", t: "Journées portes ouvertes", date: "2026-11-14", svc: "chef", m: [] });
const mois = it({ t: "Au mois seulement", date: "2026-11-01", flou: "Nov." });
const cpjpo = it({ t: "CP JPO", date: "2026-11-09", tf: jpo.id });
const tard = it({ t: "Dans deux jours", date: "2026-10-27" });
const demain = it({ t: "Demain matin", date: "2026-10-26" });
const live = it({ t: "Live JPO", date: "2026-11-09", svc: "rs", tf: jpo.id, author: U(4) });
const story = it({ t: "Story retirée", date: "2026-11-10", svc: "rs", tf: jpo.id, st: "retire", author: U(4) });
const suj = it({ kind: "tf", t: "Sujet Alumni", date: "2026-11-01", per: [2], svc: "chef", m: [] });
const items = [jpo, mois, cpjpo, tard, demain, live, story, suj];
const R = {
  vis: rq({ item: live.id, asker: U(4), dest: "chef", type: "Visuels", pour: "2026-11-02" }),        // dans 8 jours
  con: rq({ item: live.id, asker: U(4), dest: "rp", type: "Contact", pour: "2026-10-27" }),          // dans 2 jours : jaune
  rush: rq({ item: story.id, asker: U(4), dest: "video", type: "Rushs", pour: "2026-10-20" }),       // en retard : rouge
  prog: rq({ item: jpo.id, asker: U(1), dest: "rp", type: "Programme", pour: "2026-10-28" }),        // demandée par un chef à RP
  recu: rq({ item: live.id, asker: U(4), dest: "video", type: "Contexte", pour: "2026-10-22", st: "recue" }),
};
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Europe/Paris", locale: "fr-FR" });
const p = await ctx.newPage();
await p.clock.install({ time: new Date("2026-10-25T08:00:00Z") });
await p.clock.pauseAt(new Date("2026-10-25T08:00:00Z"));
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const fake = () => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const mutate = (fn, arg) => p.evaluate(([src, arg]) => { const f = window.__fake; new Function("db", "arg", src)(f.db, arg); f.save(); }, [fn, arg]);
const tick = (ms = 400) => p.clock.runFor(ms).then(() => p.waitForTimeout(50));
const tab = async (t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await tick(); };
const topv = () => p.locator(".view.pushed").last();
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  for (let i = 0; i < 40 && !(await p.evaluate(() => document.getElementById("brand").hidden)); i++) await tick(200);
  await tick(600);
}
const logout = () => p.evaluate(() => { window.__fake.db.session = null; window.__fake.save(); });
const open = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await tick(600); };
const section = async (title) => { const s = p.locator(`.todo-sec:has(h2:has-text("${title}"))`); return (await s.count()) ? s.innerText() : ""; };
const sheetOk = async () => { await p.click('.sheet.show [data-kui="ok"]'); await tick(700); };
const sheetClose = async () => { await p.click('.sheet.show [data-kui="close"]'); await tick(500); };
// choisit une date dans le calendrier d'un champ date
async function pick(id, d) {
  await p.click(`#${id}`); await tick(100);
  for (let i = 0; i < 6; i++) {
    const cell = p.locator(`#${id}-cal [data-cal-day="${d}"]`);
    if (await cell.count()) { await cell.click(); await tick(100); return; }
    const cur = await p.locator(`#${id}-cal [data-cal-day]`).first().getAttribute("data-cal-day");
    await p.click(`#${id}-cal .cal-nav >> nth=${d < cur ? 0 : 1}`); await tick(100);
  }
  throw new Error("date introuvable " + d);
}
const askOpen = async (id) => { await open(id); await topv().locator('[data-act="ask"]').first().click(); await tick(500); };
const askPour = () => p.getAttribute("#ask-pour", "value");

await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
await p.evaluate(({ items, reqs }) => { const f = window.__fake; f.db.items.push(...items); f.db.reqs.push(...reqs);
  f.db.profiles.find((x) => x.nom === "Estelle").svc = "rp"; f.save(); }, { items, reqs: Object.values(R) });

// ================= Aurélie (RP) =================
await login("aurelie");
await tab("afaire");
const dem = await section("Demandes reçues"); console.log("     demandes reçues Aurélie :", dem.replace(/\n+/g, " | "));
const conCard = p.locator('.todo:has-text("un contact")');
ok(/Deadline 27 octobre · dans 2 jours/.test(await conCard.innerText()), "À faire, demande reçue : deadline écrite « Deadline 27 octobre · dans 2 jours »");
ok(await conCard.locator(".dl.soon").count() === 1 && await conCard.locator("button.dl").count() === 0, "à 2 jours : en jaune ; le service sollicité ne peut pas la changer (pas un bouton)");
ok(/le programme/.test(dem), "demande d'un chef à RP visible chez Aurélie");
const rap = await section("Besoin d'éléments"); console.log("     rappels Aurélie :", rap.replace(/\n+/g, " | "));
ok(/CP JPO[\s\S]*J-15/.test(rap) && /Dans deux jours/.test(rap) && /Demain matin/.test(rap), "cartes rappel : CP JPO, action à 2 jours, action demain");
ok(!rap.includes("Au mois seulement"), "action datée au mois : pas de carte (ancien défaut corrigé)");
bug(/Dans deux jours[\s\S]{0,200}J-7/.test(rap), "carte rappel d'une action dans 2 jours marquée « J-7 » (le jalon) alors que la notification dit « J-2 »");
// deadline proposée
await askOpen(tard.id); const pTard = await askPour(); await sheetClose();
ok(pTard <= tard.date && pTard >= "2026-10-25", `action du 27/10 : deadline proposée ${pTard}, pas après l'action (ancien défaut corrigé)`);
await askOpen(demain.id); const pDem = await askPour(); await sheetClose();
ok(pDem === "2026-10-25", `action demain : deadline proposée aujourd'hui (${pDem})`);
await askOpen(mois.id); const pMois = await askPour(); await sheetClose();
ok(pMois >= "2026-10-25" && pMois <= "2026-11-30", `action au mois (Nov.) : deadline proposée ${pMois}`);
await askOpen(suj.id); const pSuj = await askPour(); await sheetClose();
ok(pSuj >= "2026-10-25" && pSuj <= "2026-12-31", `sujet de période : deadline proposée ${pSuj}`);
// deadline choisie après l'action, ou dans le passé : refusée avec un message, la feuille reste ouverte
await askOpen(tard.id);
await p.click('#ask-type .chip:has-text("Visuels")'); await pick("ask-pour", "2026-10-30"); await sheetOk();
ok(!(await fake()).reqs.some((q) => q.item === tard.id && q.pour === "2026-10-30") && /après l'action/.test(await p.textContent("#ask-err")), "deadline au 30/10 pour une action du 27/10 : refusée, « tombe après l'action »");
await sheetClose();
await askOpen(tard.id);
await p.click('#ask-type .chip:has-text("Contexte")'); await pick("ask-pour", "2026-10-20"); await sheetOk();
ok(!(await fake()).reqs.some((q) => q.item === tard.id && q.pour === "2026-10-20") && /déjà passée/.test(await p.textContent("#ask-err")), "deadline dans le passé (20/10) : refusée");
await sheetClose();
// Déjà demandé et doublon dans la famille du temps fort
await askOpen(cpjpo.id);
const deja = await p.locator(".sheet.show .deja").innerText().catch(() => ""); console.log("     déjà demandé :", deja.replace(/\n+/g, " | "));
ok(/Visuels/.test(deja) && /Live JPO/.test(deja) && /deadline 2 novembre/.test(deja), "« Déjà demandé » : visuels du Live JPO avec leur deadline");
ok(/Rushs/.test(deja), "demande ouverte d'un relais retiré listée (ancien défaut corrigé)");
ok(!/Contact/.test(deja) && !/Programme/.test(deja), "pas les demandes adressées à son propre service (ancien défaut corrigé)");
await p.click('#ask-type .chip:has-text("Visuels")'); await p.click('#ask-to .chip:has-text("Chef")').catch(() => p.click("#ask-to .chip >> nth=0"));
await sheetOk();
const errTxt = await p.locator("#ask-err").innerText().catch(() => "");
ok((await fake()).reqs.filter((q) => q.dest === "chef" && q.type === "Visuels" && q.st === "ouverte" && [cpjpo.id, live.id].includes(q.item)).length === 1 && /Déjà demandé/.test(errTxt), "doublon dans la famille bloqué : " + errTxt);
await sheetClose();
// demande depuis la fiche : la carte rappel disparaît
await askOpen(cpjpo.id);
await p.click('#ask-type .chip:has-text("Contexte")'); await p.click('#ask-to .chip:has-text("Vidéo")'); await sheetOk();
await tab("afaire");
ok(!(await section("Besoin d'éléments")).includes("CP JPO"), "demande faite depuis la fiche : la carte rappel de CP JPO disparaît (ancien défaut corrigé)");
// « Pas besoin » puis action décalée
await p.locator('.todo:has-text("Demain matin") [data-act="nope"]').click(); await tick();
ok(!(await section("Besoin d'éléments")).includes("Demain matin"), "« Pas besoin » : carte retirée");
await mutate("db.items.find((i) => i.id === arg).date = '2026-10-29'", demain.id);
await logout(); await login("aurelie"); await tab("afaire");
ok((await section("Besoin d'éléments")).includes("Demain matin"), "action décalée : la carte revient pour la nouvelle date (ancien défaut corrigé)");
await logout();

// ================= Stéphane (RS) : ses demandes, couleurs, changement de deadline =================
await login("stephane");
await tab("afaire");
const sent = p.locator('.todo-sec:has(h2:has-text("Tes demandes"))');
const sentTxt = await sent.innerText().catch(() => ""); console.log("     tes demandes :", sentTxt.replace(/\n+/g, " | "));
const row = (t) => sent.locator(`.rq:has-text("${t}")`);
ok(await row("Visuels").locator("button.dl:not(.soon):not(.late)").count() === 1, "Tes demandes : Visuels à 8 jours, tag neutre, modifiable");
ok(await row("Contact").locator("button.dl.soon").count() === 1, "Contact à 2 jours : jaune");
ok(await row("Rushs").locator("button.dl.late").count() === 1 && /En retard · deadline 20 octobre/.test(await row("Rushs").innerText()), "Rushs : rouge « En retard · deadline 20 octobre »");
ok(!sentTxt.includes("Contexte"), "demande reçue : plus dans Tes demandes");
const col = await p.evaluate(() => { const g = (s) => { const e = document.querySelector(s); return e && getComputedStyle(e).backgroundColor; }; return { soon: g(".dl.soon"), late: g(".dl.late"), n: g(".dl:not(.soon):not(.late)") }; });
ok(col.soon && col.late && col.soon !== col.late && col.n !== col.soon, "trois couleurs distinctes : " + JSON.stringify(col));
await row("Contact").locator("button.dl").click(); await tick(500);
await pick("pour-d", "2026-10-31"); await sheetOk();
const snack = await p.locator(".snack").innerText().catch(() => "");
ok((await fake()).reqs.find((q) => q.id === R.con.id).pour === "2026-10-31", "deadline changée par la personne qui demande : enregistrée (" + snack + ")");
ok(await row("Contact").locator("button.dl.soon").count() === 0 && /31 octobre/.test(await row("Contact").innerText()), "après changement : 31 octobre, plus en jaune");
// fiche du relais : chaque demande a sa deadline, la reçue n'en a pas
await open(live.id);
const rqs = await topv().locator(".rq").allInnerTexts(); console.log("     fiche Live JPO :", rqs.map((t) => t.replace(/\n+/g, " / ")).join(" || "));
ok(rqs.filter((t) => /Deadline|En retard/.test(t)).length === rqs.filter((t) => !/Reçu/.test(t)).length && rqs.some((t) => /Reçu/.test(t) && !/Deadline/.test(t)), "fiche : deadline sur chaque demande ouverte, aucune sur la reçue");
await logout();

// ================= Estelle (chef ET service RP) =================
await login("estelle"); await tab("afaire");
const demE = await section("Demandes reçues"); console.log("     demandes reçues Estelle :", demE.replace(/\n+/g, " | "));
ok(/un contact/.test(demE), "chef avec service : la demande à RP dans son À faire (ancien défaut corrigé)");
bug(!/le programme/.test(demE), "chef avec service RP : la demande de Julien (chef) à RP n'apparaît pas dans ses « Demandes reçues » (comptée comme « sa » demande car tous les chefs ont svc « chef »), alors que la base la prévient");
const sentE = await p.locator('.todo-sec:has(h2:has-text("Tes demandes"))').innerText().catch(() => "");
bug(/Programme/.test(sentE), "Estelle voit la demande de Julien dans « Tes demandes en attente » (demandes de tous les chefs mélangées)");
await open(jpo.id);
ok(await topv().locator('.rq:has-text("Contact") [data-act="repondre"]').count() === 1, "« Répondre » sur la demande RP depuis le temps fort (ancien défaut corrigé)");
ok(await topv().locator(".rq button.dl").count() >= 3, "un chef peut changer toutes les deadlines ouvertes du temps fort");
await logout();

// ================= Julien (chef) : écran réunion =================
await login("julien");
await p.setViewportSize({ width: 1440, height: 900 }); await tick(600);
await p.click('[data-act="meeting"] >> visible=true'); await tick(600);
const aside = await p.locator(".mt-aside").innerText(); console.log("     réunion :", aside.replace(/\n+/g, " | "));
ok(/Rushs|des rushs[\s\S]*deadline dépassée \(20 octobre\)/.test(aside), "réunion : demande en retard dans « À débloquer » avec sa deadline");
const ctb = await p.locator(".mt-aside .ma-item.ctb").allInnerTexts();
bug(ctb.some((t) => /demande/.test(t)) && !ctb.some((t) => /deadline|avant le/i.test(t)), "réunion, « Contributions » : les demandes d'éléments n'affichent pas leur deadline (ni jaune pour celles à ≤ 3 jours)");
await p.screenshot({ path: `${OUT}/besoins-reunion.png` });
ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : `Besoins : tout est bon (${bugs} défaut(s) constaté(s))`);
process.exit(fails ? 1 : 0);
