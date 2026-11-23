// 2.9 : le budget par devis, à l'année (Résultats > Budget, chefs de projet) ; la part du devis sur la fiche de l'action ;
// puis ce qui part dans la base et ce qui en revient (fausse base), le PDF rangé dans l'appli, une base sans le script 0038.
// Aujourd'hui figé au lundi 23 novembre 2026 (année 2026-2027). Usage : (cd site && python3 -m http.server 8812) puis node test/maj/devis.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const NOW = new Date("2026-11-23T10:00:00");
const NB = (s) => String(s).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const PDF = { name: "Devis Figaro signé.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%test\n") };

async function ouvrir(cfg, { theme = "light", email = "", hash = "", device = null, body = fake } = {}) {
  const ctx = await b.newContext({ ...(device || { viewport: { width: 1440, height: 900 } }), serviceWorkers: "block", deviceScaleFactor: shots ? 2 : device ? device.deviceScaleFactor : 1, colorScheme: theme, reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message)); p.on("console", (m) => m.type() === "error" && p.errs.push(m.text()));
  await p.clock.setFixedTime(NOW);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body }));
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
const txt = (p, sel) => p.$eval(sel, (e) => e.innerText).then(NB);
const toast = (p) => p.evaluate(() => ((document.querySelector(".toast span") || {}).textContent || "")).then(NB);
const voir = (p, hash) => p.evaluate((h) => { location.hash = h; }, hash).then(() => p.waitForTimeout(120));
const lignes = (p) => p.$$eval(".dv-row", (e) => e.map((x) => x.querySelector(".tt").textContent));
const snap = (p, n, full) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: !!full });
const calme = async (p) => { await p.waitForTimeout(150); await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(150); };

