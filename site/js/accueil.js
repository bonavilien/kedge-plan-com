/* Plan de com KEDGE · V2 — l'accueil : ce qui me concerne à gauche, mes épinglés à droite, trois suggestions au plus. */
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
    const pique = KP.pique ? KP.pique("accueil") : "";
    const summary = reader ? `Le plan de la période ${p.nom}, en lecture seule.` : parts.join(", ") + ".";


    return `<div class="page home">
      <div class="hello"><h1>${hr < 18 ? "Bonjour" : "Bonsoir"} ${h(u.nom)}</h1>${pique ? `<p class="pique">${h(pique)}</p>` : ""}<p>${h(summary[0].toUpperCase() + summary.slice(1))}</p></div>
      ${route7()}
      <div class="home-cols"><div class="home-main">

      ${!inbox.length && !reader ? `<section class="block"><h2>À traiter</h2><div class="vide-todo">${KP.illu ? KP.illu("petit") : ""}<div><b>Rien à traiter.</b><span>Personne n'attend rien de toi.</span></div></div></section>` : ""}
      ${inbox.length ? `<section class="block"><h2>À traiter${inbox.length > 3 && !KP.ui.allTodo ? `<button type="button" class="link" data-act="all-todo">Voir les ${inbox.length}</button>` : ""}</h2>
        ${todo.map((r) => { const it = store.get(r.item), late = r.pour && r.pour < T; if (r.de === r.a) return `<div class="todo"><div class="tx"><b>${h(r.txt || r.quoi)}</b><small>${h(it.t)} · <span class="${late ? "late" : ""}">${h(KP.due(r))}</span></small></div><button type="button" class="link soft" data-act="open" data-id="${it.id}">Voir</button><button type="button" class="ib" data-act="memo-fait" data-id="${r.id}" data-tip="C'est fait" aria-label="C'est fait">${KP.ic("check")}</button></div>`;
          return `<div class="todo">${KP.avatar(KP.person(r.de), "todo-av")}<div class="tx"><b>${r.txt ? `${h(KP.dest(r.de))} : ${KP.ecrire ? KP.ecrire.texte(r.txt, it) : h(r.txt)}` : `${h(KP.dest(r.de))} attend ${h(KP.ASK[r.quoi] || "des éléments")}`}</b><small>${h(it.t)} · <span class="${late ? "late" : ""}">${h(KP.due(r))}</span></small></div><button type="button" class="link soft" data-act="open" data-id="${it.id}">Voir</button><button type="button" class="btn primary small" data-act="answer" data-id="${r.id}">Répondre</button></div>`; }).join("")}</section>` : ""}


      <section class="block"><h2>${pilote || reader ? "Les sept prochains jours" : "Ma semaine"}<a class="link" href="${KP.href({ screen: "plan", per: p.k, svc: pilote || reader ? "" : u.svc, msg: "", type: "" })}">Tout le plan</a></h2>
        ${week.length ? `<div class="rows lines">${week.slice(0, 5).map((it) => KP.row(it)).join("")}</div>${week.length > 5 ? `<p class="muted" style="margin:8px 12px 0;font-size:13.5px">et ${week.length - 5} autre${week.length - 5 > 1 ? "s" : ""} dans le plan</p>` : ""}` : `<p class="muted">Rien de prévu. ${!reader && !mineWk ? "Profite, ça ne durera pas." : ""}</p>`}</section>

      ${shown.length ? `<section class="block"><h2>Suggestions</h2>
        ${shown.map((s, i) => `<div class="sugg">${ic(s.icon)}<div class="tx"><p>${h(s.text)}</p><p class="why">${h(s.why)}</p><div class="do">${s.actions.map((a, j) => `<button type="button" class="link" data-act="sg-do" data-i="${i}" data-j="${j}">${h(a.nom)}</button>`).join("")}<button type="button" class="link soft" data-act="sg-skip" data-i="${i}">${h(s.skip)}</button></div></div></div>`).join("")}</section>` : ""}

      </div>
      <aside class="home-side" aria-label="Épinglés"><section class="block"><h2>${ic("bookmark")}Épinglés${pins.length ? `<span class="cnt">${pins.length}</span>` : ""}</h2>
        ${pins.length ? `<div class="pins">${pins.map((it) => `<button type="button" class="pin${it.kind === "tf" ? " tf" : ""}" data-act="open" data-id="${it.id}"><span class="pin-d">${it.flou ? h(KP.dateLong(it)) : h(KP.fmt.moyen(it.date))}</span><span class="pin-t">${h(it.t)}</span>${KP.pill(it)}</button>`).join("")}</div>` : `<p class="pin-empty">${ic("bookmark")}<span>Épingle une fiche pour la garder ici.</span></p>`}
      </section></aside></div>
    </div>`;
  };

  /* le chemin vers le 7e : KEDGE et les écoles à dépasser au SIGEM, sur une route vue de haut (config.js, sigem) */
  function route7() {
    const c = (window.KPLAN_CONFIG || {}).sigem, app = (KP.marque || {}).app || "";
    if (!c || !c.kedge || !c.cible || !/7/.test(app)) return "";
    const pts = [{ r: c.kedge, nom: KP.marque.nom || "KEDGE", moi: true }, ...(c.devant || []).filter((d) => d.r < c.kedge && d.r >= c.cible).sort((a, b) => b.r - a.r)];
    const n = pts.length, reste = c.kedge - c.cible;
    const next = store.items().filter((it) => it.variant === "classement" && !it.annule && it.date >= KP.TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
    return `<section class="route7" aria-label="SIGEM ${c.annee || ""} : ${h(pts[0].nom)} ${c.kedge}e, objectif ${c.cible}e">
      <div class="r7-h"><b>${h(app)}</b><span>${reste} place${reste > 1 ? "s" : ""} à gagner au SIGEM</span>${next ? `<button type="button" class="r7-next" data-act="open" data-id="${next.id}">${ic("calendar")}<span>Prochain classement : <b>${h(next.t)}</b> · ${h(KP.dateShort(next))}</span></button>` : ""}</div>
      <div class="r7-voie" aria-hidden="true"><span class="r7-route"></span>
        ${pts.map((p, i) => `<span class="r7-pt${p.moi ? " moi" : ""}${p.r === c.cible ? " but" : ""}" style="--x:${(6 + (i * 88) / Math.max(1, n - 1)).toFixed(2)}%;--i:${i}"><b>${p.r}<sup>e</sup></b><small>${h(p.nom)}</small></span>`).join("")}
      </div></section>`;
  }

  Object.assign(KP.acts, {
    "all-todo": () => { KP.ui.allTodo = true; KP.render(); },
    "sg-do": (a) => { const s = shown[+a.dataset.i]; if (s) s.actions[+a.dataset.j].run(); },
    "sg-skip": (a) => { const s = shown[+a.dataset.i]; if (s) { KP.skipSuggestion(s); KP.toast("Noté. Je te la ressors dans 3 jours."); } },
  });
})();
