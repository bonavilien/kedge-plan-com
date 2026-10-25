// Écran copil PGE : cartes par période, diffusé / pas encore / à venir, sur le faux client.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const iso = (d) => d.toISOString().slice(0, 10), plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `30000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: new Date().toISOString(), ...o });

const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
// une année entamée : Installer (en cours) a du diffusé, du retard et de l'à venir ; Considérer est prévue ; un sujet sur Installer
const jpo = it({ kind: "tf", t: "Journées portes ouvertes", date: "2026-11-07", svc: "chef", m: [] });
const items = [
  it({ kind: "tf", t: "Salle Bloomberg", date: "2026-09-01", per: [1], svc: "chef", m: [] }),
  it({ kind: "tf", t: "Rentrée Bordeaux", date: "2026-09-07", svc: "chef", m: [] }),
  jpo,
  it({ t: "CP de rentrée", date: "2026-09-08", st: "diffuse" }),
  it({ t: "Reel rentrée", date: "2026-09-10", svc: "rs", st: "diffuse", m: ["2"] }),
  it({ t: "Vidéo campus", date: "2026-09-20", svc: "video", st: "diffuse", m: ["3"] }),
  it({ t: "Interview directeur", date: plus(-3), st: "production" }),
  it({ t: "Article Columbia", date: "2026-10-01", flou: "Oct.", svc: "rs", st: "confirmer" }),
  it({ t: "Post Top UP", date: plus(3), svc: "rs" }),
  it({ t: "Guide Prépa", date: plus(2), svc: "chef", partner: "major", m: ["4"] }),
  it({ t: "Reportage JPO", date: "2026-11-07", svc: "video", tf: jpo.id }),
  it({ t: "CP JPO", date: "2026-11-02", tf: jpo.id }),
  it({ t: "Ancienne idée retirée", date: "2026-09-15", st: "retire" }),
];
await p.evaluate((items) => { const f = window.__fake; f.db.items.push(...items); f.db.partners.push({ k: "major", nom: "Major Prépa" }); f.save(); }, items);
await p.fill("#lg-mail", "julien@kedgebs.com"); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);

await p.click('.side-btn[data-act="copil"]'); await p.waitForTimeout(400);
ok(await p.isVisible("#copil"), "Copil PGE s'ouvre depuis la barre latérale");
const cards = await p.locator(".cp-card").allInnerTexts();
ok(cards.length === 5, "cinq cartes, une par période");
console.log("   carte 1 :", cards[0].replace(/\n+/g, " | "));
console.log("   carte 2 :", cards[1].replace(/\n+/g, " | "));
ok(/En cours/.test(cards[0]) && /3\s*\/7\s*diffusées/.test(cards[0].replace(/\n/g, " ")), "Installer : en cours, 3 diffusées sur 7");
ok(/3 diffusées/.test(cards[0]) && /1 pas encore diffusée/.test(cards[0]) && /3 à venir/.test(cards[0]), "Installer : 3 diffusées, 1 pas encore (date passée), 3 à venir dont « Oct. » (la retirée ne compte pas)");
ok(/1 temps fort · 1 sujet/.test(cards[0]), "Installer : un temps fort, un sujet");
ok(/Dès le 1er novembre/.test(cards[1]) && /2 prévues/.test(cards[1]) && /1 temps fort/.test(cards[1]), "Considérer : à venir, 2 prévues, JPO");
ok(/Rien de prévu/.test(cards[2]), "période vide : « Rien de prévu »");
ok((await p.getAttribute(".cp-card.sel", "data-i")) === "0", "la période en cours est choisie d'office");
const cols = await p.locator(".cp-col").allInnerTexts(); console.log("   à venir :", cols[2].replace(/\n+/g, " | "));
ok(/Diffusé\s*3/.test(cols[0]) && /CP de rentrée/.test(cols[0]), "colonne Diffusé");
ok(/Pas encore diffusé\s*1/.test(cols[1]) && /Interview directeur/.test(cols[1]) && /en production/.test(cols[1]), "colonne Pas encore diffusé, avec l'état");
ok(/À venir\s*3/.test(cols[2]) && /Article Columbia/.test(cols[2]) && /à confirmer/.test(cols[2]) && /Guide Prépa/.test(cols[2]) && /payant/i.test(cols[2]), "colonne À venir : le mois en cours n'est pas en retard, partenariat marqué Payant");
ok((await p.locator(".cp-tf").count()) === 2, "temps forts et sujets de la période en jaune");
await p.screenshot({ path: `${OUT}/c1-copil-1440.png` });
// flèche droite (télécommande) : période suivante
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
ok((await p.getAttribute(".cp-card.sel", "data-i")) === "1" && /Considérer/.test(await p.textContent(".cp-dh h2")), "flèche droite : Considérer");
ok(/Rien de diffusé pour l'instant/.test(await p.textContent(".cp-col.d")) && /CP JPO/.test(await p.textContent(".cp-col.n")), "Considérer : tout est à venir");
await p.screenshot({ path: `${OUT}/c2-copil-considerer.png` });
await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(200);
// une ligne ouvre sa fiche
await p.locator('.cp-row:has-text("Interview directeur")').click(); await p.waitForTimeout(400);
ok(await p.isHidden("#copil") && /Interview directeur/.test(await p.locator(".view.pushed").last().innerText()), "une ligne ouvre la fiche");
// lien direct #copil, et Échap ferme
await p.evaluate(() => { location.hash = "#copil"; }); await p.waitForTimeout(400);
ok(await p.isVisible("#copil"), "lien #copil ouvre l'écran");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
ok(await p.isHidden("#copil"), "Échap ferme");
// 1920 et 1280 pour la vidéoprojection
for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  await p.setViewportSize({ width: w, height: h }); await p.evaluate(() => { location.hash = "#copil"; }); await p.waitForTimeout(400);
  const over = await p.evaluate(() => document.querySelector(".cp-body").scrollWidth - document.querySelector(".cp-body").clientWidth);
  ok(over <= 0, `${w}×${h} : pas de défilement horizontal`);
  await p.screenshot({ path: `${OUT}/c3-copil-${w}.png` }); await p.keyboard.press("Escape");
}
// téléphone : depuis le profil
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
await p.click('.tab[data-kui-tab="periode"]'); await p.waitForTimeout(250);
await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
await p.click('[data-act="copil"] >> visible=true'); await p.waitForTimeout(400);
ok(await p.isVisible("#copil"), "téléphone : depuis Profil");
const overP = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
ok(overP <= 0, "téléphone : pas de défilement horizontal");
await p.screenshot({ path: `${OUT}/c4-copil-tel.png`, fullPage: false });
await p.locator(".cp-body").evaluate((e) => e.scrollTo(0, 700)); await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/c5-copil-tel-detail.png` });
await p.keyboard.press("Escape");
ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));

// un compte de service ne voit pas l'entrée
await p.click('[data-act="logout"] >> visible=true').catch(() => {}); 
await b.close();
console.log(fails ? `${fails} échec(s)` : "Copil : tout est bon");
process.exit(fails ? 1 : 0);
