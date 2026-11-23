// 2.6 : l'écran Résultats (diffusions, à compléter, par message, diffusées) et l'onglet Budget des chefs de projet ;
// « 12 400 vues » et « 1 650 € » écrits dans la fiche ; puis ce qui part dans la base et ce qui en revient (fausse base).
// Aujourd'hui figé au jeudi 19 novembre 2026. Usage : (cd site && python3 -m http.server 8812) puis node test/maj/resultats.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
/* une base d'avant 2.9 (sans le script 0038) : l'onglet Budget reste celui des périodes ; le budget par devis a ses tests dans test/maj/devis.mjs */
const fakeAvant29 = fake.replace("absentes: [], fichiers", 'absentes: ["devis", "devis_lignes", "devis_liens", "enveloppes_annee"], fichiers');
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const NOW = new Date("2026-11-19T10:00:00");
const NB = (s) => String(s).replace(/[  ]/g, " ");

async function ouvrir(cfg, { theme = "light", email = "", hash = "", device = null, avant29 = false } = {}) {
  const ctx = await b.newContext({ ...(device || { viewport: { width: 1440, height: 900 } }), serviceWorkers: "block", deviceScaleFactor: shots ? 2 : device ? device.deviceScaleFactor : 1, colorScheme: theme, reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message)); p.on("console", (m) => m.type() === "error" && p.errs.push(m.text()));
  await p.clock.setFixedTime(NOW);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: avant29 ? fakeAvant29 : fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify(cfg)};` }));
  await p.goto(base + hash);
  if (email) {
    await p.waitForSelector("#login form");
    await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
    await p.waitForSelector("#login", { state: "detached" });
  }
  await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0);
  return [ctx, p];
}
const idOf = (p, t) => p.evaluate((t) => KP.store.items().find((x) => x.t.startsWith(t)).id, t);
const tuiles = (p) => p.$$eval(".r-tile", (e) => e.map((x) => x.innerText.replace(/\s*\n\s*/g, " ").replace(/[  ]/g, " ")));
const todo = (p) => p.$$eval(".r-todo .r-l", (e) => e.map((x) => x.querySelector(".tt").textContent + " / " + x.querySelector(".r-u.on").textContent));
const toast = (p) => p.evaluate(() => ((document.querySelector(".toast span") || {}).textContent || "").replace(/[  ]/g, " "));
const voir = (p, hash) => p.evaluate((h) => { location.hash = h; }, hash).then(() => p.waitForTimeout(120));
const snap = (p, n, full) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: !!full });

/* ---------- démo : Diffusions ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/diffusions" });
  ok(await p.locator(".side .nav a", { hasText: "Résultats" }).count() === 1, "« Résultats » dans le menu, entre Le plan et Réunion");
  ok(JSON.stringify(await p.$$eval(".side .nav a", (e) => e.map((x) => x.textContent.replace(/\d+$/, "").trim()))) === JSON.stringify(["Accueil", "Le plan", "Résultats", "Réunion"]), "ordre du menu");
  ok(JSON.stringify(await tuiles(p)) === JSON.stringify(["19,3 k vues", "3 retombées presse", "140 inscrits", "96 clics"]), "les totaux de Considérer : " + (await tuiles(p)).join(" | "));
  ok(NB(JSON.stringify(await todo(p))) === JSON.stringify(["Brève : accord avec l'université de Séoul / Retombées", "Portrait d'un alumni entrepreneur / Vues", "Encart Sud Ouest : journée portes ouvertes / Retombées"]), "à compléter : diffusées sans chiffre, unité devinée par service : " + (await todo(p)).join(" | "));
  await snap(p, "1-diffusions");
  // saisir, Entrée : la ligne part, le curseur passe à la suivante
  const breve = await idOf(p, "Brève"), portrait = await idOf(p, "Portrait d'un alumni");
  await p.click(`#rn-${breve}`); await p.keyboard.type("4");
  await p.click(`.r-l[data-id="${breve}"] .r-u[data-k="retombees"]`);
  ok(await p.evaluate(() => document.activeElement.classList.contains("r-n")), "choisir l'unité rend le curseur au nombre");
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  ok(await toast(p) === "Noté : 4 retombées", "noté : 4 retombées");
  ok(await p.evaluate(() => document.activeElement.id) === `rn-${portrait}`, "le curseur passe à la ligne suivante");
  ok((await todo(p)).length === 2 && (await tuiles(p))[1] === "7 retombées presse", "la ligne quitte « À compléter », le total suit");
  await p.keyboard.type("12400"); ok(NB(await p.inputValue(`#rn-${portrait}`)) === "12 400", "le nombre se groupe pendant la frappe");
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  ok(JSON.stringify(await p.evaluate((id) => KP.store.get(id).res, portrait)) === JSON.stringify({ vues: 12400 }), "12 400 vues sur le portrait");
  await p.click(".toast button"); await p.waitForTimeout(80);
  ok(!(await p.evaluate((id) => KP.store.get(id).res, portrait)) && (await todo(p)).length === 2, "Annuler remet la ligne dans « À compléter »");
  // un Entrée sans nombre ne note rien
  await p.click(`#rn-${portrait}`); await p.keyboard.press("Enter");
  ok((await todo(p)).length === 2, "sans nombre, rien n'est noté");
  // par message
  const pm = await p.$$eval(".bilan .b-row", (e) => e.map((x) => x.innerText.replace(/\s*\n\s*/g, " ").replace(/[  ]/g, " ")));
  ok(pm[0] === "Filières 14,2 k vues" && pm[4] === "Réputation rien de diffusé" && pm[2] === "International 5 100 vues · 96 clics · 4 retombées" && pm[3] === "Continuum 140 inscrits · 3 retombées", "par message : " + pm.join(" | "));
  // diffusées : la plus forte en haut ; corriger le chiffre
  const top = await p.$$eval(".r-row .tt", (e) => e.map((x) => x.textContent));
  ok(NB(top[0]) === "Vidéo : une journée sur le campus de Bordeaux" && top.map(NB).includes("Brève : accord avec l'université de Séoul"), "diffusées, la plus forte en haut : " + top.join(" | "));
  const video = await idOf(p, "Vidéo : une journée");
  await p.click(`.r-row[data-id="${video}"] .r-v`); await p.waitForSelector(".r-pop");
  ok(NB(await p.inputValue(".r-pop [name=vues]")) === "14 200", "la fenêtre reprend les chiffres");
  await p.fill(".r-pop [name=vues]", "15000"); await p.fill(".r-pop [name=clics]", "320"); await p.click(".r-pop .btn");
  ok(JSON.stringify(await p.evaluate((id) => KP.store.get(id).res, video)) === JSON.stringify({ vues: 15000, clics: 320 }), "corrigé : 15 000 vues et 320 clics");
  ok(!(await p.locator(`.r-row[data-id="${video}"] .open`).first().evaluate((e) => e.closest(".r-pop"))), "la fenêtre se ferme");
  // la fiche montre le chiffre ; cliquer dessus le corrige
  await p.click(`.r-row[data-id="${video}"] .open`); await p.waitForSelector("#fiche:not([hidden])");
  const fv = NB(await p.$eval(".f-meta .r-fv", (e) => e.textContent));
  ok(fv === "15 000 vues · 320 clics", "la fiche montre le résultat : " + fv);
  await snap(p, "2-fiche-ouverte");
  await p.keyboard.press("Escape");
  // une autre période
  await p.click('[data-act=rper][data-k=installer]'); await p.waitForTimeout(80);
  ok((await p.evaluate(() => location.hash)).includes("per=installer") && (await tuiles(p)).join(" | ") === "39,9 k vues | 6 retombées presse | 0 inscrit | 210 clics", "Installer : ses propres totaux : " + (await tuiles(p)).join(" | "));
  await p.click('[data-act=rper][data-k=preferer]'); await p.waitForTimeout(80);
  ok(await p.locator(".empty h3", { hasText: "Rien de diffusé sur Préférer" }).count() === 1, "une période sans diffusion le dit");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- démo, base d'avant 2.9 : Budget par période (chefs de projet) ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget" });
  await p.evaluate(() => { KP.base = { resultats: true, photo: true, devis: false }; KP.render(); });
  ok(await p.locator(".dv-avis").count() === 1 && !(await p.locator(".dv-tot").count()), "base sans 0038 : l'ancien onglet, et ce qu'il faut coller pour les devis");
  const cartes = () => p.$$eval(".r-card", (e) => e.map((x) => x.innerText.replace(/\s*\n\s*/g, " ").replace(/[  ]/g, " ")));
  ok((await cartes(p)).join(" | ") === "Installer 3 800 € sur 8 000 € | Considérer 9 800 € sur 10 000 € | Préférer 4 500 € sur 12 000 € | Convertir 0 € sur 10 000 € | Décider 0 € sur 6 000 €", "une case par période : " + (await cartes(p)).join(" | "));
  ok(NB(await p.$eval(".ag h2 small", (e) => e.textContent)) === "18 100 € sur 46 000 €", "l'année : total et enveloppes");
  ok(NB(await p.$eval(".r-prive", (e) => e.textContent)) === "Visible seulement par toi et Estelle", "qui voit l'onglet");
  const chal = await idOf(p, "Interview dans Challenges"), etu = await idOf(p, "Dossier L'Étudiant");
  await snap(p, "3-budget");
  await p.click(`#bm-${chal}`); await p.keyboard.press("Control+A"); await p.keyboard.type("3500"); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.montant(id), chal) === 3500, "montant changé : 3 500 €");
  ok(await p.evaluate(() => document.activeElement.id) === `bm-${etu}`, "Entrée passe au montant suivant");
  await p.keyboard.press("Tab"); await p.waitForTimeout(80);
  await p.click("#env-considerer"); await p.keyboard.press("Control+A"); await p.keyboard.type("9000"); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate(() => KP.store.enveloppe("considerer")) === 9000 && await p.locator(".r-card.on.over").count() === 1 && await p.locator(".r-tot .over").count() === 1, "enveloppe dépassée : la case et le total passent en rouge");
  await p.click("#env-considerer"); await p.keyboard.press("Control+A"); await p.keyboard.press("Backspace"); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate(() => KP.store.enveloppe("considerer")) === undefined && !(await p.locator(".r-card.over").count()), "enveloppe effacée : plus de rouge");
  await p.click('[data-act=rper][data-k=preferer]'); await p.waitForTimeout(80);
  ok((await p.$$eval(".r-b .tt", (e) => e.map((x) => x.textContent))).map(NB).join() === "Salon L'Étudiant : le stand", "cliquer une période montre ses partenariats");
  // la fiche d'un partenariat : son budget, réglable
  const enc = await idOf(p, "Encart Sud Ouest");
  await p.evaluate((id) => KP.go({ fiche: id }), enc); await p.waitForSelector("#fiche:not([hidden])");
  ok(NB(await p.$eval('[data-act="r-prix"]', (e) => e.textContent)) === "1 800 €", "la fiche du partenariat montre son budget");
  await p.click('[data-act="r-prix"]'); await p.fill(".r-pop input", "1650"); await p.click(".r-pop .btn");
  ok(await p.evaluate((id) => KP.store.montant(id), enc) === 1650 && await toast(p) === "Budget : 1 650 €", "réglé depuis la fiche");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- démo : un service ne voit pas le budget ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false });
  await p.evaluate(() => KP.store.switchUser("stephane"));
  await voir(p, "#/resultats/budget");
  ok(!(await p.locator("[data-act=rtab]").count()) && await p.locator(".r-tiles").count() === 1, "Stéphane : pas d'onglet Budget, l'adresse mène aux diffusions");
  ok(JSON.stringify((await todo(p)).map((x) => x.split(" / ")[0])) === JSON.stringify(["Portrait d'un alumni entrepreneur"]), "à compléter : seulement ses propres diffusions");
  const enc = await idOf(p, "Encart Sud Ouest");
  await p.evaluate((id) => KP.go({ fiche: id }), enc); await p.waitForSelector("#fiche:not([hidden])");
  ok(!(await p.locator('[data-act="r-prix"]').count()) && !(await p.locator(".f-meta dt", { hasText: "Budget" }).count()), "la fiche d'un partenariat ne montre pas son prix");
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k"); await p.waitForSelector("dialog.cmdk");
  const cmds = await p.$$eval("dialog.cmdk button, dialog.cmdk [role=option]", (e) => e.map((x) => x.textContent));
  ok(cmds.some((x) => x.includes("Résultats des diffusions")) && !cmds.some((x) => x.includes("Budget des partenariats")), "la recherche propose les Résultats, pas le budget");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- démo : écrit dans la fiche ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false });
  const fiche = async (t) => { const id = await idOf(p, t); await p.evaluate((id) => KP.go({ fiche: id }), id); await p.waitForSelector("#ph-t"); return id; };
  const ecrire = async (s) => { await p.fill("#ph-t", ""); await p.click("#ph-t"); await p.keyboard.type(s); await p.waitForTimeout(60); };
  const apercu = () => p.$eval(".ph-apercu", (e) => e.innerText.replace(/\s*\n\s*/g, " | ").replace(/[  ]/g, " ").trim());
  const marks = () => p.$$eval(".ph-miroir mark", (e) => e.map((x) => x.className.split(" ")[0] + ":" + x.textContent.replace(/[  ]/g, " ")));
  let id = await fiche("Portrait d'un alumni");
  await ecrire("le portrait a fait 12 400 vues et 300 clics sur LinkedIn");
  ok(await apercu() === "Noter 12 400 vues · 300 clics", "« 12 400 vues et 300 clics » : noter dans les résultats : " + await apercu());
  ok(JSON.stringify(await marks()) === JSON.stringify(["z-res:12 400 vues", "z-res:300 clics"]), "les chiffres sont surlignés en vert");
  ok(!(await p.$eval(".ph-go", (e) => e.disabled)), "on peut envoyer sans @");
  const n0 = await p.evaluate((id) => KP.store.reqsOf(id).length, id);
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(JSON.stringify(await p.evaluate((id) => KP.store.get(id).res, id)) === JSON.stringify({ vues: 12400, clics: 300 }) && await p.evaluate((id) => KP.store.reqsOf(id).length, id) === n0, "noté, sans message envoyé");
  ok(await toast(p) === "Noté : 12 400 vues · 300 clics" && await p.inputValue("#ph-t") === "", "« Noté », la ligne se vide");
  // décocher : rien n'est noté
  await ecrire("finalement 20 000 vues"); await p.click("[data-act=ph-res]");
  ok(await p.$eval(".ph-go", (e) => e.disabled) && !(await marks()).length, "décoché : plus rien à envoyer, plus de surlignage");
  // une action à venir : pas de résultats
  await fiche("Teaser de la journée"); await ecrire("@Louise on vise 10 000 vues");
  ok(!(await apercu()).includes("Noter"), "une action à venir ne prend pas de chiffres : " + await apercu());
  // passée mais pas encore diffusée : noter la passe en « Diffusé »
  id = await fiche("Interview croisée"); await ecrire("3 200 vues");
  ok(await apercu() === "Noter 3 200 vues et passer en Diffusé", "passée, pas diffusée : " + await apercu());
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.get(id).st, id) === "diffuse", "l'action passe en « Diffusé »");
  // un partenariat payé par un devis : le montant se change dans le devis, pas ici
  await fiche("Encart Sud Ouest"); await ecrire("@Aurélie facture reçue, 1 650 € au final");
  ok(!(await apercu()).includes("Budget"), "payé par un devis : pas de budget proposé : " + await apercu());
  // un partenariat sans devis : le montant va au budget, et le message part quand même
  id = await fiche("Interview dans Challenges");
  await ecrire("@Aurélie facture reçue, 1 650 € au final");
  ok(await apercu() === "Aurélie | pour info | Budget : 1 650 €", "« 1 650 € » sur un partenariat sans devis : le budget : " + await apercu());
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.montant(id), id) === 1650 && await p.evaluate((id) => KP.store.reqsOf(id).some((r) => r.txt.startsWith("Facture reçue") && !r.txt.includes("650")), id), "budget noté, et le message part sans le montant (réservé aux chefs de projet)");
  // Stéphane n'a pas de budget
  await p.evaluate(() => KP.store.switchUser("stephane"));
  await fiche("Interview dans Challenges"); await ecrire("@Aurélie 1 650 € au final");
  ok(!(await apercu()).includes("Budget"), "Stéphane : pas de budget proposé");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- téléphone et sombre ---------- */
