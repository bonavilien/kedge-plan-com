// Vérifie le branchement de la V2 sur la base (site/js/remote.js) avec le faux client test/v2/fake-supabase.js.
// Usage : (cd site && python3 -m http.server 8812) puis node test/v2/branchement.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const fake = fs.readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const I = (n) => `b0000000-0000-0000-0000-00000000000${n}`, U = (n) => `a0000000-0000-0000-0000-00000000000${n}`;

async function open(email) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: true, supabaseUrl: "http://faux", supabaseKey: "faux", visiteur: "lecteur@example.com" };` }));
  await p.goto(base);
  await p.waitForSelector("#login form");
  if (email) { await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]"); await p.waitForSelector("#login", { state: "detached" }); }
  return p;
}
const settle = (p) => p.waitForFunction(() => !document.documentElement.classList.contains("saving")).then(() => p.waitForTimeout(80));
const row = (p, t, id) => p.evaluate(([t, id]) => JSON.parse(JSON.stringify(window.__fake.db[t].find((x) => x.id === id) || null)), [t, id]);
const it = (p, id) => p.evaluate((id) => JSON.parse(JSON.stringify(KP.store.get(id) || null)), id);

// ---------- connexion ----------
let p = await open();
ok(await p.locator(".side .nav, #main h1").count() === 0 || (await p.locator("#main").innerText()).trim() === "", "rien ne s'affiche avant la connexion");
await p.fill("#login [name=email]", "pilote@example.com"); await p.fill("#login [name=password]", "faux"); await p.click("#login [type=submit]");
await p.waitForFunction(() => document.querySelector(".login-err").textContent.length > 0);
ok((await p.locator(".login-err").innerText()).includes("Raté"), "mauvais mot de passe : message clair");
await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]"); await p.waitForSelector("#login", { state: "detached" });
ok((await p.locator("#main").innerText()).includes("Julien"), "connecté : l'accueil salue Julien");

// ---------- lecture : la base de la V1 dite dans les mots de la V2 ----------
const jpo = await it(p, I(1));
ok(jpo.kind === "tf" && jpo.m[0] === "recrutement" && jpo.svc === "" && jpo.st === "prevu" && jpo.docs.length === 1, "temps fort : Recrutement, porté par les pilotes, Prévu, son document");
ok((await it(p, I(2))).st === "confirmer" && (await it(p, I(3))).st === "prevu" && (await it(p, I(4))).st === "diffuse", "6 statuts lus en 3 : idée = à confirmer, en production = prévu");
ok((await it(p, I(3))).reunion === true, "« à trancher en réunion » devient « à voir en réunion »");
const ann = await it(p, I(5)); ok(ann.annule && ann.annule.txt === "Plus d'actualité", "fiche retirée : annulée avec son motif");
ok((await it(p, I(6))).flou === true, "date connue au mois");
const suj = await it(p, I(7)); ok(suj.variant === "sujet" && suj.pers.join() === "considerer,preferer" && suj.fin === "2027-03-31", "sujet sur deux périodes");
const cls = await it(p, I(8)); ok(cls.variant === "classement" && cls.rang === "10e" && cls.cible === "Top 7", "classement : rang et objectif");
ok((await it(p, I(9))).variant === "partenariat" && (await it(p, I(9))).partner === "Challenges", "partenariat et son média");
ok((await p.evaluate(() => KP.inbox().map((r) => r.id).join())).includes("c0000000-0000-0000-0000-000000000001"), "la demande faite « aux chefs » arrive chez le pilote");
ok(await p.evaluate(() => KP.store.versionOf("a0000000-0000-0000-0000-000000000002")) === "1.5.0", "version utilisée par Aurélie");
await p.goto(base + "#/plan/preferer"); ok((await p.locator("#main").innerText()).includes("L'alternance"), "le sujet apparaît aussi dans sa 2e période");
await p.goto(base + "#/plan/considerer?fiche=" + I(1)); await p.waitForSelector("#fiche:not([hidden])");
ok((await p.locator("#fiche").innerText()).includes("Recrutement"), "la fiche s'ouvre avec ses infos");
ok(p.errs.length === 0, "aucune erreur à l'écran" + (p.errs.length ? " : " + p.errs[0] : ""));

// ---------- écriture ----------
await p.evaluate((id) => KP.store.update(id, { st: "prevu" }), I(2)); await settle(p);
ok((await row(p, "items", I(2))).st === "planifie", "statut « Prévu » écrit « planifié »");
let calls = await p.evaluate(() => window.__fake.calls.filter((c) => c.t === "items" && c.op === "update").pop());
ok(Object.keys(calls.patch).sort().join() === "annule_motif,st", "seul le champ modifié part vers la base");
await p.evaluate((id) => KP.store.update(id, { note: "Nouvelle note" }), I(3)); await settle(p);
ok((await row(p, "items", I(3))).st === "production" && (await row(p, "items", I(3))).note === "Nouvelle note", "modifier la note ne touche pas au statut « en production »");

const nid = await p.evaluate(() => KP.store.add({ kind: "action", t: "Article JPO", date: KP.addDays(KP.TODAY, 9), svc: "content", m: ["recrutement", "filieres"], tf: "b0000000-0000-0000-0000-000000000001" }).id); await settle(p);
const nr = await row(p, "items", nid);
ok(/^[0-9a-f-]{36}$/.test(nid) && nr && nr.svc === "content" && nr.m.join() === "REC,1" && nr.tf === I(1) && nr.st === "confirmer" && nr.kind === "action", "nouvelle action créée dans la base");
const tfid = await p.evaluate(() => KP.store.add({ kind: "tf", t: "Remise des diplômes", date: KP.addDays(KP.TODAY, 30), fin: KP.addDays(KP.TODAY, 31) }).id); await settle(p);
ok((await row(p, "items", tfid)).svc === "chef" && (await row(p, "items", tfid)).fin !== null, "temps fort sur deux jours, porté par les chefs");
const pid = await p.evaluate(() => { KP.store.addPartner("Le Figaro Étudiant"); return KP.store.add({ kind: "action", variant: "partenariat", partner: "Le Figaro Étudiant", t: "Dossier spécial", date: KP.addDays(KP.TODAY, 15), svc: "rp" }).id; }); await settle(p);
ok((await row(p, "items", pid)).partner === "le-figaro-tudiant" || !!(await row(p, "items", pid)).partner, "partenariat : le nouveau média est créé puis cité");
const fid = await p.evaluate(() => KP.store.add({ kind: "action", t: "Vidéo à dater", date: KP.TODAY.slice(0, 8) + "01", flou: true, svc: "video" }).id); await settle(p);
ok(/^[A-ZÉ]/.test((await row(p, "items", fid)).flou), "date au mois : libellé du mois écrit comme dans la V1");

await p.evaluate((id) => KP.store.setDate(id, KP.addDays(KP.TODAY, 26), false, "Salle indisponible"), I(1)); await settle(p);
const rep = await row(p, "items", I(1));
ok(rep.report_motif === "Salle indisponible" && rep.report_de && rep.report_at, "report : motif et ancienne date écrits");
ok((await row(p, "items", I(3))).date !== undefined && (await it(p, I(3))).date === await p.evaluate(() => KP.addDays(KP.TODAY, 8 + 14)), "les relais suivent le report du temps fort");
ok((await row(p, "items", I(3))).date === (await it(p, I(3))).date, "et leur nouvelle date est dans la base");

const undo = await p.evaluateHandle((id) => KP.store.cancel(id, "Le journaliste ne vient plus"), I(2)); await settle(p);
ok((await row(p, "items", I(2))).st === "retire" && (await row(p, "items", I(2))).annule_motif === "Le journaliste ne vient plus", "annuler : retiré avec motif");
await p.evaluate((id) => KP.store.restore(id), I(2)); await settle(p);
ok((await row(p, "items", I(2))).st === "planifie" && (await row(p, "items", I(2))).annule_motif === "", "rétablir : le statut revient, le motif s'efface");

await p.evaluate((id) => KP.store.update(id, { reunion: true }), I(4)); await settle(p);
ok(await p.evaluate((id) => window.__fake.db.blocks.some((x) => x.item === id && !x.leve && x.why === "à trancher en réunion"), I(4)), "« à voir en réunion » crée le sujet à trancher");
await p.evaluate(() => KP.store.meetingDone()); await settle(p);
ok(await p.evaluate(() => window.__fake.db.blocks.every((x) => x.leve)) && Math.abs(Date.now() - Date.parse(await p.evaluate(() => window.__fake.db.meta[0].v))) < 60000, "réunion terminée : sujets levés, heure notée");

await p.evaluate((id) => { const i = KP.store.get(id); KP.store.update(id, { docs: [...i.docs, { t: "Plan du campus", url: "https://example.sharepoint.com/plan" }] }); }, I(1)); await settle(p);
ok(await p.evaluate(() => window.__fake.db.links.length) === 2 && !!(await it(p, I(1))).docs[1].id, "document ajouté, son identifiant revient de la base");
await p.evaluate((id) => { const i = KP.store.get(id); KP.store.update(id, { docs: i.docs.slice(1) }); }, I(1)); await settle(p);
ok(await p.evaluate(() => window.__fake.db.links.map((l) => l.nom).join()) === "Plan du campus", "document retiré");

const cid = await p.evaluate(() => KP.store.saveContact({ nom: "Claire Morel", role: "Admissions", mail: "claire.morel@example.com", tel: "" }).id); await settle(p);
await p.evaluate(([id, c]) => KP.store.update(id, { contacts: [c] }), [I(1), cid]); await settle(p);
ok(await p.evaluate(() => window.__fake.db.contacts.length === 1 && window.__fake.db.item_contacts.length === 1), "contact créé et posé sur la fiche");
await p.evaluate(() => KP.store.listAdd("lieux", "Campus de Marseille")); await settle(p);
ok(await p.evaluate(() => window.__fake.db.lieux.length) === 2, "lieu ajouté au carnet");

await p.evaluate(([id, a]) => KP.store.ask({ item: id, a, quoi: "Visuels", txt: "Trois photos du campus", pour: KP.addDays(KP.TODAY, 4) }), [I(1), U(2)]); await settle(p);
const rq = await p.evaluate(() => window.__fake.db.reqs[window.__fake.db.reqs.length - 1]);
ok(rq.dest === U(2) && rq.type === "Visuels" && rq.quoi === "Trois photos du campus", "demande à une personne nommée");
await p.evaluate(() => KP.store.answer("c0000000-0000-0000-0000-000000000001", "Voici le programme")); await settle(p);
ok((await row(p, "reqs", "c0000000-0000-0000-0000-000000000001")).st === "recue", "réponse à une demande");

await p.evaluate((id) => KP.store.togglePin(id), I(1)); await settle(p);
ok(JSON.parse(await p.evaluate(() => window.__fake.db.answers.find((a) => a.key === "v2").val)).pins.includes(I(1)), "épingle gardée dans mes préférences");
ok(await p.evaluate(() => window.__fake.db.profiles[0].version) === await p.evaluate(() => KP.VERSION.n), "ma version est notée dans mon profil");
await p.evaluate(() => KP.store.savePerson("a0000000-0000-0000-0000-000000000003", { role: "lecteur" })); await settle(p);
ok(await p.evaluate(() => window.__fake.db.profiles[2].visiteur) === true, "passer quelqu'un en lecture seule");

const dup = await p.evaluate((id) => KP.store.duplicate(id).id, I(1)); await settle(p);
ok(await p.evaluate((id) => window.__fake.db.links.filter((l) => l.item === id).length, dup) === 1, "dupliquer recopie les documents comme de nouveaux liens");
await p.evaluate((id) => KP.store.remove(id), dup); await settle(p);
ok((await row(p, "items", dup)) === null, "supprimer : la fiche est retirée puis supprimée");

// la base refuse : on le dit et on revient à ce qu'elle contient
await p.evaluate((id) => { window.__fake.failNext = "tu n'as pas le droit"; KP.store.update(id, { t: "Titre refusé" }); }, I(4));
await p.waitForFunction(() => document.querySelector("#toasts").textContent.includes("Non enregistré")); await settle(p); await p.waitForTimeout(200);
ok((await it(p, I(4))).t === "Brève accord Séoul", "refus de la base : message, et l'écran revient à la vérité");
ok(p.errs.length === 0, "aucune erreur pendant les écritures" + (p.errs.length ? " : " + p.errs[0] : ""));

// la session tient après rechargement, puis déconnexion
await p.reload(); await p.waitForSelector("#main h1");
ok(await p.locator("#login").count() === 0 && (await it(p, I(1))).t === "Journée portes ouvertes", "rechargement : toujours connecté, les données reviennent de la base");
await p.context().close();

// ---------- un service, puis un lecteur ----------
p = await open("presse@example.com");
ok(await p.evaluate(() => KP.me().role) === "service" && await p.evaluate((id) => KP.store.canEdit(KP.store.get(id)), I(2)) && !(await p.evaluate((id) => KP.store.canEdit(KP.store.get(id)), I(3))), "un service modifie ses fiches, pas celles d'un autre");
const mine = await p.evaluate(() => KP.store.add({ kind: "tf", t: "Petit-déjeuner presse", date: KP.addDays(KP.TODAY, 18) }).id); await settle(p);
ok((await row(p, "items", mine)).svc === "rp", "un temps fort créé par un service est porté par ce service");
ok(await p.locator("[data-user]").count() === 0, "plus de bascule de démonstration");
await p.context().close();
p = await open("lecteur@example.com");
ok(await p.evaluate(() => KP.me().role) === "lecteur" && !(await p.evaluate(() => KP.store.canCreate())), "le visiteur lit tout, ne crée rien");
await p.context().close();

// ---------- sans branchement : la démonstration ----------
const ctx = await b.newContext({ serviceWorkers: "block" }); p = await ctx.newPage();
await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = { brancher: false, supabaseUrl: "http://faux", supabaseKey: "faux" };` }));
await p.goto(base); await p.waitForSelector("#main h1");
ok(await p.locator("#login").count() === 0 && !(await p.evaluate(() => KP.store.remote())), "config « brancher: false » : démonstration, aucune connexion à la base");
await b.close();
console.log(bad ? `${bad} échec(s)` : "Branchement : tout est bon"); process.exit(bad ? 1 : 0);
