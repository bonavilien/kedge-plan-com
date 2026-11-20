// Faux client Supabase pour tester le branchement de la V2 sans réseau : les mêmes appels que site/js/remote.js,
// les données en mémoire dans la page, à la façon de la base APRÈS les migrations 0019 à 0023.
// Il vérifie la traduction entre l'appli et la base ; les droits (RLS) sont vérifiés par test/db/v2.sql.
// window.__fake.db = les tables ; window.__fake.calls = les écritures faites ; window.__fake.failNext = message d'erreur à renvoyer.
(() => {
  const U = (n) => `a0000000-0000-0000-0000-00000000000${n}`, I = (n) => `b0000000-0000-0000-0000-00000000000${n}`;
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const item = (o) => ({ res: {}, flou: "", per: [], cc: [], m: [], st: "planifie", tf: null, partner: null, lieu: "", note: "", fin: null, rang: null, cible: null, author: U(1), at: new Date().toISOString(), updated_at: new Date().toISOString(),
    report_de: "", report_motif: "", report_par: null, report_at: null, annule_motif: "", annule_par: null, annule_at: null, ...o });
  const db = {
    periods: [{ n: 1, nom: "Installer", du: "2026-09-01", au: "2026-10-31", lib: "" }, { n: 2, nom: "Considérer", du: "2026-11-01", au: "2026-12-31", lib: "" }, { n: 3, nom: "Préférer", du: "2027-01-01", au: "2027-03-31", lib: "" },
      { n: 4, nom: "Convertir", du: "2027-04-01", au: "2027-05-31", lib: "" }, { n: 5, nom: "Décider", du: "2027-06-01", au: "2027-07-15", lib: "" }],
    messages: [{ n: 1, nom: "Filières", info: "Finance, Supply, Sales" }, { n: 2, nom: "Alumni", info: "Le réseau alumni" }, { n: 3, nom: "International", info: "Top universités" }, { n: 4, nom: "Continuum", info: "Le continuum prépa" }, { n: 5, nom: "Réputation", info: "Classements" }, { n: 0, nom: "Recrutement", info: "JPO" }],
    services: [{ k: "rp", nom: "Relations presse", court: "RP", ordre: 1 }, { k: "rs", nom: "Réseaux sociaux", court: "RS", ordre: 2 }, { k: "video", nom: "Production vidéo", court: "Vidéo", ordre: 3 }, { k: "content", nom: "Content", court: "Content", ordre: 4 }],
    partners: [{ k: "challenges", nom: "Challenges" }],
    profiles: [
      { id: U(1), nom: "Julien", fonction: "Chef de projet com", svc: "content", chef: true, media: true, visiteur: false, notif_all: true, notif_demandes: true, notif_changements: true, version: "" },
      { id: U(2), nom: "Aurélie", fonction: "Relations presse", svc: "rp", chef: false, media: false, visiteur: false, notif_all: false, notif_demandes: true, notif_changements: true, version: "1.5.0" },
      { id: U(3), nom: "Stéphane", fonction: "Réseaux sociaux", svc: "rs", chef: false, media: false, visiteur: false, notif_all: false, notif_demandes: true, notif_changements: true, version: "" },
      { id: U(4), nom: "Visiteur", fonction: "", svc: null, chef: false, media: false, visiteur: true, notif_all: false, notif_demandes: true, notif_changements: true, version: "" },
    ],
    items: [
      item({ id: I(1), kind: "tf", t: "Journée portes ouvertes", date: d(12), svc: "chef", m: ["REC"], lieu: "Campus de Bordeaux", note: "Accueil des familles." }),
      item({ id: I(2), kind: "action", t: "Invitation presse locale", date: d(5), svc: "rp", m: ["1"], st: "idee", tf: I(1), author: U(2) }),
      item({ id: I(3), kind: "action", t: "Teaser de la journée", date: d(8), svc: "rs", m: ["1", "4"], st: "production", tf: I(1), author: U(3) }),
      item({ id: I(4), kind: "action", t: "Brève accord Séoul", date: d(-3), svc: "rp", m: ["3"], st: "diffuse", author: U(2) }),
      item({ id: I(5), kind: "action", t: "Portrait abandonné", date: d(2), svc: "rs", m: ["2"], st: "retire", annule_motif: "Plus d'actualité", annule_par: U(3), annule_at: new Date().toISOString(), author: U(3) }),
      item({ id: I(6), kind: "action", t: "Portrait d'un professeur", date: d(0).slice(0, 8) + "01", flou: "Nov.", svc: "rs", m: ["1"], st: "confirmer", author: U(3) }),
      item({ id: I(7), kind: "tf", t: "L'alternance en dernière année", date: "2026-11-01", per: [2, 3], svc: "chef", m: ["1"] }),
      item({ id: I(8), kind: "classement", t: "Classement SIGEM", date: d(200), svc: "chef", st: "confirmer", rang: 10, cible: 7 }),
      item({ id: I(9), kind: "action", t: "Interview dans Challenges", date: d(20), svc: "chef", m: ["5"], st: "confirmer", partner: "challenges" }),
    ],
    links: [{ id: "d0000000-0000-0000-0000-000000000001", item: I(1), nom: "Programme de la JPO", url: "https://example.sharepoint.com/programme", author: U(1), at: "2026-11-01T10:00:00Z" }],
    reqs: [
      { id: "c0000000-0000-0000-0000-000000000001", item: I(2), asker: U(2), dest: "chef", type: "Programme", quoi: "Le programme des conférences", pour: d(1), st: "ouverte", at: new Date().toISOString(), reponse: "" },
      { id: "c0000000-0000-0000-0000-000000000002", item: I(1), asker: U(1), dest: "programme", type: "Programme", quoi: "Liste des intervenants", pour: d(3), st: "ouverte", at: new Date().toISOString(), reponse: "" },
    ],
    blocks: [{ id: "e0000000-0000-0000-0000-000000000001", item: I(3), author: U(3), why: "à trancher en réunion : budget du teaser", leve: false, at: "2026-11-10T10:00:00Z" }],
    answers: [], meta: [{ k: "last_meeting", v: d(-7) }],
    journal: [{ id: 1, item: I(1), author: U(1), at: "2026-11-01T09:00:00Z", kind: "creation", diff: null }, { id: 2, item: I(4), author: U(2), at: "2026-11-12T09:00:00Z", kind: "modif", diff: { st: ["planifie", "diffuse"] } }],
    lieux: [{ id: "f0000000-0000-0000-0000-000000000001", nom: "Campus de Bordeaux" }], contacts: [], item_contacts: [],
    /* 0031 : budget des partenariats et enveloppes des périodes (la vraie base ne les montre qu'aux chefs de projet) */
    budget: [{ item: I(9), montant: 3200 }], enveloppes: [{ per: 2, montant: 10000 }],
    users: [{ id: U(1), email: "pilote@example.com" }, { id: U(2), email: "presse@example.com" }, { id: U(3), email: "reseaux@example.com" }, { id: U(4), email: "lecteur@example.com" }],
  };
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem("fake-session") || "null"); } catch (e) {}
  const F = (window.__fake = { db, calls: [], failNext: null });
  const PK = { answers: ["user_id", "key"], meta: ["k"], messages: ["n"], budget: ["item"], enveloppes: ["per"] };
  const uid = () => (session ? session.user.id : null);
  const DEF = { items: (r) => item({ author: uid(), ...r }), links: (r) => ({ id: crypto.randomUUID(), author: uid(), at: new Date().toISOString(), ...r }), reqs: (r) => ({ asker: uid(), st: "ouverte", reponse: "", at: new Date().toISOString(), ...r }),
    blocks: (r) => ({ author: uid(), leve: false, at: new Date().toISOString(), ...r }), answers: (r) => ({ user_id: uid(), ...r }), partners: (r) => ({ k: r.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-"), ...r }),
    lieux: (r) => ({ id: crypto.randomUUID(), ...r }), contacts: (r) => ({ author: uid(), ...r }) };

  function query(t) {
    const q = { op: "select", filters: [], rows: null, patch: null, ret: false, one: false, sort: null };
    const match = (r) => q.filters.every(([k, v]) => String(r[k]) === String(v));
    const exec = () => {
      const tbl = (db[t] = db[t] || []);
      if (q.op !== "select") { F.calls.push({ t, op: q.op, rows: q.rows, patch: q.patch, filters: q.filters }); if (F.failNext) { const m = F.failNext; F.failNext = null; return { data: null, error: { message: m } }; } }
      if (q.op === "select") { let out = tbl.filter(match); if (q.sort) out = [...out].sort((a, b) => String(a[q.sort]).localeCompare(String(b[q.sort]))); return { data: JSON.parse(JSON.stringify(out)), error: null }; }
      if (q.op === "insert") {
        const rows = q.rows.map((r) => (DEF[t] ? DEF[t](r) : { ...r }));
        if (t === "items") for (const r of rows) { if (r.tf && !tbl.some((x) => x.id === r.tf)) return { data: null, error: { message: "temps fort inconnu" } }; if (r.partner && !db.partners.some((p) => p.k === r.partner)) return { data: null, error: { message: "média inconnu" } }; }
        tbl.push(...rows); return { data: q.one ? JSON.parse(JSON.stringify(rows[0])) : q.ret ? JSON.parse(JSON.stringify(rows)) : null, error: null };
      }
      if (q.op === "upsert") { const pk = PK[t] || ["id"]; q.rows.forEach((r0) => { const r = DEF[t] ? DEF[t](r0) : r0; const i = tbl.findIndex((x) => pk.every((k) => x[k] === r[k])); if (i >= 0) Object.assign(tbl[i], r); else tbl.push(r); }); return { data: null, error: null }; }
      const hit = tbl.filter(match);
      if (q.op === "update") {
        hit.forEach((r) => {
          const p = { ...q.patch };
          if (t === "items") { delete p.kind; if ("report_motif" in p && p.report_motif !== r.report_motif) { p.report_at = p.report_motif || p.report_de ? new Date().toISOString() : null; p.report_par = p.report_at ? uid() : null; }
            if (p.st === "retire" && r.st !== "retire") { p.annule_at = new Date().toISOString(); p.annule_par = uid(); } if (p.st && p.st !== "retire") { p.annule_motif = ""; p.annule_at = null; p.annule_par = null; } }
          Object.assign(r, p);
        });
        return { data: q.ret ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      if (q.op === "delete") { const gone = t === "items" ? hit.filter((r) => r.st === "retire") : hit; db[t] = tbl.filter((r) => !gone.includes(r)); if (t === "items") { const ids = gone.map((g) => g.id); ["links", "reqs", "blocks", "item_contacts", "budget"].forEach((k) => (db[k] = db[k].filter((x) => !ids.includes(x.item)))); db.items.forEach((x) => { if (ids.includes(x.tf)) x.tf = null; }); } return { data: q.ret ? gone.map((r) => ({ id: r.id })) : null, error: null }; }
    };
    const api = {
      select: () => { if (q.op !== "select") q.ret = true; return api; }, order: (k) => { q.sort = k; return api; }, limit: () => api, eq: (k, v) => { q.filters.push([k, v]); return api; },
      single: () => { q.one = true; return api; },
      insert: (r) => { q.op = "insert"; q.rows = Array.isArray(r) ? r : [r]; return api; }, upsert: (r) => { q.op = "upsert"; q.rows = Array.isArray(r) ? r : [r]; return api; },
      update: (p) => { q.op = "update"; q.patch = p; return api; }, delete: () => { q.op = "delete"; return api; },
      then: (ok, ko) => Promise.resolve().then(exec).then(ok, ko),
    };
    return api;
  }
  const client = {
    from: query,
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async ({ email, password }) => { const u = db.users.find((x) => x.email === email); if (!u || password !== "test") return { data: {}, error: { message: "Invalid login credentials" } }; session = { user: u }; sessionStorage.setItem("fake-session", JSON.stringify(session)); return { data: { user: u }, error: null }; },
      signOut: async () => { session = null; sessionStorage.removeItem("fake-session"); return {}; },
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    /* fonctions de la base : window.__fakeRpc = { nom: (args) => réponse } ; sinon « inconnue », comme une migration pas faite */
    rpc: async (n, a) => { const f = (window.__fakeRpc || {})[n] || (n === "set_res" ? (x) => { const it = db.items.find((i) => i.id === x.p_item); if (!it) throw new Error("fiche inconnue"); const r = { ...(it.res || {}), ...(x.p_pose || {}) }; (x.p_retire || []).forEach((k) => delete r[k]); it.res = r; (window.__fake.calls || []).push({ t: "rpc", op: "set_res", v: x }); return r; } : null); return f ? { data: f(a), error: null } : { data: null, error: { message: "fonction inconnue : " + n } }; },
  };
  window.supabase = { createClient: () => client };
})();
