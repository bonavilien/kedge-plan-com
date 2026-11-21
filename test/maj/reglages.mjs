// Réglages d'une copie : périodes et messages modifiables, nom sans logo, et le bouton « Mettre à jour » (fonction simulée).
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/reglages.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const VER = JSON.parse(fs.readFileSync(new URL("../../site/version.json", import.meta.url), "utf8")).version;
const NEXT = "9.9.0";

async function open(cfg, email = "pilote@example.com", fn = null, theme = "light") {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", deviceScaleFactor: shots ? 2 : 1, colorScheme: theme });
  const p = await ctx.newPage(); p.errs = []; p.fnCalls = []; p.online = VER;
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux", ...cfg })};` }));
  await p.route("**/version.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: p.online }) }));
  if (fn) await p.route("**/functions/v1/mise-a-jour", async (r) => { const a = JSON.parse(r.request().postData() || "{}").action; p.fnCalls.push(a); const [status, body] = await fn(a, p); await r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); });
  await p.goto(base);
  await p.waitForSelector("#login form");
  await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
  await p.waitForSelector("#login", { state: "detached" });
  return p;
}
const settle = (p) => p.waitForFunction(() => !document.documentElement.classList.contains("saving")).then(() => p.waitForTimeout(100));
const fdb = (p, t) => p.evaluate((t) => JSON.parse(JSON.stringify(window.__fake.db[t])), t);
const shot = async (p, name, sel = "#main") => { if (shots) await p.locator(sel).screenshot({ path: `${shots}/${name}.png` }); };

