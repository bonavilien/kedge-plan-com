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
await p.evaluate(() => KP.go({ screen: "reglages", set: "periodes" }));
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
await p.evaluate(() => KP.go({ set: "messages" })); await p.waitForSelector(".t-msg");
ok(await p.locator(".t-msg .tr").count() === 5, "Réglages > Messages : les 5 messages");
await p.fill("#me-alumni-nom", "Diplômés"); await p.locator("#me-alumni-nom").dispatchEvent("change"); await settle(p);
ok((await fdb(p, "messages")).find((x) => x.n === 2).nom === "Diplômés", "renommer un message : enregistré dans la base");
ok(await p.evaluate(() => KP.message("alumni").nom) === "Diplômés", "le nouveau nom s'affiche partout");
await p.evaluate(() => KP.go({ set: "apropos" })); await p.waitForTimeout(200);
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
p = await open({ copie: true }, "pilote@example.com", async () => [200, etat({ version: { ici: VER, amont: VER }, base: [], nouveautes: [], aJour: true })], "dark");
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForSelector(".maj-ajour");
ok((await p.locator(".maj").innerText()).includes("À jour") && await p.locator('[data-act="maj-go"]').count() === 0, "à jour : une coche, pas de bouton");
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

// un service ne voit pas le bouton
p = await open({ copie: true }, "presse@example.com", async () => [200, etat()]);
await p.evaluate(() => KP.go({ screen: "reglages", set: "apropos" })); await p.waitForTimeout(300);
ok(await p.locator(".maj").count() === 0 && p.fnCalls.length === 0, "un service : pas de bouton, aucun appel");
await p.context().close();

await b.close();
console.log(bad ? `${bad} échec(s)` : "Réglages d'une copie et mise à jour : tout est bon");
process.exit(bad ? 1 : 0);
