/* Plan de com KEDGE · V2 — la réunion : l'ordre du jour d'un côté, le bilan par message de l'autre. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;

  KP.views.reunion = () => {
    const r = KP.route, pilote = KP.me().role === "pilote";
    return `<div class="page">
      <div class="head"><h1>Réunion</h1><span class="sub">Dernière réunion ${h(KP.fmt.relatif(store.lastMeeting()))}</span></div>
      <div class="bar">
        <div class="seg" role="group" aria-label="Vue"><button type="button" data-act="tab" data-k="ordre" class="${r.tab === "ordre" ? "on" : ""}" aria-pressed="${r.tab === "ordre"}">Ordre du jour</button><button type="button" data-act="tab" data-k="bilan" class="${r.tab === "bilan" ? "on" : ""}" aria-pressed="${r.tab === "bilan"}">Bilan</button></div>
        ${r.tab === "bilan" ? `<div class="seg" role="group" aria-label="Période">${KP.PERIODS.map((x) => `<button type="button" data-act="bper" data-k="${x.k}" class="${x.k === r.per ? "on" : ""}" aria-pressed="${x.k === r.per}">${h(x.nom)}</button>`).join("")}</div>` : ""}
        <span class="sp"></span>
        ${r.tab === "ordre" && pilote ? `<button type="button" class="btn quiet small" data-act="close-meeting">${ic("check")}Clore la réunion</button>` : ""}
        <button type="button" class="ib tip-l" data-act="print" data-tip="Imprimer" aria-label="Imprimer">${ic("print")}</button>
      </div>
      ${r.tab === "bilan" ? bilan(r) : ordre()}
    </div>`;
  };

  function ordre() {
    const T = KP.TODAY, last = KP.parse(store.lastMeeting()).getTime(), all = store.items(), items = all.filter((i) => !i.annule);
    const moved = all.filter((i) => (i.annule && i.annule.quand > last) || (!i.annule && i.report && i.report.quand > last)).sort((a, b) => a.date.localeCompare(b.date));
    const flagged = items.filter((i) => i.reunion).sort((a, b) => a.date.localeCompare(b.date));
    const lateReq = store.reqs().filter((q) => !q.fait && q.de !== q.a && q.pour < T && store.get(q.item));
    const conf = items.filter((i) => i.st === "confirmer" && !i.flou && i.date >= T && KP.diff(i.date, T) <= 15 && !i.reunion).sort((a, b) => a.date.localeCompare(b.date));
    const fresh = [...new Set(store.journal().filter((j) => j.quand > last && /^a créé/.test(j.txt)).map((j) => j.item))].map((id) => store.get(id)).filter((i) => i && !i.reunion && !conf.includes(i)).sort((a, b) => a.date.localeCompare(b.date));
    const vu = (it) => KP.me().role === "lecteur" ? "<span></span>" : `<button type="button" class="ib tip-l" data-act="vu" data-id="${it.id}" data-tip="Vu en réunion" aria-label="Vu en réunion">${ic("check")}</button>`;
    const sec = (t, sub, html) => html ? `<h2>${t}<small>${sub}</small></h2><div class="rows">${html}</div>` : "";
    const out =
      sec("À voir ensemble", `${flagged.length} point${flagged.length > 1 ? "s" : ""}`, flagged.map((it) => KP.row(it, { end: vu(it) })).join("")) +
      sec("Reportés ou annulés", `${moved.length}`, moved.map((it) => KP.row(it, { end: "<span></span>", sub: (it.annule || it.report).txt || (it.annule ? "sans motif" : `c'était ${it.report.de}`) })).join("")) +
      sec("Demandes en retard", `${lateReq.length}`, lateReq.map((q) => { const it = store.get(q.item); return KP.row(it, { date: `<b class="late">${h(KP.fmt.moyen(q.pour))}</b>`, end: "<span></span>", sub: `${KP.dest(q.de)} attend ${KP.ASK[q.quoi] || "des éléments"} de ${KP.dest(q.a)}` }); }).join("")) +
      sec("À confirmer dans les quinze jours", `${conf.length}`, conf.map((it) => KP.row(it, { end: "<span></span>" })).join("")) +
      sec("Nouveautés depuis la dernière réunion", `${fresh.length}`, fresh.map((it) => KP.row(it, { end: "<span></span>" })).join(""));
    return `<div class="ag">${out || `<div class="empty"><h3>Rien à l'ordre du jour</h3><p>Coche « À voir en réunion » sur une fiche pour l'ajouter ici.</p></div>`}</div>`;
  }

  function bilan(r) {
    const p = KP.PERIODS.find((x) => x.k === r.per), T = KP.TODAY;
    const acts = store.items().filter((i) => !i.annule && i.kind === "action" && i.date >= p.du && i.date <= p.au);
    const max = Math.max(1, ...KP.CLES.map((m) => acts.filter((i) => i.m.includes(m.k)).length));
    const rows = KP.CLES.map((m) => {
      const a = acts.filter((i) => i.m.includes(m.k)), d = a.filter((i) => i.st === "diffuse").length, pv = a.filter((i) => i.st === "prevu").length, c = a.length - d - pv;
      const w = (n) => `width:${(n / max) * 100}%`;
      const txt = a.length ? [d && `${d} diffusée${d > 1 ? "s" : ""}`, pv && `${pv} prévue${pv > 1 ? "s" : ""}`, c && `${c} à confirmer`].filter(Boolean).join(" · ") : `<span class="late">Aucune action</span>`;
      return `<a class="b-row" href="${KP.href({ screen: "plan", per: p.k, msg: m.k, svc: "", type: "", vue: "liste" })}" style="text-decoration:none"><b>${h(m.nom)}</b><div class="stack" role="img" aria-label="${a.length} actions">${d ? `<i class="s-d" style="${w(d)}"></i>` : ""}${pv ? `<i class="s-p" style="${w(pv)}"></i>` : ""}${c ? `<i class="s-c" style="${w(c)}"></i>` : ""}</div><span class="n">${txt}</span></a>`;
    }).join("");
    const late = acts.filter((i) => KP.endOf(i) < T && i.st !== "diffuse").sort((a, b) => a.date.localeCompare(b.date));
    const cls = store.items().filter((i) => i.variant === "classement" && i.date >= p.du && i.date <= p.au);
    return `<div class="bilan">${rows}</div>
      <div class="legend"><span><i style="background:var(--text)"></i>Diffusé</span><span><i style="background:var(--text2);opacity:.55"></i>Prévu</span><span><i style="background:repeating-linear-gradient(135deg,var(--text2) 0 2px,transparent 2px 5px)"></i>À confirmer</span></div>
      <div class="ag">
      ${late.length ? `<h2>Passé, pas encore diffusé<small>${late.length}</small></h2><div class="rows">${late.map((it) => KP.row(it, { end: "<span></span>" })).join("")}</div>` : ""}
      ${cls.length ? `<h2>Classements<small>${cls.length}</small></h2><div class="rows">${cls.map((it) => KP.row(it, { end: "<span></span>" })).join("")}</div>` : ""}
      </div>`;
  }

  Object.assign(KP.acts, {
    tab: (a) => KP.go({ tab: a.dataset.k, fiche: "" }),
    bper: (a) => KP.go({ per: a.dataset.k }),
    vu: (a, e) => { e.stopPropagation(); const it = store.get(a.dataset.id); KP.toast(`« ${it.t} » : vu`, store.update(it.id, { reunion: false })); },
    "close-meeting": () => KP.toast("Réunion close, l'ordre du jour repart de zéro", store.meetingDone()),
  });
})();
