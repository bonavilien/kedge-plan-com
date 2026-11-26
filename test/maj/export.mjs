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
const { createHandler, description, lienApp, estEtiquette, jourParis } = await import(pathToFileURL(f));
import crypto from "crypto";
const signe = (secret, corps) => crypto.createHmac("sha256", secret).update(corps).digest("hex");

let ok = 0;
const check = (c, m) => { assert.ok(c, m); ok++; };

/* faux outils : ils notent chaque appel et gardent leurs tâches */
function outils() {
  const calls = [], taches = {}, cartes = {}, hooks = {}, verifs = [];
  const box = { handler: null, poignee: "" };
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
      if (t && m === "GET") { const x = taches[t[1]]; return res(200, { data: { gid: t[1], name: x.name, due_on: x.due_on || null, completed: !!x.completed, tags: x.tags || [], permalink_url: "https://app.asana.com/0/p1/" + t[1] } }); }
      /* création d'un webhook : Asana appelle l'adresse tout de suite pour la poignée de main, avant de répondre */
      if (u.pathname === "/api/1.0/webhooks" && m === "POST") {
        const r = await box.handler(new Request(body.data.target, { method: "POST", headers: { "x-hook-secret": "hs-1" } }));
        box.poignee = r.headers.get("x-hook-secret") || "";
        if (box.poignee !== "hs-1") return res(400, { errors: [{ message: "handshake failed" }] });
        const gid = "wh" + ++n; hooks[gid] = body.data; return res(201, { data: { gid } });
      }
      const wh = /^\/api\/1\.0\/webhooks\/(\w+)$/.exec(u.pathname);
      if (wh && m === "DELETE") { delete hooks[wh[1]]; return res(200, { data: {} }); }
    }
    if (u.host === "api.trello.com") {
      if (u.searchParams.get("key") !== "k" || u.searchParams.get("token") !== "tok") return res(401, "invalid key");
      if (u.pathname === "/1/members/me/boards") return res(200, [{ id: "b1", name: "Com", lists: [{ id: "l1", name: "À faire" }, { id: "l2", name: "Fait" }] }]);
      if (u.pathname === "/1/cards" && m === "POST") { const id = "c" + ++n; cartes[id] = body; return res(200, { id, shortUrl: "https://trello.com/c/" + id }); }
      const c = /^\/1\/cards\/(\w+)$/.exec(u.pathname);
      if (c && !cartes[c[1]]) return res(404, "not found");
      if (c && m === "PUT") { Object.assign(cartes[c[1]], body); return res(200, { id: c[1], shortUrl: "https://trello.com/c/" + c[1] }); }
      if (c && m === "GET") { const x = cartes[c[1]]; return res(200, { id: c[1], name: x.name, due: x.due || null, dueComplete: !!x.dueComplete, closed: !!x.closed, labels: x.labels || [], shortUrl: "https://trello.com/c/" + c[1] }); }
      if (u.pathname === "/1/lists/l1") return res(200, { id: "l1", idBoard: "b1" });
      /* création d'un webhook : Trello vérifie l'adresse par un HEAD */
      if (u.pathname === "/1/webhooks" && m === "POST") {
        const cb = u.searchParams.get("callbackURL"), r = await box.handler(new Request(cb, { method: "HEAD" }));
        verifs.push(r.status);
        if (r.status !== 200) return res(400, "callback failed");
        const id = "tw" + ++n; hooks[id] = { callbackURL: cb, idModel: u.searchParams.get("idModel") }; return res(200, { id });
      }
      const tw = /^\/1\/webhooks\/(\w+)$/.exec(u.pathname);
      if (tw && m === "DELETE") { delete hooks[tw[1]]; return res(200, {}); }
    }
    return res(404, { message: "?" });
  };
  return { fetch, calls, taches, cartes, hooks, verifs, box };
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
      majReglage: async (u, k, patch) => { if (db.outils[K(u, k)]) Object.assign(db.outils[K(u, k)], patch); },
      exportExt: async (u, k, x) => db.exports.find((e) => e.user_id === u && e.outil === k && e.ext_id === x) || null,
      importer: async (u, k, x, url, t, date) => {
        if (db.exports.some((e) => e.user_id === u && e.outil === k && e.ext_id === x)) return null;
        const p = Object.values(comptes).find((c) => c.id === u); if (!p || p.visiteur) return null;
        const id = "n" + (++db.n);
        db.fiches[id] = { id, kind: "action", t, date, flou: "", svc: p.svc || "chef", m: [], st: "confirmer", partner: null, lieu: "", note: "", service: "", messages: [], tf: "", docs: [], author: u };
        db.exports.push({ item: id, user_id: u, outil: k, ext_id: x, url, erreur: "", origine: "outil" });
        return id;
      },
      majFiche: async (u, item, t, date, st) => { const f = db.fiches[item]; if (!f || f.st === "retire") return; db.maj.push({ u, item, t, date, st }); if (t) f.t = t; if (date) { f.date = date; f.flou = ""; } if (st) f.st = st; },
    },
  });
  o.box.handler = handler;
  db.n = 0; db.maj = [];
  /* un appel de webhook : Asana signe le corps, Trello non */
  const webhook = async (outil, u, corps, o2 = {}) => {
    const r = db.outils[K(u, outil)], brut = JSON.stringify(corps), headers = { "content-type": "application/json" };
    if (outil === "asana") headers["x-hook-signature"] = o2.signature ?? signe(r.hook_secret, brut);
    const k = o2.k ?? r.crochet;
    const res = await handler(new Request(`https://ref.supabase.co/functions/v1/export?retour=${outil}&u=${u}&k=${k}`, { method: "POST", headers, body: brut }));
    let j = {}; try { j = await res.json(); } catch {}
    return { status: res.status, o: j };
  };
  const appel = async (corps, qui, secret) => {
    const headers = { "content-type": "application/json" };
    if (qui) headers.authorization = "Bearer " + qui;
    if (secret) headers["x-export-secret"] = secret;
    const r = await handler(new Request("https://ref.supabase.co/functions/v1/export", { method: "POST", headers, body: JSON.stringify(corps) }));
    return { status: r.status, o: await r.json() };
  };
  return { o, db, appel, webhook };
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

