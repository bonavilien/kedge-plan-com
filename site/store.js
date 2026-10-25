// Accès aux données : connexion, lecture, écriture et temps réel avec Supabase,
// traduits dans la forme qu'utilise l'appli (périodes en index, messages en nombres, dates locales).
window.KStore = (() => {
  const C = window.KPLAN_CONFIG;
  const ready = !!(window.KPLAN_CLIENT || (C.supabaseUrl && C.supabaseKey));
  const sb = window.KPLAN_CLIENT || (ready ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey) : null);
  const run = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const day = (ts) => iso(new Date(ts));
  const list = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} et ${a[a.length - 1]}`);
  let user = null, PERIODS = [];

  // ---------- connexion ----------
  async function session() {
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    return data.session;
  }
  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
  }
  const signOut = () => sb.auth.signOut();
  const setPassword = (password) => run(sb.auth.updateUser({ password }));

  // ---------- lecture : tout, d'un coup (l'équipe est petite) ----------
  async function load() {
    const all = (t, order) => run(sb.from(t).select("*").order(order));
    const [per, msg, svc, prt, prof, items, links, reqs, blocks, answers, seen, meta, journal] = await Promise.all([
      all("periods", "du"), all("messages", "n"), all("services", "ordre"), all("partners", "nom"), all("profiles", "nom"),
      all("items", "date"), all("links", "at"), all("reqs", "at"), all("blocks", "at"),
      run(sb.from("answers").select("key,val").eq("user_id", user.id)), run(sb.from("seen").select("item").eq("user_id", user.id)), all("meta", "k"),
      // sans la migration 0003, l'appli marche quand même, sans historique
      all("journal", "id").catch(() => []),
    ]);
    PERIODS = per.map((p) => ({ n: p.n, nom: p.nom, du: p.du, au: p.au, lib: p.lib }));
    // svc vaut « chef » pour les chefs de projet ; ownSvc garde le service réglé dans le profil
    const PEOPLE = prof.map((p) => ({ k: p.id, nom: p.nom || "Sans nom", fonction: p.fonction, svc: p.chef ? "chef" : p.svc || "", ownSvc: p.svc || "", chef: p.chef, media: p.media, notifAll: p.notif_all }));
    const names = (f) => list(PEOPLE.filter(f).map((p) => p.nom));
    // « qui » : les personnes derrière un service, pour écrire « Demande envoyée à Aurélie et Hugo »
    const SERVICES = svc.map((s) => ({ k: s.k, nom: s.nom, court: s.court, qui: names((p) => !p.chef && p.svc === s.k) || s.nom }));
    const CHEF = { k: "chef", nom: "Chef de projet", court: "Chef de projet", qui: names((p) => p.chef) || "les chefs de projet" };
    const byItem = new Map();
    links.forEach((l) => byItem.set(l.item, [...(byItem.get(l.item) || []), { id: l.id, nom: l.nom, url: l.url, by: l.author || "" }]));
    const perIndex = (n) => PERIODS.findIndex((p) => p.n === n);
    const m = Object.fromEntries(meta.map((x) => [x.k, x.v]));
    const lastTs = m.last_meeting || new Date().toISOString();
    return {
      PERIODS, PEOPLE, SERVICES, CHEF,
      MESSAGES: msg.map((x) => ({ n: x.n, nom: x.nom, info: x.info })),
      PARTNERS: prt.map((x) => ({ k: x.k, nom: x.nom })),
      me: user.id, email: user.email || "",
      db: {
        items: items.map((r) => ({
          id: r.id, kind: r.kind, t: r.t, date: r.date, flou: r.flou, per: r.per.map(perIndex).filter((i) => i >= 0),
          svc: r.svc, cc: r.cc, m: r.m.map((x) => (x === "INC" ? "INC" : +x)), st: r.st, tf: r.tf || "", partner: r.partner || "",
          lieu: r.lieu, note: r.note, by: r.author || "", at: day(r.at), ts: r.at, links: byItem.get(r.id) || [],
        })),
        reqs: reqs.map((r) => ({ id: r.id, item: r.item, from: r.asker || "", to: r.dest, type: r.type, quoi: r.quoi, pour: r.pour, st: r.st, at: day(r.at), ts: r.at })),
        blocks: blocks.map((b) => ({ id: b.id, item: b.item, by: b.author || "", why: b.why, leve: b.leve, at: day(b.at), ts: b.at })),
        answers: Object.fromEntries(answers.map((a) => [a.key, a.val])),
        vu: { [user.id]: seen.map((s) => s.item) },
        // historique : la base note chaque création, modification, document et relance
        journal: journal.map((j) => ({ id: j.id, item: j.item, by: j.author || "", kind: j.kind, diff: j.diff || {}, at: day(j.at), ts: j.at })),
        lastMeeting: day(lastTs.length === 10 ? lastTs + "T12:00:00" : lastTs), lastMeetingTs: lastTs,
      },
    };
  }

  // ---------- écriture ----------
  const itemRow = (it) => ({
    t: it.t, date: it.date, flou: it.flou, per: it.per.map((i) => PERIODS[i].n), svc: it.svc, cc: it.cc,
    m: it.m.map(String), st: it.st, tf: it.tf || null, partner: it.partner || null, lieu: it.lieu, note: it.note,
  });
  const addItem = (it) => run(sb.from("items").insert({ id: it.id, kind: it.kind, ...itemRow(it) }));
  // keys : seuls ces champs partent (une modification faite entre-temps par quelqu'un d'autre n'est pas écrasée)
  // la base ne dit rien quand une modification n'est plus permise (fiche passée à un autre service entre-temps) : aucune ligne changée
  const changed = async (q) => { const rows = await run(q.select("id")); if (!rows?.length) throw Object.assign(new Error("la fiche a changé entre-temps, tu ne peux plus la modifier"), { code: "0ROWS" }); };
  const updateItem = (id, it, keys) => { const row = itemRow(it); return changed(sb.from("items").update(keys ? Object.fromEntries(keys.map((k) => [k, row[k]])) : row).eq("id", id)); };
  const setStatus = (id, st) => changed(sb.from("items").update({ st }).eq("id", id));
  async function addLink(item, nom, url) {
    const l = await run(sb.from("links").insert({ item, nom, url }).select().single());
    return { id: l.id, nom: l.nom, url: l.url, by: l.author || "" };
  }
  const addReq = (r) => run(sb.from("reqs").insert({ id: r.id, item: r.item, dest: r.to, type: r.type, quoi: r.quoi, pour: r.pour }));
  const setReq = (id, st) => run(sb.from("reqs").update({ st }).eq("id", id));
  const setReqPour = (id, pour) => run(sb.from("reqs").update({ pour }).eq("id", id));
  const removeLink = (id) => run(sb.from("links").delete().eq("id", id));
  const addBlock = (b) => run(sb.from("blocks").insert({ id: b.id, item: b.item, why: b.why }));
  const liftBlock = (id) => run(sb.from("blocks").update({ leve: true }).eq("id", id));
  const answer = (key, val) => run(sb.from("answers").upsert({ key, val }, { onConflict: "user_id,key" }));
  const markSeen = (item) => run(sb.from("seen").upsert({ item }, { onConflict: "user_id,item" }));
  const setMeta = (k, v) => run(sb.from("meta").upsert({ k, v }));
  const setProfile = (id, p) => run(sb.from("profiles").update({ nom: p.nom, fonction: p.fonction, svc: p.ownSvc || null, chef: p.chef, media: p.media, notif_all: p.notifAll }).eq("id", id));
  // prévenir à nouveau après un changement : la base choisit les destinataires, renvoie leur nombre
  const renotify = (item, quoi) => run(sb.rpc("renotify", { p_item: item, p_quoi: quoi }));
  const addPartner = (nom) => run(sb.from("partners").insert({ nom }).select().single()).then((x) => ({ k: x.k, nom: x.nom }));

  // ---------- notifications : l'abonnement push de ce téléphone ----------
  // par la base : un téléphone déjà abonné pour quelqu'un d'autre passe à la personne connectée
  const savePush = (sub) => run(sb.rpc("save_push", { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth }));
  const removePush = (endpoint) => run(sb.from("push_subs").delete().eq("endpoint", endpoint));

  // ---------- temps réel : un changement fait par quelqu'un d'autre recharge les données ----------
  function watch(cb) {
    let t = 0;
    const kick = () => { clearTimeout(t); t = setTimeout(cb, 400); };
    sb.channel("kplan").on("postgres_changes", { event: "*", schema: "public" }, kick).subscribe();
    // retour sur l'appli après une pause : le téléphone a pu manquer des changements
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  }

  return { ready, session, signIn, signOut, setPassword, load, addItem, updateItem, setStatus, addLink, removeLink, addReq, setReq, setReqPour, addBlock, liftBlock, answer, markSeen, setMeta, setProfile, addPartner, renotify, savePush, removePush, watch };
})();