/* ---------- démo : l'année ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget" });
  ok(await txt(p, ".dv-ans .on") === "2026-2027", "l'année scolaire en cours : 2026-2027");
  ok(await txt(p, ".dv-big") === "19 500 € HT · 23 400 € TTC", "le total de l'année, HT et TTC : " + await txt(p, ".dv-big"));
  ok((await txt(p, ".dv-tot")).includes("engagés : 12 800 € sur 25 000 €, reste 12 200 €"), "engagé (signé, DA faite, facturé) face à l'enveloppe");
  ok(await txt(p, ".dv-legs") === "Reçu 6 700 € Signé 11 000 € DA faite 0 € Facturé 1 800 € + 1 200 € offerts", "les quatre états et les offerts : " + await txt(p, ".dv-legs"));
  ok(JSON.stringify(await lignes(p)) === JSON.stringify(["L'Étudiant", "Sud Ouest", "Studyrama"]), "les devis, le plus récent en haut");
  ok(await txt(p, '.dv-row:first-of-type .t small, .dv-rows .dv-row small') === "4 lignes · 2 à relier", "ce qui reste à relier se voit sur la ligne");
  ok(NB(await p.inputValue(".r-ea")) === "25 000", "l'enveloppe de l'année");
  ok(await p.locator(".r-card").count() === 0 && await p.locator(".dv-avis").count() === 0, "plus de cases par période");
  await snap(p, "1-annee", true);
  // un programme
  await p.click('[data-act=dv-prog][data-k="PGE"]');
  ok(JSON.stringify(await lignes(p)) === JSON.stringify(["L'Étudiant", "Sud Ouest"]) && !(await p.locator(".r-ea").count()), "filtre PGE : ses devis, sans l'enveloppe de toute l'année");
  ok((await txt(p, ".dv-big")).startsWith("12 800 €"), "filtre PGE : son total");
  await p.click('[data-act=dv-prog][data-k=""]');
  // l'enveloppe dépassée
  await p.click(".r-ea"); await p.keyboard.press("Control+A"); await p.keyboard.type("10000");
  ok(NB(await p.inputValue(".r-ea")) === "10 000", "le nombre se groupe pendant la frappe");
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  ok(await p.evaluate(() => KP.store.envAn(2026)) === 10000 && await toast(p) === "Enveloppe 2026-2027 : 10 000 €", "enveloppe changée : 10 000 €");
  ok(await p.locator(".dv-tot.over").count() === 1 && (await txt(p, ".dv-tot")).includes("l'enveloppe est dépassée de 2 800 €"), "dépassée : la carte le dit");
  await p.click(".toast button"); await p.waitForTimeout(80);
  ok(await p.evaluate(() => KP.store.envAn(2026)) === 25000, "Annuler remet 25 000 €");
  // une autre année
  await p.click('[data-act=dv-an][data-k="2027"]'); await p.waitForTimeout(80);
  ok((await p.evaluate(() => location.hash)).includes("an=2027") && await p.locator(".dv-vide h3", { hasText: "Aucun devis sur 2027-2028" }).count() === 1, "l'année suivante : vide, et l'adresse la garde");
  await p.click('[data-act=dv-an][data-k="2026"]'); await p.waitForTimeout(80);
  ok(!(await p.evaluate(() => location.hash)).includes("an="), "l'année en cours : l'adresse redevient courte");
  // l'état depuis la liste
  await p.click(".dv-row:nth-of-type(2) [data-act=dv-etat-menu], .dv-rows .dv-row:first-of-type [data-act=dv-etat-menu]");
  await p.click('.pop [data-v="da"]'); await p.waitForTimeout(80);
  const etu = await p.evaluate(() => KP.store.devisTous().find((d) => d.media === "L'Étudiant"));
  ok(etu.etat === "da" && await toast(p) === "Devis L'Étudiant : DA faite", "« DA faite » depuis la liste");
  ok((await txt(p, ".dv-legs")).includes("DA faite 11 000 €"), "la légende suit");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- démo : un devis de bout en bout ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget" });
  await p.click(".dv-h [data-act=dv-new]"); await p.waitForSelector("dialog .dv-form");
  await p.fill("dialog [name=media]", "Le Figaro Étudiant"); await p.fill("dialog [name=prog]", "PGE"); await p.fill("dialog [name=num]", "FE-77");
  await p.click("dialog .btn.primary"); await p.waitForSelector("#fiche:not([hidden]) .dv-etats");
  const dv = await p.evaluate(() => KP.store.devisTous().find((d) => d.media === "Le Figaro Étudiant"));
  ok(dv && dv.annee === 2026 && dv.recu === "2026-11-23" && dv.etat === "recu" && dv.prog === "PGE" && dv.num === "FE-77", "nouveau devis : reçu aujourd'hui, sur 2026-2027, état Reçu");
  await p.waitForTimeout(150);
  ok((await p.evaluate(() => location.hash)).includes("fiche=devis-" + dv.id) && await p.evaluate(() => document.activeElement.dataset.act) === "dv-ligne-add", "sa fiche s'ouvre, prête pour la première ligne");
  ok((await lignes(p)).includes("Le Figaro Étudiant"), "il entre dans la liste de l'année");
  // deux lignes : une série de 4 épisodes, une bannière offerte
  await p.click("[data-act=dv-ligne-add]"); await p.waitForSelector("dialog .dv-form [name=t]");
  await p.fill("dialog [name=t]", "Série vidéo"); await p.fill("dialog [name=d]", "4 épisodes"); await p.fill("dialog [name=m]", "8 000"); await p.fill("dialog [name=q]", "4");
  await p.click("dialog .btn.primary"); await p.waitForTimeout(80);
  ok(await toast(p) === "Ligne « Série vidéo » ajoutée", "ligne ajoutée");
  await p.click("[data-act=dv-ligne-add]"); await p.waitForSelector("dialog .dv-form [name=t]");
  await p.fill("dialog [name=t]", "Bannière"); await p.fill("dialog [name=m]", "abc"); await p.click("dialog .btn.primary"); await p.waitForTimeout(60);
  ok(await p.locator("dialog .dv-form").count() === 1 && (await toast(p)).startsWith("Ce montant n'est pas possible"), "un montant illisible est refusé, la fenêtre reste");
  await p.fill("dialog [name=m]", "1500"); await p.check("dialog [name=o]"); await p.click("dialog .btn.primary"); await p.waitForTimeout(80);
  ok(await txt(p, "#fiche .dv-total") === "8 000 € HT 9 600 € TTC", "la ligne offerte ne compte pas : " + await txt(p, "#fiche .dv-total"));
  ok((await txt(p, "#fiche .dv-off")).includes("1 500 €"), "les offerts : leur valeur, hors total");
  ok(await txt(p, "#fiche .dv-relier") === "Relier 4 actions", "la série attend 4 actions");
  // la remise
  await p.fill("#fiche [data-dv=remise]", "800"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  ok(await txt(p, "#fiche .dv-total") === "7 200 € HT 8 640 € TTC" && await toast(p) === "Remise : 800 €", "remise de 800 € : 7 200 € HT");
  ok((await txt(p, "#fiche .dv-l:first-of-type .dv-lm")) === "8 000 € 2 000 € par action", "une ligne de 4 actions dit ce que coûte chacune");
  await p.fill("#fiche [data-dv=remise]", "9000"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  ok(await toast(p) === "La remise dépasse le total des lignes" && await p.evaluate((id) => KP.store.devis(id).remise, dv.id) === 800, "une remise plus grande que les lignes est refusée");
  // relier un épisode à une action du plan
  const chal = await idOf(p, "Interview dans Challenges");
  await p.click("#fiche .dv-l:first-of-type [data-act=dv-lier], #fiche [data-act=dv-lier]"); await p.waitForSelector(".pop-dv input");
  await p.fill(".pop-dv input", "challenges"); await p.waitForTimeout(60);
  ok(await p.locator(".pop-dv .dv-c").count() === 1, "chercher une action dans la fenêtre");
  await p.click(`.pop-dv [data-i="${chal}"]`); await p.waitForTimeout(60);
  ok(await p.locator(`.pop-dv [data-i="${chal}"][aria-checked=true]`).count() === 1 && await toast(p) === "Reliée à « Interview dans Challenges »", "reliée, la case se coche");
  await p.keyboard.press("Escape"); await p.waitForTimeout(60);
  ok(await txt(p, "#fiche .dv-relier") === "Relier encore 3" && await p.locator("#fiche .dv-chip").count() === 1, "il en reste 3 à relier, la puce de l'action s'affiche");
  await snap(p, "2-fiche-devis");
  // la fiche de l'action : sa part
  await p.click("#fiche .dv-chip-o"); await p.waitForSelector("#fiche .dv-part");
  const part = await txt(p, "#fiche .dv-part");
  ok(part === "2 000 € HT Reçu 1 sur 4 de « Série vidéo » (8 000 €) 1 800 € après la remise du devis Le Figaro Étudiant · devis FE-77 ›", "l'action montre le chiffre du devis (un quart de la ligne), puis sa part après remise : " + part);
  ok(await p.evaluate((id) => { const x = KP.store.partsDe(id)[0]; return x.brut === 2000 && x.part === 1800; }, chal), "part brute 2 000 €, après remise 1 800 €");
  ok(!(await p.locator('#fiche [data-act="r-prix"]').count()), "plus de montant à l'ancienne sur une action payée par un devis");
  await snap(p, "3-fiche-action");
  await p.click("#fiche .dv-part"); await p.waitForSelector("#fiche .dv-etats");
  ok((await p.evaluate(() => location.hash)).includes("fiche=devis-" + dv.id), "un clic sur la part rouvre le devis");
  // l'état, la DA
  await p.click('#fiche [data-act=dv-etat][data-k="da"]'); await p.waitForTimeout(60);
  ok(await p.evaluate((id) => KP.store.devis(id).etat, dv.id) === "da" && await toast(p) === "Devis Le Figaro Étudiant : DA faite", "« DA faite » dans la fiche du devis");
  // le PDF (démonstration : gardé dans l'onglet)
  await p.setInputFiles("#fiche .dv-file", PDF); await p.waitForTimeout(120);
  ok(await txt(p, "#fiche .dv-pdf-t") === "Devis Figaro signé.pdf Ouvrir" && (await toast(p)).startsWith("PDF ajouté"), "le PDF se dépose dans la fiche");
  await p.setInputFiles("#fiche .dv-file", { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") }); await p.waitForTimeout(80);
  ok(await toast(p) === "Seulement un PDF", "une image est refusée");
  // délier
  await p.click("#fiche [data-act=dv-delier]"); await p.waitForTimeout(60);
  ok(!(await p.evaluate((id) => KP.store.partsDe(id).length, chal)), "déliée : l'action ne porte plus de part");
  await p.click(".toast button"); await p.waitForTimeout(60);
  ok(await p.evaluate((id) => KP.store.partsDe(id).length, chal) === 1, "Annuler la relie de nouveau");
  // un Annuler trop tardif ne ressuscite pas un devis supprimé
  ok(await p.evaluate((id) => { const r = KP.store.addLigne(id, { t: "tmp", montant: 1 }); const u = KP.store.delDevis(id); r.undo(); const back = !!KP.store.devis(id); u(); KP.store.delLigne(id, r.id); return back; }, dv.id) === false, "Annuler l'ajout d'une ligne après la suppression du devis ne le fait pas revenir");
  await p.waitForTimeout(100); await p.evaluate((id) => KP.go({ fiche: "devis-" + id }), dv.id); await p.waitForSelector("#fiche .dv-etats");
  // une action supprimée quitte sa ligne ; Annuler la remet
  const u = await p.evaluate((id) => { window.__u = KP.store.remove(id); return KP.store.devisTous().some((d) => d.lignes.some((l) => l.items.includes(id))); }, chal);
  ok(!u, "action supprimée : son lien part avec elle");
  ok(await p.evaluate((id) => { window.__u(); return KP.store.partsDe(id).length; }, chal) === 1, "Annuler la suppression remet le lien");
  // le média (titre) se change sur place
  await p.fill("#fiche [data-dv=media]", "Figaro Étudiant"); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.devis(id).media, dv.id) === "Figaro Étudiant" && (await lignes(p)).includes("Figaro Étudiant"), "le média se renomme dans la fiche, la liste suit");
  // supprimer le devis
  await p.click("#fiche [data-act=dv-more]"); await p.click('.pop [data-v="sup"]'); await p.waitForSelector("dialog .danger-bg");
  await p.click("dialog .danger-bg"); await p.waitForTimeout(100);
  ok(!(await p.evaluate((id) => KP.store.devis(id), dv.id)) && !(await p.evaluate((id) => KP.store.partsDe(id).length, chal)) && !(await p.evaluate(() => location.hash)).includes("fiche="), "devis supprimé : la fiche se ferme, l'action n'a plus de part");
  await p.click(".toast button"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.partsDe(id).length, chal) === 1, "Annuler rend le devis et ses liens");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- démo : un service ne voit ni devis ni part ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false });
  await p.evaluate(() => KP.store.switchUser("stephane"));
  const etu = await idOf(p, "Dossier L'Étudiant");
  await p.evaluate((id) => KP.go({ fiche: id }), etu); await p.waitForSelector("#fiche:not([hidden])");
  ok(!(await p.locator("#fiche .dv-part").count()) && !(await p.locator(".f-meta dt", { hasText: "Budget" }).count()), "Stéphane : la fiche ne montre pas la part du devis");
  const id = await p.evaluate(() => KP.store.devisTous()[0].id);
  await voir(p, "#/resultats/budget?fiche=devis-" + id); await p.waitForTimeout(100);
  ok(!(await p.locator("#fiche .dv-etats").count()) && !(await p.locator(".dv-tot").count()), "Stéphane : l'adresse d'un devis n'ouvre rien");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- téléphone, 1024 px, sombre ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget", device: devices["iPhone 13"] });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "téléphone : rien ne dépasse sur le côté");
  ok(await p.evaluate(() => [...document.querySelectorAll(".dv-row")].every((r) => r.getBoundingClientRect().right <= innerWidth + 1)), "téléphone : les devis tiennent dans l'écran");
  await snap(p, "4-telephone", true);
  const id = await p.evaluate(() => KP.store.devisTous()[0].id);
  await voir(p, "#/resultats/budget?fiche=devis-" + id); await p.waitForSelector("#fiche .dv-etats");
  ok(await p.evaluate(() => { const s = document.querySelector("#fiche .dv-etats").getBoundingClientRect(); return s.right <= innerWidth + 1; }), "téléphone : les quatre états tiennent dans la fiche");
  await snap(p, "5-telephone-fiche");
  await ctx.close();
}
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget", device: { viewport: { width: 1024, height: 768 } } });
  const id = await p.evaluate(() => KP.store.devisTous()[0].id);
  await voir(p, "#/resultats/budget?fiche=devis-" + id); await p.waitForSelector("#fiche .dv-etats");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "1024 px, fiche ouverte : rien ne dépasse");
  ok(await p.evaluate(() => [...document.querySelectorAll(".dv-row .st .pill")].every((x) => { const r = x.getBoundingClientRect(), c = x.closest(".rows").getBoundingClientRect(); return r.right <= c.right + 1; })), "1024 px : les états restent dans la carte");
  await snap(p, "6-1024");
  await ctx.close();
}
{
  const [ctx, p] = await ouvrir({ brancher: false }, { hash: "#/resultats/budget", theme: "dark" });
  const c = await p.$eval(".dv-big b", (e) => getComputedStyle(e).color), bg = await p.$eval(".dv-tot", (e) => getComputedStyle(e).backgroundColor);
  ok(c !== bg && !/rgb\(255, 255, 255\)/.test(bg), "sombre : la carte de l'année est sombre, le total lisible (" + c + " sur " + bg + ")");
  await snap(p, "7-sombre");
  await ctx.close();
}

/* ---------- branché (fausse base) ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" }, { email: "pilote@example.com", hash: "#/resultats/budget" });
  await ctx.route("https://faux.supabase.co/storage/**", (r) => r.fulfill({ contentType: "text/html", body: "<p>PDF</p>" }));
  const F = () => p.evaluate(() => JSON.parse(JSON.stringify({ d: window.__fake.db.devis, l: window.__fake.db.devis_lignes, k: window.__fake.db.devis_liens, e: window.__fake.db.enveloppes_annee, f: window.__fake.fichiers, c: window.__fake.calls.filter((c) => c.t === "storage") })));
  ok(await p.locator(".dv-vide h3", { hasText: "Aucun devis sur 2026-2027" }).count() === 1 && await p.evaluate(() => KP.base.devis) === true, "base avec 0038, encore vide : l'année vide, prête");
  ok(await p.locator(".ag h2", { hasText: "Sans devis" }).count() === 1 && NB(await p.inputValue("#bm-b0000000-0000-0000-0000-000000000009")) === "3 200", "l'ancien montant (Challenges, 3 200 €) reste visible dans « Sans devis »");
  // enveloppe
  await p.fill(".r-ea", "30000"); await p.keyboard.press("Enter"); await calme(p);
  ok(JSON.stringify((await F()).e) === JSON.stringify([{ annee: 2026, montant: 30000 }]), "l'enveloppe part dans la base");
  // devis + ligne + lien
  await p.click(".dv-vide [data-act=dv-new]"); await p.waitForSelector("dialog .dv-form");
  await p.fill("dialog [name=media]", "Challenges"); await p.fill("dialog [name=prog]", "PGE"); await p.click("dialog .btn.primary"); await p.waitForSelector("#fiche .dv-etats");
  await p.click("[data-act=dv-ligne-add]"); await p.waitForSelector("dialog .dv-form [name=t]");
  await p.fill("dialog [name=t]", "Interview"); await p.fill("dialog [name=m]", "3000"); await p.click("dialog .btn.primary"); await p.waitForTimeout(60);
  await p.click("#fiche [data-act=dv-lier]"); await p.waitForSelector(".pop-dv input");
  const chal = "b0000000-0000-0000-0000-000000000009";
  await p.click(`.pop-dv [data-i="${chal}"]`); await p.keyboard.press("Escape");
  await p.click('#fiche [data-act=dv-etat][data-k="signe"]'); await calme(p);
  let f = await F();
  ok(f.d.length === 1 && f.d[0].media === "Challenges" && f.d[0].programme === "PGE" && f.d[0].annee === 2026 && f.d[0].etat === "signe" && f.d[0].recu === "2026-11-23", "le devis part dans la base : " + JSON.stringify(f.d[0]));
  ok(f.l.length === 1 && f.l[0].devis === f.d[0].id && f.l[0].montant === 3000 && f.l[0].rang === 1 && f.l[0].qte === 1 && f.l[0].offert === false, "sa ligne aussi");
  ok(JSON.stringify(f.k) === JSON.stringify([{ ligne: f.l[0].id, item: chal }]), "et le lien à l'action");
  ok(await p.locator(".ag h2", { hasText: "Sans devis" }).count() === 0, "Challenges payé par le devis : il quitte « Sans devis »");
  // le PDF : rangé dans le dossier « devis »
  await p.setInputFiles("#fiche .dv-file", PDF); await calme(p);
  f = await F();
  const chemin = f.d[0].pdf;
  ok(chemin.startsWith(f.d[0].id + "/") && chemin.endsWith("-Devis-Figaro-signe.pdf") && f.d[0].pdf_nom === "Devis Figaro signé.pdf" && f.f[chemin], "le PDF est rangé dans l'appli : " + chemin);
  ok(await toast(p) === "PDF rangé dans l'appli", "« PDF rangé dans l'appli »");
  const [pop] = await Promise.all([p.waitForEvent("popup"), p.click("#fiche [data-act=dv-pdf]")]);
  await pop.waitForURL(/faux\.supabase\.co/, { timeout: 5000 }).catch(() => {});
  ok(/^https:\/\/faux\.supabase\.co\/storage\/v1\/object\/sign\/devis\/.+token=/.test(pop.url()), "Ouvrir : un lien signé, valable quelques minutes");
  await pop.close();
  // relu depuis la base
  await p.evaluate(() => sessionStorage.setItem("fake-db", JSON.stringify(window.__fake.db)));
  await p.reload(); await p.waitForFunction(() => window.KP && KP.store && KP.store.devisTous().length === 1);
  const relu = await p.evaluate(() => KP.store.devisTous()[0]);
  ok(relu.media === "Challenges" && relu.etat === "signe" && relu.pdfNom === "Devis Figaro signé.pdf" && relu.lignes.length === 1 && relu.lignes[0].items[0] === chal && await p.evaluate(() => KP.store.envAn(2026)) === 30000, "relu depuis la base : devis, ligne, lien, PDF, enveloppe");
  // supprimer la ligne : le lien part ; supprimer le devis : le PDF part aussi
  await voir(p, "#/resultats/budget?fiche=devis-" + relu.id); await p.waitForSelector("#fiche .dv-l");
  await p.click("#fiche [data-act=dv-ligne]"); await p.waitForSelector("dialog .dv-sup"); await p.click("dialog .dv-sup"); await calme(p);
  f = await F();
  ok(!f.l.length && !f.k.length, "ligne supprimée : elle part de la base avec son lien");
  await p.click("#fiche [data-act=dv-more]"); await p.click('.pop [data-v="sup"]'); await p.waitForSelector("dialog .danger-bg"); await p.click("dialog .danger-bg"); await calme(p);
  f = await F();
  ok(!f.d.length && !Object.keys(f.f).length && f.c.some((c) => c.op === "remove" && c.chemins[0] === chemin), "devis supprimé : la base et le dossier des PDF sont vidés");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- branché : un service ne lit rien ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" }, { email: "reseaux@example.com", hash: "#/resultats/budget" });
  ok(!(await p.locator("[data-act=rtab]").count()) && !(await p.locator(".dv-tot").count()), "Stéphane branché : pas d'onglet Budget");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- branché : base sans le script 0038 ---------- */
{
  const avant = fake.replace("absentes: [], fichiers", 'absentes: ["devis", "devis_lignes", "devis_liens", "enveloppes_annee"], fichiers');
  const [ctx, p] = await ouvrir({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" }, { email: "pilote@example.com", hash: "#/resultats/budget", body: avant });
  ok(await p.evaluate(() => KP.base.devis) === false && await p.locator(".r-card").count() === 5 && !(await p.locator(".dv-tot").count()), "sans 0038 : l'ancien onglet par période reste en place");
  ok((await txt(p, ".dv-avis")).includes("colle 2.9_0038"), "et il dit quoi coller : " + await txt(p, ".dv-avis"));
  const enc = "b0000000-0000-0000-0000-000000000009";
  await p.evaluate((id) => KP.go({ fiche: id }), enc); await p.waitForSelector("#fiche:not([hidden])");
  ok(await p.locator('#fiche [data-act="r-prix"]').count() === 1, "la fiche garde son montant à l'ancienne");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

await b.close();
console.log(bad ? `${bad} échec(s)` : "Budget par devis : tout est bon");
process.exit(bad ? 1 : 0);