/* ---------- le retour : Asana et Trello vers le plan ---------- */
check(estEtiquette("Plan de com") && estEtiquette("plan-de-COM") && estEtiquette(" Plan dé com ") && !estEtiquette("Plan com"), "l'étiquette se reconnaît sans souci de majuscules ni d'accents");
check(jourParis("2026-12-05T23:30:00.000Z") === "2026-12-06" && jourParis("2026-12-05T09:00:00.000Z") === "2026-12-05", "échéance Trello : le jour à Paris");
{
  const w = monde();
  const r = await w.appel({ action: "relier", outil: "asana", jeton: "pat-ok", cible: "p1", site: "https://site.io/app/", app: "Road to 7th" }, "stephane");
  const reg = w.db.outils["u2:asana"];
  check(r.o.retour === true && reg.hook_id && reg.crochet && reg.hook_secret === "hs-1" && w.o.box.poignee === "hs-1", "relier Asana : webhook créé sur son projet, poignée de main faite");
  check(w.o.hooks[reg.hook_id].resource === "p1" && w.o.hooks[reg.hook_id].target.includes("retour=asana&u=u2&k=" + reg.crochet), "le webhook vise son projet, à son adresse secrète");

  /* Stéphane étiquette une tâche dans Asana */
  w.o.taches.x1 = { name: "Vidéo du campus", due_on: "2026-12-12", completed: false, tags: [{ name: "Urgent" }, { name: "Plan de com" }] };
  const ev = { events: [{ action: "added", resource: { gid: "x1", resource_type: "task" }, parent: { gid: "p1", resource_type: "project" } }] };
  check((await w.webhook("asana", "u2", ev, { k: "faux" })).status === 401, "adresse sans le bon jeton : refusée");
  check((await w.webhook("asana", "u2", ev, { signature: "bad" })).status === 401, "signature Asana fausse : refusée");
  const a = await w.webhook("asana", "u2", ev);
  const nf = Object.values(w.db.fiches).find((x) => x.t === "Vidéo du campus");
  check(a.o.fait.join() === "creee" && nf && nf.st === "confirmer" && nf.svc === "rs" && nf.date === "2026-12-12" && nf.author === "u2", "tâche étiquetée : fiche « À confirmer » dans son service, à sa date");
  check(w.db.exports.some((e) => e.item === nf.id && e.origine === "outil" && e.user_id === "u2"), "suivie, marquée « venue de l'outil »");
  await w.webhook("asana", "u2", { events: [ev.events[0], { action: "changed", resource: { gid: "x1", resource_type: "task" } }] });
  check(Object.values(w.db.fiches).filter((x) => x.t === "Vidéo du campus").length === 1, "prévenu plusieurs fois : une seule fiche");
  w.o.taches.x2 = { name: "Perso", due_on: "2026-12-01", completed: false, tags: [] };
  check((await w.webhook("asana", "u2", { events: [{ action: "added", resource: { gid: "x2", resource_type: "task" } }] })).o.fait.join() === "rien", "tâche sans l'étiquette : rien ne bouge");

  /* il la coche, change l'échéance, la renomme */
  Object.assign(w.o.taches.x1, { completed: true, due_on: "2026-12-14", name: "Vidéo du campus, version longue" });
  await w.webhook("asana", "u2", { events: [{ action: "changed", resource: { gid: "x1", resource_type: "task" } }] });
  check(nf.st === "diffuse" && nf.date === "2026-12-14" && nf.t === "Vidéo du campus, version longue" && w.db.maj.at(-1).u === "u2", "cochée, déplacée, renommée : la fiche suit, au nom de Stéphane");
  w.o.taches.x1.completed = false;
  await w.webhook("asana", "u2", { events: [{ action: "changed", resource: { gid: "x1", resource_type: "task" } }] });
  check(nf.st === "planifie", "décochée : « Prévu »");

  /* Julien change la fiche dans l'appli : la tâche suit, sans toucher à sa description */
  w.o.taches.x1.notes = "Les notes de Stéphane";
  nf.date = "2026-12-20"; nf.st = "diffuse";
  await w.appel({ item: nf.id }, null, w.db.conf ? w.db.conf.secret : "secret-1");
  const put = w.o.calls.filter((c) => c.m === "PUT" && c.p === "/api/1.0/tasks/x1").at(-1);
  check(put && !("notes" in put.body.data) && w.o.taches.x1.notes === "Les notes de Stéphane" && w.o.taches.x1.due_on === "2026-12-20" && w.o.taches.x1.completed === true, "tâche venue d'Asana : échéance et coche mises à jour, ses notes intactes");
  const n0 = w.db.maj.length;
  const echo = await w.webhook("asana", "u2", { events: [{ action: "changed", resource: { gid: "x1", resource_type: "task" } }] });
  check(echo.o.fait.join() === "rien" && w.db.maj.length === n0, "l'écho de notre propre changement ne relance rien");

  /* une fiche envoyée depuis l'appli : cocher dans Asana la passe aussi en Diffusé */
  const e = await w.appel({ action: "envoyer", outil: "asana", item: "a2" }, "stephane");
  w.o.taches[e.o.ext_id].completed = true;
  await w.webhook("asana", "u2", { events: [{ action: "changed", resource: { gid: e.o.ext_id, resource_type: "task" } }] });
  check(w.db.fiches.a2.st === "diffuse", "fiche envoyée depuis l'appli : cochée dans Asana = Diffusé");
  w.db.fiches.a2.st = "retire";
  w.o.taches[e.o.ext_id].completed = false; w.o.taches[e.o.ext_id].name = "Autre";
  await w.webhook("asana", "u2", { events: [{ action: "changed", resource: { gid: e.o.ext_id, resource_type: "task" } }] });
  check(w.db.fiches.a2.st === "retire" && w.db.fiches.a2.t === "Communiqué", "fiche annulée : l'outil ne la change plus");

  /* tâche effacée dans Asana : plus suivie */
  delete w.o.taches.x1;
  await w.webhook("asana", "u2", { events: [{ action: "deleted", resource: { gid: "x1", resource_type: "task" } }] });
  check(!w.db.exports.some((x) => x.ext_id === "x1") && nf.st === "retire" && w.db.maj.at(-1).u === "u2", "tâche venue d'Asana effacée : la fiche passe en « Annulé », au nom de Stéphane, plus suivie");
  /* une fiche envoyée depuis l'appli, effacée dans Asana : elle reste telle quelle */
  const e1 = await w.appel({ action: "envoyer", outil: "asana", item: "a1" }, "stephane");
  delete w.o.taches[e1.o.ext_id];
  await w.webhook("asana", "u2", { events: [{ action: "deleted", resource: { gid: e1.o.ext_id, resource_type: "task" } }] });
  check(w.db.fiches.a1.st === "planifie" && !w.db.exports.some((x) => x.ext_id === e1.o.ext_id), "fiche envoyée depuis l'appli, effacée dans Asana : elle ne change pas, plus suivie");

  /* changer de projet : l'ancien webhook part, un nouveau arrive */
  const ancien = reg.hook_id;
  await w.appel({ action: "relier", outil: "asana", jeton: "", cible: "p2" }, "stephane");
  check(!w.o.hooks[ancien] && w.o.hooks[w.db.outils["u2:asana"].hook_id].resource === "p2", "changer de projet : webhook déplacé");
  /* délier : le webhook part */
  const h = w.db.outils["u2:asana"].hook_id;
  await w.appel({ action: "delier", outil: "asana" }, "stephane");
  check(!w.o.hooks[h], "délier : plus de webhook");

  /* outil relié avant cette version : l'état branche le retour */
  w.db.outils["u2:asana"] = { user_id: "u2", outil: "asana", jeton: "pat-ok", cible: "p1", cible_nom: "KEDGE · Plan de com", site: "", app: "" };
  const et = await w.appel({ action: "etat" }, "stephane");
  check(et.o.outils[0].retour === true && w.db.outils["u2:asana"].hook_id, "outil relié avant : le retour se branche tout seul");
}
{
  /* Trello, chez Louise */
  const w = monde();
  const r = await w.appel({ action: "relier", outil: "trello", jeton: "k:tok", cible: "l1", site: "https://site.io/app", app: "Road to 7th" }, "louise");
  const reg = w.db.outils["u3:trello"];
  check(r.o.retour === true && w.o.verifs.join() === "200" && w.o.hooks[reg.hook_id].idModel === "b1", "relier Trello : adresse vérifiée, webhook sur le tableau de sa liste");
  w.o.cartes.y1 = { name: "Newsletter alumni", due: "2026-12-05T23:30:00.000Z", labels: [{ name: "plan de com" }] };
  const a = await w.webhook("trello", "u3", { action: { type: "addLabelToCard", data: { card: { id: "y1" } } } });
  const nf = Object.values(w.db.fiches).find((x) => x.t === "Newsletter alumni");
  check(a.o.fait.join() === "creee" && nf.svc === "rp" && nf.date === "2026-12-06", "carte étiquetée : fiche dans son service, au bon jour");
  w.o.cartes.y1.dueComplete = true;
  await w.webhook("trello", "u3", { action: { type: "updateCard", data: { card: { id: "y1" } } } });
  check(nf.st === "diffuse", "échéance cochée dans Trello : Diffusé");
  w.o.cartes.y1.closed = true;
  await w.webhook("trello", "u3", { action: { type: "updateCard", data: { card: { id: "y1" } } } });
  check(nf.st === "retire", "carte venue de Trello archivée : « Annulé »");
  delete w.o.cartes.y1;
  await w.webhook("trello", "u3", { action: { type: "deleteCard", data: { card: { id: "y1" } } } });
  check(nf.st === "retire" && !w.db.exports.some((x) => x.ext_id === "y1"), "puis supprimée : reste « Annulé », plus suivie");
  w.o.cartes.y2 = { name: "Archivée", labels: [{ name: "Plan de com" }], closed: true };
  check((await w.webhook("trello", "u3", { action: { type: "updateCard", data: { card: { id: "y2" } } } })).o.fait.join() === "rien", "carte archivée : pas importée");
  check((await w.webhook("trello", "u3", { action: { type: "updateCard", data: { card: { id: "y1" } } } }, { k: "x" })).status === 401, "Trello : adresse sans le bon jeton refusée");
  const h = reg.hook_id;
  await w.appel({ action: "delier", outil: "trello" }, "louise");
  check(!w.o.hooks[h], "délier Trello : plus de webhook");
}

console.log(`fonction export : ${ok} vérifications passées`);
