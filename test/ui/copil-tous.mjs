// Écran copil PGE ouvert à tous les comptes : un service, un compte sans service, un visiteur ; il ne fait que montrer.
// Une fiche s'ouvre par-dessus le copil, qui reste ouvert derrière ; la croix, le retour ou Échap y ramènent.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const TF = "40000000-0000-0000-0000-000000000001";
const items = [
  { id: TF, kind: "tf", t: "Journées portes ouvertes", date: iso(15), flou: "", per: [], svc: "chef", cc: [], m: [], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: "00000000-0000-0000-0000-000000000001", at: new Date().toISOString() },
  { id: "40000000-0000-0000-0000-000000000002", kind: "action", t: "CP JPO", date: iso(10), flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: TF, partner: null, lieu: "", note: "", author: "00000000-0000-0000-0000-000000000003", at: new Date().toISOString() },
];
async function session(vp, who, setup) {
  const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: 1 })).newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(({ items, setup }) => { const f = window.__fake; f.db.items.push(...items); if (setup) new Function("f", setup)(f); f.save(); }, { items, setup });
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(500);
  return p;
}
const shown = async (p) => (await p.isVisible("#copil")) && (await p.locator(".cp-card").count()) === 5;

// ordinateur : Aurélie (RP), depuis le menu ; une fiche ouverte depuis le copil garde ses droits
let p = await session({ width: 1440, height: 900 }, "aurelie");
ok((await p.locator('.side-btn[data-act="copil"]').count()) === 1, "Aurélie (RP) : « Copil PGE » dans le menu");
await p.click('.side-btn[data-act="copil"]'); await p.waitForTimeout(400);
ok(await shown(p), "Aurélie : le copil s'ouvre, cinq périodes");
await p.screenshot({ path: `${OUT}/ct1-copil-rp.png` });
await p.locator('#copil .cp-row:has-text("CP JPO")').first().click(); await p.waitForTimeout(500);
ok((await p.locator(".view.pushed").last().innerText()).includes("CP JPO"), "une action du copil s'ouvre");
// une autre fiche depuis le copil (le temps fort, en haut de la carte) : elle remplace la première
await p.locator(`#copil .cp-tf[data-cp-open="${TF}"]`).first().click(); await p.waitForTimeout(500);
ok((await p.locator(".view.pushed").count()) === 1, "une autre fiche du copil remplace celle ouverte");
const fiche = p.locator(".view.pushed").last();
ok((await fiche.innerText()).includes("Journées portes ouvertes") && !(await fiche.locator('[data-act="edit"]').count()), "le temps fort des chefs s'ouvre sans « Modifier » pour Aurélie");
ok(await p.isVisible("#copil") && await p.evaluate(() => document.getElementById("app").dataset.cpFiche === "1"), "la fiche s'ouvre par-dessus le copil, qui reste ouvert derrière");
ok((await p.locator(`#copil [data-cp-open="${TF}"].on`).count()) >= 1, "la fiche ouverte est marquée dans le copil");
await p.screenshot({ path: `${OUT}/ct2-fiche-sur-copil.png` });
await p.keyboard.press("Escape"); await p.waitForTimeout(450);
ok(!(await p.locator(".view.pushed").count()) && await shown(p), "Échap ferme la fiche, le copil est toujours là");
await p.locator(`#copil [data-cp-open="${TF}"]`).first().click(); await p.waitForTimeout(500);
await p.locator(".view.pushed").last().locator('[data-kui="back"]').click(); await p.waitForTimeout(450);
ok(!(await p.locator(".view.pushed").count()) && await shown(p), "la croix ferme la fiche, le copil est toujours là");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
ok(!(await p.isVisible("#copil")), "Échap, ensuite, ferme le copil");
await p.click('.side-btn[data-act="copil"]'); await p.waitForTimeout(400);
await p.locator(`#copil [data-cp-open="${TF}"]`).first().click(); await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = "#copil"; }); await p.waitForTimeout(450);
ok(await shown(p) && !(await p.locator(".view.pushed").count()), "rouvrir le copil (#copil) referme la fiche");
await p.click('#copil [data-cp="close"]'); await p.waitForTimeout(450);
ok(!(await p.isVisible("#copil")), "« Quitter » ferme le copil");
ok(!p.errs.length, "Aurélie : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

// ordinateur : un visiteur, par l'adresse #copil
p = await session({ width: 1440, height: 900 }, "nouveau", `f.db.profiles.find((x) => x.nom === "Nouveau").visiteur = true;`);
ok((await p.locator('.side-btn[data-act="copil"]').count()) === 1, "visiteur : « Copil PGE » dans le menu");
await p.evaluate(() => { location.hash = "#copil"; }); await p.waitForTimeout(500);
ok(await shown(p), "visiteur : #copil ouvre le copil");
ok(!p.errs.length, "visiteur : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

// téléphone : un compte sans service, depuis Profil
p = await session({ width: 390, height: 844 }, "nouveau");
await p.click('#v-periode .nb [data-act="profil"]'); await p.waitForTimeout(400);
const row = p.locator('.view.pushed [data-act="copil"]');
ok((await row.count()) === 1 && !(await p.locator('.view.pushed [data-act="team"]').count()), "sans service : « Écran copil PGE » dans Profil, pas « Équipe »");
await row.click(); await p.waitForTimeout(400);
ok(await shown(p), "téléphone : le copil s'ouvre depuis Profil");
await p.locator('#copil .cp-row:has-text("CP JPO")').first().click(); await p.waitForTimeout(500);
const back = p.locator(".view.pushed").last().locator('[data-kui="back"]');
ok((await p.locator(".view.pushed").last().innerText()).includes("CP JPO") && /Copil/.test(await back.innerText()), "téléphone : la fiche s'ouvre avec « ‹ Copil »");
await p.screenshot({ path: `${OUT}/ct3-fiche-telephone.png` });
await back.click(); await p.waitForTimeout(450);
ok(await shown(p) && !(await p.locator(".view.pushed").count()), "téléphone : retour au copil");
ok(!p.errs.length, "sans service : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

await b.close();
console.log(fails ? `${fails} échec(s)` : "Copil pour tous : tout est bon");
process.exit(fails ? 1 : 0);