// ---------- périodes et messages, depuis la base ----------
let p = await open({ copie: false, marque: { nom: "Ville de Test", logo: "" } });
ok(await p.evaluate(() => KP.PERIODS.map((x) => x.k).join()) === "installer,considerer,preferer,convertir,decider", "les périodes viennent de la base, mêmes clés qu'avant (adresses inchangées)");
ok(await p.evaluate(() => KP.PERIODS[4].lib) === "juin – mi-juil.", "libellé court tiré des dates");
ok((await p.locator(".brand").innerText()).includes("Ville de Test") && await p.locator(".brand img").count() === 0, "sans logo : le nom de la copie s'affiche dans le menu");
await p.evaluate(() => KP.go({ screen: "reglages", set: "projet" }));
await p.waitForSelector(".t-per");
ok(await p.locator(".t-per .tr").count() === 5, "Réglages > Périodes : les 5 périodes");
await shot(p, "reglages-periodes");
await p.fill("#pe-installer-nom", "Rentrée"); await p.locator("#pe-installer-nom").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "periods")).find((x) => x.n === 1).nom === "Rentrée", "renommer une période : enregistré dans la base");
ok(await p.evaluate(() => KP.PERIODS[0].k) === "installer", "renommer garde l'adresse de la période pendant la session");
await p.fill("#pe-considerer-du", "2026-10-15"); await p.waitForTimeout(150);
ok((await p.locator("#toasts").innerText()).includes("Chevauche"), "dates qui chevauchent : refusées avec le nom de la période");
ok((await fdb(p, "periods")).find((x) => x.n === 2).du === "2026-11-01", "rien n'est parti vers la base");
await p.click('[data-act="set-add"][data-k="periods"]'); await settle(p);
const added = (await fdb(p, "periods")).find((x) => x.n === 6);
ok(!!added && added.du === "2027-07-16" && added.au === "2027-08-31", "ajouter une période : la suite de la dernière, enregistrée");
await p.locator(`[data-act="set-rm"][data-k="periods"][data-id="periode"]`).click(); await settle(p);
ok(!(await fdb(p, "periods")).some((x) => x.n === 6), "retirer une période vide : effacée de la base");
await p.evaluate(() => KP.go({ set: "projet" })); await p.waitForSelector(".t-msg");
ok(await p.locator(".t-msg .tr").count() === 6, "Réglages > Messages : les 5 messages et l'étiquette hors messages");
await p.fill("#me-alumni-nom", "Diplômés"); await p.locator("#me-alumni-nom").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "messages")).find((x) => x.n === 2).nom === "Diplômés", "renommer un message : enregistré dans la base");
ok(await p.evaluate(() => KP.message("alumni").nom) === "Diplômés", "le nouveau nom s'affiche partout");
await p.click('[data-act="set-add"][data-k="messages"]'); await settle(p);
ok((await fdb(p, "messages")).some((x) => x.n === 6) && await p.evaluate(() => KP.CLES.length) === 6, "ajouter un 6e message : enregistré, compté dans les messages clés");
await p.fill("#me-m6-nom", "Innovation"); await p.locator("#me-m6-nom").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "messages")).find((x) => x.n === 6).nom === "Innovation", "le nouveau message se renomme");
ok(await p.evaluate(() => { const it = KP.store.items().find((i) => i.kind === "action"); KP.store.update(it.id, { m: ["m6"] }); return it.id; }).then(async (id) => { await settle(p); return (await fdb(p, "items")).find((x) => x.id === id).m.join() === "6"; }), "une fiche peut citer le 6e message (code 6 dans la base)");
await p.locator('[data-act="set-rm"][data-k="messages"][data-id="m6"]').click(); await p.waitForTimeout(150);
ok((await p.locator("#toasts").innerText()).includes("cite") && (await fdb(p, "messages")).some((x) => x.n === 6), "un message cité par une fiche ne se retire pas");
await p.evaluate(() => { KP.store.items().filter((i) => i.m.includes("m6")).forEach((i) => KP.store.update(i.id, { m: [] })); }); await settle(p);
await p.locator('[data-act="set-rm"][data-k="messages"][data-id="m6"]').click(); await settle(p);
ok(!(await fdb(p, "messages")).some((x) => x.n === 6) && await p.evaluate(() => KP.CLES.length) === 5, "retiré une fois libre");
await p.fill("#me-recrutement-nom", "Événements"); await p.locator("#me-recrutement-nom").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "messages")).find((x) => x.n === 0).nom === "Événements" && await p.evaluate(() => KP.message("recrutement").nom) === "Événements", "l'étiquette hors messages se renomme");
await shot(p, "reglages-messages");
// sous-titre et couleur du projet
ok(await p.locator('.bar [data-act="set-tab"]').count() === 5, "Réglages en 5 onglets");
await p.evaluate(() => { location.hash = "#/reglages/periodes"; }); await p.waitForTimeout(150);
ok(await p.evaluate(() => KP.route.set) === "projet", "les anciennes adresses d'onglets mènent au bon onglet");
await p.fill("#pj-st", "Executive Education"); await p.locator("#pj-st").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "meta")).find((x) => x.k === "sous_titre")?.v === "Executive Education", "sous-titre enregistré dans la base");
ok((await p.locator(".brand").innerText()).includes("Executive Education"), "sous-titre sous le nom de l'appli");
ok(await p.locator(".sw").count() === 18, "18 couleurs proposées : 4 corporate et 14 programmes, expertises, campus");
await p.click('[data-act="set-couleur"][data-k="turquoise"]'); await settle(p);
ok((await fdb(p, "meta")).find((x) => x.k === "couleur")?.v === "turquoise", "couleur enregistrée dans la base");
ok(await p.evaluate(() => getComputedStyle(document.querySelector(".new")).backgroundColor) === "rgb(69, 186, 189)", "le bouton Nouveau prend la couleur du projet");
ok(await p.evaluate(() => JSON.parse(localStorage.getItem("kplan-projet")).couleur) === "turquoise", "retenue pour l'écran de connexion");
await shot(p, "reglages-projet");
await p.evaluate(() => KP.go({ screen: "plan" })); await p.waitForTimeout(250); await shot(p, "plan-turquoise", "body");
await p.click('[data-act="set-couleur"][data-k="rubis"]').catch(async () => { await p.evaluate(() => KP.store.saveProjet({ couleur: "rubis" })); }); await settle(p);
ok(await p.evaluate(() => getComputedStyle(document.querySelector(".new")).color) === "rgb(255, 255, 255)", "couleur foncée (Rubis) : texte blanc dessus");
await p.evaluate(() => KP.store.saveProjet({ couleur: "bleu-caraibes" })); await settle(p);
ok(await p.evaluate(() => getComputedStyle(document.querySelector(".side")).backgroundColor) === "rgb(29, 37, 87)", "corporate Bleu Caraïbes : le menu prend son foncé");
await shot(p, "plan-bleu-caraibes", "body");
await p.evaluate(() => KP.store.saveProjet({ couleur: "jaune-or", sousTitre: "Programme Grande École" })); await settle(p);
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForSelector(".set .vbig");
ok(await p.locator(".maj").count() === 0, "dépôt d'origine (pas une copie) : pas de bouton de mise à jour");
ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
await p.context().close();

