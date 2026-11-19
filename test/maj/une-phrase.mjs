// « Demander en une phrase » sur la fiche : suggestions @ et #, surlignage, demande datée, pour info, rappel pour moi,
// décaler l'action, lien rangé dans les documents, réponse « c'est envoyé » ; puis ce qui part dans la base (fausse base).
// Aujourd'hui figé au jeudi 19 novembre 2026. Usage : (cd site && python3 -m http.server 8812) puis node test/maj/une-phrase.mjs [dossier des captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const shots = process.argv[2] || "";
if (shots) fs.mkdirSync(shots, { recursive: true });
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
const NOW = new Date("2026-11-19T10:00:00");

async function ouvrir(cfg, { theme = "light", email = "" } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", deviceScaleFactor: shots ? 2 : 1, colorScheme: theme, reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message)); p.on("console", (m) => m.type() === "error" && p.errs.push(m.text()));
  await p.clock.setFixedTime(NOW);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify(cfg)};` }));
  await p.goto(base);
  if (email) {
    await p.waitForSelector("#login form");
    await p.fill("#login [name=email]", email); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
    await p.waitForSelector("#login", { state: "detached" });
  }
  await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0);
  return [ctx, p];
}
const fiche = (p, t) => p.evaluate((t) => { const it = KP.store.items().find((x) => x.t === t); KP.go({ fiche: it.id }); return it.id; }, t).then(async (id) => { await p.waitForSelector("#ph-t"); return id; });
const ecrire = async (p, s) => { await p.fill("#ph-t", ""); await p.click("#ph-t"); await p.keyboard.type(s); await p.waitForTimeout(60); };
const apercu = (p) => p.$eval(".ph-apercu", (e) => e.innerText.replace(/\s*\n\s*/g, " | ").trim());
const marks = (p) => p.$$eval(".ph-miroir mark", (e) => e.map((x) => x.className.split(" ")[0] + ":" + x.textContent));
const reqs = (p, id) => p.evaluate((id) => KP.store.reqsOf(id).map((r) => ({ a: r.a, quoi: r.quoi, txt: r.txt, pour: r.pour, fait: r.fait, rep: r.rep })), id);
const cartes = (p) => p.$$eval(".ph-msg", (e) => e.map((x) => x.innerText.replace(/\s*\n\s*/g, " | ")));
const snap = (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, clip: { x: 900, y: 0, width: 540, height: 900 } });

/* ---------- démo ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: false });
  const id = await fiche(p, "Teaser de la journée");   // vendredi 27 novembre
  ok(!(await p.locator("text=Demander des éléments").count()), "le bouton « Demander des éléments » a laissé place à la ligne");

  // @ puis des lettres : la suggestion, choisie avec Entrée
  await ecrire(p, "@Est");
  ok(JSON.stringify(await p.$$eval(".ph-s", (e) => e.map((x) => x.textContent))) === JSON.stringify(["@Estelle"]), "@Est propose seulement @Estelle");
  await p.keyboard.press("Enter");
  ok(await p.inputValue("#ph-t") === "@Estelle ", "Entrée choisit la suggestion");
  await p.keyboard.type("tu peux m'envoyer des visuels pour vendredi dans 2 semaines ?"); await p.waitForTimeout(60);
  ok(JSON.stringify(await marks(p)) === JSON.stringify(["z-qui:@Estelle", "z-date:vendredi dans 2 semaines"]), "surlignés : @Estelle et « vendredi dans 2 semaines »");
  ok(await apercu(p) === "Estelle | pour le ven. 4 déc. | après la diffusion du ven. 27 nov.", "compris : Estelle, pour le ven. 4 déc., et l'alerte : " + await apercu(p));
  ok(await p.$eval(".ph-miroir .z-date", (e) => e.classList.contains("alerte")), "la date après la diffusion est surlignée en rouge");
  ok(await p.evaluate(() => { const t = document.querySelector("#ph-t"), m = document.querySelector(".ph-miroir"); return Math.abs(t.offsetHeight - m.offsetHeight) <= 1 && Math.abs(t.offsetWidth - m.offsetWidth) <= 1; }), "le surlignage est calé sur le texte (même boîte)");
  await snap(p, "1-demande");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  let rs = await reqs(p, id);
  ok(rs.some((r) => r.a === "estelle" && r.quoi === "Visuels" && r.pour === "2026-12-04" && r.txt === "Tu peux m'envoyer des visuels pour vendredi dans 2 semaines ?"), "envoyé : une demande à Estelle, Visuels, pour le 4 décembre");
  ok((await p.evaluate(() => document.querySelector(".toast").innerText)).includes("Estelle reçoit une notification, puis un rappel la veille"), "le message dit la notification et le rappel la veille");
  ok(await p.inputValue("#ph-t") === "", "la ligne se vide après l'envoi");
  ok((await cartes(p)).some((c) => c.startsWith("Estelle | pour le ven. 4 déc.")), "la demande apparaît dans le fil, avec sa date");

  // une date qu'on ne voulait pas : un clic sur la pastille, et la phrase part pour info
  await ecrire(p, "@Estelle les visuels demain");
  await p.click("[data-act=ph-nodate]");
  ok((await apercu(p)).startsWith("Estelle | pour info"), "date retirée : pour info");
  ok(!(await p.$(".ph-miroir .z-date")), "la date n'est plus surlignée");
  await p.click("[data-act=ph-send]"); await p.waitForTimeout(80);
  rs = await reqs(p, id);
  ok(rs.some((r) => r.txt === "Les visuels demain" && r.pour === ""), "envoyé pour info, sans date");
  ok((await cartes(p)).some((c) => c.includes("pour info") && c.includes("Les visuels demain")), "dans le fil : la pastille « pour info »");

  // pour info, puis une échéance choisie aux boutons (J-7 et Demain tombent le même jour : un seul bouton)
  await ecrire(p, "@Aurélie @RP le teaser est validé");
  ok(await apercu(p) === "Aurélie | RP | pour info", "deux personnes, pour info");
  await p.click("[data-act=ph-dates]");
  ok(await apercu(p) === "Aurélie | RP | pour info | J-7 · ven. 20 nov. | J-3 · mar. 24 nov.", "les échéances proposées, sans doublon : " + await apercu(p));
  await p.click("[data-act=ph-quick] >> text=J-3");
  ok((await apercu(p)).includes("pour le mar. 24 nov."), "J-3 choisi : pour le mar. 24 nov.");
  await snap(p, "2-info");
  await p.click("[data-act=ph-send]"); await p.waitForTimeout(80);
  rs = await reqs(p, id);
  ok(rs.filter((r) => r.txt === "Le teaser est validé" && r.pour === "2026-11-24").map((r) => r.a).sort().join() === "aurelie,rp", "une demande à chacun, pour le 24 novembre");
  ok((await p.evaluate(() => document.querySelector(".toast").innerText)).startsWith("Aurélie et RP reçoivent"), "le message nomme les deux");

  // rappel pour moi
  await ecrire(p, "rappelle-moi lundi de relancer Aurélie");
  ok(await apercu(p) === "Rappel pour moi · lun. 23 nov.", "rappel pour moi, lundi 23");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok((await p.$$eval(".memo", (e) => e.map((x) => x.innerText.replace(/\s*\n\s*/g, " | ")))).some((m) => m.startsWith("Relancer Aurélie")), "le rappel « Relancer Aurélie » est noté sur la fiche");

  // décaler l'action, puis prévenir RS
  await ecrire(p, "@RS on décale au 4 décembre");
  ok((await apercu(p)) === "RS | pour info | Déplacer l'action au ven. 4 déc.", "décaler : proposé, et le message part pour info : " + await apercu(p));
  await snap(p, "3-decaler");
  await p.click("[data-act=ph-decaler]"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.get(id).date, id) === "2026-12-04", "l'action est déplacée au 4 décembre");
  ok(await p.inputValue("#ph-t") === "@RS on décale au 4 décembre", "la phrase reste là, prête à partir");
  ok(!(await p.$("[data-act=ph-decaler]")), "plus rien à déplacer");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok((await reqs(p, id)).some((r) => r.a === "rs" && r.pour === "" && r.txt === "On décale au 4 décembre"), "RS est prévenu pour info");

  // un lien SharePoint : rangé dans les documents (ou pas, au choix)
  await ecrire(p, "@RS le storyboard https://kedgebs.sharepoint.com/sites/com/Storyboard_teaser.pptx");
  ok((await p.getAttribute("[data-act=ph-doc]", "aria-pressed")) === "true", "« Ranger le lien dans les documents » est proposé, coché");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(await p.evaluate((id) => KP.store.get(id).docs.some((d) => d.t === "Storyboard teaser" && d.url.endsWith("Storyboard_teaser.pptx")), id), "le lien est rangé dans les documents, avec un nom tiré du fichier");
  await ecrire(p, "@RS le montage https://kedgebs.sharepoint.com/sites/com/Montage.mp4");
  await p.click("[data-act=ph-doc]");
  ok((await p.getAttribute("[data-act=ph-doc]", "aria-pressed")) === "false", "décoché d'un clic");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  ok(!(await p.evaluate((id) => KP.store.get(id).docs.some((d) => d.url.endsWith("Montage.mp4")), id)), "décoché : le lien n'est pas rangé");
  ok((await p.$$eval(".ph-msg a.link", (e) => e.map((a) => a.href))).some((u) => u.endsWith("Montage.mp4")), "le lien s'ouvre depuis le message");

  // # et le début d'un titre : l'action, puis un lien vers sa fiche
  await ecrire(p, "@RS comme pour #jour");
  ok((await p.$$eval(".ph-s", (e) => e.map((x) => x.textContent))).some((t) => t.startsWith("Journée portes ouvertes")), "#jour propose « Journée portes ouvertes »");
  await p.keyboard.press("Tab");
  ok(await p.inputValue("#ph-t") === "@RS comme pour #Journée portes ouvertes ", "Tab choisit l'action");
  ok((await marks(p)).includes("z-ref:#Journée portes ouvertes"), "l'action citée est soulignée");
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  const jpo = await p.evaluate(() => KP.store.items().find((x) => x.t === "Journée portes ouvertes").id);
  ok(await p.$(`.ph-msg button[data-act=open][data-id="${jpo}"]`) !== null, "dans le fil, #Journée portes ouvertes ouvre sa fiche");

  // rien sans @
  await ecrire(p, "les visuels pour demain");
  ok(await p.$eval(".ph-go", (b) => b.disabled) && (await apercu(p)).includes("Tape @ pour choisir à qui"), "sans @ : on ne peut pas envoyer, et l'appli dit pourquoi");

  // répondre « c'est envoyé » : la demande d'Aurélie passe au vert
  await p.click(`.ph-msg button[data-act=open][data-id="${jpo}"]`); await p.waitForTimeout(80);
  const avant = (await reqs(p, jpo)).find((r) => r.a === "julien" && !r.fait);
  await ecrire(p, "@Aurélie c'est envoyé, le programme est dans le SharePoint");
  ok((await apercu(p)).includes("Répond à Aurélie · Programme"), "« c'est envoyé » : répond à la demande d'Aurélie : " + await apercu(p));
  await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  const apres = (await reqs(p, jpo)).find((r) => r.txt === avant.txt);
  ok(apres.fait && apres.rep === "C'est envoyé, le programme est dans le SharePoint", "la demande est reçue, avec la réponse");

  // l'ancien raccourci « Demander » : le curseur dans la ligne, avec un @
  await p.evaluate(() => KP.acts.ask()); await p.waitForTimeout(80);
  ok(await p.evaluate(() => document.activeElement.id) === "ph-t" && await p.inputValue("#ph-t") === "@", "« Demander » met le curseur dans la ligne, après un @");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

/* ---------- sombre : lisible ---------- */
if (shots) {
  const [ctx, p] = await ouvrir({ brancher: false }, { theme: "dark" });
  await fiche(p, "Teaser de la journée");
  await ecrire(p, "@Estelle les visuels pour mardi en huit");
  await snap(p, "4-sombre");
  await ctx.close();
}

/* ---------- branché (fausse base) : ce qui part dans la base ---------- */
{
  const [ctx, p] = await ouvrir({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" }, { email: "pilote@example.com" });
  await fiche(p, "Teaser de la journée");
  await ecrire(p, "@Aurélie le teaser est validé"); await p.keyboard.press("Enter");
  await ecrire(p, "@RS les visuels pour le 5 décembre"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.documentElement.classList.contains("saving")); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => JSON.parse(JSON.stringify(window.__fake.db.reqs)));
  const info = rows.find((r) => r.quoi === "Le teaser est validé"), dem = rows.find((r) => r.quoi === "Les visuels pour le 5 décembre");
  ok(info && info.pour === null && info.type === "Info" && info.dest === "22222222-0000-0000-0000-000000000002".replace(/.*/, info.dest) && info.st === "ouverte", "pour info : sans date, type Info, dans la base");
  ok(dem && dem.pour === "2026-12-05" && dem.type === "Visuels" && dem.dest === "rs", "demande : pour le 5 décembre, Visuels, au service RS");
  await ctx.close();
}
/* relu depuis la base : une info sans date et une demande datée, posées dans la base avant la connexion */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.clock.setFixedTime(NOW);
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify({ brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux" })};` }));
  await p.goto(base); await p.waitForSelector("#login form");
  await p.evaluate(() => { const db = window.__fake.db, it = db.items.find((x) => x.t === "Teaser de la journée"), now = new Date().toISOString();
    db.reqs.push({ id: crypto.randomUUID(), item: it.id, asker: db.profiles[1].id, dest: db.profiles[0].id, type: "Info", quoi: "Le teaser est validé", pour: null, st: "ouverte", at: now, reponse: "" },
      { id: crypto.randomUUID(), item: it.id, asker: db.profiles[0].id, dest: "rs", type: "Visuels", quoi: "Les visuels pour le 5 décembre", pour: "2026-12-05", st: "ouverte", at: now, reponse: "" }); });
  await p.fill("#login [name=email]", "pilote@example.com"); await p.fill("#login [name=password]", "test"); await p.click("#login [type=submit]");
  await p.waitForSelector("#login", { state: "detached" }); await p.waitForFunction(() => window.KP && KP.store && KP.store.items().length > 0);
  await fiche(p, "Teaser de la journée");
  const c = await cartes(p);
  ok(c.some((x) => x.includes("pour info") && x.includes("Le teaser est validé")) && c.some((x) => x.includes("pour le sam. 5 déc.")), "relu depuis la base : la pastille « pour info » et la date : " + c.join(" // "));
  ok(!(await p.evaluate(() => KP.inbox().some((r) => r.txt === "Le teaser est validé"))), "une info n'attend pas de réponse : pas dans « À traiter »");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

await b.close();
console.log(bad ? `${bad} échec(s)` : "Demander en une phrase : tout est bon");
process.exit(bad ? 1 : 0);
