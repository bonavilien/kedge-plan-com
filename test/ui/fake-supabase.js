// Faux client Supabase pour tester l'interface sans réseau : les mêmes appels que store.js,
// les données dans le navigateur (localStorage), quelques règles de droits pour tester les refus.
(() => {
  const KEY = "kplan-fake";
  const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
  const seed = () => ({
    periods: [
      { n: 1, nom: "Installer", du: "2026-09-01", au: "2026-10-31", lib: "Sept. – oct. 2026" },
      { n: 2, nom: "Considérer", du: "2026-11-01", au: "2026-12-31", lib: "Nov. – déc. 2026" },
      { n: 3, nom: "Préférer", du: "2027-01-01", au: "2027-03-31", lib: "Janv. – mars 2027" },
      { n: 4, nom: "Convertir", du: "2027-04-01", au: "2027-05-31", lib: "Avril – mai 2027" },
      { n: 5, nom: "Décider", du: "2027-06-01", au: "2027-07-15", lib: "Juin – mi-juillet 2027" },
    ],
    messages: [
      { n: 1, nom: "Filières", info: "" }, { n: 2, nom: "Alumni", info: "" }, { n: 3, nom: "International", info: "" },
      { n: 4, nom: "Continuum", info: "" }, { n: 5, nom: "Réputation", info: "" },
    ],
    services: [{ k: "rp", nom: "Relations presse", court: "RP", ordre: 1 }, { k: "rs", nom: "Réseaux sociaux", court: "RS", ordre: 2 }, { k: "video", nom: "Production vidéo", court: "Vidéo", ordre: 3 }],
    partners: [],
    profiles: [
      { id: U(1), nom: "Julien", fonction: "Chef de projet", svc: null, chef: true, media: true, notif_all: true },
      { id: U(2), nom: "Estelle", fonction: "Responsable de l'offre", svc: null, chef: true, media: false, notif_all: false, offre: true },
      { id: U(3), nom: "Aurélie", fonction: "", svc: "rp", chef: false, media: false, notif_all: false },
      { id: U(4), nom: "Stéphane", fonction: "", svc: "rs", chef: false, media: false, notif_all: false },
      { id: U(5), nom: "Louise", fonction: "", svc: "video", chef: false, media: false, notif_all: false },
      { id: U(6), nom: "Nouveau", fonction: "", svc: null, chef: false, media: false, notif_all: false },
    ],
    items: [], links: [], reqs: [], blocks: [], answers: [], seen: [], push_subs: [], journal: [], outbox: [],
    meta: [{ k: "last_meeting", v: "2026-10-01" }],
    users: ["julien", "estelle", "aurelie", "stephane", "louise", "nouveau"].map((n, i) => ({ id: U(i + 1), email: `${n}@kedgebs.com`, password: "motdepasse" })),
    session: null,
  });
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  db = db || seed();
  db.journal = db.journal || []; db.outbox = db.outbox || [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  window.__fake = { get db() { return db; }, save, reset: () => { db = seed(); save(); }, failNext: null, rt: null, calls: [] };

  const PK = { answers: ["user_id", "key"], seen: ["user_id", "item"], meta: ["k"], push_subs: ["endpoint"], partners: ["k"] };
  const AUTHOR = { items: "author", links: "author", reqs: "asker", blocks: "author", answers: "user_id", seen: "user_id", push_subs: "user_id" };
  const me = () => db.profiles.find((p) => p.id === db.session?.user.id);
  const denied = { message: "new row violates row-level security policy", code: "42501" };
  // les règles de la base, en raccourci
  function allowed(t, op, row) {
    const p = me();
    // migration 0005 : le visiteur ne demande rien, ne signale rien, n'ajoute aucun document
    if (p.visiteur && ["reqs", "blocks", "links"].includes(t) && op === "insert") return false;
    if (t === "items") {
      // migration 0012 : un dernier jour seulement pour un temps fort daté au jour près ; migration 0011 : rang et objectif de 1 à 999
      if (row.fin && !(row.kind === "tf" && row.fin > row.date && !(row.per || []).length && (!row.flou || /^\d/.test(row.flou)))) return false;
      if ([row.rang, row.cible].some((v) => v != null && !(v >= 1 && v <= 999))) return false;
      if (row.partner) return p.media;
      // migration 0011 : un classement est saisi par les chefs
      if (row.kind === "classement" && op === "insert") return p.chef && row.svc === "chef";
      return p.chef || (!!p.svc && row.svc === p.svc);
    }
    if (["periods", "messages", "services", "meta"].includes(t)) return p.chef;
    if (t === "partners") return p.media;
    if (t === "links" && op === "insert") return p.chef || p.media || !!p.svc;
    // migration 0009 : seul un chef note une demande à la Direction du Programme
    if (t === "reqs" && op === "insert" && row.dest === "programme" && !p.chef) return false;
    // migration 0013 : « Moi », pour les chefs ; la même note par un autre chef reste possible
    if (t === "reqs" && op === "insert" && row.dest === "moi" && !p.chef) return false;
    // migration 0014 : à un chef nommé, pas à soi-même ni à quelqu'un qui n'est pas chef
    if (t === "reqs" && op === "insert" && /^[0-9a-f]{8}-/.test(row.dest) && (row.dest === p.id || !db.profiles.some((x) => x.id === row.dest && x.chef && !x.visiteur))) return false;
    if (t === "reqs" && op === "insert" && db.reqs.some((q) => q.item === row.item && q.dest === row.dest && q.type === row.type && q.st === "ouverte" && (row.dest !== "moi" || q.asker === row.asker))) return false;
    return true;
  }
  // les déclencheurs de la migration 0003 : l'historique se remplit tout seul
  const FIELDS = ["t", "date", "fin", "flou", "per", "svc", "cc", "m", "st", "tf", "partner", "lieu", "note", "rang", "cible"];
  const jot = (item, kind, diff = {}, author = db.session.user.id, at = new Date().toISOString()) =>
    db.journal.push({ id: (db.journal.at(-1)?.id || 0) + 1, item, author, at, kind, diff });
  const norm = (v) => (v === undefined || v === "" ? null : v);
  function journalUpdate(old, row) {
    const d = {};
    FIELDS.forEach((k) => { if (k in row && JSON.stringify(norm(old[k])) !== JSON.stringify(norm(row[k]))) d[k] = [norm(old[k]), norm(row[k])]; });
    if (Object.keys(d).length) jot(old.id, "modif", d);
  }
  function exec(q) {
    window.__fake.calls.push({ t: q.t, op: q.op });
    if (!db.session) return { data: null, error: { message: "JWT expired" } };
    if (window.__fake.failNext && q.op !== "select") { const e = window.__fake.failNext; window.__fake.failNext = null; return { data: null, error: e === true ? denied : e }; }
    const tab = db[q.t]; const match = (r) => q.filters.every(([c, v]) => r[c] === v);
    if (q.op === "select") {
      let rows = tab.filter(match);
      // migration 0016 : chacun ne lit que ses notifications de moins de 7 jours, non effacées
      if (q.t === "outbox") { let n = Math.max(0, ...tab.map((r) => r.id || 0)); tab.forEach((r) => { r.id ||= ++n; r.created_at ||= new Date().toISOString(); }); save();
        rows = rows.filter((r) => r.user_id === db.session.user.id && !r.efface_at && Date.now() - new Date(r.created_at) < 7 * 864e5); }
      if (q.order) rows = rows.slice().sort((a, b) => (typeof a[q.order] === "number" ? a[q.order] - b[q.order] : String(a[q.order]).localeCompare(String(b[q.order]))));
      return { data: JSON.parse(JSON.stringify(rows)), error: null };
    }
    const fill = (row) => {
      const r = { ...row };
      if (AUTHOR[q.t] && r[AUTHOR[q.t]] == null) r[AUTHOR[q.t]] = db.session.user.id;
      if (["items", "links", "reqs", "blocks"].includes(q.t)) { r.id = r.id || crypto.randomUUID(); r.at = r.at || new Date().toISOString(); }
      if (q.t === "partners") r.k = r.k || crypto.randomUUID().replace(/-/g, "");
      if (q.t === "reqs") r.st = r.st || "ouverte";
      if (q.t === "blocks") r.leve = r.leve || false;
      return r;
    };
    if (q.op === "insert") {
      const r = fill(q.row);
      if (!allowed(q.t, "insert", r)) return { data: null, error: denied };
      tab.push(r);
      if (q.t === "items") jot(r.id, "creation", {}, r.author, r.at);
      if (q.t === "links") jot(r.item, "document", { nom: r.nom }, r.author);
      // les destinataires d'une demande, comme la base (0012, 0014) : un service, les chefs, la Resp. offre, un chef nommé ; personne pour la Direction du Programme
      if (q.t === "reqs") db.profiles.filter((x) => x.id !== r.asker && ((r.dest === "chef" && x.chef) || x.svc === r.dest || (r.dest === "offre" && x.offre) || x.id === r.dest))
        .forEach((x) => db.outbox.push({ user_id: x.id, title: "Demande d'éléments", body: r.type, url: `#item=${r.item}`, dedupe: `req:${r.id}:${x.id}` }));
      save();
      return { data: q.single ? r : [r], error: null };
    }
    if (q.op === "update") {
      // comme la vraie base : une ligne qu'on n'a pas le droit de modifier est ignorée, sans erreur
      const rows = tab.filter(match).filter((r) => allowed(q.t, "update", { ...r, ...q.row }));
      // migration 0006 : retirer revient à la personne qui a demandé (ou à un chef) ; la réponse est signée et notée dans l'historique
      if (q.t === "reqs" && q.row.st === "annulee" && rows.some((r) => r.st === "ouverte" && !me().chef && r.asker !== me().id)) return { data: null, error: denied };
      // migration 0012 : une demande garde son destinataire
      if (q.t === "reqs" && "dest" in q.row) { const { dest, ...rest } = q.row; q.row = rest; }
      // migration 0007 : une demande reçue reste reçue, une demande retirée reste retirée
      if (q.t === "reqs") rows.forEach((r) => { if (["recue", "annulee"].includes(r.st) && q.row.st && q.row.st !== r.st) q.row = { ...q.row, st: r.st }; });
      // migration 0007 : le droit média ne se retire, même par un passage en visiteur, que par un compte média
      if (q.t === "profiles" && rows.some((r) => r.media && (q.row.visiteur || q.row.media === false)) && !me().media) return { data: null, error: { message: "seul un compte « Partenariats média » peut changer ce droit", code: "42501" } };
      rows.forEach((r) => { if (q.t === "items") journalUpdate(r, q.row);
        // migration 0007 : une fiche retirée retire ses demandes ouvertes, sauf un relais d'un temps fort actif
        if (q.t === "items" && q.row.st === "retire" && r.st !== "retire" && !(r.tf && db.items.some((t) => t.id === r.tf && t.st !== "retire")))
          db.reqs.forEach((x) => { if (x.item === r.id && x.st === "ouverte") { x.st = "annulee"; jot(r.id, "retrait", { type: x.type, dest: x.dest }); } });
        if (q.t === "reqs" && r.st === "ouverte" && q.row.st === "recue") { Object.assign(r, { repondu_par: me().id, repondu_at: new Date().toISOString() }); jot(r.item, "reponse", { type: r.type, dest: r.dest, reponse: q.row.reponse || "" }); }
        if (q.t === "reqs" && r.st === "ouverte" && q.row.st === "annulee") jot(r.item, "retrait", { type: r.type, dest: r.dest });
        Object.assign(r, q.row);
        // migration 0005 : un visiteur perd service et droits
        if (q.t === "profiles" && r.visiteur) Object.assign(r, { svc: null, chef: false, media: false, notif_all: false, offre: false }); }); save();
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (q.op === "upsert") {
      const r = fill(q.row), keys = PK[q.t] || ["id"];
      if (!allowed(q.t, "upsert", r)) return { data: null, error: denied };
      const old = tab.find((x) => keys.every((k) => x[k] === r[k]));
      old ? Object.assign(old, r) : tab.push(r); save();
      return { data: null, error: null };
    }
    if (q.op === "delete") {
      if (q.t === "links") tab.filter(match).forEach((r) => jot(r.item, "document", { nom: r.nom, retire: true }));
      // migration 0008 : seule une fiche retirée se supprime, par ceux qui la modifient ; ce qui en dépend part avec elle
      const gone = tab.filter(match).filter((r) => q.t !== "items" || (r.st === "retire" && allowed("items", "update", r)));
      if (q.t === "items") gone.forEach((r) => {
        // migration 0012 : un relais d'un temps fort actif confie ses demandes au temps fort ; un temps fort garde aux relais les documents de leurs demandes
        if (r.tf && db.items.some((t) => t.id === r.tf && t.st !== "retire")) db.reqs.forEach((x) => { if (x.item === r.id && x.st !== "annulee") x.item = r.tf; });
        db.links.forEach((l) => { const q2 = l.item === r.id && l.req && db.reqs.find((x) => x.id === l.req && x.item !== r.id); if (q2) l.item = q2.item; });
        ["links", "reqs", "blocks", "journal"].forEach((k) => { db[k] = db[k].filter((x) => x.item !== r.id); });
        db.items.forEach((x) => { if (x.tf === r.id) x.tf = null; }); });
      db[q.t] = db[q.t].filter((r) => !gone.includes(r)); save(); return { data: gone.map((r) => ({ id: r.id })), error: null };
    }
  }
  function from(t) {
    const q = { t, op: "select", filters: [], order: null, single: false };
    const api = {
      select() { return api; }, order(c) { q.order = c; return api; }, eq(c, v) { q.filters.push([c, v]); return api; },
      insert(row) { q.op = "insert"; q.row = row; return api; }, update(row) { q.op = "update"; q.row = row; return api; },
      upsert(row) { q.op = "upsert"; q.row = row; return api; }, delete() { q.op = "delete"; return api; }, single() { q.single = true; return api; },
      then(ok, ko) { return new Promise((r) => setTimeout(r, 40)).then(() => exec(q)).then(ok, ko); },
    };
    return api;
  }
  const auth = {
    async getSession() { return { data: { session: db.session } }; },
    async signInWithPassword({ email, password }) {
      await new Promise((r) => setTimeout(r, 80));
      const u = db.users.find((x) => x.email === email.toLowerCase() && x.password === password);
      if (!u) return { data: {}, error: { message: "Invalid login credentials", code: "invalid_credentials" } };
      db.session = { user: { id: u.id, email: u.email } }; save();
      return { data: { user: db.session.user, session: db.session }, error: null };
    },
    async signOut() { db.session = null; save(); return { error: null }; },
    async updateUser({ password }) {
      const u = db.users.find((x) => x.id === db.session.user.id);
      if (u.password === password) return { data: null, error: { message: "New password should be different from the old password." } };
      u.password = password; save(); return { data: { user: db.session.user }, error: null };
    },
  };
  // prévenir à nouveau : mêmes destinataires et mêmes droits que la fonction de la base
  async function rpc(fn, { p_item, p_quoi, p_endpoint, p_p256dh, p_auth }) {
    await new Promise((r) => setTimeout(r, 40));
    window.__fake.calls.push({ t: fn, op: "rpc" });
    if (window.__fake.failNext) { const e = window.__fake.failNext; window.__fake.failNext = null; return { data: null, error: e === true ? denied : e }; }
    // migration 0016 : effacer ses notifications (certaines ou toutes)
    if (fn === "effacer_notifs") {
      const ids = arguments[1].p_ids, now = new Date().toISOString();
      db.outbox.forEach((r) => { if (r.user_id === db.session.user.id && !r.efface_at && (!ids || ids.includes(r.id))) r.efface_at = now; }); save();
      return { data: null, error: null };
    }
    // un abonnement de téléphone passe à la personne connectée
    if (fn === "save_push") {
      db.push_subs = db.push_subs.filter((s) => s.endpoint !== p_endpoint);
      db.push_subs.push({ user_id: db.session.user.id, endpoint: p_endpoint, p256dh: p_p256dh, auth: p_auth }); save();
      return { data: null, error: null };
    }
    const it = db.items.find((x) => x.id === p_item);
    if (!it || !allowed("items", "update", it)) return { data: null, error: denied };
    const svcs = new Set([...it.cc, it.svc, ...db.items.filter((a) => a.tf === it.id && a.st !== "retire").map((a) => a.svc)]);
    // comme la base : les chefs pour une fiche du chef de projet, les comptes média pour un partenariat
    const dests = db.profiles.filter((p) => p.id !== db.session.user.id && (p.notif_all || (p.svc && svcs.has(p.svc)) || (p.chef && it.svc === "chef" && !it.partner) || (p.media && !!it.partner)));
    const who = me().nom;
    dests.forEach((p) => db.outbox.push({ user_id: p.id, title: `Modifié : ${it.t}`, body: `${who} : ${p_quoi}`, url: `#item=${it.id}` }));
    jot(it.id, "prevenu", { quoi: p_quoi, n: dests.length }); save();
    return { data: dests.length, error: null };
  }
  const channel = () => { const c = { on: (a, b, cb) => { window.__fake.rt = cb; return c; }, subscribe: () => c }; return c; };
  window.KPLAN_CLIENT = { auth, from, rpc, channel };
})();
