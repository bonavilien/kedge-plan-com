// Corrections du 26 octobre : demandes à la Resp. offre, Estelle comme Julien sur la Direction du Programme,
// rang « 10e », brouillon après un Publier refusé, Prévenir les chefs, suppression d'un relais, notification d'une fiche supprimée.
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
const tab = async (t) => { await p.click(`.tab[data-kui-tab="${t}"]`); await p.waitForTimeout(250); };
const topv = () => p.locator(".view.pushed").last();
async function login(who) {
  await p.goto(URL0); await p.waitForSelector("#login");
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
}
async function logout() {
  await p.goto(URL0); await p.waitForTimeout(500);
  await tab("periode"); await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300);
  await p.click('[data-act="logout"]'); await p.waitForTimeout(200);
  await p.click(".alert .acts button:last-child"); await p.waitForSelector("#login");
}
const open = async (id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(500); };
const snack = async () => (await p.locator(".snack").last().textContent().catch(() => "")) || "";
const I = (n) => `26000000-0000-0000-0000-00000000000${n}`;
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const item = (o) => ({ kind: "action", flou: "", fin: null, per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(3), at: new Date().toISOString(), ...o });

await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector("#login");
await p.evaluate((rows) => { window.__fake.db.items.push(...rows); window.__fake.save(); }, [
  item({ id: I(1), t: "Webinar PGE", date: iso(20) }),
  item({ id: I(2), kind: "tf", t: "Salon de l'étudiant", date: iso(30), svc: "chef", m: [], author: U(1) }),
  item({ id: I(3), t: "Relais RP du salon", date: iso(28), tf: I(2), st: "retire" }),
  item({ id: I(4), kind: "classement", t: "Classement Financial Times", date: iso(25), svc: "chef", m: [], rang: 10, cible: 7, author: U(1) }),
]);
await p.evaluate(({ I3 }) => { window.__fake.db.reqs.push({ id: "26100000-0000-0000-0000-000000000001", item: I3, asker: "00000000-0000-0000-0000-000000000003", dest: "video", type: "Rushs", quoi: "", pour: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), st: "ouverte", at: new Date().toISOString() }); window.__fake.save(); }, { I3: I(3) });

// ---------- Resp. offre ----------
await login("aurelie");
await open(I(1)); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
ok(await p.locator('#ask-to .chip:has-text("Resp. offre")').count() === 1, "RP : « Resp. offre » dans « À qui ? »");
await p.click('#ask-to .chip:has-text("Resp. offre")'); await p.click('#ask-type .chip:has-text("Contexte")');
await p.click('.sheet.show [data-kui="ok"]');
await p.waitForTimeout(500);
ok(/Demande envoyée à Estelle/.test(await snack()), "la demande part chez Estelle (« Demande envoyée à Estelle »)");
let db = await fake();
const rq = db.reqs.find((q) => q.dest === "offre");
ok(rq && db.outbox.some((o) => o.user_id === U(2) && o.dedupe === `req:${rq.id}:${U(2)}`) && !db.outbox.some((o) => o.dedupe?.startsWith(`req:${rq.id}`) && o.user_id !== U(2)), "seule Estelle est notifiée");
await logout();
await login("estelle"); await tab("afaire");
const af = await p.textContent("#v-afaire");
ok(af.includes("Webinar PGE") && /du contexte/.test(af), "Estelle a la demande dans À faire");
await p.screenshot({ path: `${OUT}/c26-offre-afaire.png` });
await p.locator('#v-afaire [data-act="repondre"]').first().click(); await p.waitForTimeout(300);
await p.fill("#rp-msg", "Le contexte est prêt"); await p.click('.sheet.show [data-kui="ok"]'); await p.waitForTimeout(500);
db = await fake();
ok(db.reqs.find((q) => q.id === rq.id)?.st === "recue", "Estelle répond : la demande est reçue");
// Équipe : l'interrupteur « Resp. offre »
await p.click('[data-act="profil"] >> visible=true'); await p.waitForTimeout(300); await p.click('[data-act="team"]'); await p.waitForTimeout(300);
ok((await topv().textContent()).includes("Resp. offre"), "Équipe : Estelle est marquée « Resp. offre »");
await logout();

