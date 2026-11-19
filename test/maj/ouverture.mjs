// Ouverture de l'appli (le 7 s'ouvre sur la connexion ou l'accueil) et nouvel écran de connexion (« Bonjour Prénom », œil, erreurs).
// Usage : (cd site && python3 -m http.server 8812) puis node test/maj/ouverture.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const base = process.env.SITE || "http://localhost:8812/index.html";
const fake = fs.readFileSync(new URL("../v2/fake-supabase.js", import.meta.url), "utf8");
const cfg = { brancher: true, supabaseUrl: "https://faux.supabase.co", supabaseKey: "faux", marque: { app: "Road to 7th", nom: "KEDGE", logo: "assets/road-to-7th.png", carre: true, symbole: "assets/road-to-7th-symbole.png" } };
const b = await chromium.launch(); let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };

async function ouvrir({ w = 1440, h = 900, motion = "no-preference", init = () => {}, arg = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", reducedMotion: motion });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message)); p.on("console", (m) => m.type() === "error" && p.errs.push(m.text()));
  await p.route("**/vendor/supabase-*.js", (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.KPLAN_CONFIG = ${JSON.stringify(cfg)};` }));
  await p.addInitScript(init, arg);
  await p.goto(base);
  return [ctx, p];
}
const enCours = (p) => p.evaluate(() => !!document.getElementById("ouverture") && document.documentElement.classList.contains("ouverture"));

// première visite : l'icône, puis le 7 s'ouvre sur la connexion ; l'étoile du fond attend l'ouverture
{
  const [ctx, p] = await ouvrir();
  ok(await enCours(p), "première visite : l'ouverture se joue");
  await p.waitForSelector("#login form");
  ok(await p.evaluate(() => document.querySelector(".login") && getComputedStyle(document.querySelector(".login-card")).animationPlayState === "paused"), "connexion en attente pendant l'ouverture");
  await p.waitForSelector("#ouverture", { state: "detached", timeout: 4000 });
  ok(!(await p.evaluate(() => document.documentElement.classList.contains("ouverture"))) && await p.evaluate(() => sessionStorage.getItem("kplan-ouvert")) === "1", "le 7 s'est ouvert puis a disparu, retenu pour la session");
  ok(await p.evaluate(() => getComputedStyle(document.querySelector(".login-card")).animationPlayState === "running"), "l'étoile du fond part après l'ouverture");
  await p.reload(); await p.waitForSelector("#login form");
  ok(!(await p.locator("#ouverture").count()), "rechargée dans la même session : pas de nouvelle ouverture");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

// appareil qui demande moins de mouvement : pas d'ouverture
{
  const [ctx, p] = await ouvrir({ motion: "reduce" });
  await p.waitForSelector("#login form");
  ok(!(await p.locator("#ouverture").count()) && !(await enCours(p)), "moins de mouvement : pas d'ouverture");
  await ctx.close();
}

// déjà connecté : le 7 s'ouvre sur l'accueil
{
  const [ctx, p] = await ouvrir({ init: () => sessionStorage.setItem("fake-session", JSON.stringify({ user: { id: "a0000000-0000-0000-0000-000000000001", email: "pilote@example.com" } })) });
  ok(await enCours(p), "déjà connecté : l'ouverture se joue");
  await p.waitForSelector("#ouverture", { state: "detached", timeout: 4000 });
  ok(!(await p.locator("#login").count()) && await p.evaluate(() => location.hash.startsWith("#/accueil")) && await p.locator("main, .app, #app").count() > 0, "le 7 s'ouvre sur l'accueil, sans écran de connexion");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

// première connexion : adresse et mot de passe, œil, erreurs, puis l'appli retient l'adresse et le prénom
{
  const [ctx, p] = await ouvrir({ init: () => sessionStorage.setItem("kplan-ouvert", "1") });
  await p.waitForSelector("#login form");
  ok(await p.textContent(".lc-tete h1") === "Road to 7th" && await p.isVisible("[name=email]") && !(await p.locator(".lc-moi").count()), "première fois : le nom de l'appli, l'adresse à taper");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.name === "email"), "première fois : le curseur est dans l'adresse");
  await p.click(".lc-go");
  ok(/adresse/i.test(await p.textContent(".login-err")) && await p.locator(".login-card.secoue").count() === 1, "adresse vide : message et secousse");
  await p.fill("[name=email]", "pilote@example.com"); await p.fill("[name=password]", "faux");
  ok(await p.getAttribute("[name=password]", "type") === "password", "mot de passe masqué au départ");
  await p.click("[data-oeil]");
  ok(await p.getAttribute("[name=password]", "type") === "text" && await p.getAttribute("[data-oeil]", "aria-pressed") === "true", "l'œil affiche le mot de passe");
  await p.click("[data-oeil]");
  ok(await p.getAttribute("[name=password]", "type") === "password", "l'œil le masque à nouveau");
  await p.click(".lc-go"); await p.waitForTimeout(100);
  ok(/incorrect/i.test(await p.textContent(".login-err")) && !(await p.isDisabled(".lc-go")), "mauvais mot de passe : message, on peut réessayer");
  await p.fill("[name=password]", "test"); await p.keyboard.press("Enter");
  await p.waitForSelector("#login", { state: "detached" });
  ok(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem("kplan-dernier")))) === JSON.stringify({ email: "pilote@example.com", prenom: "Julien" }), "connecté : l'adresse et le prénom sont retenus sur cet appareil");
  ok(!p.errs.length, "aucune erreur : " + p.errs.join(" | "));
  await ctx.close();
}

// au retour : « Bonjour Julien », l'adresse déjà là, seul le mot de passe à taper ; « Changer » rend l'adresse
{
  const [ctx, p] = await ouvrir({ init: () => { sessionStorage.setItem("kplan-ouvert", "1"); localStorage.setItem("kplan-dernier", JSON.stringify({ email: "pilote@example.com", prenom: "Julien" })); } });
  await p.waitForSelector("#login form");
  ok(await p.textContent(".lc-tete h1") === "Bonjour Julien" && await p.textContent(".lc-mail") === "pilote@example.com" && !(await p.isVisible("[name=email]")), "au retour : Bonjour Julien et son adresse");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.name === "password"), "au retour : le curseur est dans le mot de passe");
  await p.click("[data-autre]");
  ok(!(await p.locator(".lc-moi").count()) && await p.isVisible("[name=email]") && await p.inputValue("[name=email]") === "", "« Changer » : une autre adresse à taper");
  await p.fill("[name=email]", "presse@example.com"); await p.fill("[name=password]", "test"); await p.click(".lc-go");
  await p.waitForSelector("#login", { state: "detached" });
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem("kplan-dernier")).prenom) === "Aurélie", "l'appli retient la dernière personne connectée");
  await ctx.close();
}

// téléphone : rien ne dépasse, le bouton reste visible
for (const retour of [false, true]) {
  const [ctx, p] = await ouvrir({ w: 390, h: 844, init: (r) => { sessionStorage.setItem("kplan-ouvert", "1"); if (r) localStorage.setItem("kplan-dernier", JSON.stringify({ email: "pilote@example.com", prenom: "Julien" })); }, arg: retour });
  await p.waitForSelector("#login form"); await p.waitForTimeout(800);
  const box = await p.locator(".lc-go").boundingBox();
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && box && box.y + box.height <= 844, `téléphone${retour ? " (au retour)" : ""} : rien ne dépasse, le bouton Entrer est visible`);
  await ctx.close();
}

await b.close();
console.log(bad ? `Ouverture : ${bad} échec(s)` : "Ouverture : tout est bon");
process.exit(bad ? 1 : 0);
