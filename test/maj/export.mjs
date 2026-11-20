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
      /* 250 projets, par pages de 100, les plus anciens d'abord : « Plan de com » et « Événements » sont les plus récents */
      if (u.pathname === "/api/1.0/projects") { const tous = [...Array.from({ length: 248 }, (_, i) => ({ gid: "v" + i, name: "Ancien " + i })), { gid: "p1", name: "Plan de com" }, { gid: "p2", name: "Événements" }];
        const o = +(u.searchParams.get("offset") || 0), page = tous.slice(o, o + 100); return res(200, { data: page, next_page: o + 100 < tous.length ? { offset: String(o + 100) } : null }); }
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
    outils: {}, conf: null, exports: [],
    fiches: {
      a1: { id: "a1", kind: "action", t: "Post LinkedIn JPO", date: "2026-12-05", flou: "", svc: "rs", m: ["1"], st: "planifie", partner: null, lieu: "", note: "Avec la vidéo", service: "Réseaux sociaux", messages: ["Attractivité"], tf: "Journée portes ouvertes", docs: [{ nom: "Brief", url: "https://kedge.sharepoint.com/brief" }] },
      a2: { id: "a2", kind: "action", t: "Communiqué", date: "2026-12-10", flou: "", svc: "rp", m: [], st: "confirmer", partner: null, lieu: "", note: "", service: "Relations presse", messages: [], tf: "", docs: [] },
    },
  };
  const comptes = { julien: { id: "u1", chef: true, svc: "", visiteur: false }, stephane: { id: "u2", chef: false, svc: "rs", visiteur: false }, louise: { id: "u3", chef: false, svc: "rp", visiteur: false }, visiteur: { id: "u4", chef: false, svc: "", visiteur: true } };
  const K = (u, k) => u + ":" + k;
  const handler = createHandler({
    env: (k) => ({ SUPABASE_URL: "https://ref.supabase.co" }[k] || ""),
    fetch: o.fetch,
    secret: () => "secret-1",
    qui: async (jwt) => comptes[jwt] || null,
    db: {
      reglages: async (u) => Object.values(db.outils).filter((r) => r.user_id === u),
      reglage: async (u, k) => db.outils[K(u, k)] || null,
      relier: async (r) => { db.outils[K(r.user_id, r.outil)] = r; },
      delier: async (u, k) => { delete db.outils[K(u, k)]; db.exports = db.exports.filter((e) => !(e.user_id === u && e.outil === k)); },
      conf: async () => db.conf,
      ecrireConf: async (c) => { db.conf = c; },
      fiche: async (id) => db.fiches[id] ? structuredClone(db.fiches[id]) : null,
      exports: async (item) => db.exports.filter((e) => e.item === item),
      noter: async (e) => { db.exports = [...db.exports.filter((x) => !(x.item === e.item && x.user_id === e.user_id && x.outil === e.outil)), { ...e }]; },
      oublier: async (item, u, k) => { db.exports = db.exports.filter((e) => !(e.item === item && e.user_id === u && e.outil === k)); },
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
  check((await w.appel({ action: "lister", outil: "asana", jeton: "pat-ok" }, "visiteur")).status === 403, "lecture seule : pas d'outil");
  const l = await w.appel({ action: "lister", outil: "asana", jeton: "pat-ok" }, "stephane");
  check(l.status === 200 && l.o.choix.length === 250 && l.o.choix.some((c) => c.nom === "KEDGE · Plan de com") && l.o.choix.some((c) => c.nom === "KEDGE · Événements"), "Asana : tous les projets, même au-delà des 100 premiers");
  check(l.o.choix[0].nom === "KEDGE · Ancien 0" && l.o.choix[2].nom === "KEDGE · Ancien 2" && l.o.choix.at(-1).nom === "KEDGE · Plan de com", "Asana : projets rangés par nom");
  const faux = await w.appel({ action: "lister", outil: "asana", jeton: "pat-faux" }, "stephane");
  check(faux.status === 502 && faux.o.erreur === "jeton" && /Asana refuse la clé/.test(faux.o.message), "clé Asana fausse : message clair");
  check((await w.appel({ action: "lister", outil: "trello", jeton: "k" }, "louise")).o.erreur === "jeton", "Trello : il faut clé et jeton");
  const tl = await w.appel({ action: "lister", outil: "trello", jeton: "k:tok" }, "louise");
  check(tl.o.choix.map((x) => x.nom).join("|") === "Com · À faire|Com · Fait", "listes Trello proposées");
  check((await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "zz" }, "stephane")).o.erreur === "cible", "destination inconnue refusée");
}

