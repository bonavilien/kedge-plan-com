/* Plan de com KEDGE · V2
   Données : référentiels, jeu de démonstration et magasin.
   Le magasin garde tout dans le navigateur (localStorage). Son interface (get, add, update, remove…)
   est celle qu'un adaptateur Supabase reprendra pour brancher la vraie base. */
(() => {
  const KP = (window.KP = window.KP || {});

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const monday = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const TODAY = iso(new Date());
  const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const JOURS_L = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const jour = (n) => (n === 1 ? "1er" : String(n));
  const fmt = {
    court: (s) => { const d = parse(s); return `${JOURS[d.getDay()]} ${jour(d.getDate())}`; },
    moyen: (s) => { const d = parse(s); return `${jour(d.getDate())} ${MOIS_C[d.getMonth()]}`; },
    long: (s) => { const d = parse(s); return `${JOURS_L[d.getDay()]} ${jour(d.getDate())} ${MOIS[d.getMonth()]}${d.getFullYear() !== parse(TODAY).getFullYear() ? " " + d.getFullYear() : ""}`; },
    plage: (a, b) => (!b || b === a ? fmt.long(a) : parse(a).getMonth() === parse(b).getMonth() ? `du ${jour(parse(a).getDate())} au ${jour(parse(b).getDate())} ${MOIS[parse(b).getMonth()]}` : `du ${fmt.moyen(a)} au ${fmt.moyen(b)}`),
    relatif: (s) => {
      const n = diff(s, TODAY);
      if (n === 0) return "aujourd'hui"; if (n === 1) return "demain"; if (n === -1) return "hier";
      if (n > 1 && n < 60) return `dans ${n} jours`; if (n < -1 && n > -60) return `il y a ${-n} jours`;
      return fmt.moyen(s);
    },
    mois: (s) => { const d = parse(s); return MOIS[d.getMonth()] + (d.getFullYear() !== parse(TODAY).getFullYear() ? " " + d.getFullYear() : ""); },
    moisC: (s) => MOIS_C[parse(s).getMonth()],
    quand: (ts) => {
      const d = new Date(ts), n = diff(iso(d), TODAY), h = `${pad(d.getHours())}h${pad(d.getMinutes())}`;
      return n === 0 ? `aujourd'hui à ${h}` : n === -1 ? `hier à ${h}` : `le ${fmt.moyen(iso(d))}`;
    },
  };

  /* ---------- référentiels ---------- */
  const PERIODS = [
    { k: "installer", nom: "Installer", du: "2026-09-01", au: "2026-10-31", lib: "sept. – oct." },
    { k: "considerer", nom: "Considérer", du: "2026-11-01", au: "2026-12-31", lib: "nov. – déc." },
    { k: "preferer", nom: "Préférer", du: "2027-01-01", au: "2027-03-31", lib: "janv. – mars" },
    { k: "convertir", nom: "Convertir", du: "2027-04-01", au: "2027-05-31", lib: "avril – mai" },
    { k: "decider", nom: "Décider", du: "2027-06-01", au: "2027-07-15", lib: "juin – mi-juil." },
  ];
  const MESSAGES = [
    { k: "filieres", nom: "Filières", info: "Finance, Supply, Sales, employabilité, excellence académique" },
    { k: "alumni", nom: "Alumni", info: "Le réseau alumni" },
    { k: "international", nom: "International", info: "Top universités, stages et expérience à l'international" },
    { k: "continuum", nom: "Continuum", info: "Le continuum prépa (PGE), géopolitique" },
    { k: "reputation", nom: "Réputation", info: "Classements" },
    /* hors des 5 messages : les rendez-vous avec les candidats, à couvrir quand même */
    { k: "recrutement", nom: "Recrutement", info: "JPO, admissibles : à couvrir, hors des 5 messages", hors: true },
  ];
  const SERVICES0 = [
    { k: "rp", nom: "Relations presse", court: "RP" },
    { k: "rs", nom: "Réseaux sociaux", court: "RS" },
    { k: "video", nom: "Production vidéo", court: "Vidéo" },
    { k: "content", nom: "Content", court: "Content" },
  ];
  const STATUTS = [
    { k: "confirmer", nom: "À confirmer" },
    { k: "prevu", nom: "Prévu" },
    { k: "diffuse", nom: "Diffusé" },
  ];
  const PEOPLE0 = [
    { k: "julien", nom: "Julien", fonction: "Chef de projet com, Content", role: "pilote", svc: "content" },
    { k: "estelle", nom: "Estelle", fonction: "Responsable marketing de l'offre", role: "pilote", svc: "" },
    { k: "aurelie", nom: "Aurélie", fonction: "Relations presse", role: "service", svc: "rp" },
    { k: "stephane", nom: "Stéphane", fonction: "Réseaux sociaux", role: "service", svc: "rs" },
    { k: "louise", nom: "Louise", fonction: "Production vidéo", role: "service", svc: "video" },
    { k: "visiteur", nom: "Visiteur", fonction: "Lecture seule", role: "lecteur", svc: "" },
  ];
  const ELEMENTS = ["Programme", "Contexte", "Éléments de langage", "Visuels", "Contact", "Rushs", "Autre"];

  const ASK = { "Programme": "le programme", "Contexte": "du contexte", "Éléments de langage": "des éléments de langage", "Visuels": "des visuels", "Contact": "un contact", "Rushs": "des rushs", "Autre": "des éléments" };
  const PARTNERS = ["L'Étudiant", "Le Figaro Étudiant", "Studyrama", "Challenges", "Major-Prépa"];
  const monthEnd = (s) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  /* dernier jour possible d'une ligne : la fin du mois quand la date reste à préciser */
  const endOf = (it) => it.flou ? monthEnd(it.date) : it.fin || it.date;
  const periodOf = (date) => PERIODS.find((p) => date >= p.du && date <= p.au) || (date < PERIODS[0].du ? PERIODS[0] : PERIODS[PERIODS.length - 1]);

  const store0 = (id, items) => items.find((i) => i.id === id);
  /* ---------- jeu de démonstration (dates relatives à aujourd'hui) ---------- */
  function seed() {
    const d = (n) => addDays(TODAY, n);
    const per = periodOf(TODAY).k;
    let n = 0;
    const id = () => "i" + (++n);
    const items = [];
    const tf = (t, date, o = {}) => { const it = { id: id(), kind: "tf", variant: "", t, date, fin: "", svc: "", m: [], st: "prevu", tf: "", lieu: "", note: "", docs: [], reunion: false, by: "julien", ...o }; items.push(it); return it.id; };
    const ac = (t, date, svc, m, st, o = {}) => { const it = { id: id(), kind: "action", variant: "", t, date, fin: "", svc, m, st, tf: "", lieu: "", note: "", docs: [], reunion: false, by: (PEOPLE0.find((p) => p.svc === svc) || PEOPLE0[0]).k, ...o }; items.push(it); return it.id; };

    // passé
    const rentree = tf("Rentrée du PGE", d(-58), { m: ["filieres"], lieu: "Campus de Bordeaux et Marseille", st: "diffuse" });
    ac("Communiqué de rentrée", d(-60), "rp", ["filieres"], "diffuse", { tf: rentree });
    ac("Film de rentrée", d(-56), "video", ["filieres"], "diffuse", { tf: rentree });
    const forum = tf("Forum entreprises", d(-24), { fin: d(-23), m: ["filieres"], lieu: "Campus de Bordeaux", st: "diffuse" });
    ac("Carrousel : les recruteurs présents", d(-25), "rs", ["filieres"], "diffuse", { tf: forum });
    ac("Reportage vidéo du forum", d(-20), "video", ["filieres"], "prevu", { tf: forum });
    ac("Portrait d'un alumni entrepreneur", d(-9), "rs", ["alumni"], "prevu");
    ac("Tribune du directeur du programme", d(-6), "rp", ["continuum"], "prevu");
    ac("Interview croisée, double diplôme Berkeley", d(-3), "video", ["international"], "prevu");
    ac("Brève : accord avec l'université de Séoul", d(-12), "rp", ["international"], "diffuse");

    // à venir
    const jpo = tf("Journée portes ouvertes", d(12), { m: ["recrutement"], lieu: "Campus de Bordeaux et Marseille", note: "Accueil des préparationnaires et de leurs familles. Programme des conférences à recevoir de la Direction du Programme.", docs: [{ t: "Programme de la journée", url: "https://kedgebs.sharepoint.com/" }] });
    ac("Invitation presse locale", d(5), "rp", ["filieres"], "confirmer", { tf: jpo });
    ac("Teaser de la journée", d(8), "video", ["filieres"], "prevu", { tf: jpo, docs: [{ t: "Storyboard du teaser", url: "https://kedgebs.sharepoint.com/" }] });
    const ft = tf("Classement Financial Times, Masters in Management", d(20), { variant: "classement", m: ["reputation"], rang: "", cible: "Top 40", note: "Résultat sous embargo jusqu'au matin de la parution." });
    ac("Communiqué classement FT", d(20), "rp", ["reputation"], "confirmer", { tf: ft });
    const gala = tf("Gala des alumni", d(31), { m: ["alumni"], lieu: "Palais de la Bourse, Bordeaux", st: "confirmer" });
    ac("Série de portraits d'alumni", d(24), "rs", ["alumni"], "confirmer", { tf: gala });
    tf("Semaine de l'international", d(38), { fin: d(42), m: ["international"], lieu: "Tous les campus" });
    ac("Stories : une journée en échange à Shanghai", d(3), "rs", ["international"], "prevu");
    ac("Point presse géopolitique avec les prépas", d(9), "rp", ["continuum"], "confirmer", { reunion: true });
    ac("Témoignage d'une diplômée Supply Chain", d(15), "video", ["filieres"], "prevu");
    ac("Dossier L'Étudiant : spécial écoles de commerce", d(17), "rp", ["filieres"], "prevu", { variant: "partenariat", partner: "L'Étudiant", by: "julien", note: "Encart payant. Éléments à remettre dix jours avant." });
    ac("Carrousel : nos partenaires académiques", d(27), "rs", ["international"], "confirmer");
    tf("Salon des grandes écoles", d(55), { fin: d(56), m: ["filieres"], lieu: "Paris" });
    tf("Oraux des concours", d(200), { fin: d(214), m: ["continuum", "filieres"], lieu: "Bordeaux et Marseille", st: "confirmer" });
    tf("Classement SIGEM", d(245), { variant: "classement", m: ["reputation"], rang: "10e", cible: "Top 7", st: "confirmer" });

    ac("Article : cinq raisons de choisir la filière Supply", d(6), "content", ["filieres"], "prevu");
    ac("Newsletter alumni de décembre", d(22), "content", ["alumni"], "confirmer", { tf: gala });
    ac("Page web de la journée portes ouvertes", d(2), "content", ["filieres", "continuum"], "prevu", { tf: jpo });

    // date à préciser : on connaît le mois, pas encore le jour
    const m0 = TODAY.slice(0, 8) + "01", m1 = addDays(monthEnd(TODAY), 1);
    ac("Portrait d'un professeur de finance", m0, "video", ["filieres"], "confirmer", { flou: true, note: "Tournage dès que l'agenda du professeur est connu." });
    tf("Conférence géopolitique avec les classes prépas", m1, { flou: true, m: ["continuum"], st: "confirmer", lieu: "Campus de Marseille" });
    ac("Interview dans Challenges", m1, "rp", ["reputation"], "confirmer", { flou: true, variant: "partenariat", partner: "Challenges", by: "julien" });

    // sujets : toute la période
    items.push({ id: id(), kind: "tf", variant: "sujet", t: "L'alternance en dernière année", date: PERIODS.find((p) => p.k === per).du, fin: PERIODS.find((p) => p.k === per).au, per, svc: "", m: ["filieres"], st: "prevu", tf: "", lieu: "", note: "Fil rouge de la période : un contenu par service.", docs: [], reunion: false, by: "estelle" });

    const reqs = [
      { id: "r1", item: jpo, de: "aurelie", a: "julien", quoi: "Programme", txt: "Le programme des conférences pour l'invitation presse.", pour: d(1), fait: false, rep: "", quand: Date.now() - 3 * 864e5 },
      { id: "r2", item: ft, de: "julien", a: "rp", quoi: "Éléments de langage", txt: "Trois messages à faire passer selon le rang obtenu.", pour: d(-2), fait: false, rep: "", quand: Date.now() - 6 * 864e5 },
      { id: "r0", item: jpo, de: "stephane", a: "julien", quoi: "Contact", txt: "Qui accueille les familles le matin ?", pour: d(-4), fait: true, rep: "Claire, du service admissions. Elle sera à l'accueil dès 9 h.", quand: Date.now() - 8 * 864e5 },
      { id: "r3", item: gala, de: "stephane", a: "estelle", quoi: "Contact", txt: "Les alumni qui acceptent d'être photographiés.", pour: d(10), fait: false, rep: "", quand: Date.now() - 864e5 },
      { id: "r4", item: jpo, de: "julien", a: "video", quoi: "Rushs", txt: "Des plans du campus pour le teaser.", pour: d(4), fait: false, rep: "", quand: Date.now() - 2 * 864e5 },
    ];
    const journal = [
      { id: "j1", item: jpo, qui: "aurelie", quand: Date.now() - 3 * 864e5, txt: "a demandé le programme" },
      { id: "j2", item: gala, qui: "estelle", quand: Date.now() - 2 * 864e5, txt: "a créé le temps fort" },
      { id: "j3", item: ft, qui: "julien", quand: Date.now() - 6 * 864e5, txt: "a demandé des éléments de langage aux Relations presse" },
      { id: "j4", item: jpo, qui: "louise", quand: Date.now() - 20 * 36e5, txt: "a ajouté le relais « Teaser de la journée »" },
    ];
    const prefs = { julien: { pins: [jpo, ft] }, aurelie: { pins: [jpo] } };
    const contacts = [
      { id: "c1", nom: "Claire Morel", role: "Service admissions", mail: "claire.morel@exemple.fr", tel: "05 56 00 00 01" },
      { id: "c2", nom: "Marc Lefèvre", role: "Direction du Programme PGE", mail: "marc.lefevre@exemple.fr", tel: "" },
      { id: "c3", nom: "Sophie Garnier", role: "Journaliste, Sud Ouest", mail: "s.garnier@exemple.fr", tel: "06 00 00 00 03" },
    ];
    store0(jpo, items).contacts = ["c1", "c2"];
    return { v: 7, seq: 100, moi: "julien", people: JSON.parse(JSON.stringify(PEOPLE0)), services: JSON.parse(JSON.stringify(SERVICES0)), partners: [...PARTNERS],
      lieux: ["Campus de Bordeaux", "Campus de Marseille", "Campus de Paris", "Campus de Toulon", "Campus de Bordeaux et Marseille", "Tous les campus", "Palais de la Bourse, Bordeaux"], contacts, items, reqs, journal, prefs, lastMeeting: d(-7) };
  }

  /* ---------- magasin ---------- */
  const KEY = "kplan-v2-demo";
  let db;
  const listeners = [];
  const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && o.v === 7) return o; } catch (e) {} return null; };
  /* distant : quand l'appli est branchée sur la base (js/remote.js), le magasin garde la même forme en mémoire
     et chaque changement part vers la base au lieu du navigateur */
  let remote = null;
  const write = () => { if (remote) return remote.sync(db); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const emit = () => { write(); listeners.forEach((f) => f()); };
  db = read() || seed();

  const me = () => db.people.find((p) => p.k === db.moi) || db.people[0];
  const person = (k) => db.people.find((p) => p.k === k);
  const service = (k) => db.services.find((s) => s.k === k) || (remote && remote.pseudo[k]) || undefined;
  const message = (k) => MESSAGES.find((m) => m.k === k);
  const nid = (p) => remote ? remote.uuid() : p + (++db.seq);
  const log = (item, txt) => db.journal.push({ id: nid("j"), item, qui: db.moi, quand: Date.now(), txt });
  const prefs = () => (db.prefs[db.moi] = db.prefs[db.moi] || {});

  const store = {
    on: (f) => listeners.push(f),
    items: () => db.items,
    get: (id) => db.items.find((i) => i.id === id),
    relais: (id) => db.items.filter((i) => i.tf === id).sort((a, b) => a.date.localeCompare(b.date)),
    reqs: () => db.reqs,
    reqsOf: (id) => db.reqs.filter((r) => r.item === id),
    journalOf: (id) => db.journal.filter((j) => j.item === id).sort((a, b) => b.quand - a.quand),
    journal: () => db.journal,
    lastMeeting: () => db.lastMeeting,
    /* droits : le pilote modifie tout, un service ses propres lignes, le lecteur rien */
    canEdit: (it) => { const u = me(); return u.role === "pilote" || (u.role === "service" && !!it && ((it.kind === "action" && it.svc === u.svc) || it.by === u.k)); },
    canCreate: () => me().role !== "lecteur",
    add(o) {
      const it = { id: nid("i"), contacts: [], kind: "action", variant: "", t: "", date: TODAY, flou: false, fin: "", svc: "", m: [], st: "confirmer", tf: "", lieu: "", note: "", docs: [], reunion: false, by: db.moi, ...o };
      db.items.push(it); log(it.id, it.kind === "tf" ? "a créé le temps fort" : "a créé l'action"); emit();
      return it;
    },
    /* renvoie de quoi annuler */
    update(id, patch, txt) {
      const it = store.get(id); if (!it) return () => {};
      const before = {}; Object.keys(patch).forEach((k) => (before[k] = it[k]));
      Object.assign(it, patch); if (txt) log(id, txt); emit();
      return () => { Object.assign(it, before); log(id, "a annulé une modification"); emit(); };
    },
    remove(id) {
      const snap = JSON.stringify({ items: db.items, reqs: db.reqs });
      db.items = db.items.filter((i) => i.id !== id);
      db.items.forEach((i) => { if (i.tf === id) i.tf = ""; });
      db.reqs = db.reqs.filter((r) => r.item !== id); emit();
      return () => { Object.assign(db, JSON.parse(snap)); emit(); };
    },
    duplicate(id) {
      const it = store.get(id); if (!it) return null;
      return store.add({ ...JSON.parse(JSON.stringify(it)), id: undefined, t: it.t + " (copie)", st: "confirmer", reunion: false, by: db.moi, annule: undefined, report: undefined });
    },
    /* annuler garde la ligne dans le plan, barrée, avec son motif : les services rattachés savent pourquoi */
    cancel(id, txt) { const it = store.get(id); it.annule = { txt: txt || "", qui: db.moi, quand: Date.now() }; it.reunion = false; log(id, "a annulé" + (txt ? ` : ${txt}` : "")); emit(); return () => { delete it.annule; emit(); }; },
    restore(id) { const it = store.get(id), b = it.annule; delete it.annule; log(id, "a rétabli"); emit(); return () => { it.annule = b; emit(); }; },
    /* carnets : lieux, contacts, médias */
    lieux: () => db.lieux,
    addLieu(n) { if (n && !db.lieux.includes(n)) { db.lieux.push(n); db.lieux.sort((a, b) => a.localeCompare(b)); } },
    contacts: () => db.contacts,
    contact: (id) => db.contacts.find((c) => c.id === id),
    saveContact(o) { let c = o.id && store.contact(o.id); if (c) Object.assign(c, o); else { c = { id: nid("c"), nom: "", role: "", mail: "", tel: "", ...o }; db.contacts.push(c); } emit(); return c; },
    listRemove(k, v) { const before = db[k]; db[k] = db[k].filter((x) => (x.id || x) !== v); if (k === "contacts") db.items.forEach((i) => { if (i.contacts) i.contacts = i.contacts.filter((c) => c !== v); }); emit(); return () => { db[k] = before; emit(); }; },
    listAdd(k, v) { if (v && !db[k].includes(v)) { db[k].push(v); db[k].sort((a, b) => a.localeCompare(b)); emit(); } },
    /* équipe et services */
    people: () => db.people, services: () => db.services,
    versionOf: (k) => (db.prefs[k] || {}).version || "",
    savePerson(k, patch) { Object.assign(person(k), patch); emit(); },
    addPerson() { const p = { k: nid("p"), nom: "Nouvelle personne", fonction: "", role: "service", svc: db.services[0].k }; db.people.push(p); emit(); return p; },
    personUsed: (k) => k === db.moi || db.items.some((i) => i.by === k) || db.reqs.some((r) => r.de === k || r.a === k) || db.journal.some((j) => j.qui === k),
    removePerson(k) { const b = db.people; db.people = b.filter((p) => p.k !== k); emit(); return () => { db.people = b; emit(); }; },
    saveService(k, patch) { Object.assign(service(k), patch); emit(); },
    addService() { const s = { k: nid("s"), nom: "Nouveau service", court: "Nouveau" }; db.services.push(s); emit(); return s; },
    serviceUsed: (k) => db.items.filter((i) => i.svc === k).length + db.people.filter((p) => p.svc === k).length,
    removeService(k) { const b = db.services; db.services = b.filter((s) => s.k !== k); emit(); return () => { db.services = b; emit(); }; },
    partners: () => db.partners,
    addPartner(n) { if (n && !db.partners.includes(n)) { db.partners.push(n); db.partners.sort((a, b) => a.localeCompare(b)); } },
    /* fixe la date : un jour précis, ou tout un mois (flou) en attendant. Les relais suivent quand on passe d'un jour à un autre. */
    setDate(id, date, flou, motif) {
      const it = store.get(id), snap = JSON.stringify(db.items), n = diff(date, it.date);
      if (motif != null) it.report = { de: it.flou ? `courant ${fmt.mois(it.date)}` : fmt.moyen(it.date), txt: motif, qui: db.moi, quand: Date.now() };
      if (!flou && !it.flou) { if (it.fin) it.fin = addDays(it.fin, n); if (it.kind === "tf") store.relais(id).forEach((r) => { if (!r.flou) { r.date = addDays(r.date, n); if (r.fin) r.fin = addDays(r.fin, n); } }); }
      else it.fin = "";
      it.date = date; it.flou = !!flou;
      log(id, (motif != null ? `a reporté ${flou ? "à courant " + fmt.mois(date) : "au " + fmt.moyen(date)}` : flou ? `a placé courant ${fmt.mois(date)}, date à préciser` : `a fixé la date au ${fmt.moyen(date)}`) + (motif ? ` : ${motif}` : "")); emit();
      return () => { db.items = JSON.parse(snap); emit(); };
    },
    /* décale un temps fort et, si demandé, ses relais du même nombre de jours */
    shift(id, date, avecRelais) {
      const it = store.get(id); const n = diff(date, it.date);
      const snap = JSON.stringify(db.items);
      if (it.fin) it.fin = addDays(it.fin, n);
      it.date = date;
      if (avecRelais) store.relais(id).forEach((r) => { r.date = addDays(r.date, n); if (r.fin) r.fin = addDays(r.fin, n); });
      log(id, `a déplacé au ${fmt.moyen(date)}`); emit();
      return () => { db.items = JSON.parse(snap); emit(); };
    },
    ask(o) { const r = { id: nid("r"), de: db.moi, fait: false, rep: "", quand: Date.now(), ...o }; db.reqs.push(r); log(o.item, o.a === db.moi ? "s'est noté un mémo" : `a demandé ${ASK[o.quoi] || "des éléments"} à ${(person(o.a) || service(o.a) || { nom: "" }).nom}`); emit(); return r; },
    answer(id, rep) { const r = db.reqs.find((x) => x.id === id); if (!r) return () => {}; r.fait = true; r.rep = rep || ""; log(r.item, "a répondu à une demande"); emit(); return () => { r.fait = false; r.rep = ""; emit(); }; },
    meetingDone() { const b = db.lastMeeting; db.lastMeeting = TODAY; const flagged = db.items.filter((i) => i.reunion); flagged.forEach((i) => (i.reunion = false)); emit(); return () => { db.lastMeeting = b; flagged.forEach((i) => (i.reunion = true)); emit(); }; },
    /* préférences par compte : épingles, thème, suggestions écartées */
    prefs,
    setPref(k, v) { prefs()[k] = v; emit(); },
    pinned: (id) => (prefs().pins || []).includes(id),
    togglePin(id) { const p = prefs(); p.pins = p.pins || []; p.pins = p.pins.includes(id) ? p.pins.filter((x) => x !== id) : [...p.pins, id]; emit(); },
    switchUser(k) { if (remote) return; db.moi = k; emit(); },
    /* branchement sur la base : remplace les données de démonstration, sans rien renvoyer vers la base */
    _attach(r, data) { remote = r; db = data; listeners.forEach((f) => f()); },
    _replace(data) { db = data; listeners.forEach((f) => f()); },
    _db: () => db,
    remote: () => !!remote,
    reset() { if (remote) return; db = seed(); emit(); },
  };

  Object.defineProperty(KP, "PEOPLE", { get: () => db.people });
  Object.defineProperty(KP, "SERVICES", { get: () => db.services });
  Object.assign(KP, { TODAY, PERIODS, MESSAGES, CLES: MESSAGES.filter((m) => !m.hors), STATUTS, ELEMENTS, ASK, MOIS, endOf, monthEnd, fmt, iso, parse, addDays, diff, monday, periodOf, me, person, service, message, store });
})();
