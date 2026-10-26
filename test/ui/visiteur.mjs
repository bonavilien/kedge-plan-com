// Mode visiteur (migration 0005) : un chef passe un compte en visiteur, le visiteur entre avec le seul mot de passe et ne peut rien changer.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|row-level security/.test(m.text())) errs.push(m.text()); });
const fake = () => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const tab = async (t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.waitForTimeout(250); };
const topv = () => p.locator(".view.pushed").last();
const V = "00000000-0000-0000-0000-0000000000f1";
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
async function profil() { await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300); }
async function logout() { await profil(); await p.click('[data-act="logout"]'); await p.waitForTimeout(200); await p.click(".alert .acts button:last-child"); await p.waitForSelector("#login"); }

await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
// le compte créé dans Supabase (l'adresse de site/config.js), encore rattaché à un service par erreur
await p.evaluate((id) => { const d = window.__fake.db;
  d.users.push({ id, email: "visiteur@kedgebs.com", password: "ancre2026" });
  d.profiles.push({ id, nom: "Visiteur", fonction: "", svc: "rp", chef: false, media: false, notif_all: false, visiteur: false }); window.__fake.save(); }, V);

// Julien publie un temps fort puis passe le compte en visiteur dans Équipe
await login("julien");
await tab("ajouter"); await p.click('#f-kind button[value="tf"]'); await p.waitForTimeout(150);
await p.fill("#f-t", "Journées portes ouvertes"); await p.click('[data-act="publish"]'); await p.waitForTimeout(500);
await profil(); await p.click('[data-act="team"]'); await p.waitForTimeout(300);
await p.click(`[data-act="person"][data-id="${V}"]`); await p.waitForTimeout(300);
ok((await p.locator("#pp-visit").count()) === 1, "Équipe : l'interrupteur « Visiteur »");
await p.check("#pp-visit"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
const vp = (await fake()).profiles.find((x) => x.id === V);
ok(vp.visiteur && vp.svc === null && !vp.chef && !vp.notif_all, "le compte devient visiteur et perd son service");
ok((await topv().innerText()).includes("Visiteur · lecture seule"), "Équipe : « Visiteur · lecture seule »");
await logout();

// écran de connexion : « Entrer en visiteur » ne demande que le mot de passe
await p.click("#lg-visit"); await p.waitForTimeout(150);
ok(await p.isHidden("#lg-mail-f") && (await p.textContent("#lg-visit")) === "J'ai un compte", "mode visiteur : plus d'e-mail à taper, retour possible");
await p.screenshot({ path: `${OUT}/v1-connexion.png` });
await p.fill("#lg-pw", "mauvais"); await p.click("#login button"); await p.waitForTimeout(400);
ok((await p.textContent("#lg-err")) === "Mot de passe incorrect.", "mauvais mot de passe : « Mot de passe incorrect. »");
await p.click("#lg-visit"); await p.waitForTimeout(150);
ok(await p.isVisible("#lg-mail-f") && (await p.inputValue("#lg-mail")) === "", "« J'ai un compte » rend le champ e-mail, vide");
await p.click("#lg-visit"); await p.fill("#lg-pw", "ancre2026"); await p.click("#login button");
await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);
ok(true, "le visiteur est entré");

// il voit tout, sans aucun bouton pour changer quoi que ce soit
const jpo = (await fake()).items.find((i) => i.t === "Journées portes ouvertes");
await tab("tf"); await p.locator(`[data-open="${jpo.id}"]`).first().click(); await p.waitForTimeout(400);
const fiche = topv();
ok((await fiche.locator(".hero-title").innerText()) === "Journées portes ouvertes", "le visiteur ouvre la fiche du temps fort");
for (const [sel, what] of [['[data-act="ask"]', "Demander des éléments"], ['[data-act="block"]', "Signaler un blocage"], ['[data-act="addlink"]', "Ajouter un lien"],
  ['[data-act="addlinked"]', "Ajouter une action liée"], ['[data-act="edit"]', "Modifier"], ["select[data-st]", "le statut"]]) ok(!(await fiche.locator(sel).count()), `fiche : pas de « ${what} »`);
await p.screenshot({ path: `${OUT}/v2-fiche.png` });
await tab("ajouter");
ok((await p.locator("#v-ajouter").innerText()).includes("Mode visiteur"), "Ajouter : un mot dit que c'est en consultation seule");
ok(!(await p.locator("#v-ajouter #f-t").count()), "Ajouter : pas de formulaire");
await tab("tf");
ok(!(await p.locator('#v-tf [data-act="addtf"]').count()), "Temps forts : pas de « Proposer »");
await profil();
const pv = await topv().innerText();
ok(!(await topv().locator('[data-act="password"]').count()) && !(await topv().locator("#pf-push").count()), "Profil : ni mot de passe à changer, ni notifications");
ok(pv.includes("Mode visiteur : consultation seule."), "Profil : « Mode visiteur : consultation seule. »");
await p.screenshot({ path: `${OUT}/v3-profil.png` });

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Visiteur : tout est bon");
process.exit(fails ? 1 : 0);
