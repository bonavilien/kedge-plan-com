// Vérifie la fonction « export » sans réseau : faux Asana, faux Trello, fausse base.
// Usage : node --experimental-strip-types test/maj/export.mjs
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert/strict";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kplan-export-"));
const f = path.join(tmp, "index.mts");
fs.copyFileSync(path.join(ROOT, "supabase/functions/export/index.ts"), f);
const { createHandler, description, lienApp } = await import(pathToFileURL(f));

let ok = 0;
const check = (c, m) => { assert.ok(c, m); ok++; };

/* faux outils : ils notent chaque appel et gardent leurs tâches */
function outils() {
  const calls = [], taches = {}, cartes = {};
  let n = 0;
  const res = (status, body) => new Response(body == null ? "" : JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url), m = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, m, p: u.pathname, body, q: Object.fromEntries(u.searchParams), auth: init.headers.authorization });
    if (u.host === "app.asana.com") {
      if (init.headers.authorization !== "Bearer pat-ok") return res(401, { errors: [{ message: "Not Authorized" }] });
      if (u.pathname === "/api/1.0/workspaces") return res(200, { data: [{ gid: "w1", name: "KEDGE" }] });
      if (u.pathname === "/api/1.0/projects") return res(200, { data: [{ gid: "p1", name: "Plan de com" }, { gid: "p2", name: "Événements" }] });
      if (u.pathname === "/api/1.0/tasks" && m === "POST") { const gid = "t" + ++n; taches[gid] = body.data; return res(201, { data: { gid, permalink_url: "https://app.asana.com/0/p1/" + gid } }); }
      const t = /^\/api\/1\.0\/tasks\/(\w+)$/.exec(u.pathname);
      if (t && !taches[t[1]]) return res(404, { errors: [{ message: "Not found" }] });
      if (t && m === "PUT") { Object.assign(taches[t[1]], body.data); return res(200, { data: { gid: t[1], permalink_url: "https://app.asana.com/0/p1/" + t[1] } }); }
      if (t && m === "DELETE") { delete taches[t[1]]; return res(200, { data: {} }); }
    }
    if (u.host === "api.trello.com") {
      if (u.searchParams.get("key") !== "k" || u.searchParams.get("token") !== "tok") return res(401, "invalid key");
      if (u.pathname === "/1/members/me/boards") return res(200, [{ id: "b1", name: "Com", lists: [{ id: "l1", name: "À faire" }, { id: "l2", name: "Fait" }] }]);
      if (u.pathname === "/1/cards" && m === "POST") { const id = "c" + ++n; cartes[id] = body; return res(200, { id, shortUrl: "https://trello.com/c/" + id }); }
      const c = /^\/1\/cards\/(\w+)$/.exec(u.pathname);
      if (c && !cartes[c[1]]) return res(404, "not found");
      if (c && m === "PUT") { Object.assign(cartes[c[1]], body); return res(200, { id: c[1], shortUrl: "https://trello.com/c/" + c[1] }); }
    }
    return res(404, { message: "?" });
  };
  return { fetch, calls, taches, cartes };
}

function monde() {
  const o = outils();
  const db = {
    outils: {}, exports: [],
    fiches: {
      a1: { id: "a1", kind: "action", t: "Post LinkedIn JPO", date: "2026-12-05", flou: "", svc: "rs", m: ["1"], st: "planifie", partner: null, lieu: "", note: "Avec la vidéo", service: "Réseaux sociaux", messages: ["Attractivité"], tf: "Journée portes ouvertes", docs: [{ nom: "Brief", url: "https://kedge.sharepoint.com/brief" }] },
      a2: { id: "a2", kind: "action", t: "Communiqué", date: "2026-12-10", flou: "", svc: "rp", m: [], st: "confirmer", partner: null, lieu: "", note: "", service: "Relations presse", messages: [], tf: "", docs: [] },
    },
  };
  const comptes = { pilote: { id: "u1", chef: true, svc: "", visiteur: false }, rs: { id: "u2", chef: false, svc: "rs", visiteur: false }, rp: { id: "u3", chef: false, svc: "rp", visiteur: false }, visiteur: { id: "u4", chef: false, svc: "", visiteur: true } };
  const handler = createHandler({
    env: (k) => ({ SUPABASE_URL: "https://ref.supabase.co" }[k] || ""),
    fetch: o.fetch,
    secret: () => "secret-1",
    qui: async (jwt) => comptes[jwt] || null,
    db: {
      reglages: async () => Object.values(db.outils),
      reglage: async (k) => db.outils[k] || null,
      relier: async (r) => { db.outils[r.outil] = r; },
      delier: async (k) => { delete db.outils[k]; db.exports = db.exports.filter((e) => e.outil !== k); },
      fiche: async (id) => db.fiches[id] ? structuredClone(db.fiches[id]) : null,
      exports: async (item) => db.exports.filter((e) => e.item === item),
      noter: async (e) => { db.exports = [...db.exports.filter((x) => !(x.item === e.item && x.outil === e.outil)), { ...e }]; },
      oublier: async (item, k) => { db.exports = db.exports.filter((e) => !(e.item === item && e.outil === k)); },
    },
  });
  const appel = async (corps, qui, secret) => {
    const headers = { "content-type": "application/json" };
    if (qui) headers.authorization = "Bearer " + qui;
    if (secret) headers["x-export-secret"] = secret;
    const r = await handler(new Request("https://ref.supabase.co/functions/v1/export", { method: "POST", headers, body: JSON.stringify(corps) }));
    return { status: r.status, o: await r.json() };
  };
  return { o, db, appel };
}

