// L'appli vue par chaque responsable de service (RP, RS, Vidéo), les chefs, un compte sans service et le visiteur,
// avec les corrections de la migration 0007 : demandes d'une action retirée, « Demandes de ton service », visiteur et droit média.
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
const tab = async (t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
const topv = () => p.locator(".view.pushed").last();
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
async function logout() {
  await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
  await p.click('[data-act="logout"]'); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForSelector("#login");
}
const open = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(500); };
// sections d'À faire : { "Demandes reçues": [titres…], … }
async function afaire() {
  await tab("afaire");
  return p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#v-afaire .todo-sec")].map((s) => [
    s.querySelector(".sec-h").textContent.split(" · ")[0],
    [...s.querySelectorAll(".todo-act b, .rq-open b")].map((x) => x.textContent)])));
}

// ---------- données de départ ----------
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const I = (n) => `10000000-0000-0000-0000-00000000000${n}`;
const now = new Date().toISOString();
await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
await p.evaluate(({ U7, U8, items, reqs }) => { const d = window.__fake.db;
  d.users.push({ id: U7, email: "hugo@kedgebs.com", password: "motdepasse" }, { id: U8, email: "visiteur@kedgebs.com", password: "motdepasse" });
  d.profiles.push({ id: U7, nom: "Hugo", fonction: "", svc: "rp", chef: false, media: false, notif_all: false },
    { id: U8, nom: "Visiteur", fonction: "", svc: null, chef: false, media: false, notif_all: false, visiteur: true });
  d.items.push(...items); d.reqs.push(...reqs); window.__fake.save(); }, {
  U7: U(7), U8: U(8),
  items: [
    { id: I(1), kind: "tf", t: "Salon Studyrama", date: iso(40), flou: "", per: [], svc: "chef", cc: [], m: [], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(1), at: now },
    { id: I(2), kind: "action", t: "CP Studyrama", date: iso(30), flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: I(1), partner: null, lieu: "", note: "", author: U(3), at: now },
    { id: I(3), kind: "action", t: "Post Insta Studyrama", date: iso(14), flou: "", per: [], svc: "rs", cc: ["rp"], m: ["1"], st: "planifie", tf: I(1), partner: null, lieu: "", note: "", author: U(4), at: now },
    { id: I(4), kind: "action", t: "Film campus", date: iso(7), flou: "", per: [], svc: "video", cc: [], m: ["3"], st: "production", tf: null, partner: null, lieu: "", note: "", author: U(5), at: now },
    { id: I(5), kind: "action", t: "Live annulé", date: iso(20), flou: "", per: [], svc: "rs", cc: [], m: ["2"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(4), at: now },
    { id: I(6), kind: "action", t: "Tournée lycées", date: iso(10), flou: "", per: [], svc: "chef", cc: [], m: ["4"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(2), at: now },
  ],
  reqs: [
    { id: "r1", item: I(2), asker: U(3), dest: "rs", type: "Visuels", quoi: "", pour: iso(20), st: "ouverte", at: now },
    { id: "r2", item: I(5), asker: U(4), dest: "video", type: "Rushs", quoi: "", pour: iso(12), st: "ouverte", at: now },
    { id: "r3", item: I(4), asker: U(5), dest: "chef", type: "Programme", quoi: "", pour: iso(5), st: "ouverte", at: now },
    { id: "r4", item: I(4), asker: U(5), dest: "rp", type: "Contact", quoi: "", pour: iso(5), st: "annulee", at: now },
  ] });

// ---------- RP : Aurélie ----------
console.log("----- Aurélie (RP) -----");
await login("aurelie");
let T = await afaire();
ok(!T["Demandes reçues"], "RP : la demande retirée par Louise n'apparaît plus");
ok(!T["Besoin d'éléments ?"], "RP : pas de rappel J-30 sur « CP Studyrama », elle a déjà demandé");
ok((T["Ton service est cité"] || []).includes("Post Insta Studyrama"), "RP : « Ton service est cité » pour le post RS");
ok((T["Tes demandes en attente"] || []).includes("CP Studyrama"), "RP : « Tes demandes en attente » pour sa propre demande");
await open(I(2)); ok((await topv().locator('[data-act="edit"]').count()) === 1, "RP : modifie sa propre action");
await open(I(3)); ok((await topv().locator('[data-act="edit"]').count()) === 0, "RP : ne modifie pas l'action RS");
await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
const to = await p.locator("#ask-to .chip").allInnerTexts();
ok(!to.some((x) => x.trim() === "RP"), `RP : ne se demande pas à elle-même (choix : ${to.map((x) => x.trim()).join(", ")})`);
await p.click('.sheet [data-kui="cancel"]').catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300);
await logout();

// ---------- RP : Hugo (collègue) ----------
console.log("----- Hugo (RP) -----");
await login("hugo");
T = await afaire();
ok(!T["Besoin d'éléments ?"], "Hugo : pas de rappel, sa collègue a déjà demandé");
ok((T["Demandes de ton service en attente"] || []).includes("CP Studyrama"), "Hugo voit la demande de sa collègue en attente");
const hugoX = await p.locator('#v-afaire [data-act="unreq"]').count();
ok(hugoX === 0, "Hugo n'a pas « Retirer » sur la demande d'Aurélie");
const hugoSec = await p.textContent('#v-afaire .todo-sec:has(.rq-open)');
ok(hugoSec.includes("Demandes de ton service en attente") && hugoSec.includes("par Aurélie"), "Hugo : « Demandes de ton service en attente », avec le prénom d'Aurélie");
await logout();

// ---------- RS : Stéphane ----------
console.log("----- Stéphane (RS) -----");
await login("stephane");
T = await afaire();
ok((T["Demandes reçues"] || []).includes("CP Studyrama"), "RS : reçoit la demande de visuels d'Aurélie");
ok((T["Besoin d'éléments ?"] || []).includes("Post Insta Studyrama"), "RS : rappel J-15 pour son post");
ok((T["Tes demandes en attente"] || []).includes("Live annulé"), "RS : sa demande de rushs pour le live est en attente");
// Stéphane retire le live : sa demande part avec lui
await open(I(5)); await topv().locator('[data-act="retire"]').click(); await p.waitForTimeout(300);
ok((await p.textContent(".alert-wrap.show .alert")).includes("Sa demande d'éléments en cours est retirée."), "RS : la confirmation dit que la demande sera retirée");
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
ok((await p.evaluate(() => window.__fake.db.reqs.find((q) => q.id === "r2").st)) === "annulee", "RS : la demande du live retiré est retirée");
T = await afaire();
ok(!(T["Tes demandes en attente"] || []).includes("Live annulé"), "RS : plus de demande en attente pour le live retiré");
await p.locator('#v-afaire .todo:has-text("CP Studyrama") [data-act="repondre"]').click(); await p.waitForTimeout(350);
await p.fill("#rp-msg", "Visuels dans le dossier"); await p.fill("#rp-url", "https://kedgebs.sharepoint.com/v"); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(700);
T = await afaire();
ok(!T["Demandes reçues"], "RS : la demande répondue sort d'À faire");
await logout();

// ---------- Vidéo : Louise ----------
console.log("----- Louise (Vidéo) -----");
await login("louise");
T = await afaire();
ok(!(T["Demandes reçues"] || []).includes("Live annulé"), "Vidéo : pas de demande à traiter pour une action retirée (« Live annulé »)");
ok(!T["Besoin d'éléments ?"], "Vidéo : pas de rappel J-7 sur « Film campus », elle a déjà demandé aux chefs");
ok((T["Tes demandes en attente"] || []).includes("Film campus"), "Vidéo : sa demande aux chefs est en attente");
await logout();

// ---------- Chefs ----------
for (const who of ["julien", "estelle"]) {
  console.log(`----- ${who} (chef) -----`);
  await login(who);
  T = await afaire();
  ok((T["Demandes reçues"] || []).includes("Film campus"), `${who} : reçoit la demande adressée aux chefs`);
  ok((T["Besoin d'éléments ?"] || []).includes("Tournée lycées"), `${who} : rappel pour l'action du chef de projet`);
  ok(!(T["Demandes reçues"] || []).includes("Live annulé"), `${who} : ne voit pas les demandes adressées à Vidéo`);
  await open(I(3)); ok((await topv().locator('[data-act="edit"]').count()) === 1, `${who} : modifie l'action RS`);
  if (who === "estelle") {
    // Estelle n'a pas le droit média : elle ne peut pas passer Julien en visiteur (il perdrait ce droit)
    await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
    await p.click('[data-act="team"]'); await p.waitForTimeout(300); await p.click(`[data-act="person"][data-id="${U(1)}"]`); await p.waitForTimeout(300);
    ok(await p.isDisabled("#pp-visit"), "Estelle : l'interrupteur Visiteur est grisé pour Julien (compte média)");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.goto(URL0); await p.waitForTimeout(600);
  }
  await logout();
}

// ---------- Aurélie revient : la réponse ----------
await login("aurelie");
await open(I(2));
const rq = (await topv().locator(".rq").allInnerTexts()).join(" | ");
ok(rq.includes("Reçu") && rq.includes("Visuels dans le dossier"), "Aurélie voit la réponse de Stéphane sur sa fiche");
T = await afaire();
ok(!T["Tes demandes en attente"], "Aurélie : plus rien en attente");
await logout();

// ---------- Louise retire sa demande : le rappel revient ----------
await login("louise");
await open(I(4));
await topv().locator('.rq:has-text("Programme") [data-act="unreq"]').click(); await p.waitForTimeout(300);
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
T = await afaire();
ok((T["Besoin d'éléments ?"] || []).includes("Film campus"), "Vidéo : après le retrait de sa demande, le rappel J-7 revient");
await logout();

// ---------- sans service, visiteur ----------
await login("nouveau");
await open(I(4));
ok((await topv().locator('[data-act="ask"]').count()) === 1 && (await topv().locator('[data-act="edit"]').count()) === 0, "sans service : demande, ne modifie pas");
await tab("ajouter");
ok((await p.textContent("#v-ajouter")).includes("rattaché à aucun service"), "sans service : l'onglet Ajouter explique pourquoi il ne publie pas");
await logout();
await login("visiteur");
T = await afaire();
ok(!Object.keys(T).length, "visiteur : À faire vide");
await open(I(4));
ok((await topv().locator('[data-act="ask"], [data-act="block"], [data-act="addlink"], [data-act="edit"], [data-act="unreq"], [data-act="repondre"]').count()) === 0, "visiteur : aucun bouton d'écriture sur une fiche");
await open(I(1));
ok((await topv().locator('[data-act="addlinked"]').count()) === 0, "visiteur : pas « Ajouter une action liée »");
await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
ok((await p.locator('[data-act="password"], #pf-push').count()) === 0, "visiteur : pas de mot de passe ni de notifications dans Profil");

ok(!errs.length, "aucune erreur dans la page" + (errs.length ? " : " + errs.join(" | ") : ""));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Services : tout est bon");
process.exit(fails ? 1 : 0);
