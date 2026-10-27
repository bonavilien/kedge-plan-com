// Non-régression des corrections du 25 octobre 2026 (campagne de tests à plusieurs agents), sur le faux client,
// horloge figée à l'heure de Paris : copil, périodes, deadline des demandes, doublons, retrait, droits affichés.
// node test/ui/serve.mjs puis node test/ui/corrections.mjs <dossier des captures>
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const OUT = process.argv[2] || "/tmp", URL0 = "http://localhost:8790/test.html";
const b = await chromium.launch();
let fails = 0;
const errs = [];
const ok = (c, msg, extra = "") => { console.log(`${c ? "OK  " : "FAIL"} ${msg}${extra ? `  [${extra}]` : ""}`); if (!c) fails++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
let k = 0;
const it = (o) => ({ id: `50000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, kind: "action", flou: "", per: [], svc: "rp", cc: [], m: ["1"], st: "planifie", tf: null, partner: null, lieu: "", note: "", author: U(2), at: "2026-08-01T10:00:00.000Z", ...o });
const rq = (o) => ({ id: `51000000-0000-4000-8000-${String(++k).padStart(12, "0")}`, quoi: "", st: "ouverte", at: "2026-10-20T10:00:00.000Z", ...o });

async function open(now, { vp = { width: 390, height: 844 }, items = [], reqs = [], who = "julien", periods = null, patch = null } = {}) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, timezoneId: "Europe/Paris", locale: "fr-FR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date(now) });
  await p.goto(URL0); await p.evaluate(() => localStorage.clear()); await p.goto(URL0); await p.waitForSelector("#login");
  await p.evaluate(({ items, reqs, periods, patch }) => { const f = window.__fake; f.db.items.push(...items); f.db.reqs.push(...reqs);
    if (periods) f.db.periods = periods; if (patch) Object.assign(f.db.profiles.find((x) => x.nom === patch.nom), patch); f.save(); }, { items, reqs, periods, patch });
  await p.fill("#lg-mail", `${who}@kedgebs.com`); await p.fill("#lg-pw", "motdepasse"); await p.click("#login button");
  await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(300);
  return p;
}
const close = (p) => p.context().close();
const fake = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("kplan-fake")));
const tab = async (p, t) => { await p.$eval(`.tab[data-kui-tab="${t}"]`, (b) => b.click()); await p.waitForTimeout(250); };
const top = (p) => p.locator(".view.pushed").last();
const openItem = async (p, id) => { await p.evaluate((id) => { location.hash = "#item=" + id; }, id); await p.waitForTimeout(400); };

// ---------- copil : les périodes terminées gardent leur carte ; une année à la fois ----------
{
  const p = await open("2027-02-15T10:00:00+01:00", { vp: { width: 1440, height: 900 }, items: [it({ t: "CP rentrée", date: "2026-09-08", st: "diffuse" })] });
  await p.click('.side-btn[data-act="copil"]'); await p.waitForTimeout(300);
  const w = await p.evaluate(() => [...document.querySelectorAll(".cp-card")].map((c) => Math.round(c.getBoundingClientRect().width)));
  ok(w.length === 5 && w.every((x) => x > 150), "copil en février : cinq vraies cartes, terminées comprises", w.join(","));
  ok(/Terminée/.test(await p.locator(".cp-card").first().innerText()), "copil : Installer « Terminée »");
  await p.screenshot({ path: `${OUT}/cor-copil.png` });
  await close(p);
}
// ---------- Ma période : dernier jour, après l'année ----------
{
  const p = await open("2026-10-31T10:00:00+01:00");
  ok(/dernier jour/.test(await p.textContent("#v-periode .ph-t p")), "31 octobre : « dernier jour »", await p.textContent("#v-periode .ph-t p"));
  await close(p);
  const q = await open("2027-08-15T10:00:00+02:00");
  const h = await q.textContent("#v-periode .ph-t p");
  ok(/terminée/.test(h) && !/-\d/.test(h), "été 2027 : la dernière période est « terminée »", h);
  await close(q);
}
// ---------- minuit passé, appli ouverte : la période suit ----------
{
  const p = await open("2026-10-31T23:58:00+01:00");
  await p.clock.runFor(5 * 60e3); await p.waitForTimeout(300);
  ok(/Considérer/.test(await p.textContent("#v-periode .ph-title")), "après minuit sans recharger : Considérer", await p.textContent("#v-periode .ph-title"));
  await close(p);
}
// ---------- action du chef de projet : choix « Porté par », colonne sur ordinateur ----------
{
  const a = it({ t: "Tribune directeur", date: "2026-10-28", svc: "chef" });
  const p = await open("2026-10-25T10:00:00+01:00", { vp: { width: 1280, height: 900 }, items: [a] });
  ok(/Tribune directeur/.test(await p.textContent("#v-periode")), "ordinateur : une action du chef de projet est dans Ma période");
  await tab(p, "ajouter");
  const svcs = await p.$$eval("#f-svc .chip", (bs) => bs.map((x) => x.value));
  ok(svcs.includes("chef"), "« Porté par » propose le chef de projet", svcs.join(","));
  // « Incontournable » se choisit seul
  await p.click('#f-m .chip:has-text("Alumni")'); await p.click('#f-m .chip:has-text("Incontournable")'); await p.waitForTimeout(50);
  const on = await p.$$eval('#f-m .chip[aria-pressed="true"]', (bs) => bs.map((x) => x.value));
  ok(on.length === 1 && on[0] === "INC", "Incontournable remplace les messages", on.join(","));
  await close(p);
}
// ---------- fiche : temps fort retiré gardé, documents des relais, retrait annulable ----------
{
  const tf = it({ kind: "tf", t: "Forum entreprises", date: "2026-11-12", svc: "chef", m: [], st: "retire" });
  const a = it({ t: "Reel forum", date: "2026-11-10", svc: "rs", tf: tf.id });
  const p = await open("2026-10-25T10:00:00+01:00", { items: [tf, a], who: "stephane" });
  await p.evaluate(({ id }) => { const f = window.__fake; f.db.links.push({ id: crypto.randomUUID(), item: id, nom: "Script du reel", url: "https://kedgebs.sharepoint.com/s", author: "00000000-0000-0000-0000-000000000004", at: new Date().toISOString() }); f.save(); }, { id: a.id });
  await p.reload(); await p.waitForFunction(() => document.getElementById("brand").hidden);
  await openItem(p, a.id);
  // la note s'écrit sur la fiche (depuis le 27 octobre)
  await top(p).locator('[data-act="note"]').click(); await p.waitForTimeout(300);
  await p.fill(`#nt-${a.id}`, "Tournage le 5"); await top(p).locator('[data-act="note-ok"]').click(); await p.waitForTimeout(600);
  await p.click(".alert .acts button:first-child").catch(() => {});
  let db = await fake(p);
  ok(db.items.find((x) => x.id === a.id).tf === tf.id, "modifier une action liée à un temps fort retiré ne la détache pas");
  ok(db.journal.filter((j) => j.item === a.id && j.kind === "modif").every((j) => !("tf" in j.diff) && !("t" in j.diff)), "seuls les champs changés sont envoyés");
  await close(p);
  const q = await open("2026-10-25T10:00:00+01:00", { items: [tf, a] });
  await q.evaluate(({ id }) => { const f = window.__fake; f.db.links.push({ id: crypto.randomUUID(), item: id, nom: "Script du reel", url: "https://kedgebs.sharepoint.com/s", author: "00000000-0000-0000-0000-000000000004", at: new Date().toISOString() }); f.save(); }, { id: a.id });
  await q.reload(); await q.waitForFunction(() => document.getElementById("brand").hidden);
  await openItem(q, tf.id);
  ok(/Script du reel/.test(await top(q).innerText()), "le document d'un relais se voit sur son temps fort");
  ok(await top(q).locator('[data-act="unretire"]').count() === 1, "un chef peut remettre un temps fort retiré");
  await top(q).locator('[data-act="unretire"]').click(); await q.waitForTimeout(400);
  db = await fake(q);
  ok(db.items.find((x) => x.id === tf.id).st === "planifie", "temps fort remis : Planifié");
  await close(q);
}
// ---------- demandes d'éléments : deadline visible et modifiable, doublon refusé ----------
{
  const a = it({ t: "Live JPO", date: "2026-11-09", svc: "rs" });
  const r1 = rq({ item: a.id, asker: U(4), dest: "chef", type: "Visuels", pour: "2026-10-27" });
  const p = await open("2026-10-25T10:00:00+01:00", { items: [a], reqs: [r1], who: "stephane" });
  await openItem(p, a.id);
  const dl = await top(p).locator(".dl").first().innerText();
  ok(/Deadline 27 octobre · dans 2 jours/.test(dl) && (await top(p).locator(".dl.soon").count()) === 1, "deadline visible sur la fiche, en jaune à deux jours", dl);
  await top(p).locator('button.dl').click(); await p.waitForTimeout(300);
  await p.click("#pour-d"); await p.click('[data-cal-day="2026-10-30"]'); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
  let db = await fake(p);
  ok(db.reqs.find((x) => x.id === r1.id).pour === "2026-10-30", "la personne qui demande change la deadline");
  // même demande, même service, encore ouverte : refusée dans la feuille
  await top(p).locator('[data-act="ask"]').click(); await p.waitForTimeout(300);
  await p.click('#ask-type .chip:has-text("Visuels")'); await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(400);
  ok(/Déjà demandé à/.test(await p.textContent("#ask-err")) && (await fake(p)).reqs.length === 1, "même demande au même service : refusée");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  await close(p);
  // le service sollicité voit la deadline mais ne la change pas ; en retard : rouge
  const q = await open("2026-10-31T10:00:00+01:00", { items: [a], reqs: [{ ...r1, pour: "2026-10-30" }], who: "estelle" });
  await tab(q, "afaire");
  ok(/En retard · deadline 30 octobre/.test(await q.textContent("#v-afaire")) && (await q.locator("#v-afaire .dl.late").count()) === 1, "À faire : deadline dépassée en rouge");
  await close(q);
}
// ---------- rappels : pas de carte pour une date au mois, plus de carte une fois des éléments demandés ----------
{
  const m = it({ t: "Action de novembre", date: "2026-11-01", flou: "Nov.", svc: "rp" });
  const d = it({ t: "Interview", date: "2026-11-05", svc: "rp" });
  const p = await open("2026-10-25T10:00:00+01:00", { items: [m, d], who: "aurelie" });
  await tab(p, "afaire");
  let t = await p.textContent("#v-afaire");
  ok(!/Action de novembre/.test(t) && /Interview/.test(t), "rappel : rien pour une date au mois, J-15 pour l'interview");
  await openItem(p, d.id); await top(p).locator('[data-act="ask"]').click(); await p.waitForTimeout(300);
  await p.click('.sheet [data-kui="ok"]'); await p.waitForTimeout(500);
  await p.goto(URL0 + "#afaire"); await p.waitForFunction(() => document.getElementById("brand").hidden); await p.waitForTimeout(400);
  t = await p.textContent("#v-afaire");
  ok(!/Besoin d'éléments/.test(t), "éléments demandés depuis la fiche : plus de rappel");
  await close(p);
}
// ---------- droits affichés ----------
{
  const tf = it({ kind: "tf", t: "Journées portes ouvertes", date: "2026-11-28", svc: "chef", m: [] });
  const p = await open("2026-10-25T10:00:00+01:00", { items: [tf], who: "nouveau" });
  await openItem(p, tf.id);
  ok(!(await top(p).locator('[data-act="addlinked"], [data-act="addlink"]').count()), "lecture seule : ni « Ajouter une action liée » ni « Ajouter un lien »");
  await close(p);
  const q = await open("2026-10-25T10:00:00+01:00", { who: "estelle" });
  await q.evaluate(() => document.querySelector('[data-act="profil"]').click()); await q.waitForTimeout(300);
  await q.click('[data-act="team"]'); await q.waitForTimeout(300);
  await q.click(`[data-act="person"][data-id="${U(2)}"]`); await q.waitForTimeout(300);
  ok(await q.$eval("#pp-media", (x) => x.disabled), "Estelle ne peut pas se donner le droit « Partenariats média »");
  await close(q);
}
// ---------- un lien refusé après la publication : pas de doublon ----------
{
  const p = await open("2026-10-25T10:00:00+01:00", { who: "aurelie" });
  await tab(p, "ajouter");
  await p.fill("#f-t", "CP avec dossier"); await p.click('#f-m .chip:has-text("Alumni")');
  await p.click("#f-more summary"); await p.fill("#f-link", "https://kedgebs.sharepoint.com/dossier");
  await p.evaluate(() => { window.KStore.addLink = () => Promise.reject({ message: "Failed to fetch" }); });
  await p.click('[data-act="publish"]'); await p.waitForTimeout(800);
  ok(/publié, mais le lien/.test(await p.textContent(".snack")) && (await fake(p)).items.filter((x) => x.t === "CP avec dossier").length === 1, "lien refusé : l'action est publiée une fois, on le dit");
  await close(p);
}

// ---------- entre deux périodes : on reste sur celle qui vient de finir, ce qui arrive se voit ----------
{
  const per = [
    { n: 1, nom: "Installer", du: "2026-09-01", au: "2026-10-31", lib: "Sept. – oct. 2026" },
    { n: 2, nom: "Considérer", du: "2026-11-01", au: "2026-12-18", lib: "Nov. – mi-déc. 2026" },
    { n: 3, nom: "Préférer", du: "2027-01-04", au: "2027-03-31", lib: "Janv. – mars 2027" },
  ];
  const p = await open("2026-12-22T10:00:00+01:00", { periods: per, items: [it({ t: "Vœux vidéo", date: "2026-12-30", svc: "video" })] });
  ok(/Considérer/.test(await p.textContent("#v-periode .ph-title")) && /Vœux vidéo/.test(await p.textContent("#v-periode")), "dans un trou : Considérer, avec l'action du 30 décembre");
  await close(p);
}
// ---------- compte média sans service : il saisit des partenariats ----------
{
  const p = await open("2026-10-25T10:00:00+01:00", { who: "nouveau", patch: { nom: "Nouveau", media: true } });
  await tab(p, "ajouter");
  const kinds = await p.$$eval("#f-kind button", (bs) => bs.map((x) => x.value));
  ok(kinds.length === 1 && kinds[0] === "partner", "média sans service : Ajouter propose le partenariat seulement", kinds.join(","));
  await close(p);
}
ok(!errs.length, "pas d'erreur JS", errs.join(" | "));
await b.close();
console.log(fails ? `${fails} échec(s)` : "Corrections : tout est bon");
process.exit(fails ? 1 : 0);
