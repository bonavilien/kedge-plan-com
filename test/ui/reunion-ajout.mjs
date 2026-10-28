// Mode réunion : ajouter une action depuis la réunion (fiche liée ou bouton Ajouter), réunion ouverte à tous, demandes aux directions.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg, x = "") => { console.log(`${c ? "OK  " : "FAIL"} ${msg}${x ? `  [${x}]` : ""}`); if (!c) fails++; };
const iso = (d) => d.toISOString().slice(0, 10), plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `70000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: new Date().toISOString(), ...o });
const jpo = it({ kind: "tf", t: "Journées portes ouvertes", date: plus(10), svc: "chef", m: [] });
const cp = it({ t: "CP JPO", date: plus(5), tf: jpo.id });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
await p.evaluate((items) => { const f = window.__fake; f.db.items.push(...items); f.save(); }, [jpo, cp]);
const login = async (who) => { await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button"); await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500); };
await login("julien");
// 1. depuis la fiche d'un temps fort ouverte dans la réunion : « Ajouter une action liée »
await p.click('.side-btn[data-act="meeting"]'); await p.waitForTimeout(400);
await p.locator('.mx-tf:has-text("Journées portes ouvertes")').click(); await p.waitForTimeout(500);
await p.locator('.view.pushed [data-act="addlinked"]').click(); await p.waitForTimeout(600);
ok(await p.isHidden("#meeting") && await p.isVisible("#v-ajouter #f-t"), "Ajouter une action liée : le formulaire s'affiche (la réunion ne le cache plus)");
ok(await p.locator('#v-ajouter [data-act="backmeeting"]').count() === 1, "le formulaire propose « Retour à la réunion »");
await p.fill("#f-t", "Reel JPO"); await p.click('#f-m .chip:has-text("Alumni")');
await p.click('#v-ajouter [data-act="publish"]'); await p.waitForTimeout(800);
const reel = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Reel JPO"));
ok(reel && reel.tf === "70000000-0000-4000-8000-000000000001", "l'action est publiée, liée au temps fort");
ok(await p.isVisible("#meeting") && /Reel JPO/.test(await p.locator(".view.pushed").last().innerText()), "après publication : retour à la réunion, la nouvelle fiche ouverte en panneau");
ok(/Reel JPO/.test(await p.textContent("#meeting .mt-main")), "la réunion montre la nouvelle action");
await p.screenshot({ path: `${OUT}/ra1-apres-ajout.png` });
// 2. le bouton Ajouter de la réunion, puis Retour à la réunion sans publier
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await p.click('#meeting [data-mt="add"]'); await p.waitForTimeout(500);
ok(await p.isHidden("#meeting") && await p.isVisible("#v-ajouter #f-t"), "bouton Ajouter de la réunion : le formulaire s'ouvre");
await p.click('#v-ajouter [data-act="backmeeting"]'); await p.waitForTimeout(400);
ok(await p.isVisible("#meeting"), "Retour à la réunion");
await p.click('#meeting .mt-head [data-mt="close"]'); await p.waitForTimeout(300);
// 3. demandes : Direction marketing, Recrutement, Moi (mémo)
await p.evaluate(() => { location.hash = "#item=70000000-0000-4000-8000-000000000002"; }); await p.waitForTimeout(600);
await p.locator('.view.pushed [data-act="ask"]').first().click(); await p.waitForTimeout(400);
const chips = await p.$$eval("#ask-to .chip", (c) => c.map((x) => x.textContent.trim()));
ok(chips.includes("Direction marketing") && chips.includes("Recrutement") && chips.includes("Moi (mémo)"), "À qui ? : Direction marketing, Recrutement, Moi (mémo)", chips.join(", "));
await p.click('#ask-to .chip:has-text("Recrutement")'); await p.click('.sheet.show [data-kui="ok"]'); await p.waitForTimeout(600);
ok(await p.evaluate(() => window.__fake.db.reqs.some((q) => q.dest === "recrutement")), "demande notée pour le Recrutement");
// 4. un compte service : mode réunion accessible, sans « Réunion tenue »
await p.evaluate(() => { const f = window.__fake; f.db.session = null; f.save(); }); await p.goto(URL0); await p.waitForSelector("#login"); await login("aurelie");
ok(await p.locator('.side-btn[data-act="meeting"]').count() === 1 && await p.locator('.side-btn[data-act="copil"]').count() === 0, "Aurélie (RP) : Mode réunion dans le menu, pas le copil");
await p.click('.side-btn[data-act="meeting"]'); await p.waitForTimeout(400);
ok(await p.isVisible("#meeting") && await p.locator('#meeting [data-mt="held"]').count() === 0 && await p.locator('#meeting [data-mt="add"]').count() === 1, "Aurélie : réunion ouverte, Ajouter, pas « Réunion tenue »");
await p.screenshot({ path: `${OUT}/ra2-reunion-aurelie.png` });
ok(!errs.length, "aucune erreur JS" + (errs.length ? " : " + errs.join(" / ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Réunion, ajout : tout est bon");
process.exit(fails ? 1 : 0);
