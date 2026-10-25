// Parcours complets sur le faux client : base vierge, ajouts, droits par rôle, échecs, temps réel, réunion.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? "OK  " : "FAIL"} ${msg}`); if (!c) fails++; };

async function session(vp = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|row-level security/.test(m.text())) p.errs.push(m.text()); });
  return p;
}
const fake = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
async function login(p, who) {
  await p.goto(URL0);
  await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden);
  await p.waitForTimeout(400);
}
async function logout(p) {
  await p.click('.tab[data-kui-tab="periode"]'); await p.waitForTimeout(250);
  await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
  await p.click('[data-act="logout"]'); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForSelector("#login");
}
const tab = async (p, t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
const snack = (p) => p.textContent(".snack");
const topv = (p) => p.locator(".view.pushed").last();
async function add(p, { kind = "action", t, svc, m = [], cc = [], per, np, tf, link }) {
  await tab(p, "ajouter");
  await p.click(`#f-kind button[value="${kind}"]`); await p.waitForTimeout(150);
  await p.fill("#f-t", t);
  if (np) await p.fill("#f-np", np);
  if (svc) await p.click(`#f-svc .chip[value="${svc}"]`);
  if (per != null) { await p.click(`#f-per .chip[value="${per}"]`); }
  for (const x of m) await p.click(`#f-m .chip:has-text("${x}")`);
  for (const x of cc) await p.click(`#f-cc .chip[value="${x}"]`);
  if (tf || link) {
    if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary");
    if (tf) await p.evaluate((m) => { const s = document.querySelector("#f-tf"); s.value = [...s.options].find((o) => o.textContent.includes(m)).value; }, tf);
    if (link) await p.fill("#f-link", link);
  }
  await p.click('[data-act="publish"]'); await p.waitForTimeout(500);
}

// ---------------------------------------------------------------- Julien, téléphone
let p = await session();
await p.goto(URL0); await p.evaluate(() => localStorage.clear()); 
await login(p, "julien");
ok(await p.isVisible("text=Rien sur cette période."), "base vierge : Ma période vide");
await add(p, { kind: "partner", t: "Article consortium", np: "Major Prépa", m: ["Filières"] });
ok((await snack(p)).includes("C'est publié"), "partenariat publié avec un nouveau partenaire");
let db = await fake(p);
ok(db.partners.length === 1 && db.partners[0].nom === "Major Prépa", "partenaire créé en base");
ok(db.items[0]?.partner === db.partners[0].k && db.items[0].svc === "chef", "partenariat rattaché au partenaire");
await p.click(".view.pushed [data-kui='back']").catch(() => {}); await p.waitForTimeout(300);
await add(p, { kind: "partner", t: "Habillage du site", m: ["Réputation"] });
db = await fake(p);
ok(db.partners.length === 1 && db.items.length === 2, "deuxième partenariat : partenaire existant réutilisé");
await add(p, { kind: "tf", t: "Journées portes ouvertes", cc: ["rs", "video"] });
await add(p, { kind: "sujet", t: "Salle Bloomberg", per: 1 });
await add(p, { kind: "action", t: "CP rentrée", svc: "rp", m: ["International"], cc: ["rs"], tf: "Journées", link: "https://kedgebs.sharepoint.com/sites/com/dossier" });
db = await fake(p);
const jpo = db.items.find((i) => i.t === "Journées portes ouvertes"), cp = db.items.find((i) => i.t === "CP rentrée"), suj = db.items.find((i) => i.t === "Salle Bloomberg");
ok(jpo && jpo.kind === "tf" && jpo.cc.join() === "rs,video", "temps fort enregistré avec les services prévenus");
ok(suj && suj.per.join() === "1,2" && suj.kind === "tf", "sujet enregistré sur les périodes 1 et 2");
ok(cp && cp.tf === jpo.id && cp.m.join() === "3" && cp.svc === "rp", "action liée au temps fort, message International");
ok(db.links.length === 1 && db.links[0].item === cp.id, "lien d'une action liée gardé sur l'action (le temps fort le montre aussi)");
ok(await topv(p).locator("text=SharePoint").first().isVisible(), "fiche : le lien s'affiche");
await p.screenshot({ path: `${OUT}/f1-fiche.png` });
// lien invalide
await tab(p, "ajouter"); await p.fill("#f-t", "Lien cassé"); await p.click('#f-m .chip:has-text("Alumni")'); if (!(await p.$eval("#f-more", (d) => d.open))) await p.click("#f-more summary"); await p.fill("#f-link", "kedgebs.sharepoint"); await p.click('[data-act="publish"]'); await p.waitForTimeout(300);
ok(await p.isVisible("#f-link-err"), "lien sans https refusé dans le formulaire");
await p.fill("#f-link", "");
// refus de la base
await p.evaluate(() => { window.__fake.failNext = true; });
await p.click('[data-act="publish"]'); await p.waitForTimeout(600);
ok((await snack(p)).includes("tu n'as pas les droits"), "refus de la base : message clair");
db = await fake(p);
ok(!db.items.some((i) => i.t === "Lien cassé"), "refus de la base : rien d'enregistré");
ok(await p.inputValue("#f-t") === "Lien cassé", "refus de la base : le formulaire garde la saisie");
await p.fill("#f-t", "");
// profil
await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
ok(await p.isDisabled("#pf-push"), "notifications : interrupteur grisé tant que le serveur n'est pas branché");
ok((await p.textContent(".view.pushed")).includes("julien@kedgebs.com"), "profil : e-mail du compte");
await p.click('[data-act="password"]'); await p.waitForTimeout(300); await p.fill("#pw-new", "court"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(200);
ok(await p.isVisible("#pw-err"), "mot de passe trop court refusé");
await p.fill("#pw-new", "motdepasse"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(300);
ok((await p.textContent("#pw-err")).includes("déjà"), "même mot de passe : message");
await p.click('.sheet [data-kui="close"]'); await p.waitForTimeout(300);
await p.click(".view.pushed [data-kui='back']"); await p.waitForTimeout(300);
await tab(p, "media"); await p.screenshot({ path: `${OUT}/f2-media.png` });
await tab(p, "tf"); await p.screenshot({ path: `${OUT}/f3-tf.png` });
ok(p.errs.length === 0, "Julien : aucune erreur JS " + p.errs.join(" | "));
await logout(p);
ok(await p.isVisible("#login"), "déconnexion : retour à l'écran de connexion");

// ---------------------------------------------------------------- Aurélie (RP)
await login(p, "aurelie");
await tab(p, "afaire"); await p.screenshot({ path: `${OUT}/f4-aurelie-afaire.png` });
ok(await p.isVisible("text=Besoin d'éléments ?"), "Aurélie : rappel J-15 sur son action");
await p.click('[data-act="nope"]'); await p.waitForTimeout(400);
db = await fake(p);
ok(db.answers.some((a) => a.key === `${cp.id}-${cp.date}-15` && a.val === "non" && a.user_id.endsWith("3")), "réponse « pas besoin » enregistrée pour elle");
await p.evaluate((id) => { location.hash = ""; }, null);
await p.goto(URL0 + "#item=" + cp.id); await p.waitForTimeout(800);
ok(await topv(p).locator("text=CP rentrée").first().isVisible(), "lien #item= ouvre la fiche");
ok(await topv(p).locator('[data-act="edit"]').isVisible(), "Aurélie peut modifier l'action RP");
await topv(p).locator('[data-act="edit"]').click(); await p.waitForTimeout(300); await p.fill("#e-t", "CP de rentrée"); await p.click('[data-act="save"]'); await p.waitForTimeout(500);
// le titre a changé : l'appli propose de prévenir (voir historique.mjs) ; ici, pas besoin
ok(await p.isVisible(".alert-wrap.show"), "titre modifié : l'appli propose de prévenir");
await p.click(".alert .acts button:first-child"); await p.waitForTimeout(200);
db = await fake(p);
ok(db.items.find((i) => i.id === cp.id).t === "CP de rentrée", "modification enregistrée");
// demande d'éléments au chef de projet sur le temps fort
await p.goto(URL0 + "#item=" + jpo.id); await p.waitForTimeout(800);
ok(!(await topv(p).locator('[data-act="edit"]').count()), "Aurélie ne modifie pas le temps fort des chefs");
const foot = await topv(p).locator(".foot-note").textContent(); console.log("   pied :", foot);
ok(foot.includes("Modifiable par Estelle et Julien") || foot.includes("Modifiable par Julien et Estelle"), "pied de fiche : qui peut modifier");
await topv(p).locator('[data-act="ask"]').first().click(); await p.waitForTimeout(300);
const askTo = await p.textContent("#ask-to"); console.log("   à qui :", askTo);
ok(/Estelle et Julien|Julien et Estelle/.test(askTo), "demande : les chefs nommés");
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
db = await fake(p);
ok(db.reqs.length === 1 && db.reqs[0].dest === "chef" && db.reqs[0].asker.endsWith("3"), "demande envoyée aux chefs");
ok(p.errs.length === 0, "Aurélie : aucune erreur JS " + p.errs.join(" | "));
await logout(p);

// ---------------------------------------------------------------- Stéphane (RS)
await login(p, "stephane");
await tab(p, "afaire");
ok(await p.isVisible("text=Ton service est cité"), "Stéphane : son service est cité");
const nCites = await p.locator('[data-act="vu"]').count();
await p.click('[data-act="vu"] >> nth=0'); await p.waitForTimeout(400);
db = await fake(p);
ok(db.seen.length === 1 && (await p.locator('[data-act="vu"]').count()) === nCites - 1, "« Vu » enregistré");
await tab(p, "ajouter");
ok(!(await p.isVisible('#f-kind button[value="partner"]')), "Stéphane ne voit pas « Partenariat »");
ok((await p.textContent("#v-ajouter")).includes("Julien aussi"), "formulaire : Julien est prévenu de tout");
await logout(p);

// ---------------------------------------------------------------- compte sans service
await login(p, "nouveau");
await tab(p, "ajouter");
ok((await p.textContent("#v-ajouter")).includes("rattaché à aucun service"), "sans service : pas de formulaire, explication");
await tab(p, "tf");
ok(!(await p.isVisible('[data-act="addtf"]')), "sans service : pas de bouton Proposer");
await logout(p);

// ---------------------------------------------------------------- Julien, ordinateur : demandes, réunion, temps réel
await p.setViewportSize({ width: 1440, height: 900 });
await login(p, "julien");
await tab(p, "afaire");
ok(await p.isVisible("text=Demandes reçues"), "Julien : demande d'Aurélie reçue");
await p.click('[data-act="recu"]'); await p.waitForTimeout(400);
db = await fake(p);
ok(db.reqs[0].st === "recue", "« C'est envoyé » enregistré");
await tab(p, "tf"); await p.screenshot({ path: `${OUT}/f5-desk-tf.png` });
// un ajout d'Estelle arrive pendant que Julien regarde
await p.evaluate(() => {
  const d = window.__fake.db;
  d.items.push({ id: crypto.randomUUID(), kind: "tf", t: "Venue de Columbia", date: "2026-12-03", flou: "", per: [], svc: "chef", cc: [], m: [], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: "00000000-0000-0000-0000-000000000002", at: new Date().toISOString() });
  window.__fake.save(); window.__fake.rt();
});
await p.waitForTimeout(900);
ok(await p.isVisible("#v-tf >> text=Venue de Columbia"), "temps réel : l'ajout d'Estelle apparaît");
await p.click('[data-act="meeting"] >> visible=true'); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/f6-reunion.png` });
ok(await p.isVisible("#meeting >> text=Venue de Columbia"), "réunion : contribution d'Estelle listée");
await p.click('#meeting [data-mt="held"]'); await p.waitForTimeout(500);
db = await fake(p);
ok(db.meta[0].v.length > 10, "réunion tenue enregistrée");
await p.click('#meeting .mt-head [data-mt="close"]');
await tab(p, "periode"); await p.click('[data-act="next"]'); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/f7-desk-periode.png` });
await tab(p, "grille"); await p.screenshot({ path: `${OUT}/f8-desk-grille.png` });
// équipe : Julien rattache le compte « Nouveau » aux réseaux sociaux
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
await p.click('[data-act="team"]'); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/f9-equipe.png` });
await topv(p).locator('[data-act="person"]:has-text("Nouveau")').click(); await p.waitForTimeout(300);
ok(await p.isDisabled("#pp-chef") === false, "équipe : droits de chef modifiables pour un autre compte");
await p.click('#pp-svc .chip[value="rs"]'); await p.fill("#pp-fn", "Community manager");
await p.screenshot({ path: `${OUT}/f10-personne.png` });
await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
db = await fake(p);
const nv = db.profiles.find((x) => x.nom === "Nouveau");
ok(nv.svc === "rs" && nv.fonction === "Community manager" && !nv.chef, "équipe : service et fonction enregistrés");
await topv(p).locator('[data-act="person"]:has-text("Julien")').click(); await p.waitForTimeout(300);
ok(await p.isDisabled("#pp-chef"), "équipe : on ne retire pas ses propres droits de chef");
await p.click('.sheet [data-kui="close"]'); await p.waitForTimeout(300);
ok(p.errs.length === 0, "ordinateur : aucune erreur JS " + p.errs.join(" | "));
console.log(fails ? `${fails} échec(s)` : "tout est bon");
await b.close();
process.exit(fails ? 1 : 0);
