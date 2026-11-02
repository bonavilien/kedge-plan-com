// Écran copil PGE ouvert à tous les comptes : un service, un compte sans service, un visiteur ; il ne fait que montrer.
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
await p.locator(`#copil [data-cp-open="${TF}"]`).first().click(); await p.waitForTimeout(500);
const fiche = p.locator(".view.pushed").last();
ok((await fiche.innerText()).includes("Journées portes ouvertes") && !(await fiche.locator('[data-act="edit"]').count()), "le temps fort des chefs s'ouvre sans « Modifier » pour Aurélie");
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
ok(!p.errs.length, "sans service : aucune erreur" + (p.errs.length ? " : " + p.errs.join(" | ") : ""));

await b.close();
console.log(fails ? `${fails} échec(s)` : "Copil pour tous : tout est bon");
process.exit(fails ? 1 : 0);
