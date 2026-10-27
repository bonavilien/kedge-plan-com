// Écran réunion : une fiche s'ouvre en panneau par-dessus la réunion, sans la quitter ; la croix ou Échap y ramène.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
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
await p.fill("#lg-mail", "julien@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);
await p.click('.side-btn[data-act="meeting"]'); await p.waitForTimeout(400);
const top = (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.closest("#meeting") ? "reunion" : e.closest(".view.pushed") ? "fiche" : e.closest(".view") ? "vue" : e.tagName; }, [x, y]);
await p.locator('.mx-tf:has-text("Journées portes ouvertes")').click(); await p.waitForTimeout(500);
ok(await p.isVisible("#meeting"), "la réunion reste ouverte");
ok(await top(1300, 400) === "fiche" && /Journées portes ouvertes/.test(await p.locator(".view.pushed").last().innerText()), "la fiche s'ouvre en panneau à droite, par-dessus");
ok(await top(300, 400) === "reunion", "la réunion reste visible à gauche");
ok(await p.locator('#meeting [data-mt-open].on').count() > 0, "la ligne ouverte est marquée dans la réunion");
await p.screenshot({ path: `${OUT}/rf1-fiche-sur-reunion.png` });
// une autre ligne remplace la fiche
await p.locator('.rl:has-text("CP JPO")').click(); await p.waitForTimeout(500);
ok((await p.locator(".view.pushed").count()) === 1 && /CP JPO/.test(await p.locator(".view.pushed").last().innerText()), "une autre ligne remplace la fiche");
// Modifier puis revenir : on reste dans la réunion
await p.locator('.view.pushed [data-act="edit"]').click(); await p.waitForTimeout(400);
ok(await top(1300, 400) === "fiche" && await p.isVisible("#meeting"), "Modifier s'ouvre aussi dans le panneau");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
ok(await p.isVisible("#meeting") && (await p.locator(".view.pushed").count()) === 0, "Échap referme la fiche, la réunion reste");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
ok(await p.isHidden("#meeting"), "un second Échap quitte la réunion");
// la croix
await p.click('.side-btn[data-act="meeting"]'); await p.waitForTimeout(400);
await p.locator('.mx-tf:has-text("Journées portes ouvertes")').click(); await p.waitForTimeout(500);
await p.locator(".view.pushed .nb .back").click(); await p.waitForTimeout(400);
ok(await p.isVisible("#meeting") && (await p.locator(".view.pushed").count()) === 0 && !(await p.evaluate(() => document.querySelector(".app").dataset.mtFiche)), "la croix referme la fiche, la réunion reste");
// Quitter la réunion avec une fiche ouverte : tout se ferme
await p.locator('.mx-tf:has-text("Journées portes ouvertes")').click(); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector('#meeting .mt-head [data-mt="close"]').click()); await p.waitForTimeout(400);
ok(await p.isHidden("#meeting") && (await p.locator(".view.pushed").count()) === 0, "Quitter ferme aussi la fiche");
ok(await p.isVisible(".tabbar") && await top(600, 400) === "vue", "l'appli revient normalement");
ok(!errs.length, "aucune erreur JS" + (errs.length ? " : " + errs.join(" / ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "tout est bon");
process.exit(fails ? 1 : 0);
