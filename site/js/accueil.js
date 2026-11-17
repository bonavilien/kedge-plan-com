/* Plan de com KEDGE · V2 — l'accueil : une colonne, ce qui me concerne, trois suggestions au plus. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  KP.ui = KP.ui || {};
  let shown = [];

  KP.views.accueil = () => {
    const u = KP.me(), T = KP.TODAY, pilote = u.role === "pilote", reader = u.role === "lecteur";
    const inbox = KP.inbox(), todo = KP.ui.allTodo ? inbox : inbox.slice(0, 3);
    const end = KP.addDays(T, 6);
    /* un temps fort de plusieurs jours déjà commencé compte aussi : il est en cours */
    const week = store.items().filter((it) => !it.annule && it.variant !== "sujet" && !it.flou && (it.fin || it.date) >= T && it.date <= end && (pilote || reader || it.kind === "tf" || it.svc === u.svc)).sort((a, b) => a.date.localeCompare(b.date));
    const mineWk = week.filter((it) => it.kind === "action").length;
    const sugg = KP.suggestions(); shown = sugg.slice(0, 3);
    const pins = (store.prefs().pins || []).map((id) => store.get(id)).filter(Boolean);
    const p = KP.periodOf(T);
    const hr = new Date().getHours();
    const parts = [];
    const nreq = inbox.filter((r) => r.de !== r.a).length;
    if (nreq) parts.push(`${nreq} demande${nreq > 1 ? "s t'attendent" : " t'attend"}`);
    parts.push(week.length ? `${week.length} ligne${week.length > 1 ? "s" : ""} dans les sept jours` : "rien dans les sept jours");
    const summary = reader ? `Le plan de la période ${p.nom}, en lecture seule.` : parts.join(", ") + ".";

    const counters = () => {
      const acts = store.items().filter((it) => !it.annule && it.kind === "action" && it.date >= p.du && it.date <= p.au);
      return `<div class="counters">${KP.CLES.map((m) => { const n = acts.filter((it) => it.m.includes(m.k)).length; return `<a class="counter${n ? "" : " zero"}" href="${KP.href({ screen: "plan", per: p.k, msg: m.k, svc: "", type: "", vue: "liste" })}" style="text-decoration:none"><b>${n}</b><span>${h(m.nom)}</span></a>`; }).join("")}</div>`;
    };

    return `<div class="page narrow">
      <div class="hello"><h1>${hr < 18 ? "Bonjour" : "Bonsoir"} ${h(u.nom)}</h1><p>${h(summary[0].toUpperCase() + summary.slice(1))}</p></div>

      ${inbox.length ? `<section class="block"><h2>À traiter${inbox.length > 3 && !KP.ui.allTodo ? `<button type="button" class="link" data-act="all-todo">Voir les ${inbox.length}</button>` : ""}</h2>
        ${todo.map((r) => { const it = store.get(r.item), late = r.pour < T; if (r.de === r.a) return `<div class="todo"><div class="tx"><b>${h(r.txt || r.quoi)}</b><small>${h(it.t)} · <span class="${late ? "late" : ""}">${h(KP.due(r))}</span></small></div><button type="button" class="link soft" data-act="open" data-id="${it.id}">Voir</button><button type="button" class="ib" data-act="memo-fait" data-id="${r.id}" data-tip="C'est fait" aria-label="C'est fait">${KP.ic("check")}</button></div>`;
          return `<div class="todo"><div class="tx"><b>${h(KP.dest(r.de))} attend ${h(KP.ASK[r.quoi] || "des éléments")}</b><small>${h(it.t)} · <span class="${late ? "late" : ""}">${h(KP.due(r))}</span></small></div><button type="button" class="link soft" data-act="open" data-id="${it.id}">Voir</button><button type="button" class="btn primary small" data-act="answer" data-id="${r.id}">Répondre</button></div>`; }).join("")}</section>` : ""}

      ${pilote ? `<section class="block"><h2>${h(p.nom)}, actions par message<a class="link" href="${KP.href({ screen: "reunion", tab: "bilan" })}">Bilan</a></h2>${counters()}</section>` : ""}

      <section class="block"><h2>${pilote || reader ? "Les sept prochains jours" : "Ma semaine"}<a class="link" href="${KP.href({ screen: "plan", per: p.k, svc: pilote || reader ? "" : u.svc, msg: "", type: "" })}">Tout le plan</a></h2>
        ${week.length ? `<div class="rows lines">${week.slice(0, 5).map((it) => KP.row(it, { slim: true })).join("")}</div>${week.length > 5 ? `<p class="muted" style="margin:8px 12px 0;font-size:13.5px">et ${week.length - 5} autre${week.length - 5 > 1 ? "s" : ""} dans le plan</p>` : ""}` : `<p class="muted">Rien de prévu. ${!reader && !mineWk ? "Une semaine calme." : ""}</p>`}</section>

      ${shown.length ? `<section class="block"><h2>Suggestions</h2>
        ${shown.map((s, i) => `<div class="sugg">${ic(s.icon)}<div class="tx"><p>${h(s.text)}</p><p class="why">${h(s.why)}</p><div class="do">${s.actions.map((a, j) => `<button type="button" class="link" data-act="sg-do" data-i="${i}" data-j="${j}">${h(a.nom)}</button>`).join("")}<button type="button" class="link soft" data-act="sg-skip" data-i="${i}">${h(s.skip)}</button></div></div></div>`).join("")}</section>` : ""}

      ${pins.length ? `<section class="block"><h2>Épinglés</h2><div class="rows lines">${pins.map((it) => KP.row(it, { slim: true, date: it.flou ? KP.dateCell(it) : `<b>${h(KP.fmt.moyen(it.date))}</b>` })).join("")}</div></section>` : ""}
    </div>`;
  };

  Object.assign(KP.acts, {
    "all-todo": () => { KP.ui.allTodo = true; KP.render(); },
    "sg-do": (a) => { const s = shown[+a.dataset.i]; if (s) s.actions[+a.dataset.j].run(); },
    "sg-skip": (a) => { const s = shown[+a.dataset.i]; if (s) { KP.skipSuggestion(s); KP.toast("D'accord, elle reviendra dans 3 jours"); } },
  });
})();