for (const hash of ["#/resultats/diffusions", "#/resultats/budget"]) {
  const [ctx, p] = await ouvrir({ brancher: false }, { hash, device: devices["iPhone 13"] });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `téléphone ${hash} : rien ne dépasse sur le côté`);
  ok((await p.$$eval("#tabbar a", (e) => e.map((x) => x.textContent.replace(/\d+/g, "")))).join() === "Accueil,Le plan,Résultats,Réunion", "téléphone : Résultats dans la barre du bas");
  ok(await p.evaluate(() => { const r = [...document.querySelectorAll("#tabbar > *")].map((x) => x.getBoundingClientRect()), pl = document.querySelector("#tabbar .plus").getBoundingClientRect();
    return r.every((x) => x.left >= -1 && x.right <= innerWidth + 1) && Math.abs(pl.left + pl.width / 2 - innerWidth / 2) < 4; }), "téléphone : la barre du bas tient, le + au milieu");
  await snap(p, "4-telephone-" + hash.split("/").pop());
  await ctx.close();
}
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/diffusions", theme: "dark" });
  const c = await p.$eval(".r-tile b", (e) => getComputedStyle(e).color);
  ok(c === "rgb(154, 219, 179)", "sombre : les chiffres restent lisibles (" + c + ")");
  await snap(p, "5-sombre");
  await ctx.close();
}