// ---------- Direction du Programme : Estelle a les mêmes droits que Julien ----------
await login("julien");
await open(I(1)); await topv().locator('[data-act="ask"]').click(); await p.waitForTimeout(350);
await p.click('#ask-to .chip:has-text("Direction du Programme")'); await p.click('.sheet.show [data-kui="ok"]'); await p.waitForTimeout(500);
await logout();
await login("estelle"); await tab("afaire");
ok(await p.locator('#v-afaire [data-act="repondre"]:has-text("C\'est reçu")').count() >= 1, "Estelle peut marquer reçue la demande à la Direction du Programme notée par Julien");
// sa deadline : pas de « Notification envoyée à la Direction du Programme »
await open(I(1));
await topv().locator('.rq:has-text("Direction du Programme") [data-act="pour"]').click(); await p.waitForTimeout(300);
await p.click("#pour-d"); await p.waitForTimeout(150);
await p.locator("#pour-d-cal .cal-d:not([disabled])").nth(3).click(); await p.waitForTimeout(150);
await p.click('.sheet.show [data-kui="ok"]'); await p.waitForTimeout(500);
const sn = await snack();
ok(/^Deadline/.test(sn) && !/Direction du Programme/.test(sn) && /Julien/.test(sn), `nouvelle deadline : seul Julien est annoncé (« ${sn.trim()} »)`);
await logout();

// ---------- classement : rang « 10e », Prévenir propose Estelle ----------
await login("julien");
await open(I(4)); await topv().locator('[data-act="edit"]').click(); await p.waitForTimeout(400);
await topv().locator("#e-rang").fill("8e");
await topv().locator('[data-act="save"]').click(); await p.waitForTimeout(700);
db = await fake();
ok(db.items.find((x) => x.id === I(4)).rang === 8, "un rang tapé « 8e » est enregistré 8");
const alertTxt = await p.locator(".alert-wrap.show .alert").textContent().catch(() => "");
ok(/Prévenir du changement/.test(alertTxt) && /Estelle/.test(alertTxt), "Prévenir du changement ? propose Estelle");
if (alertTxt) { await p.click(".alert .acts button:last-child"); await p.waitForTimeout(500); }
db = await fake();
ok(db.outbox.some((o) => o.user_id === U(2) && /Modifié/.test(o.title)), "Estelle est prévenue du nouveau rang");
// création : « C'est publié. Notification envoyée à Estelle »
await p.goto(URL0); await p.waitForTimeout(500); await tab("ajouter");
await p.click('#f-kind button[value="classement"]'); await p.waitForTimeout(200);
await p.fill("#f-t", "  classements   Le Point "); await p.fill("#f-rang", "12e");
await p.click('[data-act="publish"]'); await p.waitForTimeout(700);
ok(/Notification envoyée à Estelle/.test(await snack()), "un classement publié annonce la notification à Estelle");
db = await fake();
ok(db.items.some((x) => x.t === "Classement Le Point" && x.rang === 12), "« classements   Le Point » devient « Classement Le Point », rang 12");

// ---------- brouillon gardé après un Publier refusé ----------
await tab("ajouter"); await p.click('#f-kind button[value="action"]'); await p.waitForTimeout(200);
await p.fill("#f-t", ""); await p.click('[data-act="publish"]'); await p.waitForTimeout(300);
await p.fill("#f-t", "Titre corrigé"); await tab("grille"); await tab("ajouter");
ok((await p.inputValue("#f-t")) === "Titre corrigé", "le titre corrigé après un refus reste dans le brouillon");
// un bouton « Ajouter un temps fort » ne l'efface pas
await tab("tf"); await p.click('[data-act="addtf"] >> visible=true'); await p.waitForTimeout(300);
ok((await p.inputValue("#f-t")) === "Titre corrigé", "« Ajouter » des Temps forts garde le brouillon commencé");
await logout();

// ---------- supprimer un relais retiré : sa demande reste sur le temps fort ----------
await login("aurelie");
await open(I(3)); await topv().locator('[data-act="delete"]').click(); await p.waitForTimeout(300);
const conf = await p.locator(".alert-wrap.show .alert").textContent();
ok(/demande d'éléments reste sur le temps fort/.test(conf), "la confirmation dit que la demande reste sur le temps fort");
await p.click(".alert .acts button:last-child"); await p.waitForTimeout(600);
db = await fake();
ok(db.reqs.find((q) => q.id === "26100000-0000-0000-0000-000000000001")?.item === I(2), "la demande ouverte passe sur le temps fort");
// la notification d'une fiche supprimée le dit
await open(I(3)); await p.waitForTimeout(800);
ok(/supprimée/.test(await snack()), "ouvrir une notification d'une fiche supprimée le dit");
await logout();

ok(!errs.length, `pas d'erreur JS ${errs.join(" | ")}`);
await b.close();
console.log(fails ? `${fails} échec(s)` : "Corrections du 26 octobre : tout est bon");
process.exit(fails ? 1 : 0);