/* chacun son outil : Stéphane sur Asana, Louise sur Trello */
{
  const w = monde();
  const r = await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "p1", site: "https://site.io/app/", app: "Road to 7th" }, "stephane");
  check(r.status === 200 && r.o.cible_nom === "KEDGE · Plan de com", "Stéphane relie son Asana");
  const reg = w.db.outils["u2:asana"];
  check(reg && reg.jeton === "pat-ok" && reg.user_id === "u2", "sa clé est rangée à son nom");
  check(w.db.conf && w.db.conf.secret === "secret-1" && w.db.conf.adresse === "https://ref.supabase.co/functions/v1/export", "premier relié : lien base-fonction installé");
  await w.appel({ action: "relier", outil: "trello", jeton: "k:tok", cible: "l1", site: "https://site.io/app/", app: "Road to 7th" }, "louise");
  check(Object.keys(w.db.outils).sort().join() === "u2:asana,u3:trello", "Louise relie son Trello, à côté");
  const eS = await w.appel({ action: "etat" }, "stephane"), eL = await w.appel({ action: "etat" }, "louise"), eJ = await w.appel({ action: "etat" }, "julien");
  check(eS.o.outils.map((x) => x.outil).join() === "asana" && eL.o.outils.map((x) => x.outil).join() === "trello" && eJ.o.outils.length === 0, "chacun ne voit que son outil");
  check(!JSON.stringify(eS.o).includes("pat-ok"), "l'état ne montre jamais la clé");
  await w.appel({ action: "relier", outil: "asana", jeton: "", cible: "p2" }, "stephane");
  check(w.db.outils["u2:asana"].jeton === "pat-ok" && w.db.outils["u2:asana"].cible === "p2", "changer de projet sans recoller la clé");
  await w.appel({ action: "relier", outil: "asana", jeton: "", cible: "p1", site: "https://site.io/app/", app: "Road to 7th" }, "stephane");
  check((await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "julien")).o.erreur === "outil", "sans outil relié : envoyer refusé, avec le chemin");

  /* les deux envoient la même fiche, chacun chez soi */
  const e = await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "stephane");
  check(e.status === 200 && e.o.url.startsWith("https://app.asana.com/0/p1/") && e.o.user_id === "u2", "Stéphane : tâche dans son Asana");
  const t = w.o.taches[e.o.ext_id];
  check(t.name === "Post LinkedIn JPO" && t.due_on === "2026-12-05" && t.completed === false && t.projects[0] === "p1" && t.notes.includes("#item=a1"), "tâche : titre, échéance, projet, lien");
  const eT = await w.appel({ action: "envoyer", outil: "trello", item: "a1" }, "louise");
  const c = w.o.cartes[eT.o.ext_id];
  check(c && c.idList === "l1" && c.desc.includes("**Service** : Réseaux sociaux"), "Louise : la même fiche, carte dans son Trello (fiche d'un autre service : c'est son outil)");
  check(w.db.exports.length === 2, "deux envois notés");
  check((await w.appel({ action: "envoyer", outil: "trello", item: "a1" }, "stephane")).o.erreur === "outil", "Stéphane n'utilise pas le Trello de Louise");

  /* la base prévient : chaque copie est réécrite */
  check((await w.appel({ item: "a1" }, null, "faux")).status === 401, "secret faux refusé");
  w.db.fiches.a1.t = "Post LinkedIn JPO, version courte"; w.db.fiches.a1.date = "2026-12-06"; w.db.fiches.a1.st = "diffuse";
  const s = await w.appel({ item: "a1" }, null, "secret-1");
  check(s.o.fait.sort().join() === "asana,trello", "fiche modifiée : les deux copies réécrites");
  check(t.name === "Post LinkedIn JPO, version courte" && t.due_on === "2026-12-06" && t.completed === true && t.notes.includes("État : Diffusé"), "Asana : renommée, déplacée, cochée");
  check(c.name === "Post LinkedIn JPO, version courte" && c.due.startsWith("2026-12-06") && c.dueComplete === true, "Trello : pareil");
  w.db.fiches.a1.st = "retire"; w.db.fiches.a1.annule_motif = "Budget";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(t.name.startsWith("Annulé · ") && t.notes.startsWith("Annulé : Budget") && c.closed === true, "annulée : marquée dans Asana, archivée dans Trello");
  w.db.fiches.a1.st = "planifie";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(c.closed === false && c.dueComplete === false && t.completed === false, "rétablie : ressortie");
  check((await w.appel({ item: "a2" }, null, "secret-1")).o.fait.length === 0, "fiche jamais envoyée : rien");

  const nAvant = Object.keys(w.o.taches).length;
  await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "stephane");
  check(Object.keys(w.o.taches).length === nAvant, "renvoyer met à jour, sans doublon");

  /* tâche effacée dans Asana : plus suivie chez Stéphane, Louise continue */
  delete w.o.taches[e.o.ext_id];
  await w.appel({ item: "a1" }, null, "secret-1");
  check(w.db.exports.length === 1 && w.db.exports[0].user_id === "u3", "tâche effacée dans Asana : plus suivie chez lui seulement");
  const e2 = await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "stephane");
  check(!!w.o.taches[e2.o.ext_id], "renvoyée : nouvelle tâche");

  /* clé expirée chez l'un : l'erreur reste sur sa ligne, l'autre passe */
  w.db.outils["u2:asana"].jeton = "pat-expire";
  await w.appel({ item: "a1" }, null, "secret-1");
  const lS = w.db.exports.find((x) => x.user_id === "u2"), lL = w.db.exports.find((x) => x.user_id === "u3");
  check(/Asana refuse la clé/.test(lS.erreur) && lL.erreur === "", "clé expirée : erreur notée chez lui, Louise à jour");
  w.db.outils["u2:asana"].jeton = "pat-ok";
  await w.appel({ item: "a1" }, null, "secret-1");
  check(w.db.exports.every((x) => x.erreur === ""), "erreur effacée au passage suivant");

  /* suppression : chez chacun */
  await w.appel({ supprimer: [{ user_id: "u2", outil: "asana", ext_id: e2.o.ext_id }, { user_id: "u3", outil: "trello", ext_id: eT.o.ext_id }] }, null, "secret-1");
  check(!w.o.taches[e2.o.ext_id] && c.closed === true, "fiche supprimée : corbeille Asana, archives Trello");

  /* arrêter, délier : chacun pour soi */
  await w.appel({ action: "envoyer", outil: "asana", item: "a2" }, "stephane");
  await w.appel({ action: "envoyer", outil: "trello", item: "a2" }, "louise");
  await w.appel({ action: "arreter", outil: "asana", item: "a2" }, "stephane");
  check(w.db.exports.filter((x) => x.item === "a2").map((x) => x.user_id).join() === "u3", "arrêter : seulement chez soi");
  await w.appel({ action: "delier", outil: "trello" }, "louise");
  check(!w.db.outils["u3:trello"] && w.db.outils["u2:asana"] && !w.db.exports.some((x) => x.user_id === "u3"), "délier : seulement son outil");
}

console.log(`fonction export : ${ok} vérifications passées`);
