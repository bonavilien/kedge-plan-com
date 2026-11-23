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
    courtMois: (s) => { const d = parse(s); return `${JOURS[d.getDay()]} ${jour(d.getDate())} ${MOIS_C[d.getMonth()]}`; },
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
    { k: "filieres", n: 1, nom: "Filières", info: "Finance, Supply, Sales, employabilité, excellence académique" },
    { k: "alumni", n: 2, nom: "Alumni", info: "Le réseau alumni" },
    { k: "international", n: 3, nom: "International", info: "Top universités, stages et expérience à l'international" },
    { k: "continuum", n: 4, nom: "Continuum", info: "Le continuum prépa (PGE), géopolitique" },
    { k: "reputation", n: 5, nom: "Réputation", info: "Classements" },
    /* hors des 5 messages : les rendez-vous avec les candidats, à couvrir quand même */
    { k: "recrutement", n: 0, nom: "Recrutement", info: "JPO, admissibles : à couvrir, hors des 5 messages", hors: true },
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
  /* 2.9 : l'état d'un devis ; « DA faite » = la demande d'achat est passée. La pastille reprend les codes des états des actions */
  const DEVIS_ETATS = [
    { k: "recu", nom: "Reçu", pill: "confirmer" },
    { k: "signe", nom: "Signé", pill: "dv-signe" },
    { k: "da", nom: "DA faite", pill: "prevu" },
    { k: "facture", nom: "Facturé", pill: "diffuse" },
  ];
  const PEOPLE0 = [
    { k: "julien", nom: "Julien", fonction: "Chef de projet com, Content", role: "pilote", svc: "content", admin: true },
    { k: "estelle", nom: "Estelle", fonction: "Responsable marketing de l'offre", role: "pilote", svc: "" },
    { k: "aurelie", nom: "Aurélie", fonction: "Relations presse", role: "service", svc: "rp" },
    { k: "stephane", nom: "Stéphane", fonction: "Réseaux sociaux", role: "service", svc: "rs" },
    { k: "louise", nom: "Louise", fonction: "Production vidéo", role: "service", svc: "video" },
    { k: "visiteur", nom: "Visiteur", fonction: "Lecture seule", role: "lecteur", svc: "" },
  ];
  /* les résultats d'une diffusion, toujours dans cet ordre ; un nombre entier par unité, zéro compris */
  const UNITES = [{ k: "vues", un: "vue", nom: "Vues" }, { k: "clics", un: "clic", nom: "Clics" }, { k: "inscrits", un: "inscrit", nom: "Inscrits" }, { k: "retombees", un: "retombée", nom: "Retombées" }];
  const resPropre = (r) => Object.fromEntries(UNITES.map((u) => [u.k, (r || {})[u.k]]).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, Math.round(Number(v))]).filter(([, n]) => Number.isFinite(n) && n >= 0 && n <= 1e9));
  const nb = (n) => Number(n).toLocaleString("fr-FR");
  const resTxt = (r) => UNITES.filter((u) => r && r[u.k] != null).map((u) => `${nb(r[u.k])} ${u.un}${r[u.k] > 1 ? "s" : ""}`).join(" · ");
  const ELEMENTS = ["Programme", "Contexte", "Éléments de langage", "Visuels", "Contact", "Rushs", "Autre"];

  const ASK = { "Programme": "le programme", "Contexte": "du contexte", "Éléments de langage": "des éléments de langage", "Visuels": "des visuels", "Contact": "un contact", "Rushs": "des rushs", "Autre": "des éléments" };
  const PARTNERS = ["L'Étudiant", "Le Figaro Étudiant", "Studyrama", "Challenges", "Major-Prépa", "Sud Ouest"];
  const monthEnd = (s) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  /* dernier jour possible d'une ligne : la fin du mois quand la date reste à préciser */
  const endOf = (it) => it.flou ? monthEnd(it.date) : it.fin || it.date;
  /* libellé court d'une période, tiré de ses dates : « sept. – oct. », « juin – mi-juil. » */
  const libOf = (du, au) => {
    const a = parse(du), z = parse(au), last = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const m1 = (a.getDate() > 10 ? "mi-" : "") + MOIS_C[a.getMonth()], m2 = (z.getDate() < last(z) - 5 ? "mi-" : "") + MOIS_C[z.getMonth()];
    return m1 === m2 ? m1 : `${m1} – ${m2}`;
  };
  /* clé stable d'un nom : « Considérer » → « considerer » */
  const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "p";
  const KEYS5 = ["filieres", "alumni", "international", "continuum", "reputation"];
  const msgKey = (n) => (n === 0 ? "recrutement" : KEYS5[n - 1] || "m" + n);
  /* les référentiels réglés dans la base (périodes, noms des messages) remplacent ceux de la démonstration, sur place :
     tout le code qui lit KP.PERIODS ou KP.MESSAGES voit la nouvelle liste */
  const setRefs = (periods, messages) => {
    if (periods && periods.length) PERIODS.splice(0, PERIODS.length, ...periods);
    /* messages : de 1 à 9, plus l'étiquette hors messages (ligne 0). Les 5 premiers gardent leurs clés d'origine */
    const rows = (messages || []).filter((m) => m.n > 0).sort((a, b) => a.n - b.n), hors = (messages || []).find((m) => m.n === 0);
    if (rows.length) {
      const h0 = MESSAGES.find((m) => m.hors);
      MESSAGES.splice(0, MESSAGES.length, ...rows.map((m) => ({ k: msgKey(m.n), n: m.n, nom: m.nom, info: m.info || "" })), h0);
    }
    if (hors) Object.assign(MESSAGES.find((m) => m.hors), { nom: hors.nom, info: hors.info || "" });
  };
  /* l'année scolaire d'une date : 2026 = septembre 2026 à août 2027 (le budget des devis se compte à l'année) */
  const anDe = (date) => { const x = parse(date); return x.getMonth() >= 8 ? x.getFullYear() : x.getFullYear() - 1; };
  const anLib = (a) => `${a}-${+a + 1}`;
  const periodOf = (date) => PERIODS.find((p) => date >= p.du && date <= p.au) || PERIODS.find((p) => date < p.du) || PERIODS[PERIODS.length - 1]; /* 2.8.2 : entre deux périodes, la suivante */

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
    ac("Communiqué de rentrée", d(-60), "rp", ["filieres"], "diffuse", { tf: rentree, res: { retombees: 6 } });
    ac("Film de rentrée", d(-56), "video", ["filieres"], "diffuse", { tf: rentree, res: { vues: 9600 } });
    const forum = tf("Forum entreprises", d(-24), { fin: d(-23), m: ["filieres"], lieu: "Campus de Bordeaux", st: "diffuse" });
    ac("Carrousel : les recruteurs présents", d(-25), "rs", ["filieres"], "diffuse", { tf: forum, res: { vues: 8300, clics: 210 } });
    ac("Reportage vidéo du forum", d(-20), "video", ["filieres"], "prevu", { tf: forum });
    ac("Portrait d'un alumni entrepreneur", d(-9), "rs", ["alumni"], "diffuse");
    ac("Tribune du directeur du programme", d(-6), "rp", ["continuum"], "diffuse", { res: { retombees: 3 } });
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
    const etudiant = ac("Dossier L'Étudiant : spécial écoles de commerce", d(17), "rp", ["filieres"], "prevu", { variant: "partenariat", partner: "L'Étudiant", by: "julien", note: "Encart payant. Éléments à remettre dix jours avant." });
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
    const challenges = ac("Interview dans Challenges", m1, "rp", ["reputation"], "confirmer", { flou: true, variant: "partenariat", partner: "Challenges", by: "julien" });

    // sujets : toute la période
    items.push({ id: id(), kind: "tf", variant: "sujet", t: "L'alternance en dernière année", date: PERIODS.find((p) => p.k === per).du, fin: PERIODS.find((p) => p.k === per).au, per, svc: "", m: ["filieres"], st: "prevu", tf: "", lieu: "", note: "Fil rouge de la période : un contenu par service.", docs: [], reunion: false, by: "estelle" });

    // résultats : ce que les diffusions ont donné ; budget : le prix des partenariats payants (chefs de projet seulement)
    ac("Vidéo : une journée sur le campus de Bordeaux", d(-14), "video", ["filieres"], "diffuse", { res: { vues: 14200 } });
    ac("Webinaire : la double compétence", d(-5), "content", ["continuum"], "diffuse", { res: { inscrits: 140 } });
    ac("Post LinkedIn : nos alumni à l'international", d(-4), "rs", ["international", "alumni"], "diffuse", { res: { vues: 5100, clics: 96 } });
    const studyrama = ac("Guide Studyrama des écoles", d(-40), "rp", ["filieres"], "diffuse", { variant: "partenariat", partner: "Studyrama", by: "julien", res: { vues: 22000 } });
    const sudouest = ac("Encart Sud Ouest : journée portes ouvertes", d(-2), "rp", ["recrutement"], "diffuse", { variant: "partenariat", partner: "Sud Ouest", by: "julien", tf: jpo });
    const salon = ac("Salon L'Étudiant : le stand", d(60), "rp", ["filieres"], "confirmer", { variant: "partenariat", partner: "L'Étudiant", by: "julien" });
    const budget = { [etudiant]: 4800, [challenges]: 3200, [studyrama]: 3800, [sudouest]: 1800, [salon]: 4500 };
    /* 2.9 : les devis de l'année (exemples inventés) ; chaque ligne se relie aux actions qu'elle paie */
    const an = anDe(TODAY), L = (t, montant, items, o = {}) => ({ id: id(), t, d: o.d || "", qte: o.qte || 1, montant, offert: !!o.offert, items });
    const devis = [
      { id: id(), annee: an, media: "L'Étudiant", prog: "PGE", num: "DEV-2026-118", recu: d(-30), remise: 300, paiement: "30 % à la signature", etat: "signe", pdf: "", pdfNom: "",
        lignes: [L("Dossier spécial écoles de commerce", 4800, [etudiant], { d: "1 double page" }), L("Stand au salon L'Étudiant", 4500, [salon]), L("Newsletter lycéens × 2", 2000, [], { d: "Décembre et février", qte: 2 }), L("Bannière web, une semaine", 1200, [], { offert: true })] },
      { id: id(), annee: an, media: "Sud Ouest", prog: "PGE", num: "SO-5521", recu: d(-45), remise: 0, paiement: "À réception de facture", etat: "facture", pdf: "", pdfNom: "",
        lignes: [L("Encart journée portes ouvertes", 1800, [sudouest], { d: "Quart de page, édition Gironde" })] },
      { id: id(), annee: an, media: "Studyrama", prog: "Bachelor", num: "Q-0912", recu: d(-70), remise: 0, paiement: "50 % à la commande", etat: "recu", pdf: "", pdfNom: "",
        lignes: [L("Guide des écoles", 3800, [studyrama]), L("Salon Studyrama de Bordeaux", 2900, [])] },
    ];
    const envAn = { [an]: 25000 };
    const env = Object.fromEntries(PERIODS.map((p, i) => [p.k, [8000, 10000, 12000, 10000, 6000][i] || 0]).filter(([, n]) => n));

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
    return { v: 8, seq: 100, moi: "julien", people: JSON.parse(JSON.stringify(PEOPLE0)), services: JSON.parse(JSON.stringify(SERVICES0)), partners: [...PARTNERS],
      lieux: ["Campus de Bordeaux", "Campus de Marseille", "Campus de Paris", "Campus de Toulon", "Campus de Bordeaux et Marseille", "Tous les campus", "Palais de la Bourse, Bordeaux"], contacts, items, reqs, journal, prefs, lastMeeting: d(-7), budget, env, devis, envAn };
  }

  /* ---------- magasin ---------- */
  const KEY = "kplan-v2-demo";
  let db;
  const listeners = [];
  /* la démonstration d'une version précédente (v7, avant les résultats et le budget) est gardée : on lui ajoute ce qui manque */
  const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && o.v === 7 && Array.isArray(o.items)) { const s = seed(); o.budget = o.budget || s.budget; o.env = o.env || s.env;
    ["people", "services", "partners", "lieux", "contacts", "reqs", "journal"].forEach((k) => { if (!Array.isArray(o[k]) || (!o[k].length && (k === "people" || k === "services"))) o[k] = s[k]; });
    o.prefs = o.prefs || {}; o.items.forEach((i) => { i.docs = i.docs || []; i.m = i.m || []; i.contacts = i.contacts || []; }); o.v = 8; } if (o && o.v === 8) { if (!Array.isArray(o.devis)) { o.devis = []; o.envAn = {}; } if (Array.isArray(o.people) && !o.people.some((p) => p.admin)) { const a = o.people.find((p) => p.role === "pilote"); if (a) a.admin = true; } return o; } } catch (e) {} return null; };
  /* distant : quand l'appli est branchée sur la base (js/remote.js), le magasin garde la même forme en mémoire
     et chaque changement part vers la base au lieu du navigateur */
  let remote = null;
  const write = () => { if (remote) return remote.sync(db); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const emit = () => { write(); listeners.forEach((f) => f()); };
  db = read() || seed();

  const me = () => db.people.find((p) => p.k === db.moi) || db.people[0];
  const person = (k) => db.people.find((p) => p.k === k);
  /* un compte supprimé, une ligne écrite sans connexion, une fiche annulée sous la V1 : on ne plante pas pour un nom inconnu */
  const nomDe = (k) => (person(k) || { nom: "Quelqu'un" }).nom;
  const byId = (id) => db.items.find((i) => i.id === id);
  /* ce qu'un geste touche, champ par champ : l'annuler ne remet que ces champs, sur la fiche telle qu'elle est maintenant */
  const keepOf = (list, keys) => list.map((x) => ({ id: x.id, v: Object.fromEntries(keys.map((k) => [k, x[k] === undefined ? undefined : JSON.parse(JSON.stringify(x[k]))])) }));
  /* 2.8.1 : avec « pose » (ce qu'on avait posé), on ne défait que ce qui n'a pas changé depuis : la modification d'un collègue n'est jamais écrasée */
  const meme = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const putBack = (saved, pose) => { let n = 0; saved.forEach((s, i) => { const x = byId(s.id); if (!x) return; const p = pose && pose[i];
    if (p && Object.keys(p.v).some((k) => !meme(x[k], p.v[k]))) return; n++; Object.entries(s.v).forEach(([k, v]) => { if (v === undefined) delete x[k]; else x[k] = v; }); });
    if (pose && !n) toast("Un collègue l'a modifiée entre-temps : rien n'a été défait"); return n; };
  const toast = (t) => { if (typeof KP !== "undefined" && KP.toast) setTimeout(() => KP.toast(t)); };
  const service = (k) => db.services.find((s) => s.k === k) || (remote && remote.pseudo[k]) || undefined;
  const message = (k) => MESSAGES.find((m) => m.k === k);
  const nid = (p) => remote ? remote.uuid() : p + (++db.seq);
  const log = (item, txt) => db.journal.push({ id: nid("j"), item, qui: db.moi, quand: Date.now(), txt });
  const prefs = () => (db.prefs[db.moi] = db.prefs[db.moi] || {});

  /* un montant en euros (entier), ou rien ; un montant impossible (négatif, plus de 100 millions) est refusé : null */
  const MAXEUR = 1e8;
  const regle = (t, k, n) => {
    const vide = n == null || n === "";
    if (!vide && (!Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > MAXEUR)) return null;
    const m = (db[t] = db[t] || {}), b = m[k], v = vide ? null : Math.round(Number(n));
    if (v === b || (v == null && b == null)) return () => {};
    if (v == null) delete m[k]; else m[k] = v; emit();
    /* annuler relit le magasin (il a pu être rechargé) et ne touche que ce montant, s'il n'a pas changé depuis */
    return () => { const m2 = (db[t] = db[t] || {}); if ((m2[k] == null ? null : m2[k]) !== v) return; if (b == null) delete m2[k]; else m2[k] = b; emit(); };
  };
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
    canEdit: (it) => { const u = me(); return u.role === "pilote" || (u.role === "service" && !!it && it.variant !== "partenariat" && ((it.kind === "action" && it.svc === u.svc) || it.by === u.k)); },
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
      const pose = JSON.parse(JSON.stringify(patch));
      return () => { const x = byId(id); if (!x) return; const ks = Object.keys(before).filter((k) => meme(x[k], pose[k]));
        if (!ks.length) return toast("Un collègue l'a modifiée entre-temps : rien n'a été défait");
        ks.forEach((k) => (x[k] = before[k])); log(id, "a annulé une modification"); emit(); };
    },
    /* branché, une suppression est définitive (la base efface aussi ses demandes et son historique) : pas d'« Annuler » */
    remove(id) {
      const it = byId(id); if (!it) return null;
      const saved = JSON.parse(JSON.stringify(it)), rel = db.items.filter((i) => i.tf === id).map((i) => i.id), reqs = db.reqs.filter((r) => r.item === id);
      db.items = db.items.filter((i) => i.id !== id);
      db.items.forEach((i) => { if (i.tf === id) i.tf = ""; });
      db.reqs = db.reqs.filter((r) => r.item !== id);
      const prix = (db.budget || {})[id]; if (prix != null) delete db.budget[id];
      const liens = []; (db.devis || []).forEach((dv) => dv.lignes.forEach((l) => { if (l.items.includes(id)) { liens.push([dv.id, l.id]); l.items = l.items.filter((x) => x !== id); } }));
      emit();
      if (remote) return null;
      return () => { if (byId(id)) return; db.items.push(saved); if (prix != null) db.budget[id] = prix; rel.forEach((r) => { const x = byId(r); if (x && !x.tf) x.tf = id; }); db.reqs.push(...reqs);
        liens.forEach(([d, l]) => { const dv = store.devis(d), li = dv && dv.lignes.find((x) => x.id === l); if (li && !li.items.includes(id)) li.items.push(id); }); emit(); };
    },
    /* annuler une création : la fiche n'a encore ni demande ni relais */
    /* 2.8.2 : la fiche se ferme d'abord (pas de « n'existe plus »), et ses demandes partent avec elle */
    unadd(id) { if (typeof KP !== "undefined" && KP.route && KP.route.fiche === id && KP.go) KP.go({ fiche: "" }, true);
      db.items = db.items.filter((i) => i.id !== id); db.items.forEach((i) => { if (i.tf === id) i.tf = ""; }); db.reqs = db.reqs.filter((r) => r.item !== id); if (db.budget) delete db.budget[id];
      (db.devis || []).forEach((dv) => dv.lignes.forEach((l) => { l.items = l.items.filter((x) => x !== id); })); emit(); },
    duplicate(id) {
      const it = store.get(id); if (!it) return null;
      const { id: _id, annule, report, res, ...copie } = JSON.parse(JSON.stringify(it));
      copie.docs = (copie.docs || []).map((d) => ({ t: d.t, url: d.url })); /* de nouveaux liens, pas ceux de l'original */
      return store.add({ ...copie, t: it.t + " (copie)", st: "confirmer", reunion: false, by: db.moi });
    },
    /* annuler garde la ligne dans le plan, barrée, avec son motif : les services rattachés savent pourquoi */
    cancel(id, txt) { const it = store.get(id), r0 = !!it.reunion; it.annule = { txt: txt || "", qui: db.moi, quand: Date.now() }; it.reunion = false; log(id, "a annulé" + (txt ? ` : ${txt}` : "")); emit(); return () => { const x = byId(id); if (!x) return; delete x.annule; x.reunion = r0; emit(); }; },
    restore(id) { const it = store.get(id), b = it.annule; delete it.annule; log(id, "a rétabli"); emit(); return () => { const x = byId(id); if (!x) return; x.annule = b; emit(); }; },
    /* carnets : lieux, contacts, médias */
    lieux: () => db.lieux,
    /* 2.8 : les phrases que la barre n'a pas comprises (l'admin seul les lit, Réglages > Phrases) */
    logPhrase(txt, raison = "rien") { (db.phrases = db.phrases || []).unshift({ id: nid("ph"), txt: String(txt).slice(0, 300), raison, qui: db.moi, quand: Date.now() }); db.phrases.length = Math.min(db.phrases.length, 300); },
    listPhrases: async () => (db.phrases || []).slice(),
    clearPhrases: async () => { db.phrases = []; },
    /* le reste du suivi (erreurs, annulés, recherches vides, écrans) */
    tele(type, txt, detail = {}) { (db.suivi = db.suivi || []).unshift({ id: nid("su"), type, txt: String(txt).slice(0, 500), detail, version: (KP.VERSION || {}).n || "", qui: type === "ecran" ? null : db.moi, quand: Date.now() }); db.suivi.length = Math.min(db.suivi.length, 500); },
    listSuivi: async () => (db.suivi || []).slice(),
    clearSuivi: async () => { db.suivi = []; },
    addLieu(n) { n = String(n || "").trim().slice(0, 120); if (n && !db.lieux.some((x) => x.toLowerCase() === n.toLowerCase())) { db.lieux.push(n); db.lieux.sort((a, b) => a.localeCompare(b)); } },
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
    /* le projet : son sous-titre (« Programme Grande École ») et sa couleur du brand book */
    projet: () => (db.projet = db.projet || { couleur: "jaune-or", sousTitre: remote ? "" : "Programme Grande École" }),
    saveProjet(patch) { Object.assign(store.projet(), patch); emit(); },
    /* périodes et messages : réglés par les pilotes dans Réglages */
    savePeriod(k, patch) { const p = PERIODS.find((x) => x.k === k); if (!p) return; Object.assign(p, patch); if (patch.du || patch.au) { p.lib = libOf(p.du, p.au); PERIODS.sort((a, b) => a.du.localeCompare(b.du)); } emit(); },
    addPeriod() {
      const z = PERIODS[PERIODS.length - 1], du = z ? addDays(z.au, 1) : TODAY, au = addDays(monthEnd(addDays(monthEnd(du), 1)), 0);
      let k = "periode", i = 1; while (PERIODS.some((x) => x.k === k)) k = "periode-" + (++i);
      const p = { k, n: Math.max(0, ...PERIODS.map((x) => x.n || 0)) + 1, nom: "Nouvelle période", du, au, lib: libOf(du, au) };
      PERIODS.push(p); emit(); return p;
    },
    periodUsed: (k) => db.items.filter((i) => i.variant === "sujet" && (i.pers || [i.per]).includes(k)).length,
    removePeriod(k) { const i = PERIODS.findIndex((x) => x.k === k); if (i < 0 || PERIODS.length < 2) return null; const [p] = PERIODS.splice(i, 1); emit(); return () => { PERIODS.splice(i, 0, p); emit(); }; },
    saveMessage(k, patch) { const m = MESSAGES.find((x) => x.k === k); if (!m) return; Object.assign(m, patch); emit(); },
    addMessage() {
      const used = MESSAGES.filter((m) => !m.hors).map((m) => m.n), n = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((x) => !used.includes(x)); if (!n) return null;
      const m = { k: msgKey(n), n, nom: "Nouveau message", info: "" }, i = MESSAGES.findIndex((x) => x.hors || x.n > n);
      MESSAGES.splice(i < 0 ? MESSAGES.length : i, 0, m); emit(); return m;
    },
    messageUsed: (k) => db.items.filter((i) => i.m.includes(k)).length,
    removeMessage(k) { const i = MESSAGES.findIndex((x) => x.k === k && !x.hors); if (i < 0 || MESSAGES.filter((m) => !m.hors).length < 2) return null; const [m] = MESSAGES.splice(i, 1); emit(); return () => { MESSAGES.splice(i, 0, m); emit(); }; },
    addPartner(n) { n = String(n || "").trim().slice(0, 80); if (n && !db.partners.some((x) => x.toLowerCase() === n.toLowerCase())) { db.partners.push(n); db.partners.sort((a, b) => a.localeCompare(b)); } },
    /* fixe la date : un jour précis, ou tout un mois (flou) en attendant. Les relais suivent quand on passe d'un jour à un autre. */
    setDate(id, date, flou, motif) {
      const it = store.get(id), n = diff(date, it.date);
      /* les relais suivent, sauf ceux déjà diffusés et ceux qu'on n'a pas le droit de modifier */
      const suit = it.kind === "tf" ? store.relaisQuiSuivent(id) : [];
      const saved = keepOf([it, ...suit], ["date", "fin", "flou", "report"]);
      if (motif != null) it.report = { de: it.flou ? `courant ${fmt.mois(it.date)}` : fmt.moyen(it.date), txt: motif, qui: db.moi, quand: Date.now() };
      if (!flou && !it.flou) { if (it.fin) it.fin = addDays(it.fin, n); suit.forEach((r) => { r.date = addDays(r.date, n); if (r.fin) r.fin = addDays(r.fin, n); }); }
      else it.fin = "";
      it.date = date; it.flou = !!flou;
      const pose = keepOf([it, ...suit], ["date", "fin", "flou", "report"]);
      log(id, (motif != null ? `a reporté ${flou ? "à courant " + fmt.mois(date) : "au " + fmt.moyen(date)}` : flou ? `a placé courant ${fmt.mois(date)}, date à préciser` : `a fixé la date au ${fmt.moyen(date)}`) + (motif ? ` : ${motif}` : "")); emit();
      return () => { putBack(saved, pose); emit(); };
    },
    /* 2.8.1 : les relais qui suivent un temps fort déplacé (pas les flous, diffusés, abandonnés, ni ceux qu'on ne peut pas modifier) */
    relaisQuiSuivent(id) { return store.relais(id).filter((r) => !r.flou && r.st !== "diffuse" && !r.annule && store.canEdit(r)); },
    /* décale un temps fort et, si demandé, ses relais du même nombre de jours */
    shift(id, date, avecRelais) {
      const it = store.get(id); const n = diff(date, it.date);
      const suit = avecRelais ? store.relaisQuiSuivent(id) : [];
      const saved = keepOf([it, ...suit], ["date", "fin"]);
      if (it.fin) it.fin = addDays(it.fin, n);
      it.date = date;
      suit.forEach((r) => { r.date = addDays(r.date, n); if (r.fin) r.fin = addDays(r.fin, n); });
      const pose = keepOf([it, ...suit], ["date", "fin"]);
      log(id, `a déplacé au ${fmt.moyen(date)}`); emit();
      return () => { putBack(saved, pose); emit(); };
    },
    ask(o, plus = false) { const r = { id: nid("r"), de: db.moi, fait: false, rep: "", quand: Date.now(), ...o }; db.reqs.push(r); if (o.a !== db.moi) log(o.item, o.pour ? `a demandé ${ASK[o.quoi] || "des éléments"} à ${(person(o.a) || service(o.a) || { nom: "" }).nom}` : `a écrit pour info à ${(person(o.a) || service(o.a) || { nom: "" }).nom}`); if (!plus) emit(); return r; },
    /* le même message à plusieurs personnes : un seul envoi */
    askAll(list) { const out = list.map((o) => store.ask(o, true)); if (out.length) emit(); return out; },
    /* un rappel pour moi ou une demande qu'on a faite : on change le texte ou la date, ou on la retire */
    editReq(id, patch) { const r = db.reqs.find((x) => x.id === id); if (!r || r.fait) return; Object.assign(r, patch); emit(); },
    /* relancer : la personne reçoit une notification (branché), et la fiche le garde dans son activité */
    relance(id) { const r = db.reqs.find((x) => x.id === id); if (!r) return; const nom = (person(r.a) || service(r.a) || { nom: "" }).nom, ok = () => KP.toast && KP.toast(`Relance envoyée à ${nom}`);
      if (remote && remote.relance) return remote.relance(id).then((sent) => sent && ok());
      log(r.item, `a relancé ${nom}`); emit(); ok(); },
    prevenir(id, svc) { const nom = (service(svc) || { nom: "" }).nom, ok = () => KP.toast && KP.toast(`${nom} : prévenu`);
      if (remote && remote.prevenir) return remote.prevenir(id, svc).then((sent) => sent && ok());
      log(id, `a prévenu ${nom}`); emit(); ok(); },
    dropReq(id) { const r = db.reqs.find((x) => x.id === id); if (!r) return; db.reqs = db.reqs.filter((x) => x !== r); if (r.a !== r.de) log(r.item, "a retiré une demande"); emit(); },
    answer(id, rep) { const r = db.reqs.find((x) => x.id === id); if (!r || (!r.pour && r.a !== r.de)) return () => {}; r.fait = true; r.rep = rep || ""; if (r.a !== r.de) log(r.item, "a répondu à une demande"); emit(); if (remote) return null; return () => { r.fait = false; r.rep = ""; emit(); }; },
    /* les résultats d'une diffusion ; tout effacé, la fiche repart dans « À compléter » */
    /* res : les unités à poser (les autres restent), une unité vide ("" ou null) est retirée ; tout = true remplace tout.
       Un chiffre impossible (négatif, plus d'un milliard, pas un nombre) : rien ne change, renvoie null */
    setRes(id, res, tout = false) {
      const it = store.get(id); if (!it) return () => {};
      const pose = {}, retire = [];
      for (const u of UNITES) { if (!(u.k in (res || {}))) { if (tout) retire.push(u.k); continue; } const v = res[u.k];
        if (v === "" || v == null) { retire.push(u.k); continue; } const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 1e9) return null; pose[u.k] = n; }
      const avant = { ...(it.res || {}) }, apres = { ...avant, ...pose }; retire.forEach((k) => delete apres[k]);
      const r = resPropre(apres), vide = !Object.keys(r).length;
      if (JSON.stringify(r) === JSON.stringify(resPropre(avant))) return () => {};
      if (vide) delete it.res; else it.res = r;
      log(id, vide ? "a retiré les résultats" : "a noté les résultats : " + resTxt(r)); emit();
      /* annuler : seulement les unités touchées, et seulement si personne ne les a changées depuis */
      const touche = [...Object.keys(pose), ...retire];
      return () => { const x = byId(id); if (!x) return; const cur = { ...(x.res || {}) };
        touche.forEach((k) => { if (cur[k] !== r[k]) return; if (avant[k] == null) delete cur[k]; else cur[k] = avant[k]; });
        if (Object.keys(cur).length) x.res = resPropre(cur); else delete x.res; emit(); };
    },
    /* le budget des partenariats payants et l'enveloppe de chaque période : vus et réglés par les chefs de projet seulement */
    /* la base pas encore à jour (scripts 2.6 non collés) : ni résultats ni budget, elle les refuserait */
    resOk: () => !(KP.base && KP.base.resultats === false),
    photoOk: () => !(KP.base && KP.base.photo === false),
    voitBudget: () => me().role === "pilote" && store.resOk(),
    montant: (id) => (db.budget || {})[id],
    enveloppe: (k) => (db.env || {})[k],
    setMontant(id, n) { return regle("budget", id, n); },
    setEnveloppe(k, n) { return regle("env", k, n); },
    /* ---------- 2.9 : les devis, à l'année (chefs de projet seulement) ---------- */
    /* la base pas encore à jour (script 2.9_0038 non collé) : l'onglet Budget reste l'ancien, par période */
    devisOk: () => !(KP.base && KP.base.devis === false),
    voitDevis: () => store.voitBudget() && store.devisOk(),
    devisTous: () => db.devis || [],
    devisDe: (a) => (db.devis || []).filter((x) => x.annee === +a),
    devis: (id) => (db.devis || []).find((x) => x.id === id),
    /* le total HT : les lignes payantes moins la remise ; les lignes offertes comptent à part, pour leur valeur */
    totalDevis(dv) { const paye = dv.lignes.filter((l) => !l.offert).reduce((a, l) => a + l.montant, 0);
      return { paye, offert: dv.lignes.filter((l) => l.offert).reduce((a, l) => a + l.montant, 0), ht: Math.max(0, paye - (dv.remise || 0)) }; },
    /* ce qu'une action coûte : sa part de chaque ligne qui la paie (la remise répartie au prorata, la ligne partagée entre ses actions) */
    partsDe(itemId) {
      const out = [];
      (db.devis || []).forEach((dv) => { const t = store.totalDevis(dv), k = t.paye ? t.ht / t.paye : 0;
        dv.lignes.forEach((l) => { if (!l.items.includes(itemId)) return; const sur = Math.max(l.qte || 1, l.items.length); /* « 1 épisode sur 4 » : un quart de la ligne, même si les 3 autres ne sont pas encore reliés */
          out.push({ devis: dv, ligne: l, part: l.offert ? 0 : Math.round((l.montant * k) / sur), offert: l.offert, sur, rang: l.items.indexOf(itemId) + 1 }); }); });
      return out;
    },
    addDevis(o) {
      const dv = { id: nid("d"), annee: anDe(TODAY), media: "", prog: "", num: "", recu: TODAY, remise: 0, paiement: "", etat: "recu", pdf: "", pdfNom: "", lignes: [], ...o };
      (db.devis = db.devis || []).push(dv); emit();
      return { id: dv.id, undo: () => { db.devis = db.devis.filter((x) => x.id !== dv.id); if (KP.route && KP.route.fiche === "devis-" + dv.id && KP.go) KP.go({ fiche: "" }, true); emit(); } };
    },
    /* un geste sur un devis : annuler remet le devis d'avant, seulement si personne ne l'a changé depuis */
    _devis(id, f) {
      const dv = store.devis(id); if (!dv) return null;
      const avant = JSON.parse(JSON.stringify(dv)); if (f(dv) === false) return null;
      if (meme(avant, dv)) return () => {};
      const apres = JSON.parse(JSON.stringify(dv)); emit();
      return () => { const i = (db.devis || []).findIndex((x) => x.id === id);
        if (i < 0) { db.devis.push(avant); return emit(); }
        if (!meme(db.devis[i], apres)) return toast("Un collègue l'a modifié entre-temps : rien n'a été défait");
        db.devis[i] = avant; emit(); };
    },
    setDevis(id, patch) {
      const p = { ...patch };
      if ("remise" in p) { const n = Math.round(Number(p.remise || 0)); if (!Number.isFinite(n) || n < 0 || n > MAXEUR) return null; p.remise = n; }
      if ("etat" in p && !DEVIS_ETATS.some((e) => e.k === p.etat)) return null;
      if ("annee" in p) p.annee = +p.annee;
      return store._devis(id, (dv) => { Object.assign(dv, p); });
    },
    delDevis(id) {
      const dv = store.devis(id); if (!dv) return null;
      const avant = JSON.parse(JSON.stringify(dv)); db.devis = db.devis.filter((x) => x.id !== id); emit();
      return () => { if (store.devis(id)) return; db.devis.push(avant); emit(); };
    },
    ligneOk: (o) => { const n = Number(o.montant), q = Number(o.qte || 1); return Number.isFinite(n) && n >= 0 && n <= MAXEUR && Number.isInteger(q) && q >= 1 && q <= 99; },
    addLigne(id, o) { if (!store.ligneOk(o)) return null; const l = { id: nid("l"), t: "", d: "", qte: 1, montant: 0, offert: false, items: [], ...o, montant: Math.round(Number(o.montant)) };
      const u = store._devis(id, (dv) => { dv.lignes.push(l); }); return u && { id: l.id, undo: u }; },
    setLigne(id, lid, patch) { const p = { ...patch }; if ("montant" in p || "qte" in p) { const dv = store.devis(id), l = dv && dv.lignes.find((x) => x.id === lid); if (!l || !store.ligneOk({ ...l, ...p })) return null; if ("montant" in p) p.montant = Math.round(Number(p.montant)); if ("qte" in p) p.qte = +p.qte; }
      return store._devis(id, (dv) => { const l = dv.lignes.find((x) => x.id === lid); if (!l) return false; Object.assign(l, p); }); },
    delLigne(id, lid) { return store._devis(id, (dv) => { const n = dv.lignes.length; dv.lignes = dv.lignes.filter((x) => x.id !== lid); if (dv.lignes.length === n) return false; }); },
    /* relier (ou délier) une action à une ligne */
    lier(id, lid, itemId, on) { return store._devis(id, (dv) => { const l = dv.lignes.find((x) => x.id === lid); if (!l || (on && !byId(itemId))) return false;
      const a = l.items.includes(itemId); if (on === a) return false; l.items = on ? [...l.items, itemId] : l.items.filter((x) => x !== itemId); }); },
    envAn: (a) => (db.envAn || {})[a],
    setEnvAn(a, n) { return regle("envAn", String(a), n); },
    /* l'heure compte : ce qui a été créé ou annulé le matin de la réunion ne revient pas à l'ordre du jour */
    meetingDone() { const b = db.lastMeeting; db.lastMeeting = new Date().toISOString(); const flagged = db.items.filter((i) => i.reunion).map((i) => i.id); flagged.forEach((id) => (byId(id).reunion = false)); emit(); return () => { db.lastMeeting = b; flagged.forEach((id) => { const x = byId(id); if (x) x.reunion = true; }); emit(); }; },
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
  /* les messages clés, sans l'étiquette hors messages : relu à chaque fois, la liste se règle */
  Object.defineProperty(KP, "CLES", { get: () => MESSAGES.filter((m) => !m.hors) });
  Object.assign(KP, { anDe, anLib, DEVIS_ETATS, TODAY, PERIODS, MESSAGES, msgKey, STATUTS, ELEMENTS, UNITES, resPropre, resTxt, nb, ASK, MOIS, libOf, slug, setRefs, endOf, monthEnd, fmt, iso, parse, addDays, diff, monday, periodOf, me, person, nomDe, service, message, store });
})();
