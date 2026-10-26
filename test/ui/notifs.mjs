// Retest round 2 (UI, faux client) : partenariats, édition sans tempête, routage des notifications.
// Usage : node test/ui/serve.mjs 8805 & node test/qa/notifs2-ui.mjs /tmp/kp2-notifs/shots
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs";
const OUT = process.argv[2] || "/tmp/kp2-notifs/shots", URL0 = "http://localhost:8790/test.html";
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/Paris", locale: "fr-FR" });
const p = await ctx.newPage();
await p.clock.install({ time: new Date("2026-10-25T09:00:00+01:00") });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `30000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(3), at: "2026-10-20T10:00:00Z", ...o });
const PAY = it({ t: "Guide Prépa", date: "2026-11-20", svc: "chef", partner: "major", m: ["4"], author: U(1) });
const ACT = it({ t: "Interview directeur", date: "2026-11-25", svc: "rp", author: U(2) });
const tab = async (t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.waitForTimeout(300); };
const topv = () => p.locator(".view.pushed").last();
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
const logout = async () => { await p.evaluate(() => { const f = window.__fake; f.db.session = null; f.save(); }); };
const openHash = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(500); };
const swOpen = (id) => p.evaluate((id) => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "open", url: location.origin + "/#item=" + id } })), id);
const writes = (n) => p.evaluate((n) => window.__fake.calls.slice(n).filter((c) => c.op !== "select"), n);

await p.goto(URL0);
await p.evaluate(({ items }) => { localStorage.clear(); window.__fake.reset(); const f = window.__fake; f.db.items.push(...items); f.db.partners.push({ k: "major", nom: "Major Prépa" });
  // Louise (Vidéo) devient compte média non chef ; Nouveau (sans service) aussi
  f.db.profiles.find((x) => x.nom === "Louise").media = true; f.db.profiles.find((x) => x.nom === "Nouveau").media = true; f.save(); }, { items: [PAY, ACT] });

// ---------- 1. Estelle : partenariat en lecture, droit média verrouillé ----------
await login("estelle");
await openHash(PAY.id);
let v = await topv().innerText();
ok(/Guide Prépa/.test(v) && /payant/i.test(v), "1a Estelle voit le partenariat avec le badge PAYANT");
ok(!(await topv().locator('[data-act="edit"]').count()) && !(await topv().locator('[data-act="retire"]').count()), "1b Estelle : ni Modifier ni Retirer sur un partenariat");
await p.keyboard.press("Escape").catch(() => {});

// ---------- 2. Estelle ajoute RS en cc : un seul PATCH, seulement cc ----------
await openHash(ACT.id);
await topv().locator('[data-act="edit"]').click(); await p.waitForTimeout(400);
let c0 = await p.evaluate(() => window.__fake.calls.length);
await p.click('#e-cc .chip[value="rs"]'); await p.click('[data-act="save"]'); await p.waitForTimeout(800);
let w = await writes(c0);
const snack = await p.locator(".snack").last().innerText().catch(() => "");
const diff = await p.evaluate((id) => window.__fake.db.journal.filter((j) => j.item === id && j.kind === "modif").at(-1)?.diff || {}, ACT.id);
ok(w.filter((c) => c.t === "items").length === 1 && JSON.stringify(Object.keys(diff)) === '["cc"]', "2a ajout de RS en cc : un seul UPDATE items, seul cc change — " + JSON.stringify(w) + " " + JSON.stringify(diff));
ok(/Notification envoyée à RS/.test(snack), "2b snack « Modifié. Notification envoyée à RS. » — " + snack);
ok(!(await p.isVisible(".alert-wrap.show")), "2c pas de proposition « Prévenir » pour un simple ajout en cc");

// ---------- 3. date + cc dans la même modification : combien de messages pour RS ? ----------
await openHash(ACT.id);
await topv().locator('[data-act="edit"]').click(); await p.waitForTimeout(400);
await p.click('#e-cc .chip[value="video"]');
await p.fill("#e-date", "2026-11-27").catch(() => {});
c0 = await p.evaluate(() => window.__fake.calls.length);
await p.click('[data-act="save"]'); await p.waitForTimeout(800);
const alertTxt = (await p.isVisible(".alert-wrap.show")) ? await p.locator(".alert").innerText() : "";
console.log("   info alerte après date+cc :", alertTxt.replace(/\n/g, " / "));
await p.screenshot({ path: `${OUT}/u3-date-cc.png` });
if (alertTxt) await p.click(".alert .acts button:first-child");
await logout();

// ---------- 4. compte média non chef (Louise, Vidéo) : publie un partenariat ----------
await login("louise");
await tab("ajouter");
ok(await p.isVisible('#f-kind button[value="partner"]'), "4a Louise (média non chef) : type « Partenariat » proposé");
await openHash(PAY.id);
ok(await topv().locator('[data-act="edit"]').count() === 1, "4b Louise : Modifier sur le partenariat");
await p.keyboard.press("Escape").catch(() => {});
await logout();

// ---------- 5. compte média sans service (Nouveau) : peut-il saisir un partenariat ? ----------
await login("nouveau");
await tab("media");
const addBtn = await p.locator('[data-act="addpartner"]:visible').count();
await tab("ajouter");
const form = await p.isVisible('#f-kind button[value="partner"]');
await p.screenshot({ path: `${OUT}/u5-media-sans-service.png` });
ok(!addBtn || form, `5a compte média sans service : bouton Ajouter un partenariat (${addBtn}) mène bien à un formulaire (${form})`);
await logout();

// ---------- 6. toucher une notification ----------
await login("stephane");
const NEW = it({ t: "Reel campus", date: "2026-11-30", svc: "rp", cc: ["rs"], author: U(3) });
await p.evaluate((x) => { const f = window.__fake; f.db.items.push(x); f.save(); }, NEW);
c0 = await p.evaluate(() => window.__fake.calls.length);
await swOpen(NEW.id); await p.waitForTimeout(1200);
ok(/Reel campus/.test(await topv().innerText().catch(() => "")), "6a notification d'une fiche pas encore chargée : rechargement puis ouverture");
const loads = await p.evaluate((n) => window.__fake.calls.slice(n).filter((c) => c.op === "select" && c.t === "items").length, c0);
ok(loads <= 1, "6b un seul rechargement (" + loads + ")");
await p.keyboard.press("Escape").catch(() => {});
// fiche inexistante : un seul rechargement, pas de boucle, pas d'ouverture tardive
const GHOST = "30000000-0000-4000-8000-999999999999";
const pushedBefore = await p.locator(".view.pushed").count();
c0 = await p.evaluate(() => window.__fake.calls.length);
await swOpen(GHOST); await p.waitForTimeout(1500);
const loads2 = await p.evaluate((n) => window.__fake.calls.slice(n).filter((c) => c.op === "select" && c.t === "items").length, c0);
const pushedAfter = await p.locator(".view.pushed").count(), topT = await topv().innerText().catch(() => "");
ok(loads2 <= 1 && pushedAfter <= pushedBefore, "6c fiche introuvable : un rechargement, rien ne s'ouvre (" + loads2 + " ; vues " + pushedBefore + "→" + pushedAfter + " ; " + topT.slice(0, 60).replace(/\n/g, " ") + ")");
ok(!errs.length, "6d pas d'erreur JS " + errs.join(" | "));
await p.screenshot({ path: `${OUT}/u6-route.png` });

await b.close();
console.log(fails ? `${fails} écart(s)` : "Tout est bon");
process.exit(fails ? 1 : 0);
