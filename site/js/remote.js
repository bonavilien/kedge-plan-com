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
  /* la base n'a pas encore les scripts de la 2.5/2.6 : on le repère au chargement pour ne pas proposer ce qu'elle refusera */
  const absente = (e) => /42P01|42703|PGRST20[45]|does not exist|could not find/i.test(((e && e.code) || "") + " " + ((e && e.message) || ""));
  let manque = {};
  const softT = (nom, q) => run(q).catch((e) => { if (absente(e)) manque[nom] = true; return []; });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
  const TRANCHER = "à trancher en réunion";
  /* messages : '1' à '9' dans la base, une clé par message dans l'appli ; 'REC' = l'étiquette hors messages */
  const mIn = (x) => (x === "REC" || x === "INC" ? "recrutement" : +x > 0 ? KP.msgKey(+x) : "");
  const mOut = (k) => { const m = KP.MESSAGES.find((x) => x.k === k); return !m ? "0" : m.hors ? "REC" : String(m.n); };
  const stIn = { idee: "confirmer", confirmer: "confirmer", planifie: "prevu", production: "prevu", diffuse: "diffuse", retire: "confirmer" };
  const stOut = { confirmer: "confirmer", prevu: "planifie", diffuse: "diffuse" };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const int = (s) => { const m = /\d+/.exec(String(s == null ? "" : s)); return m ? Math.min(999, Math.max(1, +m[0])) : null; };
  const ms = (ts) => (ts ? new Date(ts).getTime() : 0);

  let user = null, shadow = null, partnerK = {}, perKeys = {}, blocks = {}, queue = Promise.resolve(), pending = 0, reloading = false, dirty = false, gen = 0;
  const pseudo = { chef: { k: "chef", nom: "les chefs de projet", court: "Chefs de projet" }, offre: { k: "offre", nom: "la Resp. offre", court: "Resp. offre" },
    marketing: { k: "marketing", nom: "la Dir. marketing et recrutement", court: "Dir. marketing" }, programme: { k: "programme", nom: "la Direction du Programme", court: "Dir. Programme" } };

  /* ---------- lecture : tout, d'un coup (l'équipe est petite) ---------- */
  let photoCol = false;
  async function load() {
    manque = {};
    const all = (t, order) => run(sb.from(t).select("*").order(order));
    const [per, svc, prt, prof, items, links, reqs, blk, ans, meta, journal, lieux, contacts, ic, msgs, prix, env] = await Promise.all([
      all("periods", "du"), all("services", "ordre"), all("partners", "nom"), all("profiles", "nom"), all("items", "date"), all("links", "at"), all("reqs", "at"), all("blocks", "at"),
      run(sb.from("answers").select("key,val").eq("user_id", user.id)), all("meta", "k"), soft(sb.from("journal").select("*").order("id", { ascending: false }).limit(3000), []),
      soft(sb.from("lieux").select("*").order("nom"), []), soft(sb.from("contacts").select("*").order("nom"), []), soft(sb.from("item_contacts").select("*"), []),
      soft(sb.from("messages").select("*").order("n"), []),
      /* budget : la base ne le donne qu'aux chefs de projet ; les autres reçoivent des listes vides */
      softT("budget", sb.from("budget").select("item,montant")), softT("enveloppes", sb.from("enveloppes").select("per,montant")),
    ]);
    /* sans session valable, la base renvoie des listes vides sans erreur : on ne remplace pas le plan par du vide */
    if (!prof.some((p) => p.id === user.id)) { const e = new Error("session expirée"); e.session = true; throw e; }
    /* périodes et messages de cette équipe, réglés dans Réglages : une clé par période, stable pendant la session */
    const used = new Set();
    const periods = per.map((p) => {
      let k = perKeys[p.n]; if (!k || used.has(k)) { k = KP.slug(p.nom); while (used.has(k)) k += "-" + p.n; perKeys[p.n] = k; }
      used.add(k); return { k, n: p.n, nom: p.nom, du: p.du, au: p.au, lib: KP.libOf(p.du, p.au) };
    });
    KP.setRefs(periods, msgs.filter((x) => x.n >= 0 && x.n <= 9));
    const perK = (n) => perKeys[n] || "";
    partnerK = Object.fromEntries(prt.map((p) => [p.nom, p.k]));
    const partnerNom = Object.fromEntries(prt.map((p) => [p.k, p.nom]));
    const docs = {}, cts = {};
    links.forEach((l) => (docs[l.item] = docs[l.item] || []).push({ id: l.id, t: l.nom, url: l.url }));
    ic.forEach((x) => (cts[x.item] = cts[x.item] || []).push(x.contact));
    blocks = {};
    blk.filter((b) => !b.leve && b.why.startsWith(TRANCHER)).forEach((b) => (blocks[b.item] = blocks[b.item] || []).push(b.id));
    /* la photo de chacun (2.7, script 0034) : une base sans la colonne n'affiche que les initiales et ne propose pas d'en ajouter */
    photoCol = prof.some((p) => "photo" in p);
    const people = prof.map((p) => ({ k: p.id, nom: p.nom || "Sans nom", fonction: p.fonction || "", role: p.visiteur ? "lecteur" : p.chef ? "pilote" : p.svc ? "service" : "lecteur", svc: p.svc || "", photo: KP.photoSure(p.photo) }));
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
        if (r.res && typeof r.res === "object" && Object.keys(r.res).length) it.res = KP.resPropre(r.res);
        if (r.kind === "classement") { it.rang = r.rang ? (r.rang === 1 ? "1er" : r.rang + "e") : ""; it.cible = r.cible ? "Top " + r.cible : ""; }
        if (sujet && pers.length) { const a = KP.PERIODS.find((p) => p.k === pers[0]), z = KP.PERIODS.find((p) => p.k === pers[pers.length - 1]); it.per = pers[0]; it.pers = pers; it.date = a.du; it.fin = z.au; }
        if (r.st === "retire") it.annule = { txt: r.annule_motif || "", qui: r.annule_par || "", quand: ms(r.annule_at) || ms(r.updated_at) };
        if (r.report_at) it.report = { de: r.report_de || "", txt: r.report_motif || "", qui: r.report_par || "", quand: ms(r.report_at) };
        return it;
      }),
      reqs: reqs.filter((r) => r.st !== "annulee").map((r) => ({ id: r.id, item: r.item, de: r.asker || "", a: r.dest === "moi" || r.dest === "programme" ? r.asker || "" : r.dest,
        quoi: KP.ELEMENTS.includes(r.type) || r.type === "Info" ? r.type : "Autre", txt: r.quoi || (KP.ELEMENTS.includes(r.type) ? "" : r.type), pour: r.pour || "", fait: r.st === "recue", rep: r.reponse || "", quand: ms(r.at) })),
      journal: journal.map((j) => ({ id: "j" + j.id, item: j.item, qui: j.author || "", quand: ms(j.at), txt: jtxt(j), ...(j.diff && j.diff.dest && /message|reponse|retrait|relance|deadline/.test(j.kind) ? { dest: j.diff.dest } : {}), ...(j.diff && j.diff.asker && j.kind === "reponse" ? { asker: j.diff.asker } : {}) })),
      lastMeeting: m.last_meeting || KP.TODAY,
      projet: { couleur: m.couleur || "", sousTitre: m.sous_titre || "" },
      budget: Object.fromEntries(prix.map((b) => [b.item, b.montant])),
      env: Object.fromEntries(env.map((e) => [perK(e.per), e.montant]).filter(([k]) => k)),
    };
    return data;
  }

  /* une ligne d'historique de la base, dite en une phrase */
  function jtxt(j) {
    const d = j.diff || {}, k = Object.keys(d);
    if (j.kind === "creation") return "a créé la fiche";
    if (j.kind === "document") return "a ajouté un document";
    if (j.kind === "message") { const a = KP.dest ? KP.dest(d.dest) : d.dest; return d.pour ? `a demandé ${KP.ASK[d.type] || "des éléments"} à ${a}` : `a écrit pour info à ${a}`; }
    if (j.kind === "reponse") return "a répondu à une demande";
    if (j.kind === "retrait") return d.info ? "a retiré un message" : "a retiré une demande";
    if (j.kind === "prevenu") return d.svc ? "a prévenu " + ((KP.service(d.svc) || {}).nom || "un service") : "a prévenu d'un changement";
    if (j.kind === "relance") return "a relancé une demande";
    if (j.kind === "deadline") return "a changé l'échéance d'une demande";
    if (k.length === 1 && d.res) return d.res[1] && Object.keys(d.res[1]).length ? "a noté les résultats : " + KP.resTxt(d.res[1]) : "a retiré les résultats";
    if (d.st && d.st[1] === "retire") return "a annulé" + (d.annule_motif && d.annule_motif[1] ? " : " + d.annule_motif[1] : "");
    if (d.st && d.st[0] === "retire") return "a rétabli";
    if (d.report_motif && d.report_motif[1]) return "a reporté" + (d.date ? " au " + KP.fmt.moyen(d.date[1]) : "") + " : " + d.report_motif[1];
    if (d.date) return "a déplacé au " + KP.fmt.moyen(d.date[1]);
    if (d.st) return "a marqué « " + ((KP.STATUTS.find((s) => s.k === stIn[d.st[1]]) || {}).nom || d.st[1]) + " »";
    const noms = { t: "le titre", fin: "le dernier jour", flou: "la date", per: "les périodes", svc: "le service", m: "les messages", tf: "le temps fort lié", partner: "le média", lieu: "le lieu", note: "la note", rang: "le rang", cible: "l'objectif", cc: "les services prévenus", res: "les résultats" };
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
      o.per = pers.map((k) => (KP.PERIODS.find((p) => p.k === k) || {}).n).filter((n) => n != null);
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
    /* les résultats : seulement s'il y en a, pour qu'une base sans la colonne (avant 0031) crée encore des fiches */
    if (has("res") && (!creation || (it.res && Object.keys(it.res).length))) o.res = it.res || {};
    if (has("report")) { o.report_de = it.report ? it.report.de || "" : ""; o.report_motif = it.report ? it.report.txt || "" : ""; }
    return o;
  }
  const FIELDS = ["t", "date", "flou", "fin", "per", "pers", "variant", "svc", "m", "st", "annule", "tf", "partner", "lieu", "note", "rang", "cible", "report", "res"];
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
    /* le carnet des lieux est tenu par les pilotes : pour un service, le lieu va sur la fiche sans entrer au carnet */
    db.lieux.filter((n) => !shadow.lieux.includes(n)).forEach((n) => ops.push(() => run(sb.from("lieux").insert({ nom: n })).catch(() => {})));
    shadow.lieux.filter((n) => !db.lieux.includes(n)).forEach((n) => ops.push(() => run(sb.from("lieux").delete().eq("nom", n))));
    const c0 = byId(shadow.contacts), c1 = byId(db.contacts);
    db.contacts.forEach((c) => { if (!c0[c.id]) ops.push(() => run(sb.from("contacts").insert({ id: c.id, nom: c.nom, role: c.role || "", mail: c.mail || "", tel: c.tel || "" }))); else if (!same(c, c0[c.id])) ops.push(() => run(sb.from("contacts").update({ nom: c.nom, role: c.role || "", mail: c.mail || "", tel: c.tel || "" }).eq("id", c.id))); });
    shadow.contacts.forEach((c) => { if (!c1[c.id]) ops.push(() => run(sb.from("contacts").delete().eq("id", c.id))); });
    /* périodes (avant les fiches : un sujet peut citer une période créée à l'instant) et noms des messages */
    const pr0 = Object.fromEntries(shadow.periods.map((p) => [p.n, p])), pr1 = Object.fromEntries(KP.PERIODS.map((p) => [p.n, p]));
    const prow = (p) => ({ nom: p.nom, du: p.du, au: p.au, lib: p.lib });
    KP.PERIODS.forEach((p) => { const o = pr0[p.n]; if (!o) ops.push(() => run(sb.from("periods").insert({ n: p.n, ...prow(p) }))); else if (!same(prow(p), prow(o))) ops.push(() => changed(sb.from("periods").update(prow(p)).eq("n", p.n))); });
    shadow.periods.forEach((p) => { if (!pr1[p.n]) ops.push(() => run(sb.from("periods").delete().eq("n", p.n))); });
    const ms0 = Object.fromEntries(shadow.messages.map((m) => [m.n, m])), ms1 = Object.fromEntries(KP.MESSAGES.map((m) => [m.n, m]));
    KP.MESSAGES.forEach((m) => { const o = ms0[m.n], row = { nom: m.nom, info: m.info || "" };
      if (!o) ops.push(() => run(sb.from("messages").upsert({ n: m.n, ...row })));
      else if (o.nom !== m.nom || o.info !== m.info) ops.push(() => run(sb.from("messages").upsert({ n: m.n, ...row }))); });
    shadow.messages.forEach((m) => { if (!ms1[m.n]) ops.push(() => run(sb.from("messages").delete().eq("n", m.n))); });
    /* fiches : les temps forts avant leurs relais */
    const i0 = byId(shadow.items), i1 = byId(db.items), gone = new Set(shadow.items.filter((s) => !i1[s.id]).map((s) => s.id));
    [...db.items].sort((a, b) => (a.tf ? 1 : 0) - (b.tf ? 1 : 0)).forEach((it) => {
      const old = i0[it.id];
      if (!old) return ops.push(async () => {
        await partnerFor(it.variant === "partenariat" ? it.partner : "");
        const row = cols(it, FIELDS.filter((k) => k !== "report"), true);
        await run(sb.from("items").insert({ id: it.id, kind: it.variant === "classement" ? "classement" : it.kind, ...row }));
        (it.docs || []).forEach((d) => delete d.id); /* une copie reprend les documents : ce sont de nouveaux liens */
        await side(it, null);
      });
      /* le temps fort supprimé : la base détache elle-même ses relais, inutile (et parfois interdit) de les modifier */
      let keys = FIELDS.filter((k) => !same(it[k], old[k]) && !(k === "tf" && !it.tf && gone.has(old.tf)));
      const sides = !same(it.docs, old.docs) || !same(it.contacts, old.contacts) || !!it.reunion !== !!old.reunion;
      /* les résultats : seules les unités changées partent, la base les fusionne (deux personnes qui notent en même temps ne s'effacent pas) ;
         avant l'état, pour qu'un « Diffusé » ne parte pas sans ses chiffres refusés */
      if (keys.includes("res")) { keys = keys.filter((k) => k !== "res"); const a = it.res || {}, b = old.res || {};
        const pose = Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, a[k]])), retire = Object.keys(b).filter((k) => !(k in a));
        ops.push(() => run(sb.rpc("set_res", { p_item: it.id, p_pose: pose, p_retire: retire }))); }
      if (keys.length) ops.push(async () => { await partnerFor(it.variant === "partenariat" ? it.partner : ""); await changed(sb.from("items").update(cols(it, keys)).eq("id", it.id)); });
      if (sides) ops.push(() => side(it, old));
    });
    /* une fiche supprimée : la base demande qu'elle soit d'abord retirée (les services concernés sont prévenus) */
    shadow.items.forEach((it) => { if (!i1[it.id]) ops.push(async () => { if (!it.annule) await changed(sb.from("items").update({ st: "retire" }).eq("id", it.id)); await changed(sb.from("items").delete().eq("id", it.id)); }); });
    /* demandes */
    const r0 = byId(shadow.reqs);
    db.reqs.forEach((r) => {
      const old = r0[r.id];
      /* un message à plusieurs personnes : le refus de l'une n'empêche pas les autres de partir */
      if (!old) return ops.push(Object.assign(() => run(sb.from("reqs").insert({ id: r.id, item: r.item, dest: r.a === user.id ? "moi" : r.a, type: r.quoi || (r.pour ? "Autre" : "Info"), quoi: r.txt || "", pour: r.pour || null })), { seul: true }));
      if (r.fait && !old.fait) ops.push(() => changed(sb.from("reqs").update({ st: "recue", reponse: r.rep || "" }).eq("id", r.id)));
      else if (!r.fait && old.fait) ops.push(async () => { throw new Error("une demande reçue reste reçue"); });
      else if (!r.fait && (r.txt !== old.txt || r.pour !== old.pour)) ops.push(() => changed(sb.from("reqs").update({ quoi: r.txt || "", pour: r.pour || null }).eq("id", r.id)));
    });
    /* une demande retirée (ou un rappel effacé) : la base la garde, marquée « annulée » ; celles d'une fiche supprimée partent avec elle */
    shadow.reqs.forEach((r) => { if (!db.reqs.some((x) => x.id === r.id) && !gone.has(r.item) && !r.fait) ops.push(() => changed(sb.from("reqs").update({ st: "annulee" }).eq("id", r.id))); });
    /* budget des partenariats et enveloppes des périodes (chefs de projet) : après les fiches, qu'un montant puisse citer une fiche créée à l'instant */
    const b0 = shadow.budget || {}, b1 = db.budget || {};
    Object.keys(b1).forEach((id) => { if (b1[id] !== b0[id]) ops.push(() => run(sb.from("budget").upsert({ item: id, montant: b1[id] }))); });
    Object.keys(b0).forEach((id) => { if (!(id in b1) && !gone.has(id)) ops.push(() => run(sb.from("budget").delete().eq("item", id))); });
    const e0 = shadow.env || {}, e1 = db.env || {}, perN = (k) => (KP.PERIODS.find((p) => p.k === k) || {}).n;
    Object.keys(e1).forEach((k) => { if (e1[k] !== e0[k] && perN(k) != null) ops.push(() => run(sb.from("enveloppes").upsert({ per: perN(k), montant: e1[k] }))); });
    Object.keys(e0).forEach((k) => { if (!(k in e1) && perN(k) != null) ops.push(() => run(sb.from("enveloppes").delete().eq("per", perN(k)))); });
    /* équipe, services, médias */
    const p0 = Object.fromEntries(shadow.people.map((p) => [p.k, p]));
    db.people.forEach((p) => { const o = p0[p.k]; if (o && !same(p, o)) ops.push(() => run(sb.from("profiles").update({ nom: p.nom, fonction: p.fonction, ...(photoCol && (p.photo || "") !== (o.photo || "") ? { photo: p.photo || null } : {}), ...(p.role !== o.role || p.svc !== o.svc ? { chef: p.role === "pilote", visiteur: p.role === "lecteur", svc: p.svc || null } : {}) }).eq("id", p.k))); });
    const s0 = Object.fromEntries(shadow.services.map((s) => [s.k, s])), s1 = Object.fromEntries(db.services.map((s) => [s.k, s]));
    db.services.forEach((s, i) => { if (!s0[s.k]) ops.push(() => run(sb.from("services").insert({ k: s.k, nom: s.nom, court: s.court, ordre: i + 1 }))); else if (!same(s, s0[s.k])) ops.push(() => run(sb.from("services").update({ nom: s.nom, court: s.court }).eq("k", s.k))); });
    shadow.services.forEach((s) => { if (!s1[s.k]) ops.push(() => run(sb.from("services").delete().eq("k", s.k))); });
    shadow.partners.filter((n) => !db.partners.includes(n)).forEach((n) => ops.push(async () => { await run(sb.from("partners").delete().eq("nom", n)); delete partnerK[n]; }));
    /* réunion, préférences, version */
    if (db.lastMeeting !== shadow.lastMeeting) ops.push(() => run(sb.from("meta").upsert({ k: "last_meeting", v: db.lastMeeting })));
    const pj = db.projet || {}, pj0 = shadow.projet || {};
    if ((pj.couleur || "") !== (pj0.couleur || "")) ops.push(() => run(sb.from("meta").upsert({ k: "couleur", v: pj.couleur || "" })));
    if ((pj.sousTitre || "") !== (pj0.sousTitre || "")) ops.push(() => run(sb.from("meta").upsert({ k: "sous_titre", v: pj.sousTitre || "" })));
    const a = db.prefs[user.id] || {}, b = shadow.prefs[user.id] || {};
    const perso = (p) => { const { notif, version, versionVue, ...rest } = p; return rest; };
    if (!same(perso(a), perso(b))) ops.push(() => run(sb.from("answers").upsert({ key: "v2", val: JSON.stringify(perso(a)) }, { onConflict: "user_id,key" })));
    if (!same(a.notif, b.notif) && a.notif) ops.push(() => run(sb.from("profiles").update({ notif_all: !!a.notif.creations, notif_demandes: a.notif.demandes !== false, notif_changements: a.notif.changements !== false }).eq("id", user.id)));
    if (a.version && a.version !== b.version) ops.push(() => run(sb.from("profiles").update({ version: a.version }).eq("id", user.id)).catch(() => {}));
    return ops;
  }

  /* pendant un rechargement, une modification n'est jamais jetée : elle part dès que le rechargement finit */
  function sync(db) {
    if (!shadow) return;
    if (reloading) { dirty = true; return; }
    let ops; try { ops = plan(db); } catch (e) { return fail(e); }
    const before = shadow; shadow = snapshot(db);
    if (!ops.length) return;
    const g = gen; pending++; badge();
    const reseau = (e) => !navigator.onLine || /fetch|network|load failed|timed? ?out/i.test((e && e.message) || "");
    queue = queue.then(async () => { let refus = null;
        for (const op of ops) { if (g !== gen) return; if (!op.seul) { await op(); continue; } try { await op(); } catch (e) { if (reseau(e)) throw e; refus = refus || e; } }
        if (refus) throw Object.assign(refus, { seul: true }); })
      .then(() => { pending = Math.max(0, pending - 1); badge(); if (!pending) { fixDocs(); if (horsLigne) enLigne(); } },
        (e) => { pending = Math.max(0, pending - 1); badge(); if (g !== gen) return;
          /* un message refusé (et seulement lui) : les écritures suivantes, indépendantes, partent quand même */
          if (e && e.seul && !reseau(e)) return fail(e);
          gen++; if (reseau(e)) { shadow = before; offline(); } else fail(e); });
  }
  /* la base refuse : on le dit, et on revient à ce qu'elle contient vraiment */
  function fail(e) {
    console.error(e);
    KP.toast("Non enregistré : " + frErr(e));
    Promise.resolve(reload()).then(() => document.dispatchEvent(new CustomEvent("kp:refus")));
  }
  /* hors connexion (ou serveur qui ne répond pas) : la modification reste à l'écran, aucun rechargement ne l'efface,
     et elle repart au retour du réseau, au retour sur l'onglet, et toutes les 30 secondes */
  let horsLigne = false, retente = 0;
  function offline() {
    if (!horsLigne) KP.toast("Pas de réseau : ta modification partira au retour de la connexion");
    horsLigne = true; document.documentElement.classList.add("offline");
    clearTimeout(retente); retente = setTimeout(() => { if (horsLigne) sync(store._db()); }, 30000);
  }
  function enLigne() { horsLigne = false; clearTimeout(retente); document.documentElement.classList.remove("offline"); KP.toast("Connexion revenue : tout est parti"); later(); }
  window.addEventListener("online", () => { if (horsLigne) sync(store._db()); });
  /* base sans les scripts 2.6 : pas d'écran Résultats ni de budget (la base les refuserait), et on dit quoi faire */
  let prevenu = false;
  function baseAJour() {
    const ok = !manque.budget; KP.base = { resultats: ok, photo: photoCol };
    if (!ok && !prevenu && KP.me().role === "pilote") { prevenu = true; setTimeout(() => KP.toast("La base n'est pas à jour : colle 2.5_0030 puis 2.6_0031 dans Supabase (SQL Editor)"), 1500); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && horsLigne) sync(store._db()); });
  const frErr = (e) => { const m = (e && e.message) || "";
    if (/row-level security|permission denied/i.test(m)) return "tu n'as pas le droit de faire ce changement";
    if (/null value in column "pour"|column "res"|relation "public\.(budget|enveloppes)"|function public\.set_res|set_res/i.test(m) || absente(e)) return "la base n'est pas à jour (à coller dans Supabase : 2.5_0030 puis 2.6_0031)";
    if (/res_ok|budget_montant_check|enveloppes_montant_check/i.test(m)) return "ce chiffre n'est pas possible";
    if (/fetch|network/i.test(m)) return "le serveur ne répond pas";
    return m || "la base ne répond pas"; };
  const snapshot = (db) => clone({ periods: KP.PERIODS, messages: KP.MESSAGES.map((m) => ({ n: m.n, nom: m.nom, info: m.info })), items: db.items, reqs: db.reqs, people: db.people, services: db.services, partners: db.partners, lieux: db.lieux, contacts: db.contacts, prefs: { [user.id]: db.prefs[user.id] || {} }, lastMeeting: db.lastMeeting, projet: db.projet || {}, budget: db.budget || {}, env: db.env || {} });
  /* les documents ajoutés ont reçu leur identifiant de la base : la copie de référence le prend aussi */
  function fixDocs() { const cur = Object.fromEntries(store._db().items.map((i) => [i.id, i])); shadow.items.forEach((s) => { const i = cur[s.id]; if (i && i.docs && s.docs && i.docs.length === s.docs.length) s.docs = clone(i.docs); }); }
  function badge() { document.documentElement.classList.toggle("saving", pending > 0); }

  async function reload() {
    /* des modifications attendent le réseau : on les envoie d'abord, on ne remplace rien par la base */
    if (horsLigne) { sync(store._db()); return; }
    if (reloading) return; reloading = true; dirty = false;
    try {
      const data = await load();
      /* modifié pendant la lecture : on envoie d'abord, on relira ensuite */
      if (dirty) { reloading = false; dirty = false; sync(store._db()); later(); return; }
      if (horsLigne) { reloading = false; sync(store._db()); return; }
      shadow = snapshot(data); store._replace(data); baseAJour();
      if (KP.outils) KP.outils.charge();
    }
    catch (e) { console.error(e); if (e.session) { reloading = false; return loginScreen("Ta session a expiré, reconnecte-toi."); } KP.toast("Impossible de relire la base, pas de réseau ?"); }
    reloading = false;
    if (dirty) { dirty = false; sync(store._db()); }
  }
  let later = () => {};
  /* temps réel : un changement fait par quelqu'un d'autre recharge, sauf pendant qu'on enregistre */
  let watching = false;
  function watch() {
    if (watching) return; watching = true;
    let t = 0;
    const kick = () => { clearTimeout(t); t = setTimeout(() => (pending > 0 ? kick() : reload()), 600); };
    later = kick;
    try { sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") loginScreen("Ta session a expiré, reconnecte-toi."); }); } catch (e) {}
    try { sb.channel("kplan").on("postgres_changes", { event: "*", schema: "public" }, kick).subscribe(); } catch (e) {}
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  }

  /* ---------- connexion ---------- */
  /* le dernier compte connecté sur cet appareil : « Bonjour Julien », l'adresse déjà remplie */
  const DERNIER = "kplan-dernier";
  const dernier = () => { try { const d = JSON.parse(localStorage.getItem(DERNIER) || "null"); return d && d.email ? d : null; } catch (e) { return null; } };
  function loginScreen(msg) {
    let el = document.getElementById("login");
    if (!el) { el = document.createElement("div"); el.id = "login"; el.className = "login"; document.body.appendChild(el); }
    /* avec le symbole de l'icône, il passe en fond animé et quitte le formulaire */
    const fond = (KP.marque && KP.marque.symbole) || ((C.marque || {}).symbole || "");
    const app = (KP.marque && KP.marque.app) || "Plan de com";
    const st = (KP.couleur && KP.couleur.memo().sousTitre) || (KP.marque && !KP.marque.logo ? KP.marque.nom : "");
    const moi = dernier(), ic = (n) => KP.ic(n);
    el.classList.toggle("fond", !!fond);
    el.innerHTML = `${fond ? `<div class="login-fond" aria-hidden="true"></div>` : ""}<form class="login-card" autocomplete="on" novalidate>
        ${!fond && KP.logo ? KP.logo("login-logo") : ""}
        <div class="lc-tete">${moi && moi.prenom
          ? `<p class="lc-app">${h(app)}${st ? `<span>${h(st)}</span>` : ""}</p><h1>Bonjour ${h(moi.prenom)}</h1>${(() => { const pq = KP.pique ? KP.pique("connexion") : ""; return pq ? `<p class="lc-pique">${h(pq)}</p>` : ""; })()}`
          : `<h1>${h(app)}</h1>${st ? `<p class="lc-app"><span>${h(st)}</span></p>` : ""}`}</div>
        ${moi ? `<div class="lc-moi"><span class="lc-av" aria-hidden="true">${h((moi.prenom || moi.email).charAt(0).toUpperCase())}</span><span class="lc-mail">${h(moi.email)}</span><button type="button" class="lc-autre" data-autre>Changer</button></div>` : ""}
        <label class="lc-champ"${moi ? " hidden" : ""}><span class="sr">Adresse</span>${ic("mail")}<input type="email" name="email" autocomplete="username" placeholder="Adresse e-mail" required value="${moi ? h(moi.email) : ""}"></label>
        <label class="lc-champ"><span class="sr">Mot de passe</span>${ic("lock")}<input type="password" name="password" autocomplete="current-password" placeholder="Mot de passe" required><button type="button" class="lc-oeil" data-oeil aria-label="Afficher le mot de passe" aria-pressed="false">${ic("eye")}</button></label>
        <p class="login-err" role="alert">${h(msg || "")}</p>
        <button type="submit" class="lc-go"><span>Entrer</span>${ic("arrow")}</button>
        ${C.visiteur ? `<button type="button" class="link lc-visiteur" data-visiteur>Entrer en visiteur</button>` : ""}
      </form>
      <p class="login-ver">Version ${h(KP.versionLabel(KP.VERSION.n))}</p>`;
    if (fond) fetch(fond.replace(/symbole\.png$/, "fond.svg")).then((r) => (r.ok ? r.text() : "")).then((t) => { const d = el.querySelector(".login-fond"); if (d && t.startsWith("<svg")) d.innerHTML = t; }).catch(() => {});
    const f = el.querySelector("form"), err = f.querySelector(".login-err"), go = f.querySelector("[type=submit]");
    const champMail = f.email.closest(".lc-champ");
    const autre = () => { const c = f.querySelector(".lc-moi"); if (c) c.remove(); champMail.hidden = false; };
    f.querySelector("[data-autre]")?.addEventListener("click", () => { autre(); f.email.value = ""; f.email.focus(); });
    f.querySelector("[data-visiteur]")?.addEventListener("click", () => { autre(); f.email.value = C.visiteur; f.password.focus(); });
    f.querySelector("[data-oeil]").addEventListener("click", (e) => {
      const b = e.currentTarget, vu = f.password.type === "password";
      f.password.type = vu ? "text" : "password"; b.setAttribute("aria-pressed", String(vu));
      b.setAttribute("aria-label", vu ? "Masquer le mot de passe" : "Afficher le mot de passe"); b.innerHTML = ic(vu ? "eyeoff" : "eye"); f.password.focus();
    });
    (moi ? f.password : f.email).focus({ preventScroll: true });
    const rate = (t) => { err.textContent = t; f.classList.remove("secoue"); void f.offsetWidth; f.classList.add("secoue"); };
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      if (!f.email.value.trim()) { autre(); f.email.focus(); return rate("Ton adresse e-mail, d'abord."); }
      if (!f.password.value) { f.password.focus(); return rate("Ton mot de passe, d'abord."); }
      go.disabled = true; go.classList.add("attente");
      try { const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }); if (error) throw error; user = data.user; go.classList.replace("attente", "ok"); await start(); }
      catch (x) { go.disabled = false; go.classList.remove("attente", "ok"); rate(/invalid/i.test(x.message || "") ? "Raté. L'adresse ou le mot de passe, je ne dirai pas lequel." : "Connexion impossible : " + (x.message || "pas de réseau ?")); }
    });
    window.kpOuvrir && window.kpOuvrir();
  }
  async function start() {
    const data = await load();
    shadow = snapshot(data); baseAJour();
    store._attach({ sync, uuid, pseudo, relance: (id) => run(sb.rpc("relancer", { p_req: id })).then(() => true, (e) => { KP.toast("Relance non envoyée : " + frErr(e)); return false; }), prevenir: (id, svc) => run(sb.rpc("prevenir", { p_item: id, p_svc: svc })).then(() => true, (e) => { KP.toast("Non envoyé : " + frErr(e)); return false; }) }, data);
    /* mêmes droits que la base : un service modifie les fiches de son service, un pilote tout */
    store.canEdit = (it) => { const u = KP.me(); return u.role === "pilote" || (u.role === "service" && !!it && it.variant !== "partenariat" && it.svc === u.svc); };
    /* l'écran de connexion s'efface par-dessus l'appli déjà affichée */
    const el = document.getElementById("login"); if (el) { el.classList.add("sort"); setTimeout(() => el.remove(), 380); }
    KP.hold = false;
    if (!location.hash) history.replaceState(null, "", "#/accueil");
    if (KP.parseRoute) KP.route = KP.parseRoute(); /* les périodes de la base remplacent celles de la démonstration */
    KP.render();
    try { localStorage.setItem(DERNIER, JSON.stringify({ email: user.email || "", prenom: String(KP.me().nom || "").trim().split(/\s+/)[0] })); } catch (e) {}
    window.kpOuvrir && window.kpOuvrir();
    watch();
    if (KP.outils) KP.outils.charge();
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
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Ton navigateur bloque mes notifications (voir ses réglages). Je ne le prends pas mal.");
      const r = await navigator.serviceWorker.ready;
      const s = (await r.pushManager.getSubscription()) || (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(C.vapidPublicKey) }));
      const j = s.toJSON(); await run(sb.rpc("save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })); push.on = true;
    },
    async disable() { const r = await navigator.serviceWorker.getRegistration(); const s = r && (await r.pushManager.getSubscription()); if (s) { await run(sb.from("push_subs").delete().eq("endpoint", s.endpoint)).catch(() => {}); await s.unsubscribe(); } push.on = false; },
  };
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "open" && e.data.url) { const h2 = new URL(e.data.url).hash; if (h2) location.hash = h2; } });

  /* ---------- mise à jour en un clic (copie seulement) : la fonction « mise-a-jour » du Supabase de cette copie ---------- */
  /* une fonction du Supabase de cette appli (mise-a-jour, export), appelée avec la session du compte */
  async function fn(nom, corps, absente) {
    const { data } = await sb.auth.getSession();
    const tok = data.session ? data.session.access_token : "";
    let r;
    try { r = await fetch(C.supabaseUrl + "/functions/v1/" + nom, { method: "POST", headers: { "content-type": "application/json", apikey: C.supabaseKey, authorization: "Bearer " + tok }, body: JSON.stringify(corps) }); }
    catch (e) { const x = new Error(absente[0]); x.code = "absente"; throw x; }
    let o = {}; try { o = await r.json(); } catch (e) {}
    if (r.status === 404 && !o.erreur) { const x = new Error(absente[1]); x.code = "absente"; throw x; }
    if (!r.ok) { const x = new Error(o.message || absente[2] + " (" + r.status + ")."); x.code = o.erreur || "panne"; throw x; }
    return o;
  }
  const maj = (action) => fn("mise-a-jour", { action }, ["La fonction de mise à jour ne répond pas : pas de réseau, ou pas encore installée.", "Le bouton n'est pas encore installé dans Supabase.", "La mise à jour a échoué"]);
  /* Asana et Trello : ce qui est relié et les fiches envoyées se lisent dans la base ; le reste passe par la fonction « export » */
  const exporter = {
    lire: async () => {
      const [actifs, lignes] = await Promise.all([soft(sb.rpc("outils_actifs"), null), soft(sb.from("exports").select("item,user_id,outil,url,erreur").eq("user_id", user.id), [])]);
      return { base: actifs !== null, actifs: actifs || [], lignes };
    },
    fn: (corps) => fn("export", corps, ["La fonction export ne répond pas : pas de réseau, ou pas encore installée.", "La fonction export n'est pas encore installée dans Supabase.", "L'envoi a échoué"]),
  };

  KP.remote = {
    maj,
    exporter,
    push,
    get email() { return user ? user.email || "" : ""; },
    /* l'appareil ne reçoit plus les notifications de ce compte : le suivant sur ce navigateur ne les verra pas */
    signOut: async () => { try { await push.disable(); } catch (e) {} try { await sb.auth.signOut(); } catch (e) {} location.reload(); },
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
