/* Plan de com KEDGE · V2 — branchement sur la base Supabase.
   Le magasin (js/data.js) garde sa forme en mémoire. Ce fichier :
   1. connecte le compte (adresse et mot de passe) ;
   2. charge toute la base et la traduit dans la forme du magasin ;
   3. à chaque changement, compare le magasin à ce que la base connaît et n'envoie que les différences ;
   4. recharge quand quelqu'un d'autre modifie quelque chose.
   Sans config.js (aperçu, démonstration), ce fichier ne fait rien : l'appli reste sur ses données d'exemple. */
(() => {
  const KP = window.KP, C = window.KPLAN_CONFIG, store = KP.store;
  const demo = /[?&]demo\b/.test(location.search);
  /* « brancher » reste à false dans config.js jusqu'au jour de la bascule : avant les migrations de la V2,
     cette appli ne doit pas écrire dans la base que la V1 utilise encore */
  if (!C || !C.brancher || !C.supabaseUrl || !C.supabaseKey || !window.supabase || demo) return;
  KP.hold = true;

  const sb = window.KPLAN_CLIENT || window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const run = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  const soft = (q, fallback) => run(q).catch(() => fallback); /* table d'une migration pas encore faite */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
  const TRANCHER = "à trancher en réunion";
  const MSG = ["filieres", "alumni", "international", "continuum", "reputation"];
  const mIn = (x) => (x === "REC" || x === "INC" ? "recrutement" : MSG[+x - 1]);
  const mOut = (k) => (k === "recrutement" ? "REC" : String(MSG.indexOf(k) + 1));
  const stIn = { idee: "confirmer", confirmer: "confirmer", planifie: "prevu", production: "prevu", diffuse: "diffuse", retire: "confirmer" };
  const stOut = { confirmer: "confirmer", prevu: "planifie", diffuse: "diffuse" };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const int = (s) => { const m = /\d+/.exec(String(s == null ? "" : s)); return m ? Math.min(999, Math.max(1, +m[0])) : null; };
  const ms = (ts) => (ts ? new Date(ts).getTime() : 0);

  let user = null, shadow = null, partnerK = {}, perN = [], blocks = {}, queue = Promise.resolve(), pending = 0, reloading = false;
  const pseudo = { chef: { k: "chef", nom: "les chefs de projet", court: "Chefs de projet" }, offre: { k: "offre", nom: "la Resp. offre", court: "Resp. offre" },
    marketing: { k: "marketing", nom: "la Dir. marketing et recrutement", court: "Dir. marketing" }, programme: { k: "programme", nom: "la Direction du Programme", court: "Dir. Programme" } };

  /* ---------- lecture : tout, d'un coup (l'équipe est petite) ---------- */
  async function load() {
    const all = (t, order) => run(sb.from(t).select("*").order(order));
    const [per, svc, prt, prof, items, links, reqs, blk, ans, meta, journal, lieux, contacts, ic] = await Promise.all([
      all("periods", "du"), all("services", "ordre"), all("partners", "nom"), all("profiles", "nom"), all("items", "date"), all("links", "at"), all("reqs", "at"), all("blocks", "at"),
      run(sb.from("answers").select("key,val").eq("user_id", user.id)), all("meta", "k"), soft(sb.from("journal").select("*").order("id"), []),
      soft(sb.from("lieux").select("*").order("nom"), []), soft(sb.from("contacts").select("*").order("nom"), []), soft(sb.from("item_contacts").select("*"), []),
    ]);
    perN = per.map((p) => p.n);
    const perK = (n) => { const i = perN.indexOf(n); return i >= 0 && KP.PERIODS[i] ? KP.PERIODS[i].k : ""; };
    partnerK = Object.fromEntries(prt.map((p) => [p.nom, p.k]));
    const partnerNom = Object.fromEntries(prt.map((p) => [p.k, p.nom]));
    const docs = {}, cts = {};
    links.forEach((l) => (docs[l.item] = docs[l.item] || []).push({ id: l.id, t: l.nom, url: l.url }));
    ic.forEach((x) => (cts[x.item] = cts[x.item] || []).push(x.contact));
    blocks = {};
    blk.filter((b) => !b.leve && b.why.startsWith(TRANCHER)).forEach((b) => (blocks[b.item] = blocks[b.item] || []).push(b.id));
    const people = prof.map((p) => ({ k: p.id, nom: p.nom || "Sans nom", fonction: p.fonction || "", role: p.visiteur ? "lecteur" : p.chef ? "pilote" : p.svc ? "service" : "lecteur", svc: p.svc || "" }));
    const prefs = {};
    prof.forEach((p) => { if (p.version) prefs[p.id] = { version: p.version }; });
    const mine = ans.find((a) => a.key === "v2");
    let own = {}; try { own = mine ? JSON.parse(mine.val) : {}; } catch (e) {}
    const me = prof.find((p) => p.id === user.id) || {};
    prefs[user.id] = { ...own, notif: { demandes: me.notif_demandes !== false, changements: me.notif_changements !== false, creations: !!me.notif_all } };
    const m = Object.fromEntries(meta.map((x) => [x.k, x.v]));
    const data = {
      v: 0, seq: 0, moi: user.id, people, prefs,
      services: svc.map((s) => ({ k: s.k, nom: s.nom, court: s.court })),
      partners: prt.map((p) => p.nom),
      lieux: lieux.map((l) => l.nom),
      contacts: contacts.map((c) => ({ id: c.id, nom: c.nom, role: c.role, mail: c.mail, tel: c.tel })),
      items: items.map((r) => {
        const sujet = r.kind === "tf" && r.per.length > 0, pers = sujet ? r.per.map(perK).filter(Boolean) : null;
        const it = {
          id: r.id, kind: r.kind === "classement" ? "tf" : r.kind, variant: r.kind === "classement" ? "classement" : sujet ? "sujet" : r.partner ? "partenariat" : "",
          t: r.t, date: r.date, flou: !!r.flou && !/^\d/.test(r.flou), fin: r.fin || "", svc: r.svc === "chef" ? "" : r.svc, m: r.m.map(mIn).filter(Boolean), st: stIn[r.st] || "confirmer",
          tf: r.tf || "", lieu: r.lieu || "", note: r.note || "", docs: docs[r.id] || [], contacts: cts[r.id] || [], reunion: !!blocks[r.id], by: r.author || "",
        };
        if (r.partner) it.partner = partnerNom[r.partner] || "";
        if (r.kind === "classement") { it.rang = r.rang ? (r.rang === 1 ? "1er" : r.rang + "e") : ""; it.cible = r.cible ? "Top " + r.cible : ""; }
        if (sujet && pers.length) { const a = KP.PERIODS.find((p) => p.k === pers[0]), z = KP.PERIODS.find((p) => p.k === pers[pers.length - 1]); it.per = pers[0]; it.pers = pers; it.date = a.du; it.fin = z.au; }
        if (r.st === "retire") it.annule = { txt: r.annule_motif || "", qui: r.annule_par || "", quand: ms(r.annule_at) || ms(r.updated_at) };
        if (r.report_at) it.report = { de: r.report_de || "", txt: r.report_motif || "", qui: r.report_par || "", quand: ms(r.report_at) };
        return it;
      }),
      reqs: reqs.filter((r) => r.st !== "annulee").map((r) => ({ id: r.id, item: r.item, de: r.asker || "", a: r.dest === "moi" || r.dest === "programme" ? r.asker || "" : r.dest,
        quoi: KP.ELEMENTS.includes(r.type) ? r.type : "Autre", txt: r.quoi || (KP.ELEMENTS.includes(r.type) ? "" : r.type), pour: r.pour, fait: r.st === "recue", rep: r.reponse || "", quand: ms(r.at) })),
      journal: journal.map((j) => ({ id: "j" + j.id, item: j.item, qui: j.author || "", quand: ms(j.at), txt: jtxt(j) })),
      lastMeeting: (m.last_meeting || KP.TODAY).slice(0, 10),
    };
    return data;
  }

  /* une ligne d'historique de la base, dite en une phrase */
  function jtxt(j) {
    const d = j.diff || {}, k = Object.keys(d);
    if (j.kind === "creation") return "a créé la fiche";
    if (j.kind === "document") return "a ajouté un document";
    if (j.kind === "reponse") return "a répondu à une demande";
    if (j.kind === "retrait") return "a retiré une demande";
    if (j.kind === "prevenu") return "a prévenu d'un changement";
    if (j.kind === "deadline") return "a changé l'échéance d'une demande";
    if (d.st && d.st[1] === "retire") return "a annulé" + (d.annule_motif && d.annule_motif[1] ? " : " + d.annule_motif[1] : "");
    if (d.st && d.st[0] === "retire") return "a rétabli";
    if (d.report_motif && d.report_motif[1]) return "a reporté" + (d.date ? " au " + KP.fmt.moyen(d.date[1]) : "") + " : " + d.report_motif[1];
    if (d.date) return "a déplacé au " + KP.fmt.moyen(d.date[1]);
    if (d.st) return "a marqué « " + ((KP.STATUTS.find((s) => s.k === stIn[d.st[1]]) || {}).nom || d.st[1]) + " »";
    const noms = { t: "le titre", fin: "le dernier jour", flou: "la date", per: "les périodes", svc: "le service", m: "les messages", tf: "le temps fort lié", partner: "le média", lieu: "le lieu", note: "la note", rang: "le rang", cible: "l'objectif", cc: "les services prévenus" };
    const l = k.map((x) => noms[x]).filter(Boolean);
    return l.length ? "a modifié " + l.join(", ") : "a modifié la fiche";
  }

  /* ---------- écriture : seules les différences partent ---------- */
  const flouTxt = (it) => (it.flou ? cap(KP.fmt.moisC(it.date)) : "");
  const meP = () => store._db().people.find((p) => p.k === user.id) || {};
  function cols(it, keys, creation) {
    const o = {}, has = (k) => keys.includes(k), sujet = it.variant === "sujet";
    if (has("t")) o.t = it.t;
    if (has("date") || has("flou") || has("per") || has("pers") || has("variant")) {
      const pers = sujet ? (it.pers && it.pers.length ? it.pers : [it.per]).filter(Boolean) : [];
      o.per = pers.map((k) => perN[KP.PERIODS.findIndex((p) => p.k === k)]).filter((n) => n != null);
      o.date = sujet && pers.length ? KP.PERIODS.find((p) => p.k === pers[0]).du : it.date;
      o.flou = sujet ? "" : flouTxt(it);
      o.fin = sujet || it.flou || !it.fin || it.fin <= o.date || it.kind !== "tf" || it.variant === "classement" ? null : it.fin;
    } else if (has("fin")) o.fin = sujet || it.flou || !it.fin || it.fin <= it.date || it.kind !== "tf" || it.variant === "classement" ? null : it.fin;
    if (has("svc")) o.svc = it.variant === "classement" ? "chef" : it.svc || (creation && meP().role !== "pilote" ? meP().svc : "") || "chef";
    if (has("m")) o.m = it.m.map(mOut).filter((x) => x !== "0");
    if (has("st") || has("annule")) { o.st = it.annule ? "retire" : stOut[it.st] || "confirmer"; o.annule_motif = it.annule ? it.annule.txt || "" : ""; }
    if (has("tf")) o.tf = it.tf || null;
    if (has("partner") || has("variant")) o.partner = it.variant === "partenariat" && it.partner ? partnerK[it.partner] || null : null;
    if (has("lieu")) o.lieu = it.lieu || "";
    if (has("note")) o.note = it.note || "";
    if (it.variant === "classement" && (has("rang") || has("cible"))) { o.rang = int(it.rang); o.cible = int(it.cible); }
    if (has("report")) { o.report_de = it.report ? it.report.de || "" : ""; o.report_motif = it.report ? it.report.txt || "" : ""; }
    return o;
  }
  const FIELDS = ["t", "date", "flou", "fin", "per", "pers", "variant", "svc", "m", "st", "annule", "tf", "partner", "lieu", "note", "rang", "cible", "report"];
  /* un nouveau média partenaire se crée avant la fiche qui le cite */
  async function partnerFor(nom) {
    if (!nom || partnerK[nom]) return;
    const p = await run(sb.from("partners").insert({ nom }).select().single()); partnerK[p.nom] = p.k;
  }
  async function side(it, old) {
    const a = it.docs || [], b = (old && old.docs) || [];
    for (const d of b) if (d.id && !a.some((x) => x.id === d.id)) await run(sb.from("links").delete().eq("id", d.id));
    for (const d of a) if (!d.id) { const l = await run(sb.from("links").insert({ item: it.id, nom: d.t || "Document SharePoint", url: d.url }).select().single()); d.id = l.id; }
    const c = it.contacts || [], c0 = (old && old.contacts) || [];
    for (const x of c0) if (!c.includes(x)) await run(sb.from("item_contacts").delete().eq("item", it.id).eq("contact", x));
    for (const x of c) if (!c0.includes(x)) await run(sb.from("item_contacts").insert({ item: it.id, contact: x }));
    const r0 = !!(old && old.reunion);
    if (it.reunion && !r0) { const id = uuid(); await run(sb.from("blocks").insert({ id, item: it.id, why: TRANCHER })); blocks[it.id] = [id]; }
    if (!it.reunion && r0) { for (const id of blocks[it.id] || []) await run(sb.from("blocks").update({ leve: true }).eq("id", id)); delete blocks[it.id]; }
  }
  const changed = async (q) => { const rows = await run(q.select("id")); if (!rows || !rows.length) throw new Error("tu n'as pas le droit de modifier cette fiche, ou elle a changé entre-temps"); };

  function plan(db) {
    const ops = [], byId = (l) => Object.fromEntries(l.map((x) => [x.id, x]));
    /* carnets d'abord : une fiche peut citer un contact ou un média créé à l'instant */
    db.partners.filter((n) => !shadow.partners.includes(n)).forEach((n) => ops.push(() => partnerFor(n)));
    db.lieux.filter((n) => !shadow.lieux.includes(n)).forEach((n) => ops.push(() => run(sb.from("lieux").insert({ nom: n }))));
    shadow.lieux.filter((n) => !db.lieux.includes(n)).forEach((n) => ops.push(() => run(sb.from("lieux").delete().eq("nom", n))));
    const c0 = byId(shadow.contacts), c1 = byId(db.contacts);
    db.contacts.forEach((c) => { if (!c0[c.id]) ops.push(() => run(sb.from("contacts").insert({ id: c.id, nom: c.nom, role: c.role || "", mail: c.mail || "", tel: c.tel || "" }))); else if (!same(c, c0[c.id])) ops.push(() => run(sb.from("contacts").update({ nom: c.nom, role: c.role || "", mail: c.mail || "", tel: c.tel || "" }).eq("id", c.id))); });
    shadow.contacts.forEach((c) => { if (!c1[c.id]) ops.push(() => run(sb.from("contacts").delete().eq("id", c.id))); });
    /* fiches : les temps forts avant leurs relais */
    const i0 = byId(shadow.items), i1 = byId(db.items);
    [...db.items].sort((a, b) => (a.tf ? 1 : 0) - (b.tf ? 1 : 0)).forEach((it) => {
      const old = i0[it.id];
      if (!old) return ops.push(async () => {
        await partnerFor(it.variant === "partenariat" ? it.partner : "");
        const row = cols(it, FIELDS.filter((k) => k !== "report"), true);
        await run(sb.from("items").insert({ id: it.id, kind: it.variant === "classement" ? "classement" : it.kind, ...row }));
        (it.docs || []).forEach((d) => delete d.id); /* une copie reprend les documents : ce sont de nouveaux liens */
        await side(it, null);
      });
      const keys = FIELDS.filter((k) => !same(it[k], old[k]));
      const sides = !same(it.docs, old.docs) || !same(it.contacts, old.contacts) || !!it.reunion !== !!old.reunion;
      if (keys.length) ops.push(async () => { await partnerFor(it.variant === "partenariat" ? it.partner : ""); await changed(sb.from("items").update(cols(it, keys)).eq("id", it.id)); });
      if (sides) ops.push(() => side(it, old));
    });
    /* une fiche supprimée : la base demande qu'elle soit d'abord retirée (les services concernés sont prévenus) */
    shadow.items.forEach((it) => { if (!i1[it.id]) ops.push(async () => { if (!it.annule) await changed(sb.from("items").update({ st: "retire" }).eq("id", it.id)); await changed(sb.from("items").delete().eq("id", it.id)); }); });
    /* demandes */
    const r0 = byId(shadow.reqs);
    db.reqs.forEach((r) => {
      const old = r0[r.id];
      if (!old) return ops.push(() => run(sb.from("reqs").insert({ id: r.id, item: r.item, dest: r.a === user.id ? "moi" : r.a, type: r.quoi || "Autre", quoi: r.txt || "", pour: r.pour })));
      if (r.fait && !old.fait) ops.push(() => run(sb.from("reqs").update({ st: "recue", reponse: r.rep || "" }).eq("id", r.id)));
      else if (!r.fait && old.fait) ops.push(async () => { throw new Error("une demande reçue reste reçue"); });
    });
    /* équipe, services, médias */
    const p0 = Object.fromEntries(shadow.people.map((p) => [p.k, p]));
    db.people.forEach((p) => { const o = p0[p.k]; if (o && !same(p, o)) ops.push(() => run(sb.from("profiles").update({ nom: p.nom, fonction: p.fonction, ...(p.role !== o.role || p.svc !== o.svc ? { chef: p.role === "pilote", visiteur: p.role === "lecteur", svc: p.svc || null } : {}) }).eq("id", p.k))); });
    const s0 = Object.fromEntries(shadow.services.map((s) => [s.k, s])), s1 = Object.fromEntries(db.services.map((s) => [s.k, s]));
    db.services.forEach((s, i) => { if (!s0[s.k]) ops.push(() => run(sb.from("services").insert({ k: s.k, nom: s.nom, court: s.court, ordre: i + 1 }))); else if (!same(s, s0[s.k])) ops.push(() => run(sb.from("services").update({ nom: s.nom, court: s.court }).eq("k", s.k))); });
    shadow.services.forEach((s) => { if (!s1[s.k]) ops.push(() => run(sb.from("services").delete().eq("k", s.k))); });
    shadow.partners.filter((n) => !db.partners.includes(n)).forEach((n) => ops.push(async () => { await run(sb.from("partners").delete().eq("nom", n)); delete partnerK[n]; }));
    /* réunion, préférences, version */
    if (db.lastMeeting !== shadow.lastMeeting) ops.push(() => run(sb.from("meta").upsert({ k: "last_meeting", v: db.lastMeeting })));
    const a = db.prefs[user.id] || {}, b = shadow.prefs[user.id] || {};
    const perso = (p) => { const { notif, version, versionVue, ...rest } = p; return rest; };
    if (!same(perso(a), perso(b))) ops.push(() => run(sb.from("answers").upsert({ key: "v2", val: JSON.stringify(perso(a)) }, { onConflict: "user_id,key" })));
    if (!same(a.notif, b.notif) && a.notif) ops.push(() => run(sb.from("profiles").update({ notif_all: !!a.notif.creations, notif_demandes: a.notif.demandes !== false, notif_changements: a.notif.changements !== false }).eq("id", user.id)));
    if (a.version && a.version !== b.version) ops.push(() => run(sb.from("profiles").update({ version: a.version }).eq("id", user.id)).catch(() => {}));
    return ops;
  }

  function sync(db) {
    if (!shadow || reloading) return;
    let ops; try { ops = plan(db); } catch (e) { return fail(e); }
    shadow = snapshot(db);
    if (!ops.length) return;
    pending++; badge();
    queue = queue.then(async () => { for (const op of ops) await op(); }).then(() => { pending--; badge(); if (!pending) fixDocs(); }, (e) => { pending = 0; badge(); fail(e); });
  }
  /* la base refuse : on le dit, et on revient à ce qu'elle contient vraiment */
  function fail(e) {
    console.error(e);
    queue = Promise.resolve();
    KP.toast("Non enregistré : " + (e && e.message ? e.message : "la base ne répond pas"));
    reload();
  }
  const snapshot = (db) => clone({ items: db.items, reqs: db.reqs, people: db.people, services: db.services, partners: db.partners, lieux: db.lieux, contacts: db.contacts, prefs: { [user.id]: db.prefs[user.id] || {} }, lastMeeting: db.lastMeeting });
  /* les documents ajoutés ont reçu leur identifiant de la base : la copie de référence le prend aussi */
  function fixDocs() { const cur = Object.fromEntries(store._db().items.map((i) => [i.id, i])); shadow.items.forEach((s) => { const i = cur[s.id]; if (i && i.docs && s.docs && i.docs.length === s.docs.length) s.docs = clone(i.docs); }); }
  function badge() { document.documentElement.classList.toggle("saving", pending > 0); }

  async function reload() {
    if (reloading) return; reloading = true;
    try { const data = await load(); shadow = snapshot(data); store._replace(data); }
    catch (e) { console.error(e); KP.toast("Impossible de relire la base, pas de réseau ?"); }
    reloading = false;
  }
  /* temps réel : un changement fait par quelqu'un d'autre recharge, sauf pendant qu'on enregistre */
  function watch() {
    let t = 0;
    const kick = () => { clearTimeout(t); t = setTimeout(() => (pending ? kick() : reload()), 600); };
    try { sb.channel("kplan").on("postgres_changes", { event: "*", schema: "public" }, kick).subscribe(); } catch (e) {}
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  }

  /* ---------- connexion ---------- */
  function loginScreen(msg) {
    let el = document.getElementById("login");
    if (!el) { el = document.createElement("div"); el.id = "login"; el.className = "login"; document.body.appendChild(el); }
    el.innerHTML = `<form class="login-card" autocomplete="on">
        <img src="assets/kedge-logo-blanc.png" alt="KEDGE" class="login-logo">
        <h1>Plan de com</h1>
        <label class="field"><span>Adresse</span><input class="input" type="email" name="email" autocomplete="username" required autofocus></label>
        <label class="field"><span>Mot de passe</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <p class="login-err" role="alert">${h(msg || "")}</p>
        <button type="submit" class="btn primary">Se connecter</button>
        ${C.visiteur ? `<button type="button" class="link" data-visiteur>Entrer en visiteur</button>` : ""}
        <p class="login-ver">Version ${h(KP.versionLabel(KP.VERSION.n))}</p>
      </form>`;
    const f = el.querySelector("form");
    const v = el.querySelector("[data-visiteur]");
    if (v) v.addEventListener("click", () => { f.email.value = C.visiteur; f.password.focus(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true; f.querySelector(".login-err").textContent = "";
      try { const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }); if (error) throw error; user = data.user; await start(); }
      catch (err) { b.disabled = false; f.querySelector(".login-err").textContent = /invalid/i.test(err.message || "") ? "Adresse ou mot de passe incorrect." : "Connexion impossible : " + (err.message || "pas de réseau ?"); }
    });
  }
  async function start() {
    const data = await load();
    shadow = snapshot(data);
    store._attach({ sync, uuid, pseudo }, data);
    /* mêmes droits que la base : un service modifie les fiches de son service, un pilote tout */
    store.canEdit = (it) => { const u = KP.me(); return u.role === "pilote" || (u.role === "service" && !!it && it.variant !== "partenariat" && it.svc === u.svc); };
    const el = document.getElementById("login"); if (el) el.remove();
    KP.hold = false;
    if (!location.hash) history.replaceState(null, "", "#/accueil");
    KP.render();
    watch();
    push.check().then((on) => { if (on) KP.render(); });
  }
  /* ---------- notifications sur cet appareil (téléphone ou ordinateur) ---------- */
  const b64key = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
  const push = {
    on: false,
    can: () => !!C.vapidPublicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    blocked: () => "Notification" in window && Notification.permission === "denied",
    async check() { try { const r = push.can() && (await navigator.serviceWorker.getRegistration()); const s = r && (await r.pushManager.getSubscription()); push.on = !!s && Notification.permission === "granted"; } catch (e) { push.on = false; } return push.on; },
    async enable() {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Les notifications sont bloquées pour ce site dans les réglages du navigateur.");
      const r = await navigator.serviceWorker.ready;
      const s = (await r.pushManager.getSubscription()) || (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(C.vapidPublicKey) }));
      const j = s.toJSON(); await run(sb.rpc("save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })); push.on = true;
    },
    async disable() { const r = await navigator.serviceWorker.getRegistration(); const s = r && (await r.pushManager.getSubscription()); if (s) { await run(sb.from("push_subs").delete().eq("endpoint", s.endpoint)).catch(() => {}); await s.unsubscribe(); } push.on = false; },
  };
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "open" && e.data.url) { const h2 = new URL(e.data.url).hash; if (h2) location.hash = h2; } });

  KP.remote = {
    push,
    get email() { return user ? user.email || "" : ""; },
    signOut: async () => { try { await sb.auth.signOut(); } catch (e) {} location.reload(); },
    reload,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const { data } = await sb.auth.getSession();
      user = data.session ? data.session.user : null;
      if (user) await start(); else loginScreen();
    } catch (e) { console.error(e); loginScreen("Connexion impossible : " + (e.message || "pas de réseau ?")); }
  });
})();