/* ---------- branché (fausse base) ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" }, { email: "pilote@example.com", hash: "#/resultats/diffusions", avant29: true });
  const breve = await p.evaluate(() => window.__fake.db.items.find((x) => x.t === "Brève accord Séoul").id);
  ok((await todo(p)).map((x) => x.split(" / ")[0]).join() === "Brève accord Séoul", "relu depuis la base : la brève diffusée est à compléter");
  await p.click(`#rn-${breve}`); await p.keyboard.type("5"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(200);
  ok(JSON.stringify(await p.evaluate((id) => window.__fake.db.items.find((x) => x.id === id).res, breve)) === JSON.stringify({ retombees: 5 }), "les chiffres partent dans la base : 5 retombées");
  // budget
  await voir(p, "#/resultats/budget");
  const chal = "b0000000-0000-0000-0000-000000000009";
  ok(NB(await p.inputValue(`#bm-${chal}`)) === "3 200" && NB(await p.inputValue("#env-considerer")) === "10 000", "relu depuis la base : montant et enveloppe");
  await p.click(`#bm-${chal}`); await p.keyboard.press("Control+A"); await p.keyboard.type("3500"); await p.keyboard.press("Enter");
  await p.click("#env-considerer"); await p.keyboard.press("Control+A"); await p.keyboard.type("12000"); await p.keyboard.press("Enter");
  await p.waitForTimeout(150); await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(150);
  const fb = await p.evaluate(() => JSON.parse(JSON.stringify({ b: window.__fake.db.budget, e: window.__fake.db.enveloppes })));
  ok(fb.b.length === 1 && fb.b[0].montant === 3500 && fb.e.length === 1 && fb.e[0].per === 2 && fb.e[0].montant === 12000, "montant et enveloppe partent dans la base : " + JSON.stringify(fb));
  await p.click(`#bm-${chal}`); await p.keyboard.press("Control+A"); await p.keyboard.press("Backspace"); await p.keyboard.press("Tab");
  await p.waitForTimeout(150); await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(150);
  ok(!(await p.evaluate(() => window.__fake.db.budget.length)), "un montant effacé part de la base");
  // historique : « a noté les résultats »
  await p.evaluate(() => window.__fake.db.journal.push({ id: 99, item: "b0000000-0000-0000-0000-000000000004", author: "a0000000-0000-0000-0000-000000000001", at: new Date().toISOString(), kind: "modif", diff: { res: [{}, { retombees: 5 }] } }));
  // une fiche créée n'envoie pas de colonne res vide (une base sans 0031 la refuserait)
  await p.evaluate(() => KP.store.add({ t: "Nouvelle action", svc: "rs", date: KP.TODAY }));
  await p.waitForTimeout(150); await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(150);
  const ins = await p.evaluate(() => window.__fake.calls.filter((c) => c.t === "items" && c.op === "insert").map((c) => c.rows[0]));
  ok(ins.length === 1 && !("res" in ins[0]), "une fiche neuve part sans résultats");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}
/* relu : l'historique dit « a noté les résultats » ; une base d'avant 0031 (sans tables budget) ne casse rien */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.clock.setFixedTime(NOW);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fakeAvant29.replace("budget: [{ item: I(9), montant: 3200 }], enveloppes: [{ per: 2, montant: 10000 }],", "") }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" })};` }));
  await p.goto(base + "#/resultats/budget"); await p.waitForSelector("#login form");
  await p.evaluate(() => { const db = window.__fake.db; delete db.budget; delete db.enveloppes; db.items.find((x) => x.t === "Brève accord Séoul").res = { retombees: 5 };
    db.journal.push({ id: 99, item: "b0000000-0000-0000-0000-000000000004", author: db.profiles[1].id, at: new Date().toISOString(), kind: "modif", diff: { res: [{}, { retombees: 5 }] } }); });
  await p.fill("#login [name=email]", "pilote@example.com"); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
  await p.waitForSelector("#login", { state: "detached" }); await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0);
  ok(await p.locator(".r-card").count() === 5 && NB(await p.$eval(".ag h2 small", (e) => e.textContent)) === "0 €", "sans les tables du budget : l'onglet s'ouvre, vide");
  const j = await p.evaluate(() => KP.store.journalOf("b0000000-0000-0000-0000-000000000004").map((x) => x.txt));
  ok(j.includes("a noté les résultats : 5 retombées"), "l'historique : « a noté les résultats : 5 retombées »");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

await b.close();
console.log(bad ? `${bad} échec(s)` : "Résultats et budget : tout est bon");
process.exit(bad ? 1 : 0);