// ---------- mise à jour en un clic ----------
const etat = (o = {}) => ({ fonction: 1, fonctionAmont: 1, copie: "ville/plan", source: "bonavilien/kedge-plan-com", origine: false, version: { ici: VER, amont: NEXT }, retard: 4, base: ["0028_exemple.sql"],
  nouveautes: [{ n: NEXT, date: "2026-12-01", notes: ["Mise à jour en un clic", "Périodes réglables"] }], aJour: false, ...o });
p = await open({ copie: true }, "pilote@example.com", async (a, pg) => {
  if (a === "etat") return [200, etat()];
  if (a === "base") { await pg.waitForTimeout(400); return [200, { faites: ["0028_exemple.sql"] }]; }
  if (a === "code") { await pg.waitForTimeout(400); setTimeout(() => (pg.online = NEXT), 1500); return [200, { fusion: "fast-forward", publication: true, version: NEXT }]; }
});
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" }));
await p.waitForSelector(".maj-dispo");
ok((await p.locator(".maj-v").innerText()).replace(/\s+/g, " ").includes("→ 9.9"), "version disponible : ancienne → nouvelle");
ok(await p.locator(".maj-notes li").count() === 2, "les nouveautés de la version s'affichent");
ok(await p.locator('[data-act="maj-go"]').count() === 1, "un seul bouton : Mettre à jour");
ok(await p.locator(".maj-nuit").count() === 0, "fonction d'avant la mise à jour de nuit : pas de mention « chaque nuit »");
await shot(p, "maj-1-disponible", ".maj");
await p.evaluate(() => { window.__reloaded = 0; KP.acts.reload = () => { window.__reloaded++; }; });
await p.click('[data-act="maj-go"]');
await p.waitForSelector(".maj-steps li.now");
await shot(p, "maj-2-en-cours", ".maj");
await p.waitForSelector(".maj-fini", { timeout: 30000 });
await shot(p, "maj-3-fini", ".maj");
ok(p.fnCalls.join() === "etat,base,code", "dans l'ordre : état, base, puis code");
await p.waitForFunction(() => window.__reloaded > 0, null, { timeout: 5000 }).catch(() => {});
ok(await p.evaluate(() => window.__reloaded) > 0, "nouvelle version en ligne : l'appli se recharge seule");
ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
await p.context().close();

// à jour
p = await open({ copie: true }, "pilote@example.com", async () => [200, etat({ version: { ici: VER, amont: VER }, base: [], nouveautes: [], aJour: true, auto: true })], "dark");
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForSelector(".maj-ajour");
ok((await p.locator(".maj").innerText()).includes("À jour") && await p.locator('[data-act="maj-go"]').count() === 0, "à jour : une coche, pas de bouton");
ok((await p.locator(".maj-nuit").innerText()).trim() === "Chaque nuit, toute seule" && await p.locator(".maj-nuit svg").count() === 1, "copie inscrite pour la nuit : « Chaque nuit, toute seule », une icône");
await shot(p, "maj-0-a-jour-sombre", ".maj");
await p.context().close();

// erreur au milieu : message clair, Réessayer
p = await open({ copie: true }, "pilote@example.com", async (a) => a === "etat" ? [200, etat()] : a === "base" ? [500, { erreur: "script", message: "Le script 0028_exemple.sql n'est pas passé, rien n'a été changé par lui : syntax error" }] : [200, {}]);
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForSelector(".maj-dispo");
await p.click('[data-act="maj-go"]'); await p.waitForSelector(".maj-erreur");
ok((await p.locator(".maj-err").innerText()).includes("0028_exemple.sql") && p.fnCalls.join() === "etat,base", "un script refusé : on s'arrête avant le code, le message le dit");
ok(await p.locator('[data-act="maj-retry"]').count() === 1, "bouton Réessayer");
await shot(p, "maj-4-erreur", ".maj");
await p.context().close();

// fonction pas installée
p = await open({ copie: true }, "pilote@example.com", async () => [404, { code: "NOT_FOUND", message: "Requested function was not found" }]);
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForSelector(".maj-absente");
ok((await p.locator(".maj a").getAttribute("href")).includes("DEPLOYER.md"), "bouton pas installé : lien vers le guide");
await p.context().close();

