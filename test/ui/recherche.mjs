// Rechercher : toutes les fiches, sans accents ni majuscules, où le mot a été trouvé, à venir puis passé puis retiré ; téléphone et ordinateur.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const id = (n) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
const it = (n, o) => ({ id: id(n), kind: "action", t: "", date: iso(20), flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(3), at: new Date().toISOString(), ...o });
const items = [
  it(1, { t: "Webinar PGE", lieu: "Campus de Bordeaux", note: "Prévoir la salle. La salle Bloomberg ouvre en janvier, on en parle à la fin du webinar." }),
  it(2, { t: "Journée portes ouvertes", kind: "tf", svc: "chef", m: [], date: iso(30) }),
  it(3, { t: "Live Instagram", svc: "rs", tf: id(2), date: iso(29) }),
  it(4, { t: "Événement alumni", svc: "rs", date: iso(-25) }),
  it(5, { t: "Guide Prépa", svc: "chef", partner: "major", m: ["4"], date: iso(40) }),
  it(6, { t: "Interview alumni annulée", st: "retire", date: iso(10) }),
  it(7, { t: "Rencontre alumni Lyon", date: iso(12) }),
];
const links = [{ id: crypto.randomUUID(), item: id(7), nom: "Dossier de presse", url: "https://kedgebs.sharepoint.com/x", author: U(3), at: new Date().toISOString() }];
const reqs = [{ id: crypto.randomUUID(), item: id(1), asker: U(3), dest: "rs", type: "Visuels", quoi: "logo HD du campus", pour: iso(10), st: "ouverte", at: new Date().toISOString(), reponse: "" }];

async function session(vp) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(({ items, links, reqs }) => { const f = window.__fake; f.db.items.push(...items); f.db.links.push(...links); f.db.reqs.push(...reqs); f.db.partners.push({ k: "major", nom: "Major Prépa" }); f.save(); }, { items, links, reqs });
  await p.fill("#lg-mail", "aurelie@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);
  return p;
}
const sv = (p) => p.locator(".view.pushed:has(.q-in)");
const type = async (p, q) => { await sv(p).locator(".q-in").fill(q); await p.waitForTimeout(150); };
const titles = async (p) => (await sv(p).locator(".q-res .ag-row .row-main > b").allInnerTexts()).map((x) => x.trim());
const heads = async (p) => (await sv(p).locator(".q-res .sec-h").allTextContents()).map((x) => x.trim());
const snips = async (p) => (await sv(p).locator(".q-res .q-snip").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());

// ---------- téléphone ----------
let p = await session({ width: 390, height: 844 });
const loupe = p.locator('#v-periode .nb [data-act="search"]');
ok(await loupe.isVisible(), "téléphone : loupe en haut de Ma période");
ok(!(await p.locator(".side-search").isVisible()), "téléphone : pas de recherche dans un menu");
await loupe.click(); await p.waitForTimeout(450);
ok(await sv(p).isVisible(), "la loupe ouvre « Rechercher »");
ok(await p.evaluate(() => document.activeElement?.classList.contains("q-in")), "le champ a le curseur");
ok((await sv(p).innerText()).includes("Cherche dans les titres"), "avant de taper : une phrase d'aide");

await type(p, "bloomberg");
ok(JSON.stringify(await titles(p)) === JSON.stringify(["Webinar PGE"]), "« bloomberg » : trouvé dans la note du Webinar PGE");
let sn = await snips(p);
ok(sn.length === 1 && sn[0].startsWith("Note") && /salle Bloomberg ouvre/.test(sn[0]), `où : « ${sn[0]} »`);
ok((await sv(p).locator(".q-snip mark").innerText()) === "Bloomberg", "le mot est surligné");
await p.screenshot({ path: `${OUT}/r1-note.png` });

await type(p, "evenement");
ok((await titles(p)).includes("Événement alumni"), "sans accents : « evenement » trouve « Événement alumni »");
ok((await sv(p).locator(".q-res .ag-row mark").first().innerText()) === "Événement", "le titre est surligné avec ses accents");

await type(p, "WEBINAR bordeaux");
ok(JSON.stringify(await titles(p)) === JSON.stringify(["Webinar PGE"]), "deux mots, majuscules : titre + lieu");
ok((await snips(p))[0]?.startsWith("Lieu"), "où : « Lieu »");
await type(p, "webinar lyon");
ok((await sv(p).innerText()).includes("Rien ne correspond à « webinar lyon »"), "aucun résultat : on le dit");

await type(p, "portes");
let t = await titles(p);
ok(t.includes("Journée portes ouvertes") && t.includes("Live Instagram"), "le relais d'un temps fort sort avec lui : " + t.join(", "));
ok((await snips(p)).some((x) => x.startsWith("Temps fort") && x.includes("portes ouvertes")), "où : « Temps fort »");

