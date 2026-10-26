// QA droits, 2e passe : les boutons affichés pour chaque rôle comparés aux règles de la base (test/db/droits2.sql).
// node test/ui/serve.mjs 8801 & node test/ui/droits2.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const URL0 = `http://localhost:${process.env.UIPORT || 8790}/test.html`;
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg, extra = "") => { console.log(`${c ? "OK  " : "FAIL"} ${msg}${extra ? `  [${extra}]` : ""}`); if (!c) fails++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const I = (n) => `d0000000-0000-4000-8000-00000000000${n}`;
const it = (n, o) => ({ id: I(n), kind: "action", t: "x", date: "2026-11-10", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: "2026-10-20T10:00:00Z", ...o });
const ITEMS = [
  it(1, { t: "Action RP", svc: "rp", author: U(3) }),
  it(2, { t: "Action RS", svc: "rs", author: U(4) }),
  it(3, { t: "Action chef", svc: "chef" }),
  it(4, { t: "Partenariat Major", svc: "chef", partner: "major" }),
  it(5, { t: "TF chef", kind: "tf", m: [], date: "2026-11-20", svc: "chef" }),
  it(6, { t: "RP retirée", svc: "rp", author: U(3), st: "retire" }),
  it(7, { t: "Partenariat retiré", svc: "chef", partner: "major", st: "retire" }),
];
const errs = [];
async function as(who, extra) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Europe/Paris", locale: "fr-FR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${who}: ${e.message}`));
  await p.clock.install({ time: new Date("2026-10-25T10:00:00+02:00") });
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(({ items, U }) => {
    const d = window.__fake.db;
    d.partners = [{ k: "major", nom: "Major Prépa" }];
    d.items = items;
    d.blocks = [
      { id: "b1", item: items[3].id, author: U[1], why: "Pas de BAT", leve: false, at: "2026-10-20T10:00:00Z" },
      { id: "b2", item: items[0].id, author: U[4], why: "Pas de visuels", leve: false, at: "2026-10-20T10:00:00Z" },
    ];
    d.reqs = [
      { id: "r1", item: items[1].id, asker: U[4], dest: "rp", type: "Visuels", quoi: "", pour: "2026-11-05", st: "ouverte", at: "2026-10-20T10:00:00Z" },
    ];
    d.links = [
      { id: "l1", item: items[0].id, nom: "Doc de Stéphane", url: "https://x.sharepoint.com/1", author: U[4], at: "2026-10-20T10:00:00Z" },
    ];
    d.profiles.find((x) => x.nom === "Louise").media = true; // vidéo + média, pas chef
    // média sans service, pas chef
    d.users.push({ id: "00000000-0000-0000-0000-0000000000d5", email: "mediaseul@kedgebs.com", password: "motdepasse" });
    d.profiles.push({ id: "00000000-0000-0000-0000-0000000000d5", nom: "Mediaseul", fonction: "", svc: null, chef: false, media: true, notif_all: false });
    window.__fake.save();
  }, { items: ITEMS, U: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, U(n)])) });
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
  return p;
}
const openItem = async (p, id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(450); };
const top = (p) => p.locator(".view.pushed").last();
const has = async (p, sel) => (await top(p).locator(sel).count()) > 0;
const tab = async (p, t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()).catch(() => {}); await p.waitForTimeout(300); };
const team = async (p, id) => {
  await p.evaluate(() => document.querySelector('[data-act="profil"]').click()); await p.waitForTimeout(300);
  await p.click('[data-act="team"]'); await p.waitForTimeout(300);
  await p.click(`[data-act="person"][data-id="${id}"]`); await p.waitForTimeout(300);
  return { chef: await p.$eval("#pp-chef", (x) => x.disabled), media: await p.$eval("#pp-media", (x) => x.disabled) };
};
const close = (p) => p.context().close();

// ---------- Louise : vidéo + média, pas chef ----------
let p = await as("louise");
await tab(p, "ajouter");
ok((await p.$$eval("#f-kind button", (bs) => bs.map((x) => x.value))).includes("partner"), "Louise (média) : « Partenariat » dans Ajouter");
await p.click('#f-kind button[value="partner"]'); await p.waitForTimeout(150);
await p.fill("#f-t", "Article Louise"); await p.click('#f-m .chip:has-text("Filières")');
await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
const lp = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Article Louise"));
ok(lp?.svc === "chef" && lp?.partner === "major", "Louise publie un partenariat (svc chef, permis en base : droits2.sql n°74)", `${lp?.svc}/${lp?.partner}`);
await openItem(p, I(4));
ok(await has(p, '[data-act="edit"]'), "Louise : Modifier sur le partenariat");
ok(await has(p, '[data-act="unblock"]'), "Louise : Lever sur le blocage du partenariat");
ok(await has(p, '[data-act="retire"]'), "Louise : Retirer le partenariat");
await openItem(p, I(7));
ok(await has(p, '[data-act="unretire"]'), "Louise : Remettre le partenariat retiré");
await openItem(p, I(1));
ok(!(await has(p, '[data-act="edit"]')) && !(await has(p, '[data-act="unblock"]')), "Louise : ni Modifier ni Lever sur l'action RP");
await openItem(p, I(5));
ok(await has(p, '[data-act="addlink"]') && await has(p, '[data-act="addlinked"]'), "Louise : Ajouter un lien / une action liée (elle a un service)");
await close(p);

// ---------- média sans service, pas chef ----------
p = await as("mediaseul");
await tab(p, "media");
const addBtn = await p.locator('[data-act="addpartner"] >> visible=true').count();
ok(addBtn > 0, "média sans service : bouton Ajouter un partenariat");
if (addBtn) { await p.click('[data-act="addpartner"] >> visible=true'); await p.waitForTimeout(300); }
const form = await p.locator("#f-t").count();
ok(form > 0, "média sans service : le formulaire partenariat s'ouvre (la base le permet : droits2.sql n°81)",
  form ? "" : (await p.locator("#v-ajouter .empty").innerText().catch(() => "")).slice(0, 80));
await openItem(p, I(4));
ok(await has(p, '[data-act="edit"]') && await has(p, '[data-act="unblock"]'), "média sans service : Modifier et Lever sur le partenariat");
ok(await has(p, '[data-act="addlink"]'), "média sans service : Ajouter un lien (permis en base n°82)");
ok(!(await has(p, '[data-act="addlinked"]')), "média sans service : pas d'Ajouter une action liée sur un partenariat");
await close(p);

// ---------- Estelle : chef, pas média ----------
p = await as("estelle");
await openItem(p, I(4));
ok(!(await has(p, '[data-act="edit"]')), "Estelle : pas de Modifier sur un partenariat");
ok(!(await has(p, '[data-act="retire"]')), "Estelle : pas de Retirer sur un partenariat");
ok(await has(p, '[data-act="unblock"]'), "Estelle : Lever sur le blocage du partenariat (is_chef)");
await openItem(p, I(7));
ok(!(await has(p, '[data-act="unretire"]')), "Estelle : pas de Remettre sur un partenariat retiré");
await openItem(p, I(1));
ok(await has(p, '[data-act="edit"]') && await has(p, '[data-act="unblock"]'), "Estelle : Modifier et Lever sur l'action RP");
ok(await top(p).locator('[data-act="unlink"]').count() > 0, "Estelle : Retirer le document de Stéphane (chef)");
await openItem(p, I(2));
ok(await has(p, '[data-act="pour"]'), "Estelle : deadline modifiable (chef)");
await openItem(p, I(6));
ok(await has(p, '[data-act="unretire"]'), "Estelle : Remettre l'action RP retirée");
await tab(p, "ajouter");
ok(!(await p.$$eval("#f-kind button", (bs) => bs.map((x) => x.value))).includes("partner"), "Estelle : pas de Partenariat dans Ajouter");
let t = await team(p, U(2));
ok(t.chef && t.media, "Estelle sur elle-même : chef et média désactivés", JSON.stringify(t));
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
await close(p);
p = await as("estelle");
t = await team(p, U(1));
ok(!t.chef && t.media, "Estelle sur Julien : chef modifiable, média désactivé", JSON.stringify(t));
await close(p);

// ---------- Julien : chef + média ----------
p = await as("julien");
await tab(p, "ajouter");
await p.click('#f-kind button[value="action"]'); await p.waitForTimeout(150);
ok((await p.$$eval("#f-svc .chip", (bs) => bs.map((x) => x.getAttribute("value")))).includes("chef"), "Julien : « Porté par » propose Chef de projet");
await openItem(p, I(4));
ok(await has(p, '[data-act="edit"]'), "Julien : Modifier le partenariat");
t = await team(p, U(1));
ok(t.chef && !t.media, "Julien sur lui-même : chef désactivé, média modifiable", JSON.stringify(t));
await close(p);
p = await as("julien");
t = await team(p, U(2));
ok(!t.chef && !t.media, "Julien sur Estelle : chef et média modifiables", JSON.stringify(t));
await close(p);

// ---------- Stéphane : RS, auteur d'un blocage et d'un document sur l'action RP ----------
p = await as("stephane");
await openItem(p, I(1));
ok(!(await has(p, '[data-act="edit"]')), "Stéphane : pas de Modifier sur l'action RP");
ok(await has(p, '[data-act="unblock"]'), "Stéphane : Lever son propre blocage");
ok(await top(p).locator('[data-act="unlink"]').count() === 1, "Stéphane : Retirer son document");
ok(!(await has(p, '[data-act="retire"]')), "Stéphane : pas de Retirer sur l'action RP");
await openItem(p, I(2));
ok(await has(p, '[data-act="pour"]'), "Stéphane : deadline de sa demande modifiable");
await openItem(p, I(6));
ok(!(await has(p, '[data-act="unretire"]')), "Stéphane : pas de Remettre sur l'action RP retirée");
await close(p);

// ---------- Aurélie : RP, service sollicité ----------
p = await as("aurelie");
await openItem(p, I(2));
ok(!(await has(p, '[data-act="pour"]')), "Aurélie (sollicitée) : deadline non modifiable");
await openItem(p, I(1));
ok(await has(p, '[data-act="unblock"]'), "Aurélie : Lever un blocage sur son action");
ok(await top(p).locator('[data-act="unlink"]').count() === 0, "Aurélie : pas de Retirer sur le document de Stéphane");
await openItem(p, I(6));
ok(await has(p, '[data-act="unretire"]'), "Aurélie : Remettre son action retirée");
await close(p);

// ---------- Nouveau : sans service ----------
p = await as("nouveau");
await openItem(p, I(5));
ok(!(await has(p, '[data-act="edit"]')), "lecture seule : pas de Modifier");
ok(!(await has(p, '[data-act="addlinked"]')), "lecture seule : pas d'Ajouter une action liée");
ok(!(await has(p, '[data-act="addlink"]')), "lecture seule : pas d'Ajouter un lien");
ok(await has(p, '[data-act="ask"]'), "lecture seule : Demander des éléments");
await openItem(p, I(1));
ok(!(await has(p, '[data-act="unblock"]')) && (await top(p).locator('[data-act="unlink"]').count()) === 0, "lecture seule : ni Lever ni Retirer un document");
await tab(p, "ajouter");
ok((await p.locator("#f-t").count()) === 0, "lecture seule : pas de formulaire Ajouter");
await close(p);

await b.close();
ok(errs.length === 0, "aucune erreur JS", errs.join(" | "));
console.log(fails ? `${fails} écart(s)` : "tout est bon");
process.exit(fails ? 1 : 0);