// écran de connexion : le 7 de l'icône en fond animé, plus de logo dans le formulaire
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" }); const q = await ctx.newPage(); const errs = []; q.on("pageerror", (e) => errs.push(e.message));
  await q.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await q.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux", marque: { app: "Road to 7th", nom: "KEDGE", logo: "assets/road-to-7th.png", carre: true, symbole: "assets/road-to-7th-symbole.png" } })};` }));
  await q.addInitScript(() => sessionStorage.setItem("kplan-ouvert", "1")); /* sans l'ouverture du 7 (test/maj/ouverture.mjs) */
  await q.goto(base); await q.waitForSelector(".login-fond svg .lf-etoile");
  ok(await q.locator(".login-card img").count() === 0 && await q.locator(".login-fond svg .lf-route").count() === 1 && await q.locator(".login-fond svg .lf-contour").count() === 1 && !errs.length, "connexion : le 7 en fond (route, étoile, contour), plus de logo dans le formulaire");
  await q.waitForTimeout(1000);
  ok(await q.evaluate(() => getComputedStyle(document.querySelector(".lf-contour")).opacity) === "0" && await q.evaluate(() => getComputedStyle(document.querySelector(".lf-trace")).strokeDashoffset) === "1px", "connexion : l'étoile colorée monte seule, sans contour ni route");
  await q.waitForTimeout(2600);
  ok(await q.evaluate(() => getComputedStyle(document.querySelector(".lf-trace")).strokeDashoffset) === "0px" && await q.evaluate(() => getComputedStyle(document.querySelector(".lf-contour")).opacity) === "1", "connexion : le contour a jailli et la route est tracée jusqu'en haut du 7");
  await ctx.close();
  const c3 = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }); const q3 = await c3.newPage();
  await q3.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await q3.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux", marque: { app: "Road to 7th", logo: "assets/road-to-7th.png", carre: true, symbole: "assets/road-to-7th-symbole.png" } })};` }));
  await q3.goto(base); await q3.waitForSelector(".login-fond svg .lf-etoile");
  ok(await q3.evaluate(() => getComputedStyle(document.querySelector(".lf-trace")).strokeDashoffset === "0px" && getComputedStyle(document.querySelector(".lf-contour")).opacity === "1" && getComputedStyle(document.querySelector(".lf-trainee")).opacity === "0"), "moins de mouvement demandé : le fond s'affiche déjà terminé");
  await c3.close();
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" }); const q2 = await c2.newPage();
  await q2.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await q2.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux", marque: { nom: "Ville de Test", logo: "" } })};` }));
  await q2.goto(base); await q2.waitForSelector("#login form");
  ok(await q2.locator(".login-fond").count() === 0, "sans le symbole (logo d'une autre équipe) : connexion sans fond animé");
  await c2.close();
}

// l'icône sans fond : son carré et l'onglet du navigateur prennent la couleur du projet
p = await open({ copie: false, marque: { app: "Road to 7th", nom: "KEDGE", logo: "assets/road-to-7th.png", carre: true, symbole: "assets/road-to-7th-symbole.png" } });
const fond = () => p.evaluate(() => getComputedStyle(document.querySelector(".brand img")).backgroundColor);
ok((await p.locator(".brand img").getAttribute("src")).endsWith("road-to-7th-symbole.png") && await fond() === "rgb(255, 212, 83)", "icône du menu : le symbole sur le jaune d'origine");
ok(await p.evaluate(() => [...document.querySelectorAll('link[rel="icon"]')].every((l) => !l.href.startsWith("data:"))), "en jaune, l'onglet garde ses fichiers d'icône");
await p.evaluate(() => KP.store.saveProjet({ couleur: "turquoise" })); await p.waitForTimeout(400);
ok(await fond() === "rgb(69, 186, 189)", "couleur turquoise : le carré de l'icône devient turquoise");
const fav = await p.evaluate(() => { const l = document.querySelector('link[rel="icon"]'); return new Promise((res) => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.drawImage(i, 0, 0); res({ n: document.querySelectorAll('link[rel="icon"]').length, px: [...g.getImageData(6, 32, 1, 1).data] }); }; i.src = l.href; }); });
ok(fav.n === 1 && fav.px.slice(0, 3).join() === "69,186,189", "l'onglet du navigateur : icône redessinée en turquoise");
await p.evaluate(() => KP.store.saveProjet({ couleur: "jaune-or" })); await p.waitForTimeout(400);
await p.context().close();

// un service ne voit pas le bouton
p = await open({ copie: true }, "presse@example.com", async () => [200, etat()]);
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForTimeout(300);
ok(await p.locator(".maj").count() === 0 && p.fnCalls.length === 0, "un service : pas de bouton, aucun appel");
await p.context().close();

await b.close();
console.log(bad ? `${bad} échec(s)` : "Réglages d'une copie et mise à jour : tout est bon");
process.exit(bad ? 1 : 0);