/* description et lien de retour */
const w0 = monde();
const desc = description(w0.db.fiches.a1, { site: "https://bonavilien.github.io/kedge-plan-com/#/plan", app: "Road to 7th" });
check(desc.includes("Service : Réseaux sociaux") && desc.includes("Messages : Attractivité") && desc.includes("État : Prévu") && desc.includes("Temps fort : Journée portes ouvertes"), "la description reprend la fiche");
check(desc.includes("- Brief : https://kedge.sharepoint.com/brief") && desc.endsWith("Ouvrir dans Road to 7th : https://bonavilien.github.io/kedge-plan-com/#item=a1"), "documents et lien vers la fiche");
check(lienApp("https://x.io/app", "z") === "https://x.io/app/#item=z", "lien sans barre finale");
check(description(w0.db.fiches.a1, { site: "", app: "" }, true).includes("**Service** : Réseaux sociaux"), "Trello en markdown");

/* connexion et droits */
{
  const w = monde();
  check((await w.appel({ action: "etat" })).status === 401, "sans compte : refusé");
  check((await w.appel({ action: "lister", outil: "asana", jeton: "pat-ok" }, "rs")).status === 403, "un service ne relie pas");
  const l = await w.appel({ action: "lister", outil: "asana", jeton: "pat-ok" }, "pilote");
  check(l.status === 200 && l.o.choix.length === 2 && l.o.choix[0].nom === "KEDGE · Plan de com", "projets Asana proposés");
  const faux = await w.appel({ action: "lister", outil: "asana", jeton: "pat-faux" }, "pilote");
  check(faux.status === 502 && faux.o.erreur === "jeton" && /Asana refuse la clé/.test(faux.o.message), "clé Asana fausse : message clair");
  check((await w.appel({ action: "lister", outil: "trello", jeton: "k" }, "pilote")).o.erreur === "jeton", "Trello : il faut clé et jeton");
  const tl = await w.appel({ action: "lister", outil: "trello", jeton: "k:tok" }, "pilote");
  check(tl.o.choix.map((x) => x.nom).join("|") === "Com · À faire|Com · Fait", "listes Trello proposées");
  check((await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "zz" }, "pilote")).o.erreur === "cible", "destination inconnue refusée");
}

