/* Plan de com KEDGE · V2 — écran « Le plan » : la même chose en liste ou en grille, avec les mêmes filtres. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  KP.ui = KP.ui || { past: false, gx: null, gper: "" };

  const TYPES = [{ v: "tf", nom: "Temps forts" }, { v: "action", nom: "Actions" }, { v: "classement", nom: "Classements" }, { v: "partenariat", nom: "Partenariats payants" }];
  /* ce qui tombe avant la première période ou après la dernière va dans la période du bord : rien ne disparaît */
  const inPeriod = (it, p) => it.variant === "sujet" ? (it.pers ? it.pers.includes(p.k) : it.per === p.k)
    : ((it.date <= p.au || p === KP.PERIODS[KP.PERIODS.length - 1]) && ((it.flou ? it.date : it.fin || it.date) >= p.du || p === KP.PERIODS[0]))
      || (!KP.PERIODS.some((q) => it.date <= q.au && (it.flou ? it.date : it.fin || it.date) >= q.du) && KP.periodOf(it.date) === p); /* 2.8.2 : tombée entre deux périodes */
  /* un filtre inconnu dans l'adresse (vieux lien, service supprimé) est ignoré plutôt que de casser l'écran */
  const clean = (r) => ({ ...r, svc: r.svc && KP.service(r.svc) ? r.svc : "", msg: r.msg && KP.message(r.msg) ? r.msg : "", type: TYPES.some((t) => t.v === r.type) ? r.type : "" });
  const match = (it, r) =>
    (!r.svc || it.kind === "tf" || (it.svc === r.svc && it.variant !== "partenariat")) &&
    (!r.msg || it.m.includes(r.msg)) &&
    (!r.type || (r.type === "tf" ? it.kind === "tf" : r.type === "action" ? it.kind === "action" : it.variant === r.type));
  const order = (a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.t.localeCompare(b.t) : a.kind === "tf" ? -1 : 1);
  KP.planItems = (p, r) => store.items().filter((i) => i.variant !== "sujet" && inPeriod(i, p) && match(i, r)).sort(order);

  const chip = (k, label, val) => `<button type="button" class="chip${val ? " picked" : ""}" data-act="filter" data-k="${k}" aria-haspopup="menu">${h(val || label)}${ic("chevD")}</button>`;

  KP.views.plan = () => {
    const r = clean(KP.route), p = KP.PERIODS.find((x) => x.k === r.per), now = KP.periodOf(KP.TODAY).k;
    const items = KP.planItems(p, r);
    const sujets = store.items().filter((i) => i.variant === "sujet" && inPeriod(i, p) && (!r.msg || i.m.includes(r.msg)) && (!r.type || r.type === "tf"));
    const filtered = r.svc || r.msg || r.type;
    return `<div class="page">
      <div class="head"><h1>Le plan</h1><span class="sub">${h(p.nom)}, ${h(p.lib)} ${KP.parse(p.du).getFullYear()}</span></div>
      <div class="bar">
        <div class="seg pers" role="group" aria-label="Période">${KP.PERIODS.map((x) => `<button type="button" data-act="per" data-k="${x.k}" class="${x.k === p.k ? "on" : ""}" aria-pressed="${x.k === p.k}">${h(x.nom)}${x.k === now ? '<i class="now" title="Période en cours"></i>' : ""}</button>`).join("")}</div>
        <span class="sp"></span>
        <div class="tools">${chip("svc", "Service", r.svc && KP.service(r.svc).nom)}${chip("msg", "Message", r.msg && KP.message(r.msg).nom)}${chip("type", "Type", r.type && TYPES.find((t) => t.v === r.type).nom)}
        ${filtered ? `<button type="button" class="ib" data-act="clear-filters" data-tip="Retirer les filtres" aria-label="Retirer les filtres">${ic("close")}</button>` : ""}
        <div class="seg icons" role="group" aria-label="Affichage">
          <button type="button" data-act="vue" data-k="liste" class="${r.vue === "liste" ? "on" : ""}" aria-pressed="${r.vue === "liste"}" data-tip="Liste" aria-label="Liste">${ic("list")}</button>
          <button type="button" data-act="vue" data-k="grille" class="${r.vue === "grille" ? "on" : ""}" aria-pressed="${r.vue === "grille"}" data-tip="Calendrier" aria-label="Calendrier">${ic("grid")}</button>
        </div>
        <button type="button" class="ib tip-l" data-act="print" data-tip="Imprimer" aria-label="Imprimer">${ic("print")}</button></div>
      </div>
      ${sujets.length ? `<div class="sujets"><span>Sur toute la période</span>${sujets.map((s) => `<button type="button" class="sujet" data-act="open" data-id="${s.id}"><i class="tfdot"></i>${h(s.t)}</button>`).join("")}</div>` : ""}
      ${!items.length ? empty(filtered) : r.vue === "grille" ? grille(p, items, r) : liste(p, items)}
    </div>`;
  };

  /* écran vide illustré : le 7 de l'icône, posé sur un bout de route */
  KP.illu = (cls = "") => `<div class="illu${cls ? " " + cls : ""}" aria-hidden="true"><span class="illu-route"></span><img src="${KP.marque && KP.marque.symbole || "assets/road-to-7th-symbole.png"}" alt=""></div>`;
  const empty = (filtered) => `<div class="empty">${KP.illu(filtered ? "filtre" : "")}<h3>${filtered ? "Rien. Tes filtres sont trop exigeants, même pour moi." : "Rien de prévu sur cette période"}</h3>
    <p>${filtered ? "Le plan de la période est plus large." : "Le plan se remplit au fil des réunions."}</p>
    ${filtered ? `<button type="button" class="btn quiet" data-act="clear-filters">Retirer les filtres</button>` : store.canCreate() ? `<button type="button" class="btn primary" data-act="new">${ic("plus")}Nouveau</button>` : ""}</div>`;

  /* Le plan d'une période, découpé en blocs : un par semaine, plus un bloc « courant du mois »
     pour ce dont on connaît le mois mais pas encore le jour, placé juste avant la première semaine du mois. */
  function blocs(p, items, allWeeks) {
    const T = KP.TODAY, thisWk = KP.monday(T), out = [];
    /* un temps fort de plusieurs jours commencé la semaine dernière et pas fini : il est de cette semaine */
    const wkOf = (it) => { const d = it.date < p.du ? p.du : it.date; return !it.flou && it.fin && it.fin >= T && KP.monday(d) < thisWk && thisWk <= p.au ? thisWk : KP.monday(d); };
    const keys = new Set(items.filter((i) => !i.flou).map(wkOf));
    if (allWeeks) for (let k = KP.monday(p.du); k <= p.au; k = KP.addDays(k, 7)) keys.add(k);
    [...keys].sort().forEach((k) => { const a = KP.parse(k), e = KP.addDays(k, 6), b = KP.parse(e);
      out.push({ k, ord: k + "b", now: k === thisWk, past: e < T, date: k === thisWk ? T : k < p.du ? p.du : k,
        label: k === thisWk ? "Cette semaine" : k === KP.addDays(thisWk, 7) ? "Semaine prochaine" : `Semaine du ${KP.fmt.moyen(k)}`,
        range: `${a.getDate()}${a.getMonth() !== b.getMonth() ? " " + KP.fmt.moisC(k) : ""} – ${KP.fmt.moyen(e)}`,
        items: items.filter((i) => !i.flou && wkOf(i) === k) }); });
    [...new Set(items.filter((i) => i.flou).map((i) => i.date))].forEach((m) => out.push({ k: "m" + m, ord: KP.monday(m) + "a", tbc: true, past: KP.monthEnd(m) < T, date: m,
      label: `Courant ${KP.fmt.mois(m)}`, range: "date à préciser", items: items.filter((i) => i.flou && i.date === m) }));
    return out.sort((x, y) => x.ord.localeCompare(y.ord));
  }
  /* cette semaine : un trait jaune « aujourd'hui » entre ce qui est passé et ce qui vient */
  const nowRows = (its) => { const i = its.findIndex((it) => it.date >= KP.TODAY), /* 2.8.2 : un temps fort commencé et en cours reste au-dessus du trait */ at = i < 0 ? its.length : i, line = `<div class="today-line" aria-hidden="true"><span>Aujourd'hui</span></div>`;
    /* tout est passé : le trait tombe sous la dernière ligne, avec la place pour son badge */
    return its.slice(0, at).map((it) => KP.row(it)).join("") + (at > 0 ? (at === its.length ? line.replace('class="today-line"', 'class="today-line fin"') : line) : "") + its.slice(at).map((it) => KP.row(it)).join(""); };
  /* une semaine dont toutes les actions sont diffusées prend une coche ; elle s'anime si elle vient de se compléter */
  const toutDiffuse = (its) => { const a = its.filter((it) => !it.annule && it.kind === "action"); return a.length > 0 && a.every((it) => it.st === "diffuse"); };
  const cntWk = (b) => toutDiffuse(b.items) ? `<span class="cnt tout${b.items.some((it) => KP.vientDetre(it.id)) ? " vient" : ""}" title="Tout est diffusé">${ic("check")}${b.items.length}</span>` : `<span class="cnt">${b.items.length}</span>`;
  const foldBtn = (past, fold) => { const n = past.reduce((s, b) => s + b.items.length, 0), w = past.filter((b) => !b.tbc && b.items.length).length; /* la grille montre aussi les semaines vides : on ne compte que celles qui ont des lignes, comme la liste */
    return `<button type="button" class="fold" data-act="past" aria-expanded="${!fold}">${ic(fold ? "chevR" : "chevD")}${w} semaine${w > 1 ? "s" : ""} passée${w > 1 ? "s" : ""}, ${n} ligne${n > 1 ? "s" : ""}</button>`; };

  function liste(p, items) {
    const all = blocs(p, items), past = all.filter((b) => b.past), rest = all.filter((b) => !b.past);
    const fold = past.length && rest.length && !KP.ui.past;
    const bloc = (b) => `<section class="wk${b.now ? " now" : ""}"><div class="wk-h"><b>${h(b.label)}</b><small>${h(b.range)}</small>${cntWk(b)}</div><div class="colh" aria-hidden="true"><span>Date</span><span>Action</span><span>Service</span><span>Message</span><span>État</span></div><div class="rows">${b.now ? nowRows(b.items) : b.items.map((it) => KP.row(it)).join("")}</div></section>`;
    return (past.length && rest.length ? foldBtn(past, fold) : "") + (fold ? "" : past.map(bloc).join("")) + rest.map(bloc).join("");
  }

  function grille(p, items, r) {
    const all = blocs(p, items, true), past = all.filter((b) => b.past), rest = all.filter((b) => !b.past);
    const fold = past.length && rest.length && !KP.ui.past;
    const u = KP.me();
    const lanes = [{ k: "", nom: "Temps forts", sub: "" }, ...KP.SERVICES.filter((s) => !r.svc || s.k === r.svc).map((s) => ({ k: s.k, nom: s.nom, sub: KP.PEOPLE.filter((x) => x.svc === s.k).map((x) => x.nom).join(", ") }))];
    if (items.some((it) => it.variant === "partenariat")) lanes.push({ k: "pay", nom: "Partenariats payants", sub: "" });
    const cell = (b, lane) => {
      const its = b.items.filter((it) => lane.k === "pay" ? it.variant === "partenariat" : lane.k ? it.kind === "action" && it.svc === lane.k && it.variant !== "partenariat" : it.kind === "tf");
      const can = lane.k !== "pay" && !b.tbc && store.canCreate() && (u.role === "pilote" || !lane.k || lane.k === u.svc);
      return `<div class="g-c${b.now ? " g-row-now" : b.tbc ? " g-row-tbc" : ""}">${its.map((it) => `<button type="button" class="g-i ${it.kind === "tf" ? "tf " : ""}${it.annule ? "off " : ""}${it.st}${r.fiche === it.id ? " sel" : ""}" data-act="open" data-id="${it.id}">${it.flou ? "" : `<b>${h(KP.fmt.court(it.date))}${it.fin && it.fin !== it.date ? " → " + KP.parse(it.fin).getDate() : ""}</b>`}${h(it.t)}</button>`).join("")}
        ${can ? `<button type="button" class="g-add" data-act="new" data-date="${b.date}" ${lane.k ? `data-svc="${lane.k}"` : 'data-kind="tf"'} aria-label="Ajouter : ${h(lane.nom)}, ${h(b.label.toLowerCase())}">${ic("plus")}</button>` : ""}</div>`;
    };
    const row = (b) => `<div class="g-s${b.now ? " g-row-now" : b.tbc ? " g-row-tbc" : ""}">${b.now ? '<span class="nowtag">Cette semaine</span>' : ""}<b>${h(b.tbc ? b.label : b.range)}</b>${b.tbc ? h(b.range) : ""}</div>` + lanes.map((l) => cell(b, l)).join("");
    return (past.length && rest.length ? foldBtn(past, fold) : "") + `<div class="grille-wrap"><div class="grille" style="grid-template-columns:128px repeat(${lanes.length}, minmax(0, 1fr))">
      <div class="g-h"></div>${lanes.map((l, i) => { const av = l.k && l.k !== "pay" ? KP.avatarsSvc(l.k) : ""; return `<div class="g-h${i === lanes.length - 1 ? " last" : ""}${av ? " a-av" : ""}">${av ? `<span class="g-av">${av}</span>` : ""}<span class="g-hn">${h(l.nom)}${l.sub ? `<small>${h(l.sub)}</small>` : ""}</span></div>`; }).join("")}
      ${(fold ? rest : all).map(row).join("")}
    </div></div>`;
  }

  Object.assign(KP.acts, {
    per: (a) => { KP.ui.past = false; KP.go({ per: a.dataset.k, fiche: "" }); document.getElementById("main").scrollTop = 0; },
    vue: (a) => KP.go({ vue: a.dataset.k }),
    past: () => { KP.ui.past = !KP.ui.past; KP.render(); },
    "clear-filters": () => KP.go({ svc: "", msg: "", type: "" }),
    filter: (a) => {
      const k = a.dataset.k;
      const opts = k === "svc" ? KP.SERVICES.map((s) => ({ v: s.k, nom: s.nom })) : k === "msg" ? KP.MESSAGES.map((m) => ({ v: m.k, nom: m.nom, info: m.info })) : TYPES;
      KP.menu(a, [{ v: "", nom: k === "svc" ? "Tous les services" : k === "msg" ? "Tous les messages" : "Tout" }, "-", ...opts], (v) => KP.go({ [k]: v }), { selected: [KP.route[k]] });
    },
  });
})();
