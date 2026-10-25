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
      { id: U(2), nom: "Estelle", fonction: "Responsable de l'offre", svc: null, chef: true, media: false, notif_all: false },
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
    if (t === "items") {
      if (row.partner) return p.media;
      return p.chef || (!!p.svc && row.svc === p.svc);
    }
    if (["periods", "messages", "services", "meta"].includes(t)) return p.chef;
    if (t === "partners") return p.media;
    if (t === "links" && op === "insert") return p.chef || p.media || !!p.svc;
    if (t === "reqs" && op === "insert" && db.reqs.some((q) => q.item === row.item && q.dest === row.dest && q.type === row.type && q.st === "ouverte")) return false;
    return true;
  }
  // les déclencheurs de la migration 0003 : l'historique se remplit tout seul
  const FIELDS = ["t", "date", "flou", "per", "svc", "cc", "m", "st", "tf", "partner", "lieu", "note"];
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
      save();
      return { data: q.single ? r : [r], error: null };
    }
    if (q.op === "update") {
      // comme la vraie base : une ligne qu'on n'a pas le droit de modifier est ignorée, sans erreur
      const rows = tab.filter(match).filter((r) => allowed(q.t, "update", { ...r, ...q.row }));
      rows.forEach((r) => { if (q.t === "items") journalUpdate(r, q.row); Object.assign(r, q.row); }); save();
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
      db[q.t] = tab.filter((r) => !match(r)); save(); return { data: null, error: null };
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
    // un abonnement de téléphone passe à la personne connectée
    if (fn === "save_push") {
      db.push_subs = db.push_subs.filter((s) => s.endpoint !== p_endpoint);
      db.push_subs.push({ user_id: db.session.user.id, endpoint: p_endpoint, p256dh: p_p256dh, auth: p_auth }); save();
      return { data: null, error: null };
    }
    const it = db.items.find((x) => x.id === p_item);
    if (!it || !allowed("items", "update", it)) return { data: null, error: denied };
    const svcs = new Set([...it.cc, it.svc, ...db.items.filter((a) => a.tf === it.id && a.st !== "retire").map((a) => a.svc)]);
    const dests = db.profiles.filter((p) => p.id !== db.session.user.id && (p.notif_all || (p.svc && svcs.has(p.svc))));
    const who = me().nom;
    dests.forEach((p) => db.outbox.push({ user_id: p.id, title: `Modifié : ${it.t}`, body: `${who} : ${p_quoi}`, url: `#item=${it.id}` }));
    jot(it.id, "prevenu", { quoi: p_quoi, n: dests.length }); save();
    return { data: dests.length, error: null };
  }
  const channel = () => { const c = { on: (a, b, cb) => { window.__fake.rt = cb; return c; }, subscribe: () => c }; return c; };
  window.KPLAN_CLIENT = { auth, from, rpc, channel };
})();