/* relier, envoyer, synchroniser, supprimer : Asana */
{
  const w = monde();
  const r = await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "p1", site: "https://site.io/app/", app: "Road to 7th" }, "pilote");
  check(r.status === 200 && r.o.cible_nom === "KEDGE · Plan de com", "Asana relié");
  const reg = w.db.outils.asana;
  check(reg.jeton === "pat-ok" && reg.secret === "secret-1" && reg.adresse === "https://ref.supabase.co/functions/v1/export" && reg.par === "u1", "clé, secret et adresse rangés");
  const etat = await w.appel({ action: "etat" }, "rs");
  check(JSON.stringify(etat.o.outils) === JSON.stringify([{ outil: "asana", cible_nom: "KEDGE · Plan de com" }]) && !JSON.stringify(etat.o).includes("pat-ok"), "l'état ne montre jamais la clé");
  /* garder la clé en changeant de projet : jeton vide */
  await w.appel({ action: "relier", outil: "asana", jeton: "", cible: "p2" }, "pilote");
  check(w.db.outils.asana.jeton === "pat-ok" && w.db.outils.asana.cible === "p2" && w.db.outils.asana.secret === "secret-1", "changer de projet sans recoller la clé");
  await w.appel({ action: "relier", outil: "asana", jeton: "", cible: "p1", site: "https://site.io/app/", app: "Road to 7th" }, "pilote");

  check((await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "rp")).status === 403, "un autre service ne peut pas envoyer la fiche");
  check((await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "visiteur")).status === 403, "un visiteur non plus");
  const e = await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "rs");
  check(e.status === 200 && e.o.ext_id === "t1" && e.o.url === "https://app.asana.com/0/p1/t1", "tâche créée par le service de la fiche");
  const t = w.o.taches.t1;
  check(t.name === "Post LinkedIn JPO" && t.due_on === "2026-12-05" && t.completed === false && t.projects[0] === "p1" && t.notes.includes("#item=a1"), "tâche : titre, échéance, projet, lien");
  check(w.db.exports.length === 1 && w.db.exports[0].ext_id === "t1", "export noté dans la base");

  /* la base prévient : mauvais secret, puis le bon */
  check((await w.appel({ item: "a1" }, null, "faux")).status === 401, "secret faux refusé");
  w.db.fiches.a1.t = "Post LinkedIn JPO, version courte"; w.db.fiches.a1.date = "2026-12-06"; w.db.fiches.a1.st = "diffuse";
  const s = await w.appel({ item: "a1" }, null, "secret-1");
  check(s.o.fait.join() === "asana" && w.o.taches.t1.name === "Post LinkedIn JPO, version courte" && w.o.taches.t1.due_on === "2026-12-06" && w.o.taches.t1.completed === true && w.o.taches.t1.notes.includes("État : Diffusé"), "fiche modifiée : tâche réécrite, cochée quand diffusée");
  w.db.fiches.a1.st = "retire"; w.db.fiches.a1.annule_motif = "Budget";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(w.o.taches.t1.name.startsWith("Annulé · ") && w.o.taches.t1.notes.startsWith("Annulé : Budget"), "annulée : marquée dans Asana");
  check((await w.appel({ item: "a2" }, null, "secret-1")).o.fait.length === 0, "fiche jamais envoyée : rien");

  /* envoyer deux fois ne crée pas de doublon */
  const nAvant = Object.keys(w.o.taches).length;
  await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "pilote");
  check(Object.keys(w.o.taches).length === nAvant, "renvoyer met à jour, sans doublon");

  /* tâche effacée dans Asana : la fiche n'est plus suivie, et on peut la renvoyer */
  delete w.o.taches.t1;
  await w.appel({ item: "a1" }, null, "secret-1");
  check(w.db.exports.length === 0, "tâche effacée dans Asana : plus suivie");
  const e2 = await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "pilote");
  check(e2.o.ext_id === "t2", "renvoyée : nouvelle tâche");

  /* panne d'Asana : notée sur la ligne */
  w.db.outils.asana.jeton = "pat-expire";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(/Asana refuse la clé/.test(w.db.exports[0].erreur), "clé expirée : l'erreur est notée sur la fiche");
  w.db.outils.asana.jeton = "pat-ok";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(w.db.exports[0].erreur === "", "erreur effacée au passage suivant");

  /* suppression */
  await w.appel({ supprimer: [{ outil: "asana", ext_id: "t2" }] }, null, "secret-1");
  check(!w.o.taches.t2, "fiche supprimée : tâche à la corbeille d'Asana");

  /* arrêter, délier */
  await w.appel({ action: "envoyer", outil: "asana", item: "a2" }, "pilote");
  check((await w.appel({ action: "arreter", outil: "asana", item: "a2" }, "rs")).status === 403, "arrêter : mêmes droits que modifier");
  await w.appel({ action: "arreter", outil: "asana", item: "a2" }, "rp");
  check(!w.db.exports.some((x) => x.item === "a2"), "arrêter : plus suivie");
  await w.appel({ action: "delier", outil: "asana" }, "pilote");
  check(!w.db.outils.asana, "délié");
  check((await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "pilote")).o.erreur === "outil", "pas relié : envoyer refusé");
}

/* Trello */
{
  const w = monde();
  await w.appel({ action: "relier", outil: "trello", jeton: "k:tok", cible: "l1", site: "https://site.io/app", app: "Road to 7th" }, "pilote");
  check(w.db.outils.trello.cible_nom === "Com · À faire", "Trello relié");
  const e = await w.appel({ action: "envoyer", outil: "trello", item: "a2" }, "pilote");
  const c = w.o.cartes[e.o.ext_id];
  check(e.o.url.startsWith("https://trello.com/c/") && c.idList === "l1" && c.name === "Communiqué" && c.due.startsWith("2026-12-10") && c.desc.includes("**Service** : Relations presse"), "carte créée dans la liste");
  w.db.fiches.a2.st = "diffuse";
  await w.appel({ item: "a2" }, null, "secret-1");
  check(c.dueComplete === true && c.closed === false, "diffusée : échéance cochée");
  w.db.fiches.a2.st = "retire";
  await w.appel({ item: "a2" }, null, "secret-1");
  check(c.closed === true, "annulée : carte archivée");
  w.db.fiches.a2.st = "planifie";
  await w.appel({ item: "a2" }, null, "secret-1");
  check(c.closed === false && c.dueComplete === false, "rétablie : carte ressortie");
  await w.appel({ supprimer: [{ outil: "trello", ext_id: e.o.ext_id }] }, null, "secret-1");
  check(c.closed === true, "supprimée : carte archivée");
  /* les deux outils reliés partagent le même secret */
  await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "p1" }, "pilote");
  check(w.db.outils.asana.secret === w.db.outils.trello.secret, "un seul secret pour les deux");
}

console.log(`fonction export : ${ok} vérifications passées`);