await type(p, "presse"); ok((await snips(p)).some((x) => x.startsWith("Document") && x.includes("Dossier de presse")), "nom d'un document");
await type(p, "logo"); ok((await snips(p)).some((x) => x.startsWith("Demande") && x.includes("logo HD")), "demande d'éléments");
await type(p, "major"); ok((await titles(p)).includes("Guide Prépa"), "nom du partenaire");
await type(p, "aurelie"); ok((await titles(p)).length === items.length, "« Ajouté par » : toutes les fiches d'Aurélie");

await type(p, "alumni");
t = await titles(p);
ok(JSON.stringify(await heads(p)) === JSON.stringify(["À venir", "Passé", "Retiré"]), "à venir, puis passé, puis retiré");
ok(t[0] === "Rencontre alumni Lyon" && t.at(-1) === "Interview alumni annulée", "ordre : " + t.join(", "));
ok((await sv(p).innerText()).includes("3 résultats"), "le nombre de résultats");
await p.screenshot({ path: `${OUT}/r2-groupes.png` });

// le temps réel redessine sans perdre la frappe
await p.evaluate(() => window.KUI.refresh()); await p.waitForTimeout(150);
ok((await sv(p).locator(".q-in").inputValue()) === "alumni" && (await titles(p)).length === 3, "un rechargement garde la recherche");
ok(await p.evaluate(() => document.activeElement?.classList.contains("q-in")), "et le curseur");

// un résultat ouvre la fiche ; retour : la recherche est intacte
await sv(p).locator('.q-res [data-open]').first().click(); await p.waitForTimeout(450);
ok((await p.locator(".view.pushed").last().innerText()).includes("Rencontre alumni Lyon"), "un résultat ouvre sa fiche");
await p.locator(".view.pushed").last().locator('[data-kui="back"]').click(); await p.waitForTimeout(450);
ok((await sv(p).locator(".q-in").inputValue()) === "alumni" && (await titles(p)).length === 3, "retour : la recherche est toujours là");
ok(!p.errs.length, "téléphone : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

// ---------- ordinateur ----------
p = await session({ width: 1440, height: 900 });
const ss = p.locator(".side-search");
ok(await ss.isVisible() && /Rechercher/.test(await ss.innerText()) && /K/.test(await ss.innerText()), "ordinateur : « Rechercher » en haut du menu, avec le raccourci");
ok(!(await p.locator('#v-periode .nb [data-act="search"]').isVisible()), "ordinateur : pas de loupe en haut de l'écran");
await p.keyboard.press("Control+k"); await p.waitForTimeout(450);
ok(await sv(p).isVisible() && await p.evaluate(() => document.activeElement?.classList.contains("q-in")), "Ctrl+K ouvre la recherche, curseur dans le champ");
await p.keyboard.type("alumni"); await p.waitForTimeout(200);
ok((await titles(p)).length === 3, "la frappe filtre tout de suite");
await p.screenshot({ path: `${OUT}/r3-ordinateur.png` });
await sv(p).locator('.q-res [data-open]').nth(1).click(); await p.waitForTimeout(450);
ok((await p.locator(".view.pushed").last().innerText()).includes("Événement alumni"), "un résultat ouvre sa fiche dans le panneau");
await p.keyboard.press("Control+k"); await p.waitForTimeout(450);
ok(await p.evaluate(() => document.activeElement?.classList.contains("q-in")) && (await p.locator(".view.pushed").count()) === 1, "Ctrl+K ramène à la recherche");
await p.keyboard.press("Escape"); await p.waitForTimeout(450);
ok((await sv(p).locator(".q-in").inputValue()) === "" && (await p.locator(".view.pushed").count()) === 1, "Échap vide d'abord le champ");
await p.keyboard.press("Escape"); await p.waitForTimeout(450);
ok(!(await p.locator(".view.pushed").count()), "puis Échap ferme la recherche");
await ss.click(); await p.waitForTimeout(450);
await p.keyboard.type("prépa"); await p.waitForTimeout(200);
ok(await sv(p).isVisible() && (await titles(p)).includes("Guide Prépa"), "le bouton du menu ouvre la recherche");
await sv(p).locator('[data-kui="back"]').click(); await p.waitForTimeout(450);
await ss.click(); await p.waitForTimeout(450);
ok((await sv(p).locator(".q-in").inputValue()) === "prépa", "fermée par la croix, elle se rouvre sur la dernière recherche");
await p.locator("#v-periode").click({ position: { x: 300, y: 300 } }).catch(() => {});
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
await p.locator("body").press("/"); await p.waitForTimeout(450);
ok(await sv(p).isVisible(), "« / » ouvre aussi la recherche");
ok(!p.errs.length, "ordinateur : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

await b.close();
console.log(fails ? `${fails} échec(s)` : "Rechercher : tout est bon");
process.exit(fails ? 1 : 0);
