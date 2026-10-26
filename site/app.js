// Plan de com KEDGE : l'appli, une fois connecté. boot.js charge les données puis appelle KPlan.
// Trois objets qui ne se ressemblent pas : le temps fort (un moment de l'année, en jaune), l'action de diffusion (neutre, rangée par message)
// et le partenariat payant (anthracite, marqué « Payant »). Les messages sont écrits en toutes lettres, sans code à apprendre.
// Un sujet (Salle Bloomberg, Top UP…) est un temps fort sans date : on le valorise sur une ou plusieurs périodes entières.
// Un classement (SIGEM, Financial Times…) n'est ni l'un ni l'autre : une publication datée, avec le rang de KEDGE et l'objectif, marquée d'un podium.
// Les données viennent de la base (store.js) ; chaque écriture part tout de suite, et les changements des autres arrivent en temps réel.
window.KPlan = (DATA, { greet = false } = {}) => {
  const K = window.KUI, I = K.icons, esc = K.esc, Store = window.KStore, CFG = window.KPLAN_CONFIG;
  const app = document.getElementById("app");
  // les tableaux et DB sont remplacés en place à chaque rechargement
  const { MESSAGES, PERIODS, SERVICES, CHEF, PEOPLE, PARTNERS, me: ME } = DATA;
  const DB = DATA.db;

  // ---------- dates ----------
  const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  // la date du jour, l'année du plan et la période en cours se recalculent (minuit passé, périodes ajoutées) : voir recalc()
  let TODAY, T0, FIRST, LAST, MONTHS, CUR, G0, GN, DMIN, DMAX;
  const days = (s) => Math.round((D(s) - T0) / 864e5);
  const addDays = (s, n) => { const x = D(s); x.setDate(x.getDate() + n); return iso(x); };
  const premier = (s) => s.replace(/(^|\s)1 /, "$11er "); // « 1er novembre »
  const fmtShort = (s) => premier(D(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }));
  const fmtDay = (s) => premier(D(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const monShort = (s) => D(s).toLocaleDateString("fr-FR", { month: "short" });
  const monLong = (m) => cap(D(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  const isSujet = (it) => !!(it.per && it.per.length);
  // un temps fort sur plusieurs jours : « du 9 au 13 nov. », « du 30 nov. au 4 déc. »
  const fmtRange = (a, b) => { const dm = (s) => premier(D(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }));
    return `du ${a.slice(0, 7) === b.slice(0, 7) ? dm(a).split(" ")[0] : dm(a)} au ${dm(b)}`; };
  const when = (it) => (isSujet(it) ? K.fr.list(it.per.map((i) => perName(PERIODS[i]))) : it.flou || (multi(it) ? fmtRange(it.date, it.fin) : fmtShort(it.date)));
  const ago = (s) => { const n = -days(s); return n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} jours`; };
  const precise = (it) => !isSujet(it) && (!it.flou || /^\d/.test(it.flou)); // « Oct. » ou « Date à confirmer » : on ne connaît que le mois
  const multi = (it) => !!it.fin && precise(it); // temps fort sur plusieurs jours : date = premier jour, fin = dernier
  const endOf = (it) => (multi(it) ? it.fin : it.date);
  // les jours d'un temps fort sur plusieurs jours, du premier au dernier
  const daysOf = (it) => { const l = [it.date]; while (multi(it) && l[l.length - 1] < it.fin) l.push(addDays(l[l.length - 1], 1)); return l; };
  const isPast = (it) => (isSujet(it) ? PERIODS[Math.max(...it.per)].au < TODAY : precise(it) ? endOf(it) < TODAY : it.date.slice(0, 7) < TODAY.slice(0, 7));
  const norm = (s) => s.toLowerCase().replace(/\./g, "");

  // ---------- référentiels ----------
  const ST = { idee: "Idée", confirmer: "À confirmer", planifie: "Planifié", production: "En production", diffuse: "Diffusé", retire: "Retiré" };
  const TYPES = ["Programme", "Contexte", "Éléments de langage", "Visuels", "Contact", "Rushs", "Autre"];
  const ASK = { "Programme": "le programme", "Contexte": "du contexte", "Éléments de langage": "des éléments de langage", "Visuels": "des visuels", "Contact": "un contact", "Rushs": "des rushs", "Autre": "des éléments" };
  // la Direction du Programme : un chef de projet y note pour lui-même une info qu'il ira chercher (personne n'est notifié)
  const PROG = { k: "programme", nom: "Direction du Programme", court: "Dir. Programme", qui: "la Direction du Programme" };
  // la responsable de l'offre reçoit des demandes comme un service (les profils cochés « Resp. offre » dans Équipe)
  const offre = () => ({ k: "offre", nom: "Responsable de l'offre", court: "Resp. offre", qui: K.fr.list(PEOPLE.filter((p) => p.offre).map((p) => p.nom)) || "la Resp. offre" });
  const svcOf = (k) => SERVICES.find((s) => s.k === k) || (k === PROG.k ? PROG : k === "offre" ? offre() : CHEF);
  const fonctionOf = (p) => p.fonction || (p.svc ? svcOf(p.svc).nom : "");
  const person = (k) => PEOPLE.find((p) => p.k === k) || { k, nom: "Ancien compte", svc: "", fonction: "" };
  const me = () => person(ME);
  const isMedia = () => !!me().media; // saisit les partenariats média
  const canAdd = () => me().chef || !!me().svc; // un compte sans service lit tout et demande des éléments
  const isVisit = () => !!me().visiteur; // visiteur : voit tout, ne change rien (ni demande, ni blocage)
  // qui est qui : les noms viennent des profils
  const names = (f) => K.fr.list(PEOPLE.filter(f).map((p) => p.nom));
  const mediaNames = () => names((p) => p.media) || "le chef de projet";
  const toldAll = () => PEOPLE.filter((p) => p.notifAll && p.k !== ME).map((p) => p.nom); // prévenus de chaque ajout
  // la période d'une date : celle qui la contient ; entre deux périodes, celle qui vient de finir ; avant la première, la première
  const periodOf = (s) => { let i = 0; PERIODS.forEach((p, k) => { if (p.du <= s) i = k; }); return i; };
  // entre deux périodes, celle qui vient de finir reste « en cours » : ses dernières actions sont encore à venir (après la dernière, c'est fini)
  const perState = (P) => (P.du > TODAY ? "avenir" : P.au >= TODAY || (PERIODS[CUR] === P && PERIODS[CUR + 1]) ? "encours" : "fini");
  const nJours = (n) => `${n} ${n > 1 ? "jours" : "jour"}`;
  // « encore 12 jours », « dernier jour », « dans 3 jours », « terminée »
  const restTxt = (P) => { const s = perState(P), n = s === "avenir" ? days(P.du) : days(P.au);
    const nx = PERIODS[PERIODS.indexOf(P) + 1];
    return s === "fini" ? "terminée" : s === "avenir" ? (n === 1 ? "commence demain" : `dans ${nJours(n)}`) : n < 0 ? `finie le ${fmtDay(P.au)}${nx ? `, la suivante commence le ${fmtDay(nx.du)}` : ""}` : n === 0 ? "dernier jour" : `encore ${nJours(n)}`; };
  // année scolaire d'une période (septembre à août) : l'écran copil montre une année à la fois
  const yearOf = (P) => { const [y, m] = P.du.split("-").map(Number); return m >= 8 ? y : y - 1; };
  const perName = (P) => (PERIODS.filter((x) => x.nom === P.nom).length > 1 ? `${P.nom} ${yearOf(P)}-${String(yearOf(P) + 1).slice(2)}` : P.nom);
  function recalc() {
    TODAY = iso(new Date()); T0 = D(TODAY);
    FIRST = PERIODS[0]; LAST = PERIODS[PERIODS.length - 1]; DMIN = FIRST.du; DMAX = LAST.au;
    MONTHS = []; for (let d = D(FIRST.du.slice(0, 7) + "-01"); d <= D(LAST.au); d.setMonth(d.getMonth() + 1)) MONTHS.push(iso(d).slice(0, 7));
    // la période en cours : celle d'aujourd'hui, comme pour les fiches (entre deux périodes, celle qui vient de finir)
    CUR = periodOf(TODAY);
    // grille : du lundi de la semaine où commence la première période jusqu'à la fin de la dernière
    const g = D(FIRST.du); g.setDate(g.getDate() - ((g.getDay() + 6) % 7)); G0 = iso(g);
    GN = Math.floor(Math.round((D(LAST.au) - D(G0)) / 864e5) / 7) + 1;
  }
  recalc();
  const byId = (id) => DB.items.find((i) => i.id === id);
  // un moment de l'année qui a des relais : temps fort, sujet ou classement
  const isTF = (it) => it.kind === "tf" || it.kind === "classement";
  const isCls = (it) => it.kind === "classement";
  const isTfDay = (it) => it.kind === "tf" && !isSujet(it); // un temps fort daté, ni sujet ni classement
  const momWord = (it) => (isSujet(it) ? "sujet" : isCls(it) ? "classement" : "temps fort");
  // le rang de KEDGE et l'objectif d'un classement : « 10e · objectif top 7 »
  const rgTxt = (n) => (n === 1 ? "1er" : `${n}e`);
  // un classement s'appelle toujours « Classement … », avec une majuscule et un seul espace (comme store.js)
  const clsT = (t) => `Classement ${t.replace(/\s+/g, " ").trim().replace(/^classements?\b\s*/i, "")}`.trim();
  const rankTxt = (it) => [it.rang ? rgTxt(it.rang) : "", it.cible ? `objectif top ${it.cible}` : ""].filter(Boolean).join(" · ");
  const isPay = (it) => !!it.partner;
  const isInc = (it) => it.m.includes("INC");
  const typeOf = (it) => (isSujet(it) ? "suj" : isCls(it) ? "cls" : isTF(it) ? "tf" : isPay(it) ? "pay" : "act");
  const kindName = (it) => (isSujet(it) ? "Sujet" : isCls(it) ? "Classement" : isTF(it) ? "Temps fort" : isPay(it) ? "Partenariat" : "Action");
  const root = (it) => (!isTF(it) && it.tf && byId(it.tf)) || it;
  // une demande d'éléments faite pour un relais profite à tout le temps fort : on la retrouve sur lui et sur chacun de ses relais
  // (un relais retiré compris : une demande encore ouverte sur lui reste visible sur le temps fort)
  const famille = (it) => { const r = root(it); return isTF(r) ? [r, ...DB.items.filter((a) => a.tf === r.id)] : [it]; };
  const reqsOf = (it) => { const ids = new Set(famille(it).map((x) => x.id));
    return DB.reqs.filter((q) => ids.has(q.item) && q.st !== "annulee").sort((a, b) => (a.st === "recue") - (b.st === "recue") || a.pour.localeCompare(b.pour)); };
  const canEdit = (it) => (isPay(it) ? isMedia() : me().chef || (!!me().svc && it.svc === me().svc));
  // lever un blocage : les chefs, l'auteur du blocage, ceux qui modifient la fiche (mêmes règles que la base)
  const canLift = (b, it) => me().chef || b.by === ME || canEdit(it);
  // ajouter un document : ceux qui publient (service, chef, média)
  const canLink = () => canAdd() || isMedia();
  const partnerName = (it) => (PARTNERS.find((p) => p.k === it.partner) || { nom: "Partenaire" }).nom;
  const svcLabel = (it) => (isPay(it) ? partnerName(it) : svcOf(it.svc).court);
  const svcWord = (it) => (isTF(it) ? kindName(it) : svcLabel(it));
  const sortKey = (it) => (precise(it) ? it.date : it.date.slice(0, 7) + "-00"); // les dates à préciser ouvrent leur mois
  const sortDate = (a, b) => sortKey(a).localeCompare(sortKey(b));
  const reqTxt = (r) => (r.quoi && r.quoi !== r.type ? `${r.type} : ${r.quoi}` : r.type);
  const stWord = (it) => ({ confirmer: "à confirmer", idee: "idée", production: "en production", retire: "retiré" }[it.st] || "");
  const stAfter = (it, txt) => (it.st === "confirmer" && /confirmer|définir/i.test(txt || "") ? "" : stWord(it)); // évite « Date à confirmer · à confirmer »
  const seeMore = (n, word) => (n === 1 ? `Voir ${word === "autres" ? "l'autre" : "le passé"}` : `Voir les ${n} ${word}`);
  // messages en toutes lettres ; « Incontournable » pour une action à couvrir hors message
  const msgNames = (it) => it.m.filter((x) => x !== "INC").map((n) => MESSAGES[n - 1].nom);
  const msgText = (it) => K.fr.list([...msgNames(it), ...(isInc(it) ? ["Incontournable"] : [])]);
  const editors = (it) => (isPay(it) ? mediaNames() : SERVICES.some((s) => s.k === it.svc) ? `${svcOf(it.svc).court}, ${CHEF.qui}` : CHEF.qui);
  const hostOf = (u) => { try { return /sharepoint\.com$/.test(new URL(u).hostname) ? "SharePoint" : new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "Lien"; } };

  // ---------- écritures ----------
  // identifiant fait ici : la fiche s'ouvre tout de suite, la base garde le même
  const uid = () => crypto.randomUUID?.() || "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  const errText = (e) => (e?.code === "42501" ? "tu n'as pas les droits pour ça" : e?.code === "23503" && /_item_fkey|_req_fkey/.test(e?.message || "") ? "cette fiche vient d'être supprimée" : /fetch|network|load failed/i.test(e?.message || "") ? "pas de connexion" : /jwt|token/i.test(e?.message || "") ? "reconnecte-toi" : e?.message || "erreur inconnue");
  // une écriture refusée : on le dit, et on remet l'écran d'accord avec la base
  const fail = (e) => { console.error(e); K.snack(`Pas enregistré : ${esc(errText(e))}. Réessaie.`, 5000); sync(); };
  // petites écritures : l'écran change tout de suite, la base suit
  const quick = (p, msg) => { K.refresh(); if (msg) K.snack(msg); p.catch(fail); };

  // une date proposée dans l'année du plan
  const inPlan = (s) => (s < FIRST.du ? FIRST.du : s > LAST.au ? LAST.au : s);
  const newDraft = (kind = "action") => ({ kind, per: [S.period], t: "", prec: "jour", date: inPlan(addDays(TODAY, 14)), mois: inPlan(TODAY).slice(0, 7), m: [], cc: [], svc: me().chef ? SERVICES[0]?.k || "" : me().svc, partner: PARTNERS[0]?.k || "", newPartner: "", tf: "", link: "", note: "", more: false, plus: false, fin: "", rang: "", cible: "" });
  // ordinateur et tablette : trois colonnes de services dès 768 px, fiche en panneau à droite dès 1100 px
  const MQ_COLS = matchMedia("(min-width: 768px)"), MQ_PANEL = matchMedia("(min-width: 1100px)"), MQ_DESK = matchMedia("(min-width: 1280px)");
  const cols = () => MQ_COLS.matches, panel = () => MQ_PANEL.matches;
  const S = { period: CUR, filter: null, msgF: null, pastP: false, past: { tf: false, media: false }, open: {}, draft: null, edit: null };

  // ---------- petits gabarits ----------
  const chip = (label, on, value) => `<button type="button" class="chip" value="${esc(value ?? label)}" aria-pressed="${!!on}">${I.check}${esc(label)}</button>`;
  const pressed = (sel, root = document) => [...root.querySelectorAll(`${sel} .chip[aria-pressed="true"]`)].map((b) => b.value);
  const down = `<span class="down" aria-hidden="true">${I.chevL}</span>`;
  const profileBtn = () => K.iconBtn("user", "Profil", 'data-act="profil"');
  const payBadge = `<span class="pay">Payant</span>`;
  const tfBadge = `<span class="tf-b">Temps fort</span>`, sujBadge = `<span class="tf-b suj">Sujet</span>`, clsBadge = `<span class="tf-b cls">${I.podium}Classement</span>`;
  // ligne d'identité d'un objet : le type se voit avant de se lire
  const metaHTML = (it) => isTF(it) ? `${isSujet(it) ? sujBadge : isCls(it) ? clsBadge : tfBadge}${esc(cap(when(it)))}`
    : isPay(it) ? `${payBadge}${esc(partnerName(it))} · ${esc(cap(when(it)))}` : `${esc(cap(when(it)))} · ${esc(svcLabel(it))}`;
  // une action portée par le chef de projet (svc « chef ») n'a pas de service : elle compte à part
  const isChefAct = (a) => !isPay(a) && !SERVICES.some((s) => s.k === a.svc);
  function relais(tf) {
    const linked = DB.items.filter((a) => a.tf === tf.id && a.st !== "retire" && !isPay(a));
    const c = Object.fromEntries(SERVICES.map((s) => [s.k, 0])); linked.forEach((a) => { if (c[a.svc] != null) c[a.svc]++; });
    const keys = Object.keys(c), chef = linked.some(isChefAct);
    return { linked, has: [...keys.filter((k) => c[k]).map((k) => svcOf(k).court), ...(chef ? [CHEF.court] : [])], miss: keys.filter((k) => !c[k]).map((k) => svcOf(k).court) };
  }
  // les relais d'un temps fort rangés par porteur : services, chef de projet, puis partenariats
  const relaisGroups = (tf) => {
    const linked = DB.items.filter((a) => a.tf === tf.id && a.st !== "retire");
    return [...SERVICES.map((s) => ({ nom: s.nom, l: linked.filter((a) => !isPay(a) && a.svc === s.k) })),
      { nom: CHEF.nom, l: linked.filter(isChefAct) }, { nom: "Partenariats média", l: linked.filter(isPay) }].filter((g) => g.l.length);
  };
  // on montre les relais existants, sans dire ce qui manque : chaque service décide
  const relaisTxt = (it) => {
    if (isPast(it)) return "";
    const r = relais(it);
    return r.has.length ? `Relais ${K.fr.list(r.has)}` : "";
  };

  // une ligne d'agenda : date à gauche, titre, une ligne secondaire.
  // who : "all" nomme le service ; "tf" le tait (liste d'un seul service)
  function agRow(it, { date = true, mode = "week", who = "all", mark = true } = {}) {
    const t = typeOf(it), dt = D(it.date), p = precise(it), mon = monShort(it.date);
    const dcol = !date ? "" : t === "suj" ? `<b class="ic">${I.bookmark}</b>` : p ? `<b>${dt.getDate()}</b><span>${esc(mode === "week" ? dt.toLocaleDateString("fr-FR", { weekday: "short" }) : mon)}</span>` : `<b class="m">${esc(mon)}</b>`;
    const flouTxt = multi(it) ? `jusqu'au ${fmtShort(it.fin)}` : it.flou && (p || norm(it.flou) !== norm(mon)) ? it.flou : "";
    const ev = t === "tf" || t === "suj" || t === "cls";
    const parts = ev ? [t === "cls" ? rankTxt(it) : "", relaisTxt(it), flouTxt, stAfter(it, flouTxt)]
      : [t === "pay" ? partnerName(it) : who === "all" ? svcLabel(it) : "", msgText(it), flouTxt, stAfter(it, flouTxt)];
    // hiérarchie de la 2e ligne : qui (service, partenaire ou relais) en noir, messages en pastilles, état en gris
    // un classement : le rang et l'objectif d'abord, ses relais ensuite
    const lead = t === "cls" ? rankTxt(it) : ev ? relaisTxt(it) : t === "pay" ? partnerName(it) : who === "all" ? svcLabel(it) : "";
    const tags = ev ? "" : [...msgNames(it), ...(isInc(it) ? ["Incontournable"] : [])].map((n) => `<span class="ag-msg${n === "Incontournable" ? " inc" : ""}">${esc(n)}</span>`).join("");
    const st = [t === "cls" ? relaisTxt(it) : "", flouTxt, stAfter(it, flouTxt)].filter(Boolean).join(" · ");
    const line = `${lead ? `<span class="ag-who">${esc(lead)}</span>` : ""}${tags}${st ? `<span class="ag-st">${esc(st)}</span>` : ""}`;
    const badge = t === "pay" && mark ? payBadge : "";
    const isNew = me().chef && it.by !== me().k && it.at >= addDays(TODAY, -7);
    const done = it.st === "diffuse" || (ev && isPast(it));
    const kind = t === "pay" ? "Partenariat payant" : kindName(it);
    const label = [kind, cap(when(it)), it.t, parts.filter(Boolean).join(", "), done ? "fait" : "", isNew ? "nouveau" : ""].filter(Boolean).join(". ");
    const side = done ? `<span class="done">${I.check}</span>` : t === "tf" ? `<span class="ag-flag">${I.flag}</span>` : t === "cls" ? `<span class="ag-flag">${I.podium}</span>` : "";
    return `<button type="button" class="row ag-row is-${t}${it.st === "retire" ? " retire" : ""}" data-open="${it.id}" aria-label="${esc(label)}">
      <span class="ag-date">${dcol}</span>
      <span class="row-main"><b>${isNew ? `<i class="new-dot"></i>` : ""}${esc(it.t)}</b>${line || badge ? `<span class="ag-sub">${badge}${line}</span>` : ""}</span>
      ${side ? `<span class="ag-side">${side}</span>` : ""}</button>`;
  }
  // la date ne s'affiche qu'une fois par jour
  function rows(list, opts = {}) {
    let last = "", lastT = "";
    return list.slice().sort(sortDate).map((it) => { const key = sortKey(it), t = typeOf(it); const h = agRow(it, { ...opts, date: key !== last || (t !== "act" && t !== lastT) || t === "suj" || t === "cls" }); last = key; lastT = t; return h; }).join("");
  }
  function agenda(list, opts = {}) {
    const by = new Map();
    list.slice().sort(sortDate).forEach((it) => { const m = it.date.slice(0, 7); by.set(m, [...(by.get(m) || []), it]); });
    return [...by].map(([m, l]) => `<h3 class="ag-month">${cap(D(m + "-01").toLocaleDateString("fr-FR", { month: "long" }))}</h3><div class="group">${rows(l, opts)}</div>`).join("");
  }

  // =====================================================================
  // À faire : tout ce qui attend une réponse, chaque carte commence par l'action concernée
  // =====================================================================
  // rappels J-30, J-15, J-7, comme la base : actions datées au jour près, à ceux qui les portent ;
  // la réponse vaut pour cette date (une action décalée repart avec ses jalons) ; plus de rappel une fois des éléments demandés
  const jalKey = (it, j) => `${it.id}-${it.date}-${j}`;
  const carries = (p, it) => (isPay(it) ? !!p.media : it.svc === "chef" ? !!p.chef : !!p.ownSvc && it.svc === p.ownSvc);
  const askedBy = (p, it) => reqsOf(it).some((q) => q.from === p.k || (!!p.ownSvc && person(q.from).ownSvc === p.ownSvc));
  function jalons(p) {
    return DB.items.filter((it) => !isTF(it) && precise(it) && carries(p, it) && !["retire", "diffuse"].includes(it.st) && days(it.date) > 0 && days(it.date) <= 30 && !askedBy(p, it))
      .map((it) => { const n = days(it.date), j = n <= 7 ? 7 : n <= 15 ? 15 : 30; return { it, n, j, key: jalKey(it, j) }; })
      .sort((a, b) => a.n - b.n);
  }
  // une demande reçue par mon service (ou par les chefs si j'en suis un)
  // (une demande à la Direction du Programme : les chefs de projet la marquent reçue, celui qui l'a notée ou un autre ;
  // une demande à la Resp. offre : pour la responsable de l'offre)
  const forMe = (q, p = me()) => q.to === p.svc || (!!p.ownSvc && q.to === p.ownSvc) || (q.to === PROG.k && !!p.chef) || (q.to === "offre" && !!p.offre);
  // la deadline d'une demande se voit partout : en rouge une fois passée, en jaune à trois jours
  const dlTxt = (pour) => { const n = days(pour); return n < 0 ? `En retard · deadline ${fmtDay(pour)}` : n === 0 ? "Deadline aujourd'hui" : n === 1 ? "Deadline demain" : `Deadline ${fmtDay(pour)} · dans ${nJours(n)}`; };
  const dlCls = (q) => (q.st === "recue" ? "" : days(q.pour) < 0 ? " late" : days(q.pour) <= 3 ? " soon" : "");
  const canPour = (q) => q.st === "ouverte" && (me().chef || q.from === ME);
  const dlTag = (q) => (q.st === "recue" ? "" : canPour(q)
    ? `<button type="button" class="dl${dlCls(q)}" data-act="pour" data-r="${q.id}" aria-label="${esc(dlTxt(q.pour))}, changer la deadline">${I.calendar}${esc(dlTxt(q.pour))}</button>`
    : `<span class="dl${dlCls(q)}">${I.calendar}${esc(dlTxt(q.pour))}</span>`);
  function todo() {
    const p = me(), vu = DB.vu[p.k] || [];
    // envoyée par moi ou par mon service (pas par « les chefs » : une demande d'un autre chef à mon service est pour moi)
    const mine = (r) => r.from === p.k || (!!p.ownSvc && person(r.from).ownSvc === p.ownSvc);
    const demandes = DB.reqs.filter((r) => forMe(r, p) && r.st === "ouverte" && !mine(r) && byId(r.item)).sort((a, b) => a.pour.localeCompare(b.pour));
    const rappels = jalons(p).filter((j) => !DB.answers[j.key]);
    const cites = DB.items.filter((it) => it.cc.includes(p.svc) && it.svc !== p.svc && person(it.by).svc !== p.svc && it.at >= addDays(TODAY, -30)
      && days(it.date) >= 0 && it.st !== "retire" && !vu.includes(it.id)).sort((a, b) => b.at.localeCompare(a.at));
    const blocages = DB.blocks.filter((b) => !b.leve && byId(b.item) && (p.chef || byId(b.item).svc === p.svc));
    const envoyees = DB.reqs.filter((r) => mine(r) && r.st === "ouverte" && byId(r.item)).sort((a, b) => a.pour.localeCompare(b.pour));
    return { demandes, rappels, cites, blocages, envoyees, count: demandes.length + rappels.length + cites.length + blocages.length };
  }
  function syncBadge() {
    syncSide();
    const n = todo().count, tab = app.querySelector('.tab[data-kui-tab="afaire"]'); if (!tab) return;
    let b = tab.querySelector(".tab-badge");
    if (!n) { b?.remove(); tab.removeAttribute("aria-label"); return; }
    if (!b) { b = document.createElement("span"); b.className = "tab-badge"; b.setAttribute("aria-hidden", "true"); tab.append(b); }
    b.textContent = n; tab.setAttribute("aria-label", `À faire, ${n} en attente`);
  }

  function renderAfaire(el) {
    const T = todo();
    const head = (it) => `<button type="button" class="todo-act" data-open="${it.id}"><span><b>${esc(it.t)}</b><span class="todo-meta">${metaHTML(it)}</span></span>${I.chevR}</button>`;
    const card = (it, { body = "", left = "", acts = "" }) => `<article class="todo is-${typeOf(it)}">${head(it)}${body ? `<p class="todo-body">${body}</p>` : ""}<div class="todo-foot"><span class="due">${left}</span>${acts}</div></article>`;
    const section = (k, title, list, render) => {
      if (!list.length) return "";
      const all = S.open[k], shown = all ? list : list.slice(0, 3);
      return `<section class="todo-sec"><h2 class="sec-h">${title} · ${list.length}</h2><div class="todos">${shown.map(render).join("")}</div>
        ${list.length > 3 ? `<p class="more-p"><button type="button" class="link" data-act="more" data-k="${k}">${all ? "Voir moins" : seeMore(list.length - 3, "autres")}</button></p>` : ""}</section>`;
    };
    const demande = (r) => { const it = byId(r.item), tf = root(it);
      return card(it, { body: `<b>${esc(person(r.from).nom)}</b> demande ${esc(ASK[r.type] || "des éléments")}${r.quoi && r.quoi !== r.type ? ` : « ${esc(r.quoi)} »` : ""}.${tf !== it ? `<span class="todo-tf">Pour le ${momWord(tf)} « ${esc(tf.t)} »</span>` : ""}`,
        left: dlTag(r), acts: `<button type="button" class="btn small" data-act="repondre" data-r="${r.id}">${r.to === PROG.k ? "C'est reçu" : "Répondre"}</button>` }); };
    const rappel = ({ it, n, key }) => card(it, { left: `<span class="jal">J-${n}</span>`,
      acts: `<button type="button" class="btn small" data-act="ask" data-id="${it.id}" data-key="${key}">Oui, je demande</button><button type="button" class="btn small outline" data-act="nope" data-key="${key}">Pas besoin</button>` });
    const cite = (it) => card(it, { left: `Ajouté par ${esc(person(it.by).nom)}, ${ago(it.at)}`, acts: `<button type="button" class="btn small tonal" data-act="vu" data-id="${it.id}">Vu</button>` });
    const blocage = (b) => { const it = byId(b.item);
      return card(it, { body: `<span class="blk-l">Bloqué</span>${esc(b.why)}`, left: `${esc(person(b.by).nom)}, ${ago(b.at)}`,
        acts: canLift(b, it) ? `<button type="button" class="btn small tonal" data-act="unblock" data-b="${b.id}">Lever</button>` : "" }); };
    // les demandes d'un ou d'une collègue du service s'y voient aussi, avec son prénom
    const sentH = T.envoyees.some((r) => r.from !== ME) ? "Demandes de ton service en attente" : "Tes demandes en attente";
    const sent = T.envoyees.length ? `<section class="todo-sec"><h2 class="sec-h">${sentH} · ${T.envoyees.length}</h2><div class="group">${T.envoyees.map((r) => { const it = byId(r.item);
      return `<div class="row wrap rq"><span class="row-main"><button type="button" class="rq-open" data-open="${it.id}"><b>${esc(it.t)}</b><span>${esc(r.type)}${r.from !== ME ? ` · par ${esc(person(r.from).nom)}` : ""} · demandé à ${esc(svcOf(r.to).qui)}</span></button>${dlTag(r)}${canPour(r) ? `<button type="button" class="txt-btn rq-x" data-act="unreq" data-r="${r.id}">Retirer la demande</button>` : ""}</span>${forMe(r) ? `<button type="button" class="btn small" data-act="repondre" data-r="${r.id}">C'est reçu</button>` : ""}</div>`; }).join("")}</div></section>` : "";

    el.innerHTML = K.navbar({ title: "À faire", actions: addBtn() + profileBtn() }) + `<div class="scroll page-wide">
      <h1 class="large-title">À faire</h1>
      ${T.count ? "" : `<div class="all-good"><span class="hl-ic big">${I.check}</span><b>Tout est à jour.</b><span>Rien n'attend ta réponse.</span></div>`}
      <div class="todo-board">
      ${section("demandes", "Demandes reçues", T.demandes, demande)}
      ${section("blocages", "Blocages", T.blocages, blocage)}
      ${section("rappels", "Besoin d'éléments ?", T.rappels, rappel)}
      ${section("cites", "Ton service est cité", T.cites, cite)}
      ${sent}
      </div>
    </div>`;
    syncBadge();
  }

  // =====================================================================
  // Ma période : ce qui arrive, rien d'autre
  // =====================================================================
  const defFilter = () => (me().chef || !me().svc ? "all" : "mine");
  const curFilter = () => S.filter || defFilter();
  const filterLabel = (f) => ({ mine: "Mon service", all: "Tous les services" }[f] || svcOf(f).nom);
  // temps forts et partenariats ont leur onglet : ici, seulement les actions de diffusion
  const isAct = (it) => !isTF(it) && !isPay(it);
  function scoped(k = S.period) {
    const p = me(), f = curFilter();
    let list = DB.items.filter((it) => isAct(it) && periodOf(it.date) === k);
    if (f === "mine") list = list.filter((it) => it.svc === p.svc);
    else if (f !== "all") list = list.filter((it) => it.svc === f);
    return list;
  }
  const newItems = () => DB.items.filter((it) => isAct(it) && it.by !== me().k && it.at >= addDays(TODAY, -7)).sort((a, b) => b.at.localeCompare(a.at));
  const newRow = (it) => { const b = person(it.by);
    return `<button type="button" class="row nv-row" data-open="${it.id}"><span class="av sm" aria-hidden="true">${K.initials(b.nom)}</span><span class="row-main"><b>${esc(it.t)}</b><span>${esc(b.nom)} · ${esc(svcLabel(it))} · ${ago(it.at)}</span></span>${I.chevR}</button>`; };

  function renderPeriode(el) {
    const wide = cols(), P = PERIODS[S.period], cur = S.period === CUR, chef = me().chef;
    const base = wide ? DB.items.filter((it) => isAct(it) && periodOf(it.date) === S.period) : scoped(); // en colonnes, tous les services sont visibles
    // filtrer par message montre ce que compte le compteur : les actions retirées n'y sont pas
    const list = S.msgF ? base.filter((it) => it.m.includes(+S.msgF) && it.st !== "retire") : base;
    const past = cur ? list.filter(isPast) : [];
    const shown = cur && !S.pastP ? list.filter((it) => !isPast(it)) : list;
    // les 7 derniers jours d'une période : ce qui ouvre la suivante (ses deux premières semaines) se voit déjà
    const nx = PERIODS[S.period + 1], left = days(P.au);
    const soon = cur && nx && left >= 0 && left <= 6
      ? (wide ? DB.items.filter((it) => isAct(it) && periodOf(it.date) === S.period + 1) : scoped(S.period + 1))
        .filter((it) => it.st !== "retire" && (!S.msgF || it.m.includes(+S.msgF)) && sortKey(it) <= addDays(nx.du, 13))
        .concat(DB.items.filter((it) => isCls(it) && it.st !== "retire" && periodOf(it.date) === S.period + 1 && sortKey(it) <= addDays(nx.du, 13))).sort(sortDate)
      : [];

    // actions par message (chefs de projet) : les messages à zéro ressortent
    const live = base.filter((it) => it.st !== "retire");
    const counts = MESSAGES.map((m) => live.filter((it) => it.m.includes(m.n)).length);
    const cover = chef ? `<div class="cov" role="group" aria-label="Actions par message sur la période, touche un message pour filtrer">
        ${MESSAGES.map((m, i) => `<button type="button" class="cov-i${counts[i] ? "" : " zero"}" data-msgf="${m.n}" aria-pressed="${S.msgF == m.n}">${esc(m.nom)}<b>${counts[i]}</b></button>`).join("")}
      </div>` : "";

    const nv = chef && cur ? newItems() : [];
    const authors = [...new Set(nv.map((it) => it.by))];
    const news = nv.length ? `<div class="group news"><button type="button" class="row nv-sum" data-act="allnew">
        <span class="avs" aria-hidden="true">${authors.slice(0, 3).map((k) => `<i>${K.initials(person(k).nom)}</i>`).join("")}</span>
        <span class="row-main"><b>${nv.length} ${nv.length > 1 ? "nouveautés" : "nouveauté"} cette semaine</b><span>${esc(K.fr.list(authors.map((k) => person(k).nom)))}</span></span>${I.chevR}</button></div>` : "";

    // les classements de la période, en tête : la date, le rang et l'objectif
    const clsP = DB.items.filter((it) => isCls(it) && it.st !== "retire" && periodOf(it.date) === S.period).sort(sortDate);
    const clsH = clsP.length ? `<div class="group cls-strip" aria-label="Classements de la période">${rows(clsP, { mode: "month" })}</div>` : "";

    const f = curFilter();
    const bar = `<div class="ag-bar">
      ${wide ? "" : `<button type="button" class="filter-btn" data-act="filter" aria-haspopup="dialog" aria-label="Afficher : ${esc(filterLabel(f))}">${esc(filterLabel(f))}${down}</button>`}
      ${S.msgF ? `<button type="button" class="chip" aria-pressed="true" data-act="clearf" aria-label="Retirer le filtre ${esc(MESSAGES[S.msgF - 1].nom)}">${esc(MESSAGES[S.msgF - 1].nom)}<span class="x" aria-hidden="true">${I.close}</span></button>` : ""}
      ${past.length ? `<button type="button" class="link" data-act="pastp">${S.pastP ? "Masquer les passés" : seeMore(past.length, "passés")}</button>` : ""}
    </div>`;
    const empty = `<div class="group"><div class="empty"><span>${S.msgF ? "Rien pour ce message sur cette période." : cur && past.length && !S.pastP ? "Plus rien à venir sur cette période." : "Rien sur cette période."}</span>${canAdd() ? `<button type="button" class="btn small" data-act="goadd">Ajouter une action</button>` : ""}</div></div>`;

    // grand écran : une colonne par service, plus le chef de projet quand il porte des actions
    const chefL = shown.filter(isChefAct);
    const colsH = () => `<div class="svc-cols">${[...SERVICES.map((s) => ({ nom: s.nom, l: shown.filter((it) => it.svc === s.k) })), ...(chefL.length ? [{ nom: CHEF.nom, l: chefL }] : [])].map(({ nom, l }) =>
      `<section class="svc-col" aria-label="${esc(nom)}"><h2 class="col-h">${esc(nom)}<span>${l.filter((it) => it.st !== "retire").length}</span></h2>${l.length ? agenda(l, { who: "tf" }) : `<p class="col-empty">Rien sur cette période.</p>`}</section>`).join("")}</div>`;
    el.innerHTML = K.navbar({ title: "Ma période", actions: (chef ? `<button type="button" class="txt-btn strong wide-only" data-act="meeting">Mode réunion</button>` : "") + addBtn() + profileBtn() }) + `<div class="scroll${wide ? " page-wide" : ""}"><div class="swipe" id="swipe">
      ${periodHead(cover)}
      ${clsH}
      ${news}
      ${bar}
      ${!shown.length ? empty : wide ? colsH() : agenda(shown, { who: f === "all" ? "all" : "tf" })}
      ${soon.length ? `<section class="soon" aria-label="Période suivante"><h2 class="soon-h">À suivre<span>${esc(perName(nx))}, dès le ${esc(fmtDay(nx.du))}</span></h2>${agenda(soon, { who: wide || f === "all" ? "all" : "tf" })}</section>` : ""}
    </div></div>`;
    wireSwipe(el.querySelector("#swipe"));
    syncBadge();
  }
  // le bandeau de la période regardée (Ma période, Calendrier sur téléphone) : flèches, points, et on glisse pour changer
  function periodHead(cover = "", h = "h1") {
    const P = PERIODS[S.period];
    return `<section class="panel lg phead" aria-label="${esc(`Période ${S.period + 1} sur ${PERIODS.length}`)}">
        <div class="ph-nav">
          <button type="button" class="ph-arrow" data-act="prev" aria-label="Période précédente"${S.period === 0 ? " disabled" : ""}>${I.chevL}</button>
          <div class="ph-t"><${h} class="ph-title"><em>${esc(perName(P))}</em></${h}><p>${esc(P.lib)} · ${restTxt(P)}</p></div>
          <button type="button" class="ph-arrow" data-act="next" aria-label="Période suivante"${S.period === PERIODS.length - 1 ? " disabled" : ""}><span class="flip">${I.chevL}</span></button>
        </div>
        <div class="pdots" aria-hidden="true">${PERIODS.map((x, i) => `<i${i === S.period ? ' class="on"' : ""}></i>`).join("")}</div>
        ${cover}
      </section>
      ${S.period === CUR ? "" : `<p class="back-now"><button type="button" class="link" data-act="now">Revenir à ${esc(perName(PERIODS[CUR]))}</button></p>`}`;
  }
  function filterSheet() {
    const p = me(), cur = curFilter();
    const opts = [...(p.chef || !p.svc ? [] : [["mine", `Mon service (${svcOf(p.svc).court})`]]), ["all", "Tous les services"],
      ...SERVICES.filter((s) => s.k !== p.svc).map((s) => [s.k, s.nom]), ...(DB.items.some(isChefAct) ? [["chef", CHEF.nom]] : [])];
    K.sheet.open({ title: "Afficher", cancel: "Fermer", body: `<div class="group">${opts.map(([k, l]) => `<button type="button" class="row" data-setf="${k}" aria-pressed="${cur === k}"><span class="row-main"><b>${esc(l)}</b></span>${cur === k ? `<span class="tick" aria-hidden="true">${I.check}</span>` : ""}</button>`).join("")}</div>` });
  }

  // swipe intentionnel : il faut tirer franchement (30 % de la largeur ou un geste vif)
  function wireSwipe(sw) {
    if (!sw) return;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, lock = null, id = null, moved = false;
    sw.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse" && e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = 0; lock = null; id = e.pointerId; moved = false; });
    sw.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const ddx = e.clientX - x0, ddy = e.clientY - y0;
      if (!lock && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) { lock = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? "x" : "y"; if (lock === "x") { sw.setPointerCapture(e.pointerId); sw.classList.add("dragging"); } }
      if (lock !== "x") return;
      moved = true; dx = ddx;
      const edge = (dx > 0 && S.period === 0) || (dx < 0 && S.period === PERIODS.length - 1);
      sw.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return; id = null;
      sw.classList.remove("dragging");
      if (lock !== "x") return;
      const w = sw.clientWidth, v = Math.abs(dx) / Math.max(1, performance.now() - t0), dir = dx < 0 ? 1 : -1;
      const ok = (Math.abs(dx) > w * 0.3 || (v > 0.6 && Math.abs(dx) > 70)) && S.period + dir >= 0 && S.period + dir < PERIODS.length;
      if (ok) changePeriod(dir, sw); else { sw.classList.add("anim"); sw.style.transform = ""; setTimeout(() => sw.classList.remove("anim"), 240); }
    };
    sw.addEventListener("pointerup", end); sw.addEventListener("pointercancel", end);
    sw.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  }
  function changePeriod(dir, sw) {
    const n = S.period + dir; if (!dir || n < 0 || n >= PERIODS.length) return;
    const vid = sw?.closest(".view")?.id || "v-periode";
    const go = () => { S.period = n; S.msgF = null; S.gpast = false; K.refresh(); const v = document.getElementById(vid); v.querySelector(".scroll").scrollTop = 0; v.querySelector(".swipe")?.classList.add(dir > 0 ? "in-r" : "in-l"); };
    if (!sw || K.reduceMotion()) return go();
    sw.classList.add("anim"); sw.style.transform = `translateX(${dir > 0 ? "-" : ""}${Math.round(sw.clientWidth * 0.6)}px)`; sw.style.opacity = "0";
    setTimeout(go, 180);
  }

  // =====================================================================
  // Grille de diffusion : la couleur dit le type (jaune temps fort, anthracite payant, neutre diffusion)
  // =====================================================================
  // jours comptés en arrondi : un changement d'heure ne décale pas d'une colonne
  const wk = (s) => Math.max(0, Math.min(GN - 1, Math.floor(Math.round((D(s) - D(G0)) / 864e5) / 7)));
  // une semaine à cheval sur deux périodes va à celle qui en a le plus de jours (une période qui commence du vendredi au dimanche démarre la semaine suivante)
  const wkStart = (i) => (i === 0 ? 0 : Math.min(GN - 1, wk(PERIODS[i].du) + ((D(PERIODS[i].du).getDay() + 6) % 7 >= 4 ? 1 : 0)));
  // un mois : sa première semaine qui lui appartient vraiment (le 1er novembre, un dimanche, ouvre la semaine du 2)
  const wkM = (s) => Math.min(GN - 1, wk(s) + ((D(s).getDay() + 6) % 7 >= 4 ? 1 : 0));
  // une fiche connue au mois seulement se place sur la première semaine de son mois
  const wkOf = (it) => (precise(it) ? wk(it.date) : wkM(it.date.slice(0, 7) + "-01"));

  // téléphone : le tableau à deux dimensions ne tient pas dans 390 px ; le calendrier se lit comme un agenda,
  // une période à la fois, semaine par semaine, avec les mêmes lignes que Ma période (date, titre, service, message, état)
  const dm = (d) => premier(D(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }));
  const range = (a, b) => `${a.slice(0, 7) === b.slice(0, 7) ? premier(`${D(a).getDate()} `).trim() : dm(a)} – ${dm(b)}`; // « 2 – 8 nov. », « 26 oct. – 1er nov. »
  // les semaines de la période regardée ; période en cours : les semaines passées restent repliées, on commence à cette semaine
  function calWeeks() {
    const i = S.period, w0 = wkStart(i), w1 = i < PERIODS.length - 1 ? Math.max(w0 + 1, wkStart(i + 1)) : GN;
    const live = DB.items.filter((it) => !isSujet(it));
    const now = wk(TODAY), isCur = i === CUR && now >= w0 && now < w1, past = isCur ? now - w0 : 0;
    const ws = Array.from({ length: w1 - w0 }, (_, n) => w0 + n).slice(S.gpast ? 0 : past).map((w) => ({ w, d0: addDays(G0, w * 7), here: isCur && w === now,
      // un temps fort sur plusieurs jours : sa ligne dans la semaine où il commence, un rappel dans les suivantes
      its: live.filter((it) => wkOf(it) === w).sort(sortDate),
      cont: live.filter((it) => multi(it) && wk(it.date) < w && w <= wk(it.fin)) }));
    const suj = DB.items.filter((it) => isSujet(it) && it.per.includes(i));
    const pastL = past ? `<p class="past-p"><button type="button" class="link" data-act="gpast">${S.gpast ? "Masquer les semaines passées" : seeMore(past, past > 1 ? "semaines passées" : "semaine passée")}</button></p>` : "";
    return { ws, now, isCur, suj, pastL };
  }
  function renderGrillePhone(el) {
    const { ws, now, isCur, suj, pastL } = calWeeks();
    // des semaines vides qui se suivent : une seule ligne discrète
    const out = [];
    ws.forEach((x) => { const empty = !x.its.length && !x.cont.length, prev = out[out.length - 1];
      if (empty && prev?.empty && x.w !== now) prev.to = x.w; else out.push({ ...x, empty, to: x.w }); });
    const weeks = out.map((x) => {
      const d0 = x.d0, d1 = addDays(G0, x.to * 7 + 6), here = x.here;
      const tag = here ? `<em class="pw-now">Cette semaine</em>` : "";
      if (x.empty) return `<p class="pw-empty"${here ? ' id="pw-now"' : ""}><span>${esc(range(d0, d1))}</span>${tag}<span class="pw-none">Rien de prévu</span></p>`;
      const cont = x.cont.map((it) => `<button type="button" class="pw-cont" data-open="${it.id}" aria-label="${esc(`${it.t}, en cours jusqu'au ${fmtShort(it.fin)}`)}">${I.flag}<span><b>${esc(it.t)}</b> continue jusqu'au ${esc(fmtShort(it.fin))}</span></button>`).join("");
      return `<section class="pw"${here ? ' id="pw-now"' : ""} aria-label="Semaine du ${esc(range(d0, d1))}">
        <h2 class="pw-h">${esc(range(d0, d1))}${tag}</h2>${cont}
        ${x.its.length ? `<div class="group">${rows(x.its, { mode: "week" })}</div>` : ""}</section>`;
    }).join("");
    // la même période que Ma période : changer ici change là-bas, et inversement
    el.innerHTML = K.navbar({ title: "Calendrier", actions: addBtn() + profileBtn() }) + `<div class="scroll">
      <h1 class="large-title">Calendrier</h1>
      <div class="swipe">${periodHead("", "h2")}
      ${suj.length ? `<h2 class="pw-h">Toute la période</h2><div class="group">${rows(suj, { mode: "week" })}</div>` : ""}
      ${pastL}
      ${weeks}
    </div></div>`;
    wireSwipe(el.querySelector(".swipe"));
    syncBadge();
  }
  // ordinateur (≥ 1280 px, en dessous l'agenda du téléphone) : la grille de diffusion d'une télé. Une ligne par semaine,
  // une colonne par service, la période regardée en entier sur la largeur de l'écran : on ne défile que de haut en bas
  function renderGrilleDesk(el) {
    const { ws, suj, pastL } = calWeeks();
    const C = [{ nom: "Temps forts", f: (it) => isTfDay(it) || isCls(it) },
      ...SERVICES.map((s) => ({ nom: s.nom, f: (it) => !isTF(it) && !isPay(it) && it.svc === s.k })),
      ...(DB.items.some(isChefAct) ? [{ nom: CHEF.nom, f: (it) => !isTF(it) && isChefAct(it) }] : []),
      { nom: "Partenariats", f: isPay }];
    // une ligne de cellule : le jour, le titre, puis ce qui distingue (rang, payant, à confirmer, retiré)
    const day = (it) => `<span class="gi-d">${precise(it) ? `${D(it.date).getDate()} <i>${esc(D(it.date).toLocaleDateString("fr-FR", { weekday: "short" }))}</i>` : esc(monShort(it.date))}</span>`;
    const item = (it) => { const t = typeOf(it), st = stWord(it), cls = t === "cls" ? rankTxt(it) : "";
      const sub = [multi(it) ? `jusqu'au ${fmtShort(it.fin)}` : "", cls, t === "pay" ? partnerName(it) : "", it.st === "retire" ? "" : st].filter(Boolean).join(" · ");
      return `<button type="button" class="gi is-${t}${it.st === "retire" ? " retire" : ""}" data-open="${it.id}" aria-label="${esc([kindName(it), cap(when(it)), it.t, sub, it.st === "retire" ? "retiré" : ""].filter(Boolean).join(". "))}">
        <span class="gi-t">${day(it)} ${t === "pay" ? payBadge : ""}${t === "cls" ? I.podium : ""}<b>${esc(it.t)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`; };
    const contL = (it) => `<button type="button" class="gi gi-cont" data-open="${it.id}" aria-label="${esc(`${it.t}, en cours jusqu'au ${fmtShort(it.fin)}`)}"><span class="gi-t">${I.flag}<b>${esc(it.t)}</b><small>suite, jusqu'au ${esc(fmtShort(it.fin))}</small></span></button>`;
    const rowsH = ws.map((x) => `<div class="gt-r${x.here ? " now" : ""}" role="row"${x.here ? ' id="pw-now"' : ""}>
        <div class="gt-w" role="rowheader"><b>${esc(range(x.d0, addDays(x.d0, 6)))}</b>${x.here ? `<em class="pw-now">Cette semaine</em>` : ""}</div>
        ${C.map((c, k) => `<div class="gt-c" role="cell">${k === 0 ? x.cont.map(contL).join("") : ""}${x.its.filter(c.f).map(item).join("")}</div>`).join("")}</div>`).join("");
    el.innerHTML = K.navbar({ title: "Calendrier", actions: profileBtn() }) + `<div class="scroll page-wide">
      <h1 class="large-title">Calendrier</h1>
      <div class="swipe">${periodHead("", "h2")}
      ${suj.length ? `<h2 class="sec-h suj-h">Toute la période · ${suj.length}</h2><div class="suj-grid">${suj.map(sujCard).join("")}</div>` : ""}
      ${pastL}
      <div class="gt" role="table" aria-label="Calendrier de la période, une ligne par semaine" style="--nc:${C.length}">
        <div class="gt-r gt-head" role="row"><div class="gt-w" role="columnheader">Semaine</div>${C.map((c) => `<div class="gt-c" role="columnheader">${esc(c.nom)}</div>`).join("")}</div>
        ${rowsH}
      </div>
    </div></div>`;
    wireSwipe(el.querySelector(".swipe"));
    syncBadge();
  }
  // téléphone : « Ajouter » quitte la barre du bas et devient un + en haut des écrans principaux
  const addBtn = () => (canAdd() || isMedia() ? `<button type="button" class="icon-btn phone-only add-btn" aria-label="Ajouter" data-act="goadd">${I.plus}</button>` : "");

  function renderGrille(el) {
    if (!MQ_DESK.matches) return renderGrillePhone(el);
    renderGrilleDesk(el);
  }

  // =====================================================================
  // Temps forts, et partenariats média (visibles par tous, remplis par les comptes média)
  // =====================================================================
  // grand écran : un tableau par période, des colonnes alignées qu'on parcourt d'un coup d'œil
  const tdDate = (it) => {
    const p = precise(it), dt = D(it.date), mon = monShort(it.date);
    const main = p ? `<b class="dp">${dt.getDate()}</b><span>${esc(dt.toLocaleDateString("fr-FR", { weekday: "short" }))} ${esc(mon)}</span>` : `<b class="dp m">${esc(mon)}</b>`;
    const flou = multi(it) ? `<small>jusqu'au ${esc(fmtShort(it.fin))}</small>` : it.flou && (p || norm(it.flou) !== norm(mon)) ? `<small>${esc(it.flou)}</small>` : "";
    return `<span class="td td-date">${main}${flou}</span>`;
  };
  const stCell = (it) => { const past = isPast(it) || it.st === "diffuse";
    return `<span class="td td-st">${past ? `<span class="done">${I.check}</span>${it.st === "diffuse" ? "Diffusé" : "Passé"}` : esc(cap(stWord(it)))}</span>`; };
  const isNewIt = (it) => me().chef && it.by !== me().k && it.at >= addDays(TODAY, -7);
  const RCOLS = [...SERVICES.map((s) => ({ nom: s.court, f: (a) => !isPay(a) && a.svc === s.k })), { nom: "Chef", f: isChefAct }, { nom: "Partenariats", f: isPay }];
  function tfRow(it) {
    const linked = DB.items.filter((a) => a.tf === it.id && a.st !== "retire"), rl = relaisTxt(it), past = isPast(it);
    const label = [cap(when(it)), it.t, rl, past ? "passé" : stWord(it)].filter(Boolean).join(". ");
    return `<button type="button" class="tr${past ? " past" : ""}${it.st === "confirmer" ? " soft" : ""}" data-open="${it.id}" aria-label="${esc(label)}">
      ${tdDate(it)}<span class="td td-t"><b>${isNewIt(it) ? `<i class="new-dot"></i>` : ""}${esc(it.t)}</b>${rl ? `<span class="td-sub">${esc(rl)}</span>` : ""}</span>
      ${RCOLS.map((c) => { const n = linked.filter(c.f).length; return `<span class="td td-n">${n ? `<i>${n}</i>` : ""}</span>`; }).join("")}${stCell(it)}</button>`;
  }
  function payRow(it) {
    const tags = [...msgNames(it), ...(isInc(it) ? ["Incontournable"] : [])].map((n) => `<span class="ag-msg${n === "Incontournable" ? " inc" : ""}">${esc(n)}</span>`).join("");
    const past = isPast(it) || it.st === "diffuse";
    return `<button type="button" class="tr${past ? " past" : ""}${it.st === "confirmer" ? " soft" : ""}" data-open="${it.id}" aria-label="${esc([cap(when(it)), it.t, partnerName(it), msgText(it), past ? "passé" : stWord(it)].filter(Boolean).join(". "))}">
      ${tdDate(it)}<span class="td td-t"><b>${esc(it.t)}</b><span class="td-sub"><span class="ag-who">${esc(partnerName(it))}</span>${tags}</span></span>
      <span class="td td-p">${esc(partnerName(it))}</span><span class="td td-m">${tags}</span>${stCell(it)}</button>`;
  }
  const tfHead = `<div class="tr th" aria-hidden="true"><span class="td th-a">Date</span><span class="td th-b">Temps fort</span><span class="td th-g">Relais</span>${RCOLS.map((c, i) => `<span class="td td-n" style="grid-column:${i + 3}">${c.nom}</span>`).join("")}<span class="td td-st th-z">Statut</span></div>`;
  const payHead = `<div class="tr th" aria-hidden="true"><span class="td">Date</span><span class="td">Dispositif</span><span class="td td-p">Partenaire</span><span class="td td-m">Message</span><span class="td td-st">Statut</span></div>`;
  const sujCard = (it) => { const rl = relaisTxt(it);
    return `<button type="button" class="suj-card" data-open="${it.id}" aria-label="${esc(["Sujet", cap(when(it)), it.t, rl].filter(Boolean).join(". "))}"><span class="sc-ic" aria-hidden="true">${I.bookmark}</span><span><b>${esc(it.t)}</b>${rl ? `<span>${esc(rl)}</span>` : ""}</span></button>`; };

  function byPeriod(el, { k, title, all, action, lead = "", mark = true, empty = "", add = "" }) {
    const pastN = all.filter(isPast).length, open = S.past[k], wide = cols();
    const list = open ? all : all.filter((it) => !isPast(it));
    // dans une période : ses sujets, ses classements, puis ses temps forts datés
    const secs = PERIODS.map((P, i) => ({ P, i, suj: list.filter((it) => isSujet(it) && it.per.includes(i)), cls: list.filter((it) => isCls(it) && periodOf(it.date) === i).sort(sortDate),
      l: list.filter((it) => !isSujet(it) && !isCls(it) && periodOf(it.date) === i).sort(sortDate) })).filter((g) => g.suj.length || g.cls.length || g.l.length);
    const phone = (g) => `<h2 class="ag-month">${esc(g.P.nom)} <span>${esc(g.P.lib)}</span></h2>
      ${g.suj.length ? `<h3 class="sec-h suj-h">Sujets de la période</h3><div class="group">${rows(g.suj, { mode: "month", mark })}</div>` : ""}
      ${g.cls.length ? `<h3 class="sec-h suj-h">Classements</h3><div class="group">${rows(g.cls, { mode: "month", mark })}</div>` : ""}
      ${g.l.length ? `${g.suj.length || g.cls.length ? `<h3 class="sec-h suj-h">Temps forts</h3>` : ""}<div class="group">${rows(g.l, { mode: "month", mark })}</div>` : ""}`;
    const desk = (g) => `<section class="tbl-sec" id="per-${k}-${g.i}" aria-label="${esc(g.P.nom)}"><h2 class="ag-month">${esc(g.P.nom)} <span>${esc(g.P.lib)}</span></h2>
      ${g.suj.length ? `<h3 class="sec-h suj-h">Sujets de la période · ${g.suj.length}</h3><div class="suj-grid">${g.suj.map(sujCard).join("")}</div>` : ""}
      ${g.cls.length ? `<h3 class="sec-h suj-h">Classements · ${g.cls.length}</h3><div class="group cls-grp">${rows(g.cls, { mode: "month", mark })}</div>` : ""}
      ${g.l.length ? `${g.suj.length || g.cls.length ? `<h3 class="sec-h suj-h">Temps forts · ${g.l.length}</h3>` : ""}<div class="tbl tbl-${k}" style="--nr:${RCOLS.length - 1}">${k === "tf" ? tfHead + g.l.map(tfRow).join("") : payHead + g.l.map(payRow).join("")}</div>` : ""}</section>`;
    const nav = wide && secs.length > 1 ? `<nav class="per-nav" aria-label="Aller à une période">${secs.map((g) => `<button type="button" class="per-l${g.i === CUR ? " now" : ""}" data-act="goper" data-k="${k}" data-i="${g.i}">${esc(g.P.nom)}</button>`).join("")}
      ${pastN ? `<button type="button" class="link" data-act="past" data-k="${k}">${open ? "Masquer les passés" : seeMore(pastN, "passés")}</button>` : ""}</nav>` : "";
    el.innerHTML = K.navbar({ title, actions: action + profileBtn() }) + `<div class="scroll${wide ? " page-wide" : ""}">
      <h1 class="large-title">${title}</h1>${lead}
      ${wide && secs.length > 1 ? nav : pastN ? `<p class="past-p"><button type="button" class="link" data-act="past" data-k="${k}">${open ? "Masquer les passés" : seeMore(pastN, "passés")}</button></p>` : ""}
      ${secs.length ? secs.map(wide ? desk : phone).join("") : `<div class="group"><div class="empty"><span>${pastN ? "Plus rien à venir." : empty}</span>${pastN ? "" : add}</div></div>`}
    </div>`;
    syncBadge();
  }
  const renderTF = (el) => byPeriod(el, { k: "tf", title: "Temps forts", all: DB.items.filter(isTF),
    action: canAdd() ? `<button type="button" class="txt-btn strong" data-act="addtf">${me().chef ? "Ajouter" : "Proposer"}</button>` : "",
    empty: "Aucun temps fort pour l'instant.", add: canAdd() ? `<button type="button" class="btn small" data-act="addtf">${me().chef ? "Ajouter un temps fort" : "Proposer un temps fort"}</button>` : "" });
  const renderMedia = (el) => byPeriod(el, { k: "media", title: "Partenariats média", all: DB.items.filter(isPay), mark: false,
    action: isMedia() ? `<button type="button" class="txt-btn strong" data-act="addpartner">Ajouter</button>` : "",
    lead: isMedia() ? "" : `<p class="sec-f lead">Rempli par ${esc(mediaNames())}. Tu peux y demander des éléments.</p>`,
    empty: "Aucun partenariat pour l'instant.", add: isMedia() ? `<button type="button" class="btn small" data-act="addpartner">Ajouter un partenariat</button>` : "" });

  // =====================================================================
  // Formulaire commun : ajouter (préfixe f) et modifier (préfixe e)
  // =====================================================================
  function formHTML(d, px, edit) {
    const p = me(), suj = d.kind === "sujet", cls = d.kind === "classement", tf = d.kind === "tf" || suj || cls, pay = d.kind === "partner", mois = d.prec === "mois";
    const tfk = d.kind === "tf", plus = tfk && d.plus; // un temps fort peut durer plusieurs jours (semaine séminaire…)
    const kinds = [...(canAdd() ? [["action", "Action"], ["tf", "Temps fort"], ["sujet", "Sujet"], ...(p.chef ? [["classement", "Classement"]] : [])] : []), ...(isMedia() ? [["partner", "Partenariat"]] : [])];
    const told = K.fr.list(toldAll());
    // le temps fort déjà lié reste dans la liste, même retiré ou passé : enregistrer ne doit pas le détacher
    const tfs = DB.items.filter((it) => isTF(it) && (it.id === d.tf || (it.st !== "retire" && (precise(it) ? days(endOf(it)) >= -7 : !isPast(it))))).sort(sortDate);
    const opt = (it) => `<option value="${it.id}"${d.tf === it.id ? " selected" : ""}>${esc(`${when(it)} · ${it.t}`)}</option>`;
    const open = d.more || !!d.tf || !!d.link || !!d.note;
    const ph = suj ? "Ex. Salle Bloomberg" : cls ? "Ex. Financial Times" : tf ? "Ex. Venue de Columbia à Bordeaux" : pay ? "Ex. Article sur le consortium" : "Ex. Reel alumni chez EY";
    return `${edit ? "" : `<div class="seg" data-seg id="${px}-kind" role="group" aria-label="Type d'ajout">${kinds.map(([k, l]) => `<button type="button" value="${k}" aria-pressed="${d.kind === k}">${I.check}${l}</button>`).join("")}</div>`}
      <label class="lbl" for="${px}-t">${pay ? "Dispositif" : "Titre"}</label><input class="in" id="${px}-t" value="${esc(d.t)}" placeholder="${ph}" aria-describedby="${px}-t-err"><p class="err" id="${px}-t-err" hidden>Donne un titre.</p>
      ${pay ? `<span class="lbl" id="${px}-pt-l">Partenaire</span>${PARTNERS.length ? `<div class="chips" data-chips id="${px}-pt" role="group" aria-labelledby="${px}-pt-l">${PARTNERS.map((x) => chip(x.nom, d.partner === x.k && !d.newPartner, x.k)).join("")}</div>` : ""}
        <input class="in np-in" id="${px}-np" value="${esc(d.newPartner)}" placeholder="${PARTNERS.length ? "Ou un nouveau partenaire" : "Ex. Major Prépa"}" aria-labelledby="${px}-pt-l" aria-describedby="${px}-pt-err"><p class="err" id="${px}-pt-err" hidden>Choisis ou écris un partenaire.</p>` : ""}
      ${!tf && !pay && p.chef ? `<span class="lbl" id="${px}-svc-l">Porté par</span><div class="chips" data-chips id="${px}-svc" role="group" aria-labelledby="${px}-svc-l">${[...SERVICES, CHEF].map((s) => chip(s.court, d.svc === s.k, s.k)).join("")}</div>` : ""}
      ${suj ? `<span class="lbl" id="${px}-per-l">Période</span><div class="chips" data-chips="multi" id="${px}-per" role="group" aria-labelledby="${px}-per-l" aria-describedby="${px}-per-err">${PERIODS.map((P, i) => chip(perName(P), d.per.includes(i), i)).join("")}</div>
        <p class="err" id="${px}-per-err" hidden>Choisis au moins une période.</p>` : `<div id="${px}-jour"${mois ? " hidden" : ""}><label class="lbl" for="${px}-date" id="${px}-date-l">${plus ? "Du" : cls ? "Publication" : "Date"}</label>${dateField(`${px}-date`, d.date)}
        ${tfk ? `<div id="${px}-finw"${plus ? "" : " hidden"}><label class="lbl" for="${px}-fin">Au</label>${dateField(`${px}-fin`, finOf(d))}<p class="err" id="${px}-fin-err" hidden>Choisis un dernier jour après le premier.</p></div>` : ""}</div>
      <div id="${px}-moisw"${mois ? "" : " hidden"}><label class="lbl" for="${px}-mois">Mois</label><select class="in" id="${px}-mois">${MONTHS.map((m) => `<option value="${m}"${d.mois === m ? " selected" : ""}>${monLong(m)}</option>`).join("")}</select></div>
      <div class="group conf-row">${tfk ? `<label class="row" for="${px}-plus" id="${px}-plusr"${mois ? " hidden" : ""}><span class="row-main"><b>Sur plusieurs jours</b></span><input type="checkbox" class="switch" id="${px}-plus" data-plus="${px}"${plus ? " checked" : ""}></label>` : ""}
        <label class="row" for="${px}-prec"><span class="row-main"><b>Date à préciser</b></span><input type="checkbox" class="switch" id="${px}-prec" data-prec="${px}"${mois ? " checked" : ""}></label></div>`}
      ${cls ? `<div class="rk-in"><div><label class="lbl" for="${px}-rang">Rang de KEDGE</label><input class="in" id="${px}-rang" inputmode="numeric" autocomplete="off" value="${esc(d.rang)}" placeholder="10" aria-describedby="${px}-rk-err"></div>
        <div><label class="lbl" for="${px}-cible">Objectif : top</label><input class="in" id="${px}-cible" inputmode="numeric" autocomplete="off" value="${esc(d.cible)}" placeholder="7" aria-describedby="${px}-rk-err"></div></div>
        <p class="err" id="${px}-rk-err" hidden>Un rang va de 1 à 999.</p>` : ""}
      ${tf ? "" : `<span class="lbl" id="${px}-m-l">Message</span><div class="chips" data-chips="multi" id="${px}-m" role="group" aria-labelledby="${px}-m-l" aria-describedby="${px}-m-err ${px}-m-f">${MESSAGES.map((m) => chip(m.nom, d.m.includes(String(m.n)), m.n)).join("")}${chip("Incontournable", d.m.includes("INC"), "INC")}</div>
        <p class="err" id="${px}-m-err" hidden>Choisis un message, ou « Incontournable ».</p><p class="sec-f" id="${px}-m-f">Incontournable : à couvrir même sans message (admissibles, JPO…).</p>`}
      ${pay ? "" : `<span class="lbl" id="${px}-cc-l">Qui prévenir ?</span><div class="chips" data-chips="multi" id="${px}-cc" role="group" aria-labelledby="${px}-cc-l">${SERVICES.filter((s) => s.k !== p.svc).map((s) => chip(s.court, d.cc.includes(s.k), s.k)).join("")}</div>
        <p class="sec-f">${told ? `Ils reçoivent une notification, ${esc(told)} aussi.` : "Ils reçoivent une notification."}</p>`}
      <details class="more" id="${px}-more"${open ? " open" : ""}><summary>Plus d'options${down}</summary>
        ${tf ? "" : `<label class="lbl" for="${px}-tf">Temps fort, sujet ou classement lié</label><select class="in" id="${px}-tf"><option value="">Aucun</option>
          <optgroup label="Temps forts">${tfs.filter(isTfDay).map(opt).join("")}</optgroup><optgroup label="Sujets">${tfs.filter(isSujet).map(opt).join("")}</optgroup>${tfs.some(isCls) ? `<optgroup label="Classements">${tfs.filter(isCls).map(opt).join("")}</optgroup>` : ""}</select>`}
        ${edit ? "" : `<label class="lbl" for="${px}-link">Lien SharePoint</label><input class="in" id="${px}-link" type="url" inputmode="url" value="${esc(d.link)}" placeholder="https://kedgebs.sharepoint.com/…" aria-describedby="${px}-link-err"><p class="err" id="${px}-link-err" hidden>Colle un lien qui commence par https://</p>`}
        <label class="lbl" for="${px}-note">Note</label><textarea class="in" id="${px}-note" rows="3" placeholder="Contexte, contact…">${esc(d.note)}</textarea>
      </details>
      <div class="cta"><button type="button" class="btn block" data-act="${edit ? "save" : "publish"}"${edit ? ` data-id="${d.id}"` : ""}>${edit ? "Enregistrer" : "Publier"}</button></div>`;
  }
  function readForm(el, px, base) {
    const q = (id) => el.querySelector(`#${px}-${id}`);
    // un champ absent (« Date à préciser » n'existe pas pour un sujet) garde la valeur du brouillon
    return { ...base, t: q("t")?.value ?? base.t, prec: q("prec") ? (q("prec").checked ? "mois" : "jour") : base.prec, date: q("date")?.value || base.date, mois: q("mois")?.value || base.mois,
      m: q("m") ? pressed(`#${px}-m`, el) : base.m, per: q("per") ? pressed(`#${px}-per`, el).map(Number) : base.per, cc: q("cc") ? pressed(`#${px}-cc`, el) : base.cc,
      svc: q("svc") ? pressed(`#${px}-svc`, el)[0] || base.svc : base.svc, partner: q("pt") ? pressed(`#${px}-pt`, el)[0] || base.partner : base.partner, newPartner: q("np")?.value ?? base.newPartner,
      tf: q("tf") ? q("tf").value : base.tf, link: q("link")?.value ?? base.link, note: q("note")?.value ?? base.note, more: !!q("more")?.open,
      plus: q("plus") ? q("plus").checked : base.plus, fin: q("fin")?.value || base.fin, rang: q("rang")?.value ?? base.rang, cible: q("cible")?.value ?? base.cible };
  }
  function validate(el, px, d) {
    const t = el.querySelector(`#${px}-t`), okT = !!d.t.trim(), okM = d.kind === "tf" || d.kind === "sujet" || d.kind === "classement" || d.m.length > 0, mErr = el.querySelector(`#${px}-m-err`);
    const okP = d.kind !== "sujet" || d.per.length > 0, pErr = el.querySelector(`#${px}-per-err`);
    const okPt = d.kind !== "partner" || !!(d.newPartner.trim() || PARTNERS.some((x) => x.k === d.partner)), ptErr = el.querySelector(`#${px}-pt-err`);
    const fErr = el.querySelector(`#${px}-fin-err`), okF = !(d.kind === "tf" && d.plus && d.prec !== "mois") || finOf(d) > d.date;
    const rkOk = (v) => !rkNum(v) || (/^\d{1,3}$/.test(rkNum(v)) && +rkNum(v) >= 1);
    const okR = d.kind !== "classement" || (rkOk(d.rang) && rkOk(d.cible)), rErr = el.querySelector(`#${px}-rk-err`);
    const link = el.querySelector(`#${px}-link`), okL = !d.link.trim() || /^https:\/\/\S+$/.test(d.link.trim()), lErr = el.querySelector(`#${px}-link-err`);
    el.querySelector(`#${px}-t-err`).hidden = okT; t.setAttribute("aria-invalid", String(!okT)); if (mErr) mErr.hidden = okM; if (pErr) pErr.hidden = okP; if (ptErr) ptErr.hidden = okPt; if (fErr) fErr.hidden = okF; if (rErr) rErr.hidden = okR;
    if (lErr) { lErr.hidden = okL; link.setAttribute("aria-invalid", String(!okL)); }
    if (!okT) { t.focus(); return false; }
    if (!okPt) { el.querySelector(`#${px}-np`).focus(); return false; }
    if (!okP) { el.querySelector(`#${px}-per .chip`).focus(); return false; }
    if (!okM) { el.querySelector(`#${px}-m .chip`).focus(); return false; }
    if (!okF) { el.querySelector(`#${px}-fin`).focus(); return false; }
    if (!okR) { el.querySelector(`#${px}-${rkOk(d.rang) ? "cible" : "rang"}`).focus(); return false; }
    if (!okL) { el.querySelector(`#${px}-more`).open = true; link.focus(); return false; }
    return true;
  }
  // le dernier jour proposé : celui choisi, sinon une semaine du lundi au vendredi (sans dépasser la fin du plan,
  // sauf pour un premier jour qui est le dernier du plan : le dernier jour peut alors déborder un peu)
  const finFrom = (date) => [addDays(date, 4), [DMAX, addDays(date, 1)].sort().pop()].sort()[0];
  const finOf = (d) => d.fin || finFrom(d.date);
  // date précise, ou seulement le mois (« Date à préciser »)
  const dateFields = (d, prev) => {
    if (d.kind === "sujet") { const per = [...d.per].sort((a, b) => a - b); return { date: PERIODS[per[0]].du, flou: "", fin: "", per }; }
    if (d.prec === "mois") return prev && !precise(prev) && prev.date.slice(0, 7) === d.mois ? { date: prev.date, flou: prev.flou, fin: "" } : { date: `${d.mois}-01`, flou: cap(monShort(`${d.mois}-01`)), fin: "" };
    return { date: d.date, flou: prev && precise(prev) && prev.date === d.date ? prev.flou : "", fin: d.kind === "tf" && d.plus ? finOf(d) : "" };
  };
  // « 10e », « 1er », « top 7 » : on garde le nombre (un champ texte : un champ nombre rendait « 10e » vide sans rien dire)
  const rkNum = (v) => String(v ?? "").trim().replace(/^top\s*/i, "").replace(/\s*(er|ère|re|e|ème|eme)$/i, "");
  const rankOf = (d) => (d.kind === "classement" ? { rang: rkNum(d.rang) ? +rkNum(d.rang) : null, cible: rkNum(d.cible) ? +rkNum(d.cible) : null } : {});
  const msgsOf = (d) => (d.kind === "tf" || d.kind === "sujet" || d.kind === "classement" ? [] : d.m.map((x) => (x === "INC" ? "INC" : +x)));

  function renderAjouter(el) {
    // un compte média sans service ne saisit que des partenariats
    // un brouillon en cours garde tout ce qui a été saisi quand l'écran se redessine (changement d'onglet, temps réel)
    if (S.draft && el._draft === S.draft && el.querySelector("#f-t")) S.draft = readForm(el, "f", S.draft);
    if (!S.draft || (!canAdd() && S.draft.kind !== "partner")) S.draft = newDraft(canAdd() ? "action" : "partner");
    el._draft = S.draft;
    el.innerHTML = K.navbar({ title: "Ajouter", actions: profileBtn() }) + `<div class="scroll"><h1 class="large-title">Ajouter</h1>${canAdd() || isMedia() ? formHTML(S.draft, "f", false)
      : isVisit() ? `<div class="group"><div class="empty"><span>Mode visiteur : tu peux tout consulter, sans rien ajouter ni modifier.</span></div></div>`
      : `<div class="group"><div class="empty"><span>Ton compte n'est rattaché à aucun service : tu peux tout consulter et demander des éléments. Pour publier, demande à ${esc(CHEF.qui)} de t'ajouter à ton service.</span></div></div>`}</div>`;
    syncBadge();
  }
  // le brouillon en cours, s'il contient déjà quelque chose (titre, note ou lien)
  function keptDraft() {
    const el = document.getElementById("v-ajouter");
    if (S.draft && el?._draft === S.draft && el.querySelector("#f-t")) S.draft = readForm(el, "f", S.draft);
    const d = S.draft;
    return d && (d.t.trim() || d.note.trim() || d.link.trim() || d.newPartner.trim()) ? d : null;
  }
  // partenaire choisi, ou nouveau partenaire créé au passage
  async function partnerOf(d) {
    const nom = d.newPartner.trim(); if (!nom) return d.partner;
    const known = PARTNERS.find((x) => norm(x.nom) === norm(nom)); if (known) return known.k;
    const x = await Store.addPartner(nom); PARTNERS.push(x); return x.k;
  }
  async function publish(btn) {
    const el = document.getElementById("v-ajouter"), d = (S.draft = readForm(el, "f", S.draft));
    // un Publier refusé : le formulaire reste le brouillon, ce qu'on corrige ensuite est gardé
    el._draft = S.draft;
    if (!validate(el, "f", d)) return;
    const p = me(), cls = d.kind === "classement", tf = d.kind === "tf" || d.kind === "sujet" || cls, pay = d.kind === "partner";
    // un classement est porté par les chefs de projet
    const it = { id: uid(), kind: cls ? "classement" : tf ? "tf" : "action", per: [], svc: cls ? "chef" : tf ? p.svc : pay ? "chef" : p.chef ? d.svc : p.svc, ...dateFields(d), t: cls ? clsT(d.t) : d.t.trim(), m: msgsOf(d),
      st: "planifie", cc: pay ? [] : d.cc, tf: tf ? "" : d.tf, partner: "", by: p.k, at: TODAY, ts: new Date().toISOString(), lieu: "", note: d.note.trim(), links: [], ...rankOf(d) };
    btn.disabled = true;
    try {
      if (pay) it.partner = await partnerOf(d);
      await Store.addItem(it);
    } catch (e) { btn.disabled = false; return fail(e); }
    DB.items.push(it);
    // la base note la création ; on l'affiche sans attendre le temps réel
    (DB.journal ||= []).push({ id: 0, item: it.id, by: p.k, kind: "creation", diff: {}, at: TODAY, ts: it.ts });
    // la fiche est enregistrée : un lien refusé ne doit pas faire republier (doublon)
    let linkErr = null;
    // le lien reste sur la fiche créée : la fiche du temps fort et celles des relais le montrent aussi
    if (d.link.trim()) { try { it.links.push(await Store.addLink(it.id, "Document SharePoint", d.link.trim())); } catch (e) { console.error(e); linkErr = e; } }
    btn.disabled = false;
    // prévenus par la base : services cités, service porteur (s'il n'est pas le mien), les autres chefs pour une fiche du chef de projet
    // (un classement, un temps fort d'un chef…), les comptes média pour un partenariat, prévenus de tout
    const others = (f) => PEOPLE.filter((x) => x.k !== ME && f(x)).map((x) => x.nom);
    const told = [...new Set([...(pay ? [] : [...new Set([...d.cc, ...(it.svc !== p.svc && it.svc !== "chef" && !tf ? [it.svc] : [])])].map((k) => svcOf(k).court)),
      ...(pay ? others((x) => x.media) : it.svc === "chef" ? others((x) => x.chef) : []), ...toldAll()])];
    S.draft = newDraft();
    K.refresh();
    K.snack(linkErr ? `C'est publié, mais le lien n'a pas été ajouté (${esc(errText(linkErr))}). Ajoute-le depuis la fiche.`
      : told.length ? `C'est publié. Notification envoyée à ${esc(K.fr.list(told))}.` : "C'est publié.", linkErr ? 6000 : undefined);
    openItem(it.id);
  }
  const draftOf = (it) => ({ id: it.id, kind: isSujet(it) ? "sujet" : isCls(it) ? "classement" : isTF(it) ? "tf" : isPay(it) ? "partner" : "action", t: it.t, prec: precise(it) ? "jour" : "mois", date: it.date, mois: it.date.slice(0, 7),
    m: it.m.map(String), per: isSujet(it) ? [...it.per] : [S.period], cc: [...it.cc], svc: it.svc, partner: it.partner || PARTNERS[0]?.k || "", newPartner: "", tf: it.tf, link: "", note: it.note, more: !!(it.tf || it.note), plus: multi(it), fin: it.fin || "", rang: it.rang ?? "", cible: it.cible ?? "",
    orig: JSON.parse(JSON.stringify(it)) });
  function openEdit(id) { const it = byId(id); if (!it) return; S.edit = draftOf(it); K.push((el, o) => renderEdit(el, o, id), { title: "Modifier" }); }
  function renderEdit(el, { back }) {
    el.innerHTML = K.navbar({ title: "Modifier", back }) + `<div class="scroll"><h1 class="large-title">Modifier</h1>${formHTML(S.edit, "e", true)}</div>`;
  }
  async function saveEdit(id, btn) {
    const it = byId(id), el = K.topView(), d = readForm(el, "e", S.edit);
    if (!it || !validate(el, "e", d)) return;
    const next = { ...it, ...dateFields(d, it), t: d.kind === "classement" ? clsT(d.t) : d.t.trim(), m: msgsOf(d), cc: d.kind === "partner" ? [] : d.cc, tf: d.kind === "tf" || d.kind === "sujet" || d.kind === "classement" ? "" : d.tf, note: d.note.trim(), ...rankOf(d) };
    if (d.kind === "action" && me().chef) next.svc = d.svc;
    btn.disabled = true;
    try {
      if (d.kind === "partner") next.partner = await partnerOf(d);
    } catch (e) { btn.disabled = false; return fail(e); }
    // seuls les champs changés dans le formulaire partent : une modification faite entre-temps par quelqu'un d'autre est gardée
    const orig = S.edit.orig, keys = ["t", "date", "fin", "flou", "per", "svc", "cc", "m", "tf", "partner", "note", "rang", "cible"].filter((k) => JSON.stringify(orig[k]) !== JSON.stringify(next[k]));
    if (!keys.length) { btn.disabled = false; S.edit = null; K.pop(); return K.snack("Rien n'a changé."); }
    try { await Store.updateItem(id, next, keys); } catch (e) { return fail(e); } finally { btn.disabled = false; }
    const before = { ...it };
    keys.forEach((k) => { it[k] = next[k]; });
    S.edit = null; K.pop(); K.refresh();
    // un service ajouté à « Qui prévenir » est prévenu par la base
    const added = it.cc.filter((k) => !before.cc.includes(k)).map((k) => svcOf(k).court);
    K.snack(added.length ? `Modifié. Notification envoyée à ${esc(K.fr.list(added))}.` : "Modifié.");
    sync();
    offerNotify(before, it);
  }
  // une date, un titre ou des précisions qui changent : on propose de prévenir ceux qui suivent la fiche,
  // sans relancer d'office (pas de notification pour une faute de frappe)
  async function offerNotify(a, b) {
    const ch = [];
    if (when(a) !== when(b)) ch.push(["date", `${when(a)} → ${when(b)}`]);
    if (a.t !== b.t) ch.push(["titre", `« ${a.t} » → « ${b.t} »`]);
    if (isCls(b) && rankTxt(a) !== rankTxt(b)) ch.push(["rang", `${rankTxt(a) || "—"} → ${rankTxt(b) || "—"}`]);
    if (a.note !== b.note) ch.push(["précisions", b.note ? `« ${clip(b.note, 120)} »` : "retirées"]);
    if (!ch.length) return;
    // les mêmes personnes que la base : prévenus de tout, services cités, service porteur, services des relais
    // (une fiche du chef de projet, dont chaque classement : les autres chefs ; un partenariat : les comptes média)
    const svcs = new Set([...b.cc, b.svc, ...DB.items.filter((x) => x.tf === b.id && x.st !== "retire").map((x) => x.svc)]);
    const who = PEOPLE.filter((p) => p.k !== ME && (p.notifAll || (p.ownSvc && svcs.has(p.ownSvc)) || (p.chef && b.svc === "chef" && !isPay(b)) || (p.media && isPay(b)))).map((p) => p.nom);
    if (!who.length) return;
    const ok = await K.alert({ title: "Prévenir du changement ?", cancel: "Pas besoin", ok: "Prévenir",
      text: `${ch.map(([k, v]) => `<b>${cap(k)}</b> : ${esc(v)}`).join("<br>")}<br><br>${esc(K.fr.list(who))} ${who.length > 1 ? "recevront" : "recevra"} une notification.` });
    if (!ok) return;
    try { await Store.renotify(b.id, ch.map(([k, v]) => `${k} : ${v}`).join(" ; ")); } catch (e) { return fail(e); }
    K.snack(`Notification envoyée à ${esc(K.fr.list(who))}.`);
    sync();
  }

  // =====================================================================
  // Fiche : l'essentiel en haut, une rubrique n'apparaît que si elle a du contenu
  // =====================================================================
  // ---------- historique d'une fiche ----------
  // la base garde les valeurs brutes (numéros de période et de message, codes) : on les écrit en toutes lettres
  const FIELDS = { t: "titre", date: "date", per: "périodes", svc: "porté par", cc: "prévenus", m: "messages", st: "statut", tf: "lié à", partner: "partenaire", lieu: "lieu", note: "précisions", rang: "rang", cible: "objectif" };
  const clip = (s, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const quote = (s) => `« ${clip(s)} »`;
  function valTxt(k, v) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "—";
    if (k === "per") return K.fr.list(v.map((n) => PERIODS.find((P) => P.n === n)?.nom || String(n)));
    if (k === "svc") return svcOf(v).court;
    if (k === "cc") return K.fr.list(v.map((x) => svcOf(x).court));
    if (k === "m") return K.fr.list(v.map((x) => (x === "INC" ? "Incontournable" : MESSAGES[+x - 1]?.nom || x)));
    if (k === "st") return ST[v] || v;
    if (k === "tf") return byId(v) ? quote(byId(v).t) : "une fiche effacée";
    if (k === "rang") return rgTxt(v);
    if (k === "cible") return `top ${v}`;
    if (k === "partner") return (PARTNERS.find((x) => x.k === v) || { nom: "—" }).nom;
    return quote(String(v));
  }
  const stamp = (ts) => { const d = new Date(ts), day = iso(d); return `${day === TODAY ? "aujourd'hui" : fmtDay(day)} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; };
  // une ligne par événement : quoi (gras), qui et quand (gris), puis le détail avant → après
  function histOf(it) {
    const det = (k, v) => `<span class="h-d"><i>${esc(k)}</i>${esc(v)}</span>`;
    // le dernier jour tel qu'il était juste après chaque événement : on remonte le temps depuis la fiche actuelle
    let finApres = it.fin || null;
    return (DB.journal || []).filter((j) => j.item === it.id).sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id).map((j) => {
      const d = j.diff || {}, fin1 = finApres;
      if (d.fin) finApres = d.fin[0] || null;
      if (j.kind === "creation") return { j, main: "Création" };
      if (j.kind === "document") return { j, main: d.retire ? "Document retiré" : "Document ajouté", det: d.nom ? det("", quote(d.nom)) : "" };
      // le détail est sur la modification juste en dessous
      if (j.kind === "deadline") return { j, main: `Deadline changée : ${d.type || "demande"} à ${svcOf(d.dest).court}`, det: d.pour ? det("", `${fmtDay(d.pour[0])} → ${fmtDay(d.pour[1])}`) : "" };
      if (j.kind === "reponse") return { j, main: `Éléments envoyés : ${d.type || "demande"}`, det: d.reponse ? det("", quote(d.reponse)) : "" };
      if (j.kind === "retrait") return { j, main: `Demande retirée : ${d.type || "demande"} à ${svcOf(d.dest).court}` };
      if (j.kind === "prevenu") return { j, main: d.n ? `Changement signalé à ${d.n} ${d.n > 1 ? "personnes" : "personne"}` : "Changement signalé" };
      // la date et sa précision (« Nov. », « Date à confirmer ») forment une seule ligne
      const dt = (i) => { const f = d.flou ? d.flou[i] : it.flou, x = d.date ? d.date[i] : it.date, y = d.fin ? d.fin[i] : i ? fin1 : finApres;
        return f || (x ? (y && y > x ? fmtRange(x, y) : fmtShort(x)) : "—"); };
      // un sujet n'a pas de date à montrer : ses périodes suffisent
      const ks = Object.keys(FIELDS).filter((k) => (d[k] || (k === "date" && (d.flou || d.fin))) && !(k === "date" && isSujet(it)));
      if (!ks.length) return null;
      return { j, main: `Modification : ${K.fr.list(ks.map((k) => FIELDS[k]))}`,
        det: ks.map((k) => (k === "date" ? det("date", `${dt(0)} → ${dt(1)}`) : k === "note" ? det("précisions", d.note[1] ? quote(d.note[1]) : "retirées") : det(FIELDS[k], `${valTxt(k, d[k][0])} → ${valTxt(k, d[k][1])}`))).join("") };
    }).filter(Boolean);
  }
  function histHTML(it) {
    const all = histOf(it); if (!all.length) return "";
    const k = `h-${it.id}`, open = S.open[k], list = open ? all : all.slice(0, 3);
    return `<h2 class="sec-h">Historique</h2><div class="group hist">${list.map(({ j, main, det = "" }) => `<div class="row wrap"><span class="row-main"><b>${esc(main)}</b><span>${esc([j.by ? person(j.by).nom : "", stamp(j.ts)].filter(Boolean).join(", "))}</span>${det}</span></div>`).join("")}</div>
      ${all.length > 3 ? `<p class="more-p"><button type="button" class="link" data-act="more" data-k="${k}">${open ? "Voir moins" : `Voir tout l'historique (${all.length})`}</button></p>` : ""}`;
  }

  // une demande : pour quel relais (s'il ne s'agit pas de cette fiche), quoi, de qui à qui et pour quand ; le service sollicité peut répondre d'ici
  const reqDocs = (q) => { const it = byId(q.item); return it ? famille(it).flatMap((x) => x.links || []).filter((l) => l.req === q.id) : []; };
  const reqRow = (q, id) => { const o = q.item !== id && byId(q.item), docs = q.st === "recue" ? reqDocs(q) : [];
    const rep = q.st === "recue" && (q.reponse || docs.length) ? `<span class="rq-rep">${q.reponse ? `<span class="rq-msg">${esc(q.reponse)}</span>` : ""}${docs.map((l) => `<button type="button" class="rq-doc" data-link="${esc(l.url)}">${I.external}${esc(l.nom)}</button>`).join("")}${q.by ? `<small>${esc(person(q.by).nom)}${q.rts ? `, ${ago(iso(new Date(q.rts)))}` : ""}</small>` : ""}</span>` : "";
    return `<div class="row wrap rq"><span class="row-main">${o ? `<button type="button" class="rq-for" data-open="${o.id}">${esc(o.t)}${o.st === "retire" ? " (retirée)" : ""}</button>` : ""}<b>${esc(reqTxt(q))}</b><span>De ${esc(person(q.from).nom)} à ${esc(svcOf(q.to).qui)}</span>${dlTag(q)}${rep}${canPour(q) ? `<button type="button" class="txt-btn rq-x" data-act="unreq" data-r="${q.id}">Retirer la demande</button>` : ""}</span>${q.st === "recue" ? `<span class="tag">Reçu</span>` : forMe(q) ? `<button type="button" class="btn small" data-act="repondre" data-r="${q.id}">${q.to === PROG.k ? "C'est reçu" : "Répondre"}</button>` : ""}</div>`; };
  function openItem(id) { const it = byId(id); if (!it) return; K.push((el, o) => renderItem(el, o, id), { title: kindName(it) }); }
  function renderItem(el, { back }, id) {
    const it = byId(id);
    if (!it) { el.innerHTML = K.navbar({ title: "Fiche", back }) + `<div class="scroll"><div class="empty"><span>Cette fiche n'existe plus.</span></div></div>`; return; }
    // les documents de la fiche, et ceux de son temps fort partagés avec tous ses relais
    const r = root(it), edit = canEdit(it), links = famille(it).filter((x) => x.st !== "retire" || x === it || x === r).flatMap((x) => (x.links || []).map((l) => ({ ...l, on: x })));
    const linkedTF = !isTF(it) && it.tf ? byId(it.tf) : null, past = isTF(it) && isPast(it);
    const reqs = reqsOf(it), blocks = DB.blocks.filter((b) => b.item === id && !b.leve);
    const kv = (k, v) => `<div class="row"><span class="row-main"><b>${k}</b></span><span class="row-value">${v}</span></div>`;
    const choices = isTF(it) ? ["confirmer", "planifie"] : isPay(it) ? ["confirmer", "planifie", "diffuse"] : ["idee", "confirmer", "planifie", "production", "diffuse"];
    const status = edit && !past && it.st !== "retire"
      ? `<div class="row field-row"><label for="st-${id}">Statut</label><select id="st-${id}" data-st="${id}">${choices.map((k) => `<option value="${k}"${it.st === k ? " selected" : ""}>${ST[k]}</option>`).join("")}</select></div>`
      : kv("Statut", past ? (isCls(it) ? "Publié" : "Passé") : ST[it.st]);
    const tags = !isTF(it) && it.m.length ? `<div class="mtags">${msgNames(it).map((n) => `<span class="mtag">${esc(n)}</span>`).join("")}${isInc(it) ? `<span class="mtag inc">Incontournable</span>` : ""}</div>` : "";
    let relay = "";
    if (isTF(it)) {
      const gs = relaisGroups(it), n = gs.reduce((s, g) => s + g.l.length, 0);
      relay = `${n ? `<h2 class="sec-h">Relais · ${n}</h2>` : ""}${gs.map((g) => `<h3 class="sec-h rl-h">${esc(g.nom)} · ${g.l.length}</h3><div class="group">${rows(g.l, { mode: "month", who: "tf" })}</div>`).join("")}
        ${canAdd() && it.st !== "retire" ? `<div class="group"><button type="button" class="row add-row" data-act="addlinked" data-id="${id}"><span class="add-ic">${I.plus}</span><span class="row-main"><b>Ajouter une action liée</b></span></button></div>` : ""}`;
    }
    const kindTitle = kindName(it), hist = histHTML(it);
    el.innerHTML = K.navbar({ title: kindTitle, back, actions: edit && it.st !== "retire" ? `<button type="button" class="txt-btn strong" data-act="edit" data-id="${id}">Modifier</button>` : "" }) + `<div class="scroll">
      <div class="hero hero-${typeOf(it)}">
        <h1 class="hero-title${it.st === "retire" ? " struck" : ""}">${esc(it.t)}</h1>
        <p class="hero-meta">${isTF(it) || isPay(it) ? metaHTML(it) : `${esc(svcOf(it.svc).nom)} · ${esc(cap(when(it)))}`}${isSujet(it) ? " · toute la période" : precise(it) || /confirmer|définir|préciser/i.test(it.flou) ? "" : ` · date à préciser`}</p>
        ${tags}
        ${isCls(it) && (it.rang || it.cible) ? `<div class="rk">${it.rang ? `<span class="rk-n" aria-label="Rang de KEDGE : ${rgTxt(it.rang)}"><b>${it.rang}</b>${it.rang === 1 ? "er" : "e"}</span>` : ""}${it.cible ? `<span class="rk-g">Objectif<b>Top ${it.cible}</b></span>` : ""}</div>` : ""}
      </div>
      ${it.st === "retire" || isVisit() ? "" : `<div class="cta fiche-cta"><button type="button" class="btn block" data-act="ask" data-id="${id}">${I.chat}Demander des éléments</button></div>`}
      ${blocks.length ? `<div class="group blk-group">${blocks.map((b) => `<div class="row"><span class="row-main"><b><span class="blk-l">Bloqué</span>${esc(b.why)}</b><span>${esc(person(b.by).nom)}, ${ago(b.at)}</span></span>${canLift(b, it) ? `<button type="button" class="btn small tonal" data-act="unblock" data-b="${b.id}">Lever</button>` : ""}</div>`).join("")}</div>` : ""}
      <div class="group facts">
        ${status}
        ${it.cc.length ? kv("Concernés", esc(K.fr.list(it.cc.map((k) => svcOf(k).court)))) : ""}
        ${linkedTF ? `<button type="button" class="row" data-open="${linkedTF.id}"><span class="row-main"><b>${cap(momWord(linkedTF))} lié</b><span>${esc(linkedTF.t)}</span></span>${I.chevR}</button>` : ""}
        ${it.lieu ? kv("Lieu", esc(it.lieu)) : ""}
      </div>
      ${it.note ? `<p class="sec-f">${esc(it.note)}</p>` : ""}
      ${reqs.length ? `<h2 class="sec-h">Demandes d'éléments · ${reqs.length}</h2><div class="group">${reqs.map((q) => reqRow(q, id)).join("")}</div>
        ${r !== it ? `<p class="sec-f">Partagées avec le ${momWord(r)} « ${esc(r.t)} » et ses relais.</p>` : reqs.some((q) => q.item !== id) ? `<p class="sec-f">Avec celles de ses relais.</p>` : ""}` : ""}
      ${links.length || canLink() ? `<h2 class="sec-h">Documents${links.length ? ` · ${links.length}` : ""}</h2><div class="group">${links.map((l) => `<div class="row lk"><button type="button" class="row-main lk-open" data-link="${esc(l.url)}"><b>${esc(l.nom)}</b><span>${esc(hostOf(l.url))}${l.on !== it ? ` · ${esc(isTF(l.on) ? momWord(l.on) : l.on.t)}` : ""}</span></button>
          ${l.by === ME || me().chef ? `<button type="button" class="txt-btn lk-x" data-act="unlink" data-l="${l.id}" data-id="${l.on.id}" aria-label="Retirer le document ${esc(l.nom)}">Retirer</button>` : `<span class="ext" aria-hidden="true">${I.external}</span>`}</div>`).join("")}
        ${canLink() ? `<button type="button" class="row add-row" data-act="addlink" data-id="${id}"><span class="add-ic">${I.plus}</span><span class="row-main"><b>Ajouter un lien SharePoint</b></span></button>` : ""}</div>
        ${links.length && r !== it ? `<p class="sec-f">Ceux du ${momWord(r)} « ${esc(r.t)} » sont partagés avec tous ses relais.</p>` : links.length && isTF(it) ? `<p class="sec-f">Visibles aussi sur ses relais.</p>` : ""}` : ""}
      ${relay}
      ${hist}
      ${hist && edit ? "" : `<p class="foot-note">${hist ? "" : `Ajouté par ${esc(person(it.by).nom)} le ${fmtDay(it.at)}. `}${edit ? "" : `Modifiable par ${esc(editors(it))}.`}</p>`}
      ${it.st === "retire" ? (edit ? `<p class="retire-p"><button type="button" class="txt-btn strong" data-act="unretire" data-id="${id}">Remettre ${isTF(it) ? `ce ${momWord(it)}` : "cette action"}</button><button type="button" class="txt-btn danger" data-act="delete" data-id="${id}">Supprimer définitivement</button></p>` : "")
        : isVisit() ? ""
        : `<p class="retire-p"><button type="button" class="txt-btn" data-act="block" data-id="${id}">Signaler un blocage</button>${edit ? `<button type="button" class="txt-btn danger" data-act="retire" data-id="${id}">Retirer ${isTF(it) ? `ce ${momWord(it)}` : "cette action"}</button>` : ""}</p>`}
    </div>`;
  }

  // ---------- date en français ----------
  // le champ date natif suit la langue du navigateur (souvent mois/jour/année) : on écrit la date en toutes lettres
  // et on la choisit dans un calendrier français, semaine du lundi au dimanche, jours de temps fort marqués en jaune
  const fmtLong = (s) => premier(cap(D(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })));
  const dateField = (id, value) => `<button type="button" class="in date-in" id="${id}" value="${value}" data-date-pick aria-expanded="false" aria-controls="${id}-cal">${I.calendar}<span>${esc(fmtLong(value))}</span></button><div class="cal" id="${id}-cal" hidden></div>`;
  function calHTML(id, sel, month) {
    // le dernier jour d'un temps fort peut déborder d'un mois après la fin du plan
    const max = /-fin$/.test(id) ? addDays(DMAX, 31) : DMAX;
    const first = D(month + "-01"), y = first.getFullYear(), mo = first.getMonth(), n = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const prev = iso(new Date(y, mo - 1, 1)).slice(0, 7), next = iso(new Date(y, mo + 1, 1)).slice(0, 7);
    const tf = new Set(DB.items.filter((it) => isTfDay(it) && precise(it) && it.st !== "retire").flatMap(daysOf));
    const nav = (m, dir, off) => `<button type="button" class="cal-nav" data-cal-nav="${m}" data-for="${id}" aria-label="${dir}"${off ? " disabled" : ""}>${dir === "Mois suivant" ? `<span class="flip">${I.chevL}</span>` : I.chevL}</button>`;
    const cells = Array.from({ length: n }, (_, i) => {
      const d = `${month}-${String(i + 1).padStart(2, "0")}`;
      return `<button type="button" class="cal-d${d === sel ? " on" : ""}${d === TODAY ? " now" : ""}${tf.has(d) ? " tf" : ""}" data-cal-day="${d}" data-for="${id}"${d < DMIN || d > max ? " disabled" : ""} aria-label="${esc(fmtLong(d) + (tf.has(d) ? ", temps fort" : ""))}"${d === sel ? ' aria-current="date"' : ""}>${i + 1}</button>`;
    }).join("");
    return `<div class="cal-h">${nav(prev, "Mois précédent", prev < DMIN.slice(0, 7))}<b>${esc(monLong(month))}</b>${nav(next, "Mois suivant", next > max.slice(0, 7))}</div>
      <div class="cal-w" aria-hidden="true">${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span>${x}</span>`).join("")}</div><div class="cal-g">${"<span></span>".repeat(lead)}${cells}</div>`;
  }
  document.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-date-pick]"), nav = e.target.closest("[data-cal-nav]"), day = e.target.closest("[data-cal-day]");
    if (pick) {
      const cal = document.getElementById(pick.id + "-cal"), open = cal.hidden;
      cal.hidden = !open; pick.setAttribute("aria-expanded", String(open));
      if (open) cal.innerHTML = calHTML(pick.id, pick.value, pick.value.slice(0, 7));
    } else if (nav) {
      const id = nav.dataset.for;
      document.getElementById(id + "-cal").innerHTML = calHTML(id, document.getElementById(id).value, nav.dataset.calNav);
      document.querySelector(`#${id}-cal [data-cal-nav="${nav.dataset.calNav}"]`)?.focus();
    } else if (day) {
      const f = document.getElementById(day.dataset.for);
      f.value = day.dataset.calDay; f.querySelector("span").textContent = fmtLong(f.value);
      if (/-fin$/.test(f.id)) f.dataset.set = "1";
      // un premier jour qui passe après le dernier : le dernier suit (une semaine du lundi au vendredi)
      const fin = /-date$/.test(f.id) && document.getElementById(f.id.replace(/date$/, "fin"));
      if (fin && fin.value <= f.value) { fin.value = finFrom(f.value); fin.querySelector("span").textContent = fmtLong(fin.value); }
      document.getElementById(f.id + "-cal").hidden = true; f.setAttribute("aria-expanded", "false"); f.focus();
    }
  });

  // ---------- feuilles ----------
  const sheetFor = (it) => `<p class="sheet-for"><b>${esc(it.t)}</b><span>${metaHTML(it)}</span></p>`;
  // une deadline déjà passée, ou après une action datée au jour près, ne sert à rien
  const pourErr = (it, v) => (v < TODAY ? "Cette deadline est déjà passée." : precise(it) && it.date >= TODAY && v > it.date ? `La deadline tombe après l'action (${fmtDay(it.date)}).` : "");
  function askSheet(id, key) {
    const it = byId(id), p = me(); if (!it) return;
    // deadline proposée : une semaine avant, au plus tôt dans trois jours, et jamais après l'action elle-même
    let pour = [addDays(it.date, -7), addDays(TODAY, 3)].sort().pop();
    if (precise(it) && it.date > TODAY && pour >= it.date) pour = [TODAY, addDays(it.date, -1)].sort().pop();
    // la Resp. offre, quand quelqu'un l'est (et pas soi-même) ; la Direction du Programme, pour les chefs
    const of = PEOPLE.some((x) => x.offre && x.k !== ME) && !p.offre ? [offre()] : [];
    const to = [...(p.chef ? [] : [CHEF]), ...SERVICES.filter((s) => s.k !== p.svc), ...of, ...(p.chef ? [PROG] : [])];
    // déjà demandé : seulement à ceux qu'on peut solliciter (pas à son propre service)
    const r = root(it), deja = reqsOf(it).filter((q) => q.st === "ouverte" && to.some((s) => s.k === q.to));
    K.sheet.open({ title: "Demander des éléments", ok: "Envoyer", full: true, body: `${sheetFor(it)}
      ${deja.length ? `<div class="deja"><span class="lbl">Déjà demandé</span><ul>${deja.map((q) => `<li><b>${esc(reqTxt(q))}</b><span>${esc(svcOf(q.to).court)} · deadline ${fmtDay(q.pour)}${q.item !== id ? ` · ${esc(byId(q.item)?.t || "")}` : ""}</span></li>`).join("")}</ul></div>` : ""}
      <span class="lbl" id="ask-type-l">Quoi ?</span><div class="chips" data-chips id="ask-type" role="group" aria-labelledby="ask-type-l">${TYPES.map((t, i) => chip(t, i === 0)).join("")}</div>
      <span class="lbl" id="ask-to-l">À qui ?</span><div class="chips" data-chips id="ask-to" role="group" aria-labelledby="ask-to-l">${to.map((s, i) => chip(s === CHEF ? CHEF.qui : s === PROG ? PROG.nom : s.court, i === 0, s.k)).join("")}</div>
      <label class="lbl" for="ask-pour">Deadline</label>${dateField("ask-pour", pour)}<p class="err" id="ask-err" hidden></p>
      <label class="lbl" for="ask-quoi">Précision <span class="opt">facultatif</span></label><textarea class="in" id="ask-quoi" rows="2" placeholder="Ex. les éléments de langage validés"></textarea>
      ${r !== it ? `<p class="sec-f">Visible aussi sur le ${momWord(r)} « ${esc(r.t)} » et ses relais.</p>` : isTF(it) ? `<p class="sec-f">Visible aussi sur ses relais.</p>` : ""}`,
      onOk: async (s) => {
        const type = pressed("#ask-type", s)[0] || "Autre", dest = pressed("#ask-to", s)[0] || to[0].k;
        // la même demande, au même service, déjà ouverte pour ce temps fort ou ses relais : on ne la renvoie pas
        const twin = deja.find((q) => q.to === dest && q.type === type);
        const e = s.querySelector("#ask-err"), v = s.querySelector("#ask-pour").value || pour, bad = pourErr(it, v);
        if (twin || bad) { e.textContent = twin ? `Déjà demandé à ${svcOf(dest).qui}, deadline ${fmtDay(twin.pour)}. Change la deadline depuis la fiche si besoin.` : bad; e.hidden = false; return false; }
        const q = { id: uid(), item: id, from: p.k, to: dest, type, quoi: s.querySelector("#ask-quoi").value.trim(), pour: v, st: "ouverte", at: TODAY, ts: new Date().toISOString() };
        try { await Store.addReq(q); if (key) await Store.answer(key, "oui"); } catch (e) { fail(e); return false; }
        DB.reqs.push(q); if (key) DB.answers[key] = "oui";
        K.refresh(); K.snack(dest === PROG.k ? "Noté : à demander à la Direction du Programme." : `Demande envoyée à ${esc(svcOf(dest).qui)}.`);
      } });
  }
  function blockSheet(id) {
    const it = byId(id);
    K.sheet.open({ title: "Signaler un blocage", ok: "Signaler", body: `${sheetFor(it)}<label class="lbl" for="bl-why">Qu'est-ce qui bloque ?</label><textarea class="in" id="bl-why" rows="3" placeholder="Ex. rushs pas encore reçus du partenaire" aria-describedby="bl-err"></textarea><p class="err" id="bl-err" hidden>Écris en une phrase ce qui bloque.</p>`,
      onOk: async (s) => { const w = s.querySelector("#bl-why"); if (!w.value.trim()) { w.setAttribute("aria-invalid", "true"); s.querySelector("#bl-err").hidden = false; w.focus(); return false; }
        const b = { id: uid(), item: id, by: me().k, why: w.value.trim(), at: TODAY, ts: new Date().toISOString(), leve: false };
        try { await Store.addBlock(b); } catch (e) { fail(e); return false; }
        DB.blocks.push(b); K.refresh(); K.snack("Blocage signalé. Il remontera en réunion."); } });
  }
  function linkSheet(id) {
    const it = byId(id), r = root(it);
    K.sheet.open({ title: "Ajouter un lien", ok: "Ajouter", body: `<label class="lbl" for="ln-nom">Nom du document</label><input class="in" id="ln-nom" placeholder="Ex. Dossier de presse">
      <label class="lbl" for="ln-url">Lien SharePoint</label><input class="in" id="ln-url" type="url" inputmode="url" placeholder="https://kedgebs.sharepoint.com/…" aria-describedby="ln-err"><p class="err" id="ln-err" hidden>Colle un lien qui commence par https://</p>
      ${r !== it ? `<p class="sec-f">Visible aussi sur le ${momWord(r)} « ${esc(r.t)} » et ses relais.</p>` : isTF(it) ? `<p class="sec-f">Visible aussi sur ses relais.</p>` : ""}`,
      onOk: async (s) => { const u = s.querySelector("#ln-url"); if (!/^https:\/\/\S+$/.test(u.value.trim())) { u.setAttribute("aria-invalid", "true"); s.querySelector("#ln-err").hidden = false; u.focus(); return false; }
        try { r.links.push(await Store.addLink(r.id, s.querySelector("#ln-nom").value.trim() || "Document SharePoint", u.value.trim())); } catch (e) { fail(e); return false; }
        K.refresh(); K.snack("Lien ajouté."); } });
  }
  // répondre à une demande : un message et, au besoin, un lien SharePoint. Le document va sur le temps fort (ou le sujet)
  // quand l'action y est liée, sinon sur la fiche : il se voit partout où la demande se voit
  function answerSheet(rid) {
    const q = DB.reqs.find((x) => x.id === rid), it = q && byId(q.item); if (!it) return;
    const r = root(it);
    // une info notée par un chef (Direction du Programme) : on note ce qu'on a reçu, sans « répondre » à quelqu'un
    const self = q.from === ME || q.to === PROG.k;
    K.sheet.open({ title: self ? "C'est reçu" : "Répondre", ok: self ? "Enregistrer" : "Envoyer", full: true, body: `${sheetFor(it)}<p class="sec-f">${self ? `À demander à ${esc(svcOf(q.to).qui)}` : `${esc(person(q.from).nom)} demande`} : ${esc(reqTxt(q))}.</p>
      <label class="lbl" for="rp-msg">${self ? "Ce que tu as reçu" : "Message"} <span class="opt">facultatif</span></label><textarea class="in" id="rp-msg" rows="3" maxlength="1000" placeholder="${self ? "Ex. programme validé par la direction" : "Ex. les visuels validés sont dans le dossier"}"></textarea>
      <label class="lbl" for="rp-url">Lien SharePoint <span class="opt">facultatif</span></label><input class="in" id="rp-url" type="url" inputmode="url" placeholder="https://kedgebs.sharepoint.com/…" aria-describedby="rp-err"><p class="err" id="rp-err" hidden>Colle un lien qui commence par https://</p>
      <label class="lbl" for="rp-nom">Nom du document <span class="opt">facultatif</span></label><input class="in" id="rp-nom" placeholder="${esc(q.type)}">
      <p class="sec-f">${r !== it ? `Le document va sur le ${momWord(r)} « ${esc(r.t)} » et se voit sur tous ses relais.` : isTF(it) ? "Le document se voit aussi sur ses relais." : "Le document va sur la fiche."}</p>`,
      onOk: async (s) => {
        const u = s.querySelector("#rp-url"), url = u.value.trim(), msg = s.querySelector("#rp-msg").value.trim();
        if (url && !/^https:\/\/\S+$/.test(url)) { u.setAttribute("aria-invalid", "true"); s.querySelector("#rp-err").hidden = false; u.focus(); return false; }
        try {
          if (url) r.links.push(await Store.addLink(r.id, s.querySelector("#rp-nom").value.trim() || q.type, url, q.id));
          await Store.answerReq(q.id, msg);
        } catch (e) { fail(e); return false; }
        Object.assign(q, { st: "recue", reponse: msg, by: ME, rts: new Date().toISOString() });
        K.refresh(); K.snack(q.from === ME ? "Noté comme reçu." : `${self ? "Noté comme reçu" : "Envoyé"}. Notification envoyée à ${esc(person(q.from).nom)}.`); sync();
      } });
  }
  async function withdrawReq(rid) {
    const q = DB.reqs.find((x) => x.id === rid); if (!q) return;
    if (!(await K.alert({ title: "Retirer la demande ?", text: `${esc(reqTxt(q))}, demandé à ${esc(svcOf(q.to).qui)}.${q.to === PROG.k ? "" : " Une notification lui sera envoyée."}`, ok: "Retirer", danger: true }))) return;
    try { await Store.setReq(q.id, "annulee"); } catch (e) { return fail(e); }
    q.st = "annulee"; K.refresh(); K.snack("Demande retirée."); sync();
  }
  // changer la deadline d'une demande : la personne qui demande, ou un chef ; le service sollicité est prévenu
  function pourSheet(rid) {
    const q = DB.reqs.find((x) => x.id === rid), it = q && byId(q.item); if (!it) return;
    K.sheet.open({ title: "Deadline", ok: "Enregistrer", body: `${sheetFor(it)}<p class="sec-f">${esc(reqTxt(q))}, demandé à ${esc(svcOf(q.to).qui)}.</p>
      <label class="lbl" for="pour-d">Nouvelle deadline</label>${dateField("pour-d", q.pour)}<p class="err" id="pour-err" hidden></p>`,
      onOk: async (s) => { const v = s.querySelector("#pour-d").value; if (!v || v === q.pour) return;
        const bad = pourErr(it, v); if (bad) { const e = s.querySelector("#pour-err"); e.textContent = bad; e.hidden = false; return false; }
        try { await Store.setReqPour(q.id, v); } catch (e) { fail(e); return false; }
        // la base prévient le service sollicité (personne pour la Direction du Programme), et la personne qui a demandé quand c'est un chef qui change la date
        const who = [...(q.to === PROG.k ? [] : [svcOf(q.to).qui]), ...(q.from !== ME ? [person(q.from).nom] : [])];
        q.pour = v; K.refresh(); K.snack(`Deadline : ${fmtDay(v)}.${who.length ? ` Notification envoyée à ${esc(K.fr.list(who))}.` : ""}`); } });
  }

  // =====================================================================
  // Écrans poussés : nouveautés, profil
  // =====================================================================
  function renderAllNew(el, { back }) {
    el.innerHTML = K.navbar({ title: "Nouveautés", back }) + `<div class="scroll"><h1 class="large-title">Nouveautés</h1><div class="group">${newItems().map(newRow).join("")}</div></div>`;
  }
  // le bouton Profil ouvre le profil, et le referme s'il est déjà ouvert (avec ce qui a été ouvert par-dessus, comme Équipe)
  let profEl = null;
  function toggleProfil() {
    if (profEl?.isConnected && !profEl.classList.contains("leave")) {
      for (let n = 0; n < 20 && K.topView() !== profEl; n++) K.pop();
      if (K.topView() === profEl) K.pop();
      profEl = null; return;
    }
    profEl = K.push(renderProfil, { title: "Profil" });
  }
  function renderProfil(el, { back }) {
    const p = me(), ps = Push.state();
    el.innerHTML = K.navbar({ title: "Profil", back }) + `<div class="scroll">
      <div class="profile-head"><span class="av big hl" aria-hidden="true">${K.initials(p.nom)}</span><h2>${esc(p.nom)}</h2><p>${esc(fonctionOf(p))}</p></div>
      ${isVisit() ? "" : `<div class="group"><label class="row" for="pf-push"><span class="row-main"><b>Notifications sur cet appareil</b></span><input type="checkbox" class="switch" id="pf-push"${ps.on ? " checked" : ""}${ps.can ? "" : " disabled"}></label></div>
      <p class="sec-f">${esc(ps.hint)}</p>`}
      <h2 class="sec-h">Apparence</h2>
      <div class="seg" data-seg id="pf-theme" role="group" aria-label="Apparence">${[["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, l]) => `<button type="button" value="${k}" aria-pressed="${K.theme === k}">${I.check}${l}</button>`).join("")}</div>
      <h2 class="sec-h">Compte</h2>
      <div class="group">${p.chef ? `<button type="button" class="row" data-act="team"><span class="row-main"><b>Équipe</b><span>Services et droits de chacun</span></span>${I.chevR}</button>
        <button type="button" class="row" data-act="copil"><span class="row-main"><b>Écran copil PGE</b><span>L'année en cinq périodes : diffusé, pas encore, à venir</span></span>${I.chevR}</button>` : ""}
        ${isVisit() ? "" : `<button type="button" class="row" data-act="password"><span class="row-main"><b>Changer de mot de passe</b></span>${I.chevR}</button>`}
        <button type="button" class="row" data-act="logout"><span class="row-main"><b class="danger" style="font-weight:400">Se déconnecter</b></span></button></div>
      <p class="sec-f">${isVisit() ? "Mode visiteur : consultation seule." : `Connecté avec ${esc(DATA.email)}.`}</p>
    </div>`;
  }
  function passwordSheet() {
    K.sheet.open({ title: "Mot de passe", ok: "Enregistrer", body: `<label class="lbl" for="pw-new">Nouveau mot de passe</label><input class="in" id="pw-new" type="password" autocomplete="new-password" aria-describedby="pw-err"><p class="err" id="pw-err" hidden></p>`,
      onOk: async (s) => {
        const w = s.querySelector("#pw-new"), err = s.querySelector("#pw-err");
        const say = (t) => { err.textContent = t; err.hidden = false; w.setAttribute("aria-invalid", "true"); w.focus(); return false; };
        if (w.value.length < 8) return say("8 caractères au moins.");
        try { await Store.setPassword(w.value); } catch (e) { return say(/same|different/i.test(e.message) ? "C'est déjà ton mot de passe." : `Pas changé : ${errText(e)}.`); }
        K.snack("Mot de passe changé.");
      } });
  }

  // ---------- équipe (chefs de projet) : service et droits de chaque compte ----------
  // les comptes se créent dans Supabase ; on règle ici qui fait quoi
  const rights = (p) => p.visiteur ? "Visiteur · lecture seule" : [...new Set([p.fonction, p.chef ? "Chef de projet" : p.ownSvc ? svcOf(p.ownSvc).nom : "Sans service", p.media ? "Partenariats" : "", p.offre ? "Resp. offre" : "", p.notifAll ? "Prévenu de tout" : ""].filter(Boolean))].join(" · ");
  function renderTeam(el, { back }) {
    const list = [...PEOPLE].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    el.innerHTML = K.navbar({ title: "Équipe", back }) + `<div class="scroll"><h1 class="large-title">Équipe</h1>
      <div class="group">${list.map((p) => `<button type="button" class="row" data-act="person" data-id="${p.k}"><span class="av sm" aria-hidden="true">${K.initials(p.nom)}</span><span class="row-main"><b>${esc(p.nom)}${p.k === ME ? " (toi)" : ""}</b><span>${esc(rights(p))}</span></span>${I.chevR}</button>`).join("")}</div>
      <p class="sec-f">Pour ajouter quelqu'un : crée son compte dans Supabase (Authentication, Add user, avec Auto Confirm), puis règle-le ici.</p></div>`;
  }
  function personSheet(id) {
    const p = person(id), self = id === ME;
    const sw = (k, label, sub, on, off) => `<label class="row" for="pp-${k}"><span class="row-main"><b>${label}</b><span>${sub}</span></span><input type="checkbox" class="switch" id="pp-${k}"${on ? " checked" : ""}${off ? " disabled" : ""}></label>`;
    K.sheet.open({ title: p.nom, ok: "Enregistrer", full: true, body: `<label class="lbl" for="pp-nom">Prénom</label><input class="in" id="pp-nom" value="${esc(p.nom)}">
      <label class="lbl" for="pp-fn">Fonction <span class="opt">facultatif</span></label><input class="in" id="pp-fn" value="${esc(p.fonction)}" placeholder="Ex. Responsable de l'offre">
      <span class="lbl" id="pp-svc-l">Service</span><div class="chips" data-chips id="pp-svc" role="group" aria-labelledby="pp-svc-l">${[{ k: "", court: "Aucun" }, ...SERVICES].map((s) => chip(s.court, p.ownSvc === s.k, s.k)).join("")}</div>
      <div class="group" style="margin-top:16px">${sw("chef", "Chef de projet", "Modifie tout, anime la réunion", p.chef, self)}${sw("media", "Partenariats média", isMedia() ? "Saisit les partenariats payants" : `Saisit les partenariats payants. Seul ${mediaNames()} peut changer ce droit.`, p.media, !isMedia())}${sw("offre", "Resp. offre", "Reçoit les demandes d'éléments faites à la responsable de l'offre", p.offre)}${sw("all", "Prévenu de chaque ajout", "Une notification à chaque nouveauté", p.notifAll)}${self ? "" : sw("visit", "Visiteur", p.media && !isMedia() ? `Voit tout, ne modifie rien. Seul ${mediaNames()} peut retirer ses droits de partenariats.` : "Voit tout, ne modifie rien", p.visiteur, p.media && !isMedia())}</div>
      ${self ? `<p class="sec-f">Un autre chef de projet peut changer tes droits de chef.</p>` : ""}`,
      onOk: async (s) => {
        const v = { nom: s.querySelector("#pp-nom").value.trim() || p.nom, fonction: s.querySelector("#pp-fn").value.trim(), ownSvc: pressed("#pp-svc", s)[0] || "",
          chef: s.querySelector("#pp-chef").checked, media: s.querySelector("#pp-media").checked, notifAll: s.querySelector("#pp-all").checked, offre: s.querySelector("#pp-offre").checked, visiteur: !!s.querySelector("#pp-visit")?.checked };
        // la base retire au visiteur tout service et tout droit : on fait pareil ici
        if (v.visiteur) Object.assign(v, { ownSvc: "", chef: false, media: false, notifAll: false, offre: false });
        try { await Store.setProfile(id, v); } catch (e) { fail(e); return false; }
        Object.assign(p, v, { svc: v.chef ? "chef" : v.ownSvc });
        K.refresh(); K.snack(`${esc(v.nom)} : c'est enregistré.`); sync();
      } });
  }

  // ---------- notifications push sur cet appareil ----------
  const Push = (() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const home = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    let on = false;
    const key = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
    const current = async () => { const r = ok && (await navigator.serviceWorker.getRegistration()); return r ? r.pushManager.getSubscription() : null; };
    current().then((sub) => { on = !!sub && Notification.permission === "granted"; }).catch(() => {});
    return {
      state() {
        if (!ok) return { can: false, on: false, hint: ios && !home ? "Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil (Partager, puis Sur l'écran d'accueil) et ouvre-la depuis son icône." : "Ce navigateur ne reçoit pas les notifications." };
        if (!CFG.vapidPublicKey) return { can: false, on: false, hint: "Les notifications ne sont pas encore branchées sur le serveur." };
        if (Notification.permission === "denied") return { can: false, on: false, hint: "Les notifications sont bloquées pour ce site dans les réglages du navigateur." };
        return { can: true, on, hint: "Rappels J-30, J-15 et J-7, demandes d'éléments, et ce qui concerne ton service." };
      },
      async enable() {
        if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications refusées");
        const r = await navigator.serviceWorker.ready;
        const sub = (await r.pushManager.getSubscription()) || (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(CFG.vapidPublicKey) }));
        await Store.savePush(sub.toJSON()); on = true;
      },
      async disable() {
        const sub = await current();
        if (sub) { await Store.removePush(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
        on = false;
      },
    };
  })();

  // =====================================================================
  // Écran réunion (ordinateur)
  // =====================================================================
  const meeting = (() => { app.insertAdjacentHTML("beforeend", `<div class="meeting" id="meeting" hidden role="dialog" aria-modal="true" aria-label="Écran réunion"></div>`); return document.getElementById("meeting"); })();
  // La réunion répond à une question : chaque temps fort a-t-il ses relais ? Un temps fort par ligne, un service par colonne,
  // les trous (service prévenu, rien de prévu) ressortent. Le reste de la production vient ensuite, replié.
  const laneOf = (it) => (isSujet(it) ? "Sujets" : isCls(it) ? "Classements" : isTF(it) ? "Temps forts" : isPay(it) ? "Partenariats" : svcOf(it.svc).court);
  const MT = { contrib: false, free: {} };
  function renderMeeting() {
    const P = PERIODS[CUR], N = PERIODS[CUR + 1], cm = TODAY.slice(0, 7);
    // période en cours : à partir du mois en cours ; les fiches sont rangées par période, pas par mois
    const groups = [{ P, i: CUR, now: true }, ...(N ? [{ P: N, i: CUR + 1, now: false }] : [])];
    const COLS = [...SERVICES.map((s) => ({ k: s.k, nom: s.court, f: (a) => !isPay(a) && a.svc === s.k })), { k: "chef", nom: "Chef", f: isChefAct }, { k: "pay", nom: "Partenariats", f: isPay }];
    const alive = (it) => it.st !== "retire";
    const dayOf = (it) => (isSujet(it) ? I.bookmark : precise(it) ? String(D(it.date).getDate()) : `<small>${esc(monShort(it.date))}</small>`);
    const stTxt = (it) => (it.st === "diffuse" ? "" : stWord(it));
    const relay = (a, tf) => {
      const label = isPay(a) ? `${partnerName(a)} · ${a.t}` : a.t;
      const done = a.st === "diffuse";
      return `<button type="button" class="rl${done ? " fait" : ""}${a.st === "confirmer" || a.st === "idee" ? " soft" : ""}" data-mt-open="${a.id}" aria-label="${esc([fmtDay(a.date), laneOf(a), a.t, stTxt(a), done ? "fait" : ""].filter(Boolean).join(". "))}">
        <span class="rl-d">${dayOf(a)}</span><span class="rl-t">${esc(label)}${stTxt(a) ? `<i> · ${esc(stTxt(a))}</i>` : ""}</span>${done ? `<span class="ml-ok">${I.check}</span>` : ""}</button>`;
    };
    const section = (g) => {
      const inMonths = (it) => periodOf(it.date) === g.i && (!g.now || it.date.slice(0, 7) >= cm);
      // un temps fort sur plusieurs jours encore en cours compte dans la période en cours, même commencé avant
      const running = (it) => g.now && multi(it) && it.fin >= TODAY && it.date < TODAY && periodOf(it.date) <= g.i;
      // les sujets de la période d'abord, puis les temps forts datés
      const tfs = [...DB.items.filter((it) => isSujet(it) && alive(it) && it.per.includes(g.i)), ...DB.items.filter((it) => isTF(it) && !isSujet(it) && alive(it) && (inMonths(it) || running(it))).sort(sortDate)];
      const ids = new Set(tfs.map((t) => t.id));
      // couverture des messages sur toute la période, comme dans Ma période
      const acts = DB.items.filter((it) => !isTF(it) && !isPay(it) && alive(it) && periodOf(it.date) === g.i);
      const cov = MESSAGES.map((m) => ({ m, n: acts.filter((it) => it.m.includes(m.n)).length }));
      const rowsH = tfs.map((tf) => {
        const past = isPast(tf), linked = DB.items.filter((a) => a.tf === tf.id && alive(a));
        const when = isSujet(tf) ? "Toute la période" : multi(tf) ? cap(fmtRange(tf.date, tf.fin)) : precise(tf) ? cap(D(tf.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })) : cap(tf.flou);
        const cells = COLS.map((c) => {
          const l = linked.filter(c.f).sort(sortDate);
          if (l.length) return `<div class="mx-c">${l.map((a) => relay(a, tf)).join("")}</div>`;
          return `<div class="mx-c"></div>`;
        }).join("");
        return `<div class="mx-row${past ? " past" : ""}"><button type="button" class="mx-tf${tf.st === "confirmer" ? " soft" : ""}${isSujet(tf) ? " suj" : isCls(tf) ? " cls" : ""}" data-mt-open="${tf.id}">
            <span class="mx-d">${dayOf(tf)}</span><span><b>${esc(tf.t)}</b><span>${esc([precise(tf) || isSujet(tf) ? when : norm(tf.flou) !== norm(monShort(tf.date)) ? tf.flou : "", stAfter(tf, tf.flou), past ? "passé" : ""].filter(Boolean).join(" · "))}</span></span>${past ? `<span class="ml-ok">${I.check}</span>` : ""}</button>${cells}</div>`;
      }).join("");
      // production hors temps fort : le nombre d'abord, le détail à la demande
      const free = COLS.map((c) => DB.items.filter((a) => !isTF(a) && alive(a) && inMonths(a) && c.f(a) && !ids.has(a.tf)).sort(sortDate));
      const nFree = free.reduce((s, l) => s + l.length, 0), open = MT.free[g.i];
      const freeRow = nFree ? `<div class="mx-row mx-free"><button type="button" class="mx-tf" data-mt="free" data-k="${g.i}" aria-expanded="${!!open}">
          <span class="mx-d"><span class="down${open ? " up" : ""}" aria-hidden="true">${I.chevL}</span></span><span><b>Hors temps fort</b><span>${nFree} ${nFree > 1 ? "actions" : "action"} · ${open ? "masquer le détail" : "voir le détail"}</span></span></button>
          ${free.map((l) => `<div class="mx-c">${open ? l.map((a) => relay(a, { t: "" })).join("") : l.length ? `<span class="mx-n">${l.length} ${l.length > 1 ? "actions" : "action"}</span>` : ""}</div>`).join("")}</div>` : "";
      return `<section class="mp${g.now ? " now" : ""}" aria-label="${esc(g.P.nom)}">
        <header class="mp-h"><h2>${esc(perName(g.P))}</h2><span class="mp-tag${perState(g.P) === "encours" ? " on" : ""}">${perState(g.P) === "encours" ? `En cours, ${restTxt(g.P)}` : perState(g.P) === "avenir" ? `Dès le ${fmtDay(g.P.du)}` : "Terminée"}</span></header>
        <div class="mp-cov" aria-label="Actions par message sur la période">${cov.map((c) => `<span class="${c.n ? "" : "zero"}">${esc(c.m.nom)} <b>${c.n}</b></span>`).join("")}</div>
        <div class="mx" role="table" style="--nc:${COLS.length}">
          <div class="mx-row mx-head"><span>Temps forts, sujets, classements</span>${COLS.map((c) => `<span>${esc(c.nom)}</span>`).join("")}</div>
          ${rowsH}${freeRow}
        </div>${rowsH || freeRow ? "" : `<p class="ma-empty">${perState(g.P) === "fini" ? "La dernière période de l'année est terminée : les périodes de l'année suivante s'ajoutent dans la base." : "Rien de prévu pour l'instant."}</p>`}</section>`;
    };

    const bl = DB.blocks.filter((b) => !b.leve && byId(b.item));
    const late = DB.reqs.filter((r) => r.st === "ouverte" && r.pour < TODAY && byId(r.item));
    const row = (it, sub, k) => `<button type="button" class="ma-item ${k}" data-mt-open="${it.id}"><b>${esc(it.t)}</b><span>${esc(sub)}</span></button>`;
    const since = (x) => Date.parse(x.ts) > Date.parse(DB.lastMeetingTs);
    const contrib = [
      ...DB.items.filter((it) => isTF(it) && since(it)).map((it) => ({ at: it.at, ts: it.ts, it, sub: `${person(it.by).nom} · nouveau ${momWord(it)}` })),
      ...DB.reqs.filter((r) => since(r) && r.st !== "annulee" && byId(r.item)).map((r) => ({ at: r.at, ts: r.ts, it: byId(r.item), k: dlCls(r).trim(),
        sub: `${person(r.from).nom} demande ${ASK[r.type] || "des éléments"} à ${svcOf(r.to).qui}${r.st === "recue" ? " (reçu)" : `, deadline ${fmtDay(r.pour)}`}` })),
    ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    const shownC = MT.contrib ? contrib : contrib.slice(0, 3);
    const aside = `<aside class="mt-aside panel lg" aria-label="À traiter en réunion">
      <section class="ma-sec"><h2>À débloquer <span class="tnum">${bl.length + late.length}</span></h2>
        ${bl.map((b) => row(byId(b.item), `${b.why} ${person(b.by).nom}, ${laneOf(byId(b.item))}.`, "bloq")).join("")}
        ${late.map((r) => row(byId(r.item), `${person(r.from).nom} attend ${ASK[r.type] || "des éléments"} de ${svcOf(r.to).qui} : deadline dépassée (${fmtDay(r.pour)}).`, "late")).join("")}
        ${bl.length + late.length ? "" : `<p class="ma-empty">Rien ne bloque.</p>`}</section>
      <section class="ma-sec"><h2>Contributions <span class="tnum">${contrib.length}</span></h2><p class="ma-since">Depuis la réunion du ${fmtDay(DB.lastMeeting)}</p>
        ${shownC.map((c) => row(c.it, `${c.sub}, ${ago(c.at)}`, `ctb ${c.k || ""}`)).join("") || `<p class="ma-empty">Rien de nouveau.</p>`}
        ${contrib.length > 3 ? `<button type="button" class="ma-more" data-mt="more" data-k="contrib">${MT.contrib ? "Voir moins" : seeMore(contrib.length - 3, "autres")}</button>` : ""}</section>
    </aside>`;

    meeting.innerHTML = `<div class="mt-small"><p>L'écran réunion est prévu pour un ordinateur. Agrandis la fenêtre ou ouvre l'appli sur ton ordinateur.</p><button type="button" class="btn small" data-mt="close">Fermer</button></div>
      <header class="mt-head"><img class="logo-l" src="assets/kedge-logo-anthracite.png" alt="KEDGE Business School" height="30"><img class="logo-d" src="assets/kedge-logo-blanc.png" alt="" height="30">
        <div class="mt-title"><h1>Réunion de quinzaine</h1><p>${esc(premier(cap(K.fr.day(T0))))} · <em>${esc(perName(P))}</em>${N ? ` puis <em>${esc(perName(N))}</em>` : ""}</p></div>
        <button type="button" class="btn small tonal" data-mt="held">Réunion tenue</button><button type="button" class="btn small" data-mt="close">Quitter</button></header>
      <div class="mt-body"><div class="mt-main">${groups.map(section).join("")}</div>${aside}</div>`;
  }
  const openMeeting = () => { renderMeeting(); meeting.hidden = false; meeting.querySelector(".mt-head [data-mt='close']")?.focus(); };
  const closeMeeting = () => { meeting.hidden = true; };
  meeting.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mt],[data-mt-open]"); if (!b) return;
    if (b.dataset.mt === "close") closeMeeting();
    if (b.dataset.mt === "held") { const ts = new Date().toISOString(); Object.assign(DB, { lastMeeting: TODAY, lastMeetingTs: ts }); renderMeeting(); K.snack("Les contributions repartent de zéro."); Store.setMeta("last_meeting", ts).catch(fail); }
    if (b.dataset.mt === "more") { MT[b.dataset.k] = !MT[b.dataset.k]; renderMeeting(); }
    if (b.dataset.mt === "free") { const sc = meeting.querySelector(".mt-main").scrollTop; MT.free[b.dataset.k] = !MT.free[b.dataset.k]; renderMeeting(); meeting.querySelector(".mt-main").scrollTop = sc; }
    if (b.dataset.mtOpen) { closeMeeting(); openItem(b.dataset.mtOpen); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !meeting.hidden) { e.stopImmediatePropagation(); closeMeeting(); } }, true);

  // =====================================================================
  // Écran copil PGE : l'année en cinq cartes, ce qui est diffusé, ce qui ne l'est pas encore, ce qui arrive
  // =====================================================================
  const copil = (() => { app.insertAdjacentHTML("beforeend", `<div class="copil" id="copil" hidden role="dialog" aria-modal="true" aria-label="Copil PGE"></div>`); return document.getElementById("copil"); })();
  const CP = { sel: CUR };
  // la diffusion d'une période : actions et partenariats ; temps forts et sujets sont des moments, montrés à part
  function bilan(i) {
    const alive = (it) => it.st !== "retire";
    const l = DB.items.filter((it) => !isTF(it) && alive(it) && periodOf(it.date) === i).sort(sortDate);
    return {
      l, done: l.filter((it) => it.st === "diffuse"), late: l.filter((it) => it.st !== "diffuse" && isPast(it)), next: l.filter((it) => it.st !== "diffuse" && !isPast(it)),
      tfs: [...DB.items.filter((it) => isSujet(it) && alive(it) && it.per.includes(i)), ...DB.items.filter((it) => isTF(it) && !isSujet(it) && alive(it) && periodOf(it.date) === i).sort(sortDate)],
    };
  }
  const plur = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  function renderCopil() {
    // état d'une carte : « fini », « avenir », « encours » (pas « done », déjà pris par la coche ronde des listes)
    const stateOf = (P) => ({ fini: "fini", avenir: "next", encours: "now" })[perState(P)];
    // une année scolaire à la fois, celle de la période choisie
    const yr = yearOf(PERIODS[CP.sel]), shownP = PERIODS.map((P, i) => ({ P, i })).filter((x) => yearOf(x.P) === yr);
    const card = ({ P, i }) => {
      const b = bilan(i), st = stateOf(P), n = b.l.length, w = (x) => ((x.length / n) * 100).toFixed(2);
      const tag = st === "fini" ? "Terminée" : st === "now" ? `En cours, ${restTxt(P)}` : `Dès le ${fmtDay(P.du)}`;
      const big = !n ? `<span class="cp-big none">Rien de prévu</span>`
        : st === "next" && !b.done.length ? `<span class="cp-big"><b>${n}</b> ${n > 1 ? "prévues" : "prévue"}</span>`
        : `<span class="cp-big"><b>${b.done.length}</b><small>/${n}</small> ${b.done.length > 1 ? "diffusées" : "diffusée"}</span>`;
      const leg = [["d", b.done, "diffusée", "diffusées"], ["l", b.late, "pas encore diffusée", "pas encore diffusées"], ["n", b.next, "à venir", "à venir"]].filter(([, x]) => x.length);
      const nTF = b.tfs.filter(isTfDay).length, nS = b.tfs.filter(isSujet).length, nC = b.tfs.filter(isCls).length;
      return `<button type="button" class="cp-card ${st}${CP.sel === i ? " sel" : ""}" data-cp="per" data-i="${i}" aria-pressed="${CP.sel === i}">
        <span class="cp-tag">${esc(tag)}</span><h2>${esc(perName(P))}</h2><span class="cp-dates">${esc(P.lib)}</span>${big}
        ${n ? `<span class="cp-bar" aria-hidden="true"><i class="d" style="width:${w(b.done)}%"></i><i class="l" style="width:${w(b.late)}%"></i><i class="n" style="width:${w(b.next)}%"></i></span>` : ""}
        ${leg.length ? `<span class="cp-leg">${leg.map(([k, x, one, many]) => `<span class="${k}">${plur(x.length, one, many)}</span>`).join("")}</span>` : ""}
        ${nTF + nS + nC ? `<span class="cp-tfn">${esc([nTF ? plur(nTF, "temps fort", "temps forts") : "", nS ? plur(nS, "sujet", "sujets") : "", nC ? plur(nC, "classement", "classements") : ""].filter(Boolean).join(" · "))}</span>` : ""}</button>`;
    };
    const P = PERIODS[CP.sel], b = bilan(CP.sel);
    const dcol = (it) => (precise(it) ? `<b>${D(it.date).getDate()}</b><span>${esc(monShort(it.date))}</span>` : `<b class="m">${esc(monShort(it.date))}</b>`);
    const row = (it, k) => `<button type="button" class="cp-row" data-cp-open="${it.id}"><span class="cp-d">${dcol(it)}</span>
      <span class="cp-t"><b>${esc(it.t)}</b><span>${isPay(it) ? payBadge : ""}${esc([svcLabel(it), k === "d" ? "" : stWord(it)].filter(Boolean).join(" · "))}</span></span></button>`;
    const col = (k, title, list, empty) => `<section class="cp-col ${k}" aria-label="${esc(title)}"><h3>${esc(title)} <b>${list.length}</b></h3>
      ${list.map((it) => row(it, k)).join("") || `<p class="cp-empty">${esc(empty)}</p>`}</section>`;
    const chip = (it) => `<button type="button" class="cp-tf${isSujet(it) ? " suj" : isCls(it) ? " cls" : ""}${isPast(it) ? " past" : ""}" data-cp-open="${it.id}">${isSujet(it) ? I.bookmark : `<span>${esc(precise(it) ? (multi(it) ? when(it) : fmtShort(it.date)) : it.flou)}</span>`}${isCls(it) ? I.podium : ""}${esc(it.t)}</button>`;
    // couverture des 5 messages sur la période, comme à l'écran réunion
    const acts = b.l.filter((it) => !isPay(it)), cov = MESSAGES.map((m) => ({ m, n: acts.filter((it) => it.m.includes(m.n)).length }));
    const all = shownP.map((x) => bilan(x.i)), nAll = all.reduce((s, x) => s + x.l.length, 0), nDone = all.reduce((s, x) => s + x.done.length, 0);
    copil.innerHTML = `<header class="mt-head"><img class="logo-l" src="assets/kedge-logo-anthracite.png" alt="KEDGE Business School" height="30"><img class="logo-d" src="assets/kedge-logo-blanc.png" alt="" height="30">
        <div class="mt-title"><h1>Copil PGE${PERIODS.some((x) => yearOf(x) !== yr) ? ` ${yr}-${yr + 1}` : ""}</h1><p>${esc(premier(cap(K.fr.day(T0))))}${nAll ? ` · <em>${nDone}</em> ${nDone > 1 ? "diffusées" : "diffusée"} sur ${plur(nAll, "action prévue", "actions prévues")} cette année` : ""}</p></div>
        <button type="button" class="btn small" data-cp="close">Quitter</button></header>
      <div class="cp-body">
        <div class="cp-cards" style="--np:${shownP.length}">${shownP.map(card).join("")}</div>
        <section class="cp-detail" aria-label="${esc(P.nom)}">
          <header class="cp-dh"><h2>${esc(perName(P))}</h2><span>${esc(P.lib)}</span></header>
          ${b.tfs.length ? `<div class="cp-tfs" aria-label="Temps forts et sujets">${b.tfs.map(chip).join("")}</div>` : ""}
          <div class="cp-cols">${col("d", "Diffusé", b.done, "Rien de diffusé pour l'instant.")}${col("l", "Pas encore diffusé", b.late, "Rien en attente.")}${col("n", "À venir", b.next, "Plus rien à venir.")}</div>
          ${acts.length ? `<div class="mp-cov" aria-label="Actions par message sur la période">${cov.map((c) => `<span class="${c.n ? "" : "zero"}">${esc(c.m.nom)} <b>${c.n}</b></span>`).join("")}</div>` : ""}
        </section>
      </div>`;
  }
  const openCopil = () => { CP.sel = CUR; renderCopil(); copil.hidden = false; copil.querySelector("[data-cp='close']")?.focus(); };
  const closeCopil = () => { copil.hidden = true; };
  const pickPer = (i) => { if (i < 0 || i >= PERIODS.length) return; CP.sel = i; renderCopil(); copil.querySelector(`.cp-card[data-i="${i}"]`)?.focus(); };
  copil.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp],[data-cp-open]"); if (!b) return;
    if (b.dataset.cp === "close") closeCopil();
    if (b.dataset.cp === "per") pickPer(+b.dataset.i);
    if (b.dataset.cpOpen) { closeCopil(); openItem(b.dataset.cpOpen); }
  });
  // une télécommande de présentation envoie les flèches ou page suivante : on passe d'une période à l'autre
  document.addEventListener("keydown", (e) => {
    if (copil.hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); closeCopil(); }
    else if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); pickPer(CP.sel + 1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); pickPer(CP.sel - 1); }
  }, true);

  function syncSide() {
    const f = document.getElementById("side-foot"); if (!f) return;
    const p = me();
    f.innerHTML = `${p.chef ? `<button type="button" class="side-btn" data-act="meeting">${I.people}<span>Mode réunion</span></button><button type="button" class="side-btn" data-act="copil">${I.board}<span>Copil PGE</span></button>` : ""}
      <button type="button" class="side-me" data-act="profil" aria-label="Profil de ${esc(p.nom)}"><span class="av sm" aria-hidden="true">${K.initials(p.nom)}</span><span><b>${esc(p.nom)}</b><small>${esc(fonctionOf(p))}</small></span></button>`;
  }
  const markSel = (id) => { app.querySelectorAll(".sel[data-open]").forEach((x) => x.classList.remove("sel")); app.querySelectorAll(`#v-${app.dataset.tab} [data-open="${id}"]`).forEach((x) => x.classList.add("sel")); };

  // =====================================================================
  // Démarrage et événements
  // =====================================================================
  K.tabs({
    periode: { label: "Ma période", icon: "home", render: renderPeriode },
    tf: { label: "Temps forts", icon: "flag", render: renderTF },
    media: { label: "Partenariats", icon: "megaphone", render: renderMedia },
    ajouter: { label: "Ajouter", icon: "plus", render: renderAjouter },
    grille: { label: "Calendrier", icon: "calendar", render: renderGrille },
    afaire: { label: "À faire", icon: "bell", render: renderAfaire },
  });

  // ordinateur et tablette : la barre d'onglets devient un menu latéral, la marque en haut, le profil et la réunion en bas
  const side = app.querySelector(".tabbar");
  side.setAttribute("aria-label", "Menu");
  side.insertAdjacentHTML("afterbegin", `<div class="side-head"><img class="logo-l" src="assets/kedge-logo-anthracite.png" alt="KEDGE Business School" height="28"><img class="logo-d" src="assets/kedge-logo-blanc.png" alt="" height="28"><span>Plan de com 2026-2027</span></div>`);
  side.insertAdjacentHTML("beforeend", `<div class="side-foot" id="side-foot"></div>`);
  syncSide();
  // la liste (ou le formulaire Ajouter) reste utilisable pendant qu'une fiche est ouverte dans le panneau,
  // même quand l'écran se redessine (temps réel) ; la ligne ouverte reste marquée
  K.setKeepBase(panel);
  new MutationObserver(() => {
    if (app.dataset.pushed !== "1") app.querySelectorAll(".sel[data-open]").forEach((x) => x.classList.remove("sel"));
  }).observe(app, { attributes: true, attributeFilter: ["data-pushed"] });
  [MQ_COLS, MQ_PANEL, MQ_DESK].forEach((m) => m.addEventListener("change", () => K.refresh()));

  app.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-open],[data-act],[data-msgf],[data-link],[data-setf]"); if (!t || !app.contains(t) || meeting.contains(t)) return;
    if (t.dataset.open) {
      if (panel() && !t.closest(".view.pushed")) { while (app.dataset.pushed === "1") K.pop(); markSel(t.dataset.open); }
      return openItem(t.dataset.open);
    }
    if (t.dataset.msgf) { S.msgF = S.msgF === t.dataset.msgf ? null : t.dataset.msgf; return K.refresh(); }
    if (t.dataset.link) return window.open(t.dataset.link, "_blank", "noopener");
    if (t.dataset.setf) { S.filter = t.dataset.setf; S.msgF = null; K.sheet.close(); return K.refresh(); }
    const a = t.dataset.act, id = t.dataset.id;
    if (a === "prev" || a === "next") changePeriod(a === "next" ? 1 : -1, t.closest(".view")?.querySelector(".swipe"));
    if (a === "now") changePeriod(CUR - S.period, t.closest(".view")?.querySelector(".swipe"));
    if (a === "clearf") { S.msgF = null; K.refresh(); }
    if (a === "pastp") { S.pastP = !S.pastP; K.refresh(); }
    if (a === "filter") filterSheet();
    if (a === "profil") toggleProfil();
    if (a === "goper") document.getElementById(`per-${t.dataset.k}-${t.dataset.i}`)?.scrollIntoView({ behavior: K.reduceMotion() ? "auto" : "smooth", block: "start" });
    if (a === "allnew") K.push(renderAllNew, { title: "Nouveautés" });
    if (a === "meeting") openMeeting();
    if (a === "copil") openCopil();
    if (a === "gpast") { S.gpast = !S.gpast; K.refresh(); }
    // un brouillon déjà commencé n'est pas effacé : on change seulement de type (et de fiche liée)
    if (a === "goadd") { S.draft = keptDraft() || newDraft(); K.showTab("ajouter"); }
    if (a === "addtf") { const k = keptDraft(); S.draft = k ? { ...k, kind: "tf" } : newDraft("tf"); K.showTab("ajouter"); }
    if (a === "addpartner") { const k = keptDraft(); S.draft = k ? { ...k, kind: "partner" } : newDraft("partner"); K.showTab("ajouter"); }
    if (a === "addlinked") { const tf = byId(id); S.draft = { ...(keptDraft() || newDraft()), kind: "action", tf: id, more: true }; K.showTab("ajouter"); K.snack(`Rattachée à « ${esc(tf.t)} ».`); }
    if (a === "edit") openEdit(id);
    if (a === "save") saveEdit(id, t);
    if (a === "past") { S.past[t.dataset.k] = !S.past[t.dataset.k]; K.refresh(); }
    if (a === "more") { S.open[t.dataset.k] = !S.open[t.dataset.k]; K.refresh(); }
    if (a === "publish") publish(t);
    if (a === "ask") askSheet(id, t.dataset.key);
    if (a === "nope") { DB.answers[t.dataset.key] = "non"; quick(Store.answer(t.dataset.key, "non"), "Noté, pas besoin d'éléments."); }
    if (a === "vu") { DB.vu[ME] = [...(DB.vu[ME] || []), id]; quick(Store.markSeen(id)); }
    if (a === "block") blockSheet(id);
    if (a === "unblock") { const b = DB.blocks.find((x) => x.id === t.dataset.b); if (b) { b.leve = true; quick(Store.liftBlock(b.id), "Blocage levé."); } }
    if (a === "addlink") linkSheet(id);
    if (a === "unlink") { const on = byId(id), l = on?.links.find((x) => x.id === t.dataset.l);
      if (l && (await K.alert({ title: `Retirer « ${l.nom} » ?`, text: "Le lien disparaît de la fiche. Le document reste sur SharePoint.", ok: "Retirer", danger: true }))) {
        on.links = on.links.filter((x) => x !== l);
        (DB.journal ||= []).push({ id: 0, item: on.id, by: ME, kind: "document", diff: { nom: l.nom, retire: true }, at: TODAY, ts: new Date().toISOString() });
        quick(Store.removeLink(l.id), "Document retiré.");
      } }
    if (a === "pour") pourSheet(t.dataset.r);
    if (a === "repondre") answerSheet(t.dataset.r);
    if (a === "unreq") withdrawReq(t.dataset.r);
    if (a === "retire") {
      const it = byId(id), tf = isTF(it), n = tf ? DB.items.filter((x) => x.tf === id && x.st !== "retire").length : 0;
      const what = tf ? `Le ${momWord(it)}` : "L'action";
      // ses demandes encore ouvertes partent avec elle (la base fait pareil), sauf un relais d'un temps fort actif : elles servent au temps fort
      const live = !tf && it.tf && byId(it.tf) && byId(it.tf).st !== "retire", open = live ? [] : DB.reqs.filter((q) => q.item === id && q.st === "ouverte");
      const text = `${what} reste ${tf ? "barré" : "barrée"} dans l'historique${tf ? "" : " et ne sera pas diffusée"}. ${n ? `${n > 1 ? `Ses ${n} relais restent` : "Son relais reste"} en place. ` : ""}${open.length ? `${open.length > 1 ? `Ses ${open.length} demandes d'éléments en cours sont retirées` : "Sa demande d'éléments en cours est retirée"}. ` : ""}Les services concernés sont prévenus.`;
      if (await K.alert({ title: `Retirer « ${it.t} » ?`, text, ok: "Retirer", danger: true })) {
        // noté tout de suite dans l'historique local : « Remettre » retrouve le statut d'avant sans attendre la base
        (DB.journal ||= []).push({ id: 0, item: id, by: ME, kind: "modif", diff: { st: [it.st, "retire"] }, at: TODAY, ts: new Date().toISOString() });
        it.st = "retire"; open.forEach((q) => { q.st = "annulee"; }); quick(Store.setStatus(id, "retire"), tf ? "Retiré." : "Retirée.");
      }
    }
    if (a === "delete") {
      // pour de bon : la fiche, ses documents, ses demandes et son historique ; les relais d'un temps fort restent, sans temps fort
      // un relais d'un temps fort actif : ses demandes servent encore au temps fort, elles y passent (la base fait pareil)
      const it = byId(id), rel = isTF(it) ? DB.items.filter((x) => x.tf === id) : [], tfl = !isTF(it) && it.tf && byId(it.tf)?.st !== "retire" ? byId(it.tf) : null;
      const kept = tfl ? DB.reqs.filter((q) => q.item === id && q.st !== "annulee") : [];
      const text = `${isTF(it) ? `Le ${momWord(it)}` : "L'action"} disparaît de l'appli avec ${K.fr.list(["ses documents", ...(kept.length ? [] : ["ses demandes"]), "son historique"])}. ${rel.length ? `${rel.length > 1 ? `Ses ${rel.length} relais restent` : "Son relais reste"}, sans ${momWord(it)}, avec les documents reçus pour leurs demandes. ` : ""}${kept.length ? `${kept.length > 1 ? `Ses ${kept.length} demandes d'éléments restent` : "Sa demande d'éléments reste"} sur le ${momWord(tfl)} « ${esc(tfl.t)} ». ` : ""}Impossible de revenir en arrière.`;
      if (await K.alert({ title: `Supprimer « ${it.t} » ?`, text, ok: "Supprimer", danger: true })) {
        try { await Store.deleteItem(id); } catch (e) { return fail(e); }
        DB.items = DB.items.filter((x) => x.id !== id); rel.forEach((x) => { x.tf = ""; }); kept.forEach((q) => { q.item = tfl.id; });
        ["reqs", "blocks", "journal"].forEach((k) => { DB[k] = (DB[k] || []).filter((x) => x.item !== id); });
        if (K.topView()?.classList.contains("pushed")) K.pop();
        K.refresh(); K.snack("Supprimé."); sync();
      }
    }
    if (a === "unretire") {
      // le statut d'avant le retrait, d'après l'historique
      const it = byId(id), j = (DB.journal || []).filter((x) => x.item === id && x.diff?.st?.[1] === "retire").sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id)[0];
      it.st = j && ST[j.diff.st[0]] && j.diff.st[0] !== "retire" ? j.diff.st[0] : "planifie";
      quick(Store.setStatus(id, it.st), `Remis : ${ST[it.st]}.`);
    }
    if (a === "password") passwordSheet();
    if (a === "team") K.push(renderTeam, { title: "Équipe" });
    if (a === "person") personSheet(id);
    if (a === "logout") {
      if (!(await K.alert({ title: "Se déconnecter ?", text: "Cet appareil ne recevra plus tes notifications.", ok: "Se déconnecter" }))) return;
      await Push.disable().catch(() => {}); await Store.signOut().catch(() => {}); location.reload();
    }
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.st) { const it = byId(t.dataset.st); if (it) { it.st = t.value; quick(Store.setStatus(it.id, it.st), `Statut : ${ST[it.st]}.`); } }
    if (t.id === "pf-push") {
      const want = t.checked; t.disabled = true;
      (want ? Push.enable() : Push.disable())
        .then(() => K.snack(want ? "Notifications activées sur cet appareil." : "Notifications coupées sur cet appareil."))
        .catch((e) => K.snack(`Pas fait : ${esc(e.message === "Notifications refusées" ? "les notifications ont été refusées" : errText(e))}.`, 5000))
        .finally(() => K.refresh());
    }
    // « Date à préciser » : le choix du jour laisse la place au choix du mois
    if (t.dataset.prec) { const px = t.dataset.prec, pr = document.getElementById(`${px}-plusr`); document.getElementById(`${px}-jour`).hidden = t.checked; document.getElementById(`${px}-moisw`).hidden = !t.checked; if (pr) pr.hidden = t.checked; }
    // « Sur plusieurs jours » : un premier et un dernier jour
    // en l'activant, le dernier jour part du premier jour choisi (Du + 4), sauf un dernier jour déjà réglé après lui
    if (t.dataset.plus) { const px = t.dataset.plus, du = document.getElementById(`${px}-date`), fin = document.getElementById(`${px}-fin`);
      document.getElementById(`${px}-finw`).hidden = !t.checked; document.getElementById(`${px}-date-l`).textContent = t.checked ? "Du" : "Date";
      if (t.checked && fin && !fin.dataset.set) { fin.value = finFrom(du.value); fin.querySelector("span").textContent = fmtLong(fin.value); } }
  });
  app.addEventListener("kui:change", (e) => {
    const t = e.target;
    if (t.id === "f-kind") { const d = readForm(document.getElementById("v-ajouter"), "f", S.draft); S.draft = { ...d, kind: e.detail }; K.refresh(); }
    if (t.id === "pf-theme") K.setTheme(e.detail);
    // partenaire : choisir une pastille efface le nom tapé, et inversement
    if (t.id === "f-pt" || t.id === "e-pt") { const np = document.getElementById(t.id.replace("pt", "np")); if (np) np.value = ""; }
  });
  // « Incontournable » se choisit seul : il remplace les messages, et un message le remplace
  app.addEventListener("click", (e) => {
    const c = e.target.closest("#f-m .chip, #e-m .chip"); if (!c) return;
    setTimeout(() => { if (c.getAttribute("aria-pressed") !== "true") return;
      c.parentElement.querySelectorAll(".chip").forEach((x) => { if (x !== c && (c.value === "INC" || x.value === "INC")) x.setAttribute("aria-pressed", "false"); }); });
  });
  app.addEventListener("input", (e) => {
    const t = e.target;
    if ((t.id === "f-np" || t.id === "e-np") && t.value.trim()) document.querySelectorAll(`#${t.id.replace("np", "pt")} .chip`).forEach((c) => c.setAttribute("aria-pressed", "false"));
  });

  // =====================================================================
  // Temps réel : les changements des autres arrivent tout seuls
  // =====================================================================
  // on ne redessine pas sous les doigts de quelqu'un qui écrit : la donnée est à jour, l'écran suivra
  const busy = () => { const a = document.activeElement; return !!(app.querySelector(".sheet.show") || K.topView()?.querySelector("#f-t, #e-t") || (a && app.contains(a) && a.matches("input, textarea, select"))); };
  let pendingHash = null;
  // un nouveau jour (appli restée ouverte après minuit) : la date, la période en cours et les compteurs suivent
  // les périodes choisies sont retenues par leur numéro : une période ajoutée ou retirée ne fait pas changer d'écran
  const perKeys = () => ({ p: PERIODS[S.period]?.n, c: PERIODS[CP.sel]?.n, cur: PERIODS[CUR]?.n, g0: G0 });
  function newDay(k = perKeys()) {
    recalc();
    const at = (n) => PERIODS.findIndex((P) => P.n === n);
    S.period = k.p === k.cur || at(k.p) < 0 ? CUR : at(k.p);
    CP.sel = at(k.c) < 0 ? CUR : at(k.c);
  }
  // réunion et copil ouverts : redessinés en gardant le défilement
  function redrawOverlays() {
    if (!meeting.hidden) { const sc = meeting.querySelector(".mt-main")?.scrollTop || 0; renderMeeting(); meeting.querySelector(".mt-main").scrollTop = sc; }
    if (!copil.hidden) { const sc = copil.querySelector(".cp-body")?.scrollTop || 0; renderCopil(); copil.querySelector(".cp-body").scrollTop = sc; }
  }
  async function sync() {
    let fresh; try { fresh = await Store.load(); } catch (e) { return; }
    const k = perKeys();
    Object.assign(DB, fresh.db);
    [[PEOPLE, fresh.PEOPLE], [PARTNERS, fresh.PARTNERS], [SERVICES, fresh.SERVICES], [PERIODS, fresh.PERIODS], [MESSAGES, fresh.MESSAGES]].forEach(([a, b]) => a.splice(0, a.length, ...b));
    CHEF.qui = fresh.CHEF.qui;
    newDay(k);
    if (pendingHash) { const h = pendingHash; pendingHash = null; route(h, true); }
    redrawOverlays();
    if (busy()) syncBadge(); else K.refresh();
  }
  Store.watch(sync);
  setInterval(() => { if (iso(new Date()) !== TODAY) { newDay(); redrawOverlays(); if (!busy()) K.refresh(); } }, 60e3);

  // un lien de notification : #item=… ouvre la fiche, #afaire l'onglet À faire
  // une fiche toute neuve n'est peut-être pas encore chargée : on recharge une fois, puis on l'ouvre
  function route(hash, retried = false) {
    const m = /^#item=([\w-]+)/.exec(hash || "");
    if (m && !byId(m[1]) && !retried) { pendingHash = hash; sync(); return; }
    if (m && byId(m[1])) { if (!meeting.hidden) closeMeeting(); closeCopil(); openItem(m[1]); }
    else if (m) K.snack("Cette fiche a été supprimée.");
    else if (hash === "#afaire") { closeMeeting(); closeCopil(); K.showTab("afaire"); }
    else if (hash === "#copil" && me().chef) { closeMeeting(); openCopil(); }
  }
  const routeHash = () => { if (!location.hash) return; route(location.hash); history.replaceState(null, "", location.pathname + location.search); };
  routeHash();
  addEventListener("hashchange", routeHash);
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "open") route(new URL(e.data.url).hash); });

  if (greet) K.snack(`Bonjour ${esc(me().nom)}.${cols() ? "" : " Glisse l'écran pour changer de période."}`, cols() ? 2500 : 4200);
};
