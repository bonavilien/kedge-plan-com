/* Road to 7th — Résultats : ce que les diffusions ont donné, période par période (vues, retombées presse, inscrits, clics).
   L'onglet Budget, réservé aux chefs de projet, fait le compte des partenariats payants, période par période. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const $ = (id) => document.getElementById(id);
  const curPer = () => KP.periodOf(KP.TODAY).k;
  const nb = KP.nb;
  /* gros chiffres : « 14,2 k », « 1,2 M » */
  const court = (n) => { const k = Math.round(n / 100) / 10; return n >= 1e6 || k >= 1000 ? nb(Math.round(n / 1e5) / 10) + " M" : n >= 1e4 ? nb(k) + " k" : nb(n); };
  const eur = (n) => nb(n || 0) + " €";
  /* pour classer les diffusions, la plus forte en haut : une retombée presse pèse mille vues, un inscrit cinquante, un clic deux */
  const POIDS = { vues: 1, clics: 2, inscrits: 50, retombees: 1000 };
  const score = (it) => Object.entries(it.res || {}).reduce((a, [k, n]) => a + n * (POIDS[k] || 1), 0);
  const aRes = (it) => !!it.res && Object.keys(it.res).length > 0;
  const somme = (list, k) => list.reduce((a, i) => a + ((i.res || {})[k] || 0), 0);
  const unite = (k) => KP.UNITES.find((u) => u.k === k);
  const mot = (k, n) => { const u = unite(k); return u.un + (n > 1 ? "s" : ""); };
  const dans = (p) => (i) => i.date >= p.du && i.date <= p.au;
  /* une action passée « Diffusé » sur la période */
  const diffusees = (p) => store.items().filter((i) => !i.annule && i.kind === "action" && i.st === "diffuse" && dans(p)(i));
  /* l'unité proposée : celle que ce service note le plus souvent ; la presse compte en retombées, les autres en vues */
  const devine = (it) => {
    const n = {}; store.items().filter((x) => x.svc === it.svc && aRes(x)).forEach((x) => Object.keys(x.res).forEach((k) => (n[k] = (n[k] || 0) + 1)));
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : /presse|^rp$/i.test(it.svc + " " + ((KP.service(it.svc) || {}).nom || "")) ? "retombees" : "vues";
  };
  const brouillon = (it) => { KP.ui.rc = KP.ui.rc || {}; return KP.ui.rc[it.id] || (KP.ui.rc[it.id] = { n: "", u: devine(it) }); };
  /* un nombre tapé à la française : « 14 200 », « 1 650,50 », « 1,5 k », « 2 M » ; vide : null ; illisible ou négatif : NaN */
  const valeur = (s) => {
    let t = String(s == null ? "" : s).trim().toLowerCase().replace(/[\s\u00a0\u202f]/g, "").replace(/€|euros?/g, "");
    if (!t) return null;
    const m = /^(-?)([\d.,]+)(k|m|mille|millions?)?$/.exec(t); if (!m || m[1]) return NaN;
    t = m[2].replace(/\.(?=\d{3}(?!\d))/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    let x = Number(t); if (/^k|^mille/.test(m[3] || "")) x *= 1e3; if (/^m/.test(m[3] || "")) x *= 1e6;
    return Math.round(x);
  };
  /* pendant la frappe : grouper les milliers d'un nombre entier ; une virgule ou un « k » restent tels quels */
  const groupe = (s) => (/^[\d\s\u00a0\u202f]*$/.test(s) ? (s.replace(/\D/g, "").slice(0, 12) ? nb(Number(s.replace(/\D/g, "").slice(0, 12))) : "") : s);
  const IMPOSSIBLE = "Ce chiffre n'est pas possible : un nombre entier, de 0 à un milliard";
  const IMPOSSIBLE_EUR = "Ce montant n'est pas possible : de 0 à 100 millions d'euros";

  KP.views.resultats = () => {
    if (!store.resOk()) return `<div class="page res"><div class="head"><h1>Résultats</h1></div><div class="empty"><h3>Bientôt ici</h3><p>La base n'est pas encore à jour pour noter les résultats. ${KP.me().role === "pilote" ? "Colle 2.5_0030 puis 2.6_0031 dans Supabase (SQL Editor)." : "Un chef de projet doit la mettre à jour."}</p></div></div>`;
    const r = KP.route, chef = store.voitBudget(), tab = r.tab === "budget" && chef ? "budget" : "diffusions";
    const p = KP.PERIODS.find((x) => x.k === r.per) || KP.periodOf(KP.TODAY);
    const pers = `<div class="seg pers" role="group" aria-label="Période">${KP.PERIODS.map((x) => `<button type="button" data-act="rper" data-k="${x.k}" class="${x.k === p.k ? "on" : ""}" aria-pressed="${x.k === p.k}">${h(x.nom)}${x.k === curPer() ? '<i class="now" aria-label="en cours"></i>' : ""}</button>`).join("")}</div>`;
    const autres = KP.PEOPLE.filter((x) => x.role === "pilote" && x.k !== KP.me().k).map((x) => x.nom);
    const qui = autres.length ? "toi et " + (autres.length > 1 ? autres.slice(0, -1).join(", ") + " et " + autres[autres.length - 1] : autres[0]) : "toi";
    return `<div class="page res">
      <div class="head"><h1>Résultats</h1><span class="sub">${tab === "budget" ? "Partenariats payants" : `${h(p.nom)}, ${h(p.lib)}`}</span></div>
      <div class="bar">
        ${chef ? `<div class="seg" role="group" aria-label="Vue"><button type="button" data-act="rtab" data-k="diffusions" class="${tab === "diffusions" ? "on" : ""}" aria-pressed="${tab === "diffusions"}">Diffusions</button><button type="button" data-act="rtab" data-k="budget" class="${tab === "budget" ? "on" : ""}" aria-pressed="${tab === "budget"}">${ic("lock")}Budget</button></div>` : ""}
        ${tab === "diffusions" ? pers : `<span class="muted r-prive">${ic("lock")}Visible seulement par ${h(qui)}</span>`}
      </div>
      ${tab === "budget" ? budget(p) : diffusions(p)}
    </div>`;
  };

  /* ---------- Diffusions ---------- */
  function diffusions(p) {
    const all = diffusees(p);
    if (!all.length) return `<div class="empty"><h3>Rien de diffusé sur ${h(p.nom)}</h3><p>Une action passée en « Diffusé » arrive ici.</p></div>`;
    const todo = all.filter((i) => !aRes(i) && store.canEdit(i)).sort((a, b) => a.date.localeCompare(b.date));
    const done = all.filter((i) => !todo.includes(i)).sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date));
    const tiles = [["vues", "vues"], ["retombees", "retombées presse"], ["inscrits", "inscrits"], ["clics", "clics"]].filter(([k]) => k !== "clics" || somme(all, k) > 0);
    const tuile = ([k, lib]) => { const n = somme(all, k); return `<div class="r-tile${n ? "" : " zero"}"><b>${court(n)}</b><span>${n <= 1 ? lib.replace(/s(\b|$)/g, "$1") : lib}</span></div>`; };
    /* par message : la barre suit les vues (la mesure commune) ; sans aucune vue, le poids des résultats */
    /* la barre suit le poids de tous les résultats (une retombée pèse mille vues…) : un message sans vues mais avec des inscrits a sa barre */
    const parM = KP.CLES.map((m) => { const l = all.filter((i) => i.m.includes(m.k)); return { m, l, v: somme(l, "vues"), s: l.reduce((a, i) => a + score(i), 0) }; });
    const vues = false, max = Math.max(1, ...parM.map((x) => x.s));
    const msg = parM.map(({ m, l, v, s }) => {
      const txt = KP.UNITES.map((u) => [u.k, somme(l, u.k)]).filter(([, n]) => n > 0).map(([k, n]) => `${court(n)} ${mot(k, n)}`).join(" · ");
      const w = Math.round((100 * (vues ? v : s)) / max);
      return `<a class="b-row" href="${KP.href({ screen: "plan", per: p.k, msg: m.k, svc: "", type: "", vue: "liste" })}"><b>${h(m.nom)}</b><div class="stack r-bar" role="img" aria-label="${h(txt || "aucun résultat")}">${w ? `<i class="s-ok" style="width:${w}%"></i>` : ""}</div><span class="n${txt ? " ok" : ""}">${txt || (l.length ? "pas encore de chiffres" : "rien de diffusé")}</span></a>`;
    }).join("");
    const colh = `<div class="colh r-colh" aria-hidden="true"><span>Date</span><span>Action</span><span>Service</span><span>Message</span><span>Résultat</span></div>`;
    return `<div class="r-tiles">${tiles.map(tuile).join("")}</div>
      ${todo.length ? `<div class="ag"><h2>À compléter<small>${todo.length}</small></h2><div class="rows r-todo">${todo.map(saisie).join("")}</div></div>` : ""}
      <div class="ag"><h2>Par message</h2></div><div class="bilan">${msg}</div>
      ${done.length ? `<div class="ag"><h2>Diffusées<small>${done.length}</small></h2><div class="rows">${colh}${done.map(ligne).join("")}</div></div>` : ""}`;
  }

  const svcNom = (it) => (it.variant === "partenariat" ? it.partner || "" : (KP.service(it.svc) || {}).nom || "");
  const tags = (it) => it.m.map((k) => (KP.message(k) || {}).nom).filter(Boolean).map((n) => `<i class="tag">${h(n)}</i>`).join("");
  /* une diffusion sans chiffre : on tape le nombre, on choisit l'unité, Entrée */
  const saisie = (it) => {
    const b = brouillon(it);
    return `<div class="r-l" data-id="${it.id}">
      <span class="d">${KP.dateCell(it)}</span>
      <span class="t"><button type="button" class="open" data-act="open" data-id="${it.id}" title="${h(it.t)}"><span class="tt">${h(it.t)}</span></button></span>
      <span class="svc">${h(svcNom(it))}</span>
      <input class="input r-n" id="rn-${it.id}" data-id="${it.id}" value="${h(b.n ? groupe(String(b.n)) : "")}" inputmode="numeric" autocomplete="off" placeholder="Combien ?" aria-label="Résultat de « ${h(it.t)} »">
      <span class="r-us" role="group" aria-label="Unité">${KP.UNITES.map((u) => `<button type="button" class="r-u${b.u === u.k ? " on" : ""}" data-act="r-u" data-id="${it.id}" data-k="${u.k}" aria-pressed="${b.u === u.k}">${u.nom}</button>`).join("")}</span>
      <button type="button" class="r-ok" data-act="r-ok" data-id="${it.id}" aria-label="Noter le résultat" data-tip="Noter (Entrée)">${ic("check")}</button>
    </div>`;
  };
  /* une diffusion avec ses chiffres ; on clique sur le chiffre pour le corriger */
  const ligne = (it) => {
    const res = it.res || {}, ks = KP.UNITES.map((u) => u.k).filter((k) => res[k] != null).sort((a, b) => res[b] * POIDS[b] - res[a] * POIDS[a]);
    const val = ks.length ? `<b>${nb(res[ks[0]])}</b> ${mot(ks[0], res[ks[0]])}${ks.length > 1 ? `<small>${ks.slice(1).map((k) => `${nb(res[k])} ${mot(k, res[k])}`).join(" · ")}</small>` : ""}` : `<span class="muted">—</span>`;
    return `<div class="row r-row${KP.route.fiche === it.id ? " sel" : ""}" data-act="open" data-id="${it.id}">
      <span class="d">${KP.dateCell(it)}</span>
      <span class="t"><button type="button" class="open" data-act="open" data-id="${it.id}" title="${h(it.t)}"><span class="tt">${h(it.t)}</span></button>${it.variant === "partenariat" ? `<span class="badge">Payant</span>` : ""}</span>
      <span class="svc">${h(svcNom(it))}</span><span class="msg">${tags(it)}</span>
      ${store.canEdit(it) ? `<button type="button" class="r-v" data-act="r-edit" data-id="${it.id}" aria-label="Corriger le résultat de « ${h(it.t)} »">${val}</button>` : `<span class="r-v">${val}</span>`}
    </div>`;
  };

  /* ---------- Budget ---------- */
  function budget(sel) {
    const parts = store.items().filter((i) => i.variant === "partenariat" && !i.annule);
    const perOf = (it) => KP.periodOf(it.date).k;
    const tot = (k) => parts.filter((i) => perOf(i) === k).reduce((a, i) => a + (store.montant(i.id) || 0), 0);
    const envs = KP.PERIODS.map((p) => store.enveloppe(p.k)).filter((n) => n != null);
    const max = Math.max(1, ...KP.PERIODS.map((p) => tot(p.k)));
    const an = KP.PERIODS.reduce((a, p) => a + tot(p.k), 0), anEnv = envs.reduce((a, n) => a + n, 0);
    const cartes = KP.PERIODS.map((p) => {
      const t = tot(p.k), e = store.enveloppe(p.k), over = e != null && t > e, on = p.k === sel.k;
      const w = Math.min(100, Math.round((100 * t) / (e != null ? Math.max(1, e) : max)));
      return `<button type="button" class="r-card${on ? " on" : ""}${over ? " over" : ""}" data-act="rper" data-k="${p.k}" aria-pressed="${on}">
        <span class="r-card-h">${h(p.nom)}${p.k === curPer() ? '<i class="now" aria-label="en cours"></i>' : ""}</span>
        <b>${eur(t)}</b><small>${e != null ? `sur ${eur(e)}` : "&nbsp;"}</small>
        <span class="r-jauge"><i style="width:${w}%"></i></span></button>`;
    }).join("");
    const rows = parts.filter((i) => perOf(i) === sel.k).sort((a, b) => a.date.localeCompare(b.date));
    const e = store.enveloppe(sel.k), t = tot(sel.k);
    const lignes = rows.map((it) => { const m = store.montant(it.id);
      return `<div class="r-b" data-id="${it.id}">
        <span class="d">${KP.dateCell(it)}</span>
        <span class="t"><button type="button" class="open" data-act="open" data-id="${it.id}" title="${h(it.t)}"><span class="tt">${h(it.t)}</span></button></span>
        <span class="svc">${h(it.partner || "Média à choisir")}</span>
        <span class="r-eur"><input class="input r-m" id="bm-${it.id}" data-id="${it.id}" data-v="${m != null ? nb(m) : ""}" value="${m != null ? nb(m) : ""}" inputmode="numeric" autocomplete="off" placeholder="—" aria-label="Montant de « ${h(it.t)} », en euros"><span aria-hidden="true">€</span></span>
        <span class="st">${KP.pill(it)}</span>
      </div>`; }).join("");
    return `<div class="ag"><h2>L'année<small>${eur(an)}${anEnv ? ` sur ${eur(anEnv)}` : ""}</small></h2></div>
      <div class="r-cards">${cartes}</div>
      <div class="ag"><h2>${h(sel.nom)}<small>${h(sel.lib)}</small><span class="sp"></span>
        <label class="r-env">Enveloppe <span class="r-eur"><input class="input r-e" id="env-${sel.k}" data-k="${sel.k}" data-v="${e != null ? nb(e) : ""}" value="${e != null ? nb(e) : ""}" inputmode="numeric" autocomplete="off" placeholder="—" aria-label="Enveloppe de la période ${h(sel.nom)}, en euros"><span aria-hidden="true">€</span></span></label></h2></div>
      <div class="rows r-budget">
        <div class="colh r-bh" aria-hidden="true"><span>Date</span><span>Partenariat</span><span>Média</span><span>Montant</span><span>État</span></div>
        ${lignes || `<p class="r-vide muted">Aucun partenariat payant sur cette période.</p>`}
        ${rows.length ? `<div class="r-b r-tot"><b class="r-tot-l">Total</b><b class="r-eur${e != null && t > e ? " over" : ""}">${eur(t)}</b></div>` : ""}
      </div>`;
  }

  /* ---------- gestes ---------- */
  /* noter le résultat d'une ligne « À compléter », puis passer à la suivante */
  const noter = (id) => {
    const it = store.get(id), b = brouillon(it), inp = $("rn-" + id), n = valeur(inp ? inp.value : b.n);
    if (n == null) { if (inp) inp.focus(); return; }
    if (!(n >= 0 && n <= 1e9)) { if (inp) inp.focus(); return KP.toast(IMPOSSIBLE); }
    const rows = [...document.querySelectorAll(".r-todo .r-l")], i = rows.findIndex((x) => x.dataset.id === id), next = (rows[i + 1] || rows[i - 1] || {}).dataset;
    const undo = store.setRes(id, { [b.u]: n });
    if (!undo) { if (inp) inp.focus(); return KP.toast(IMPOSSIBLE); }
    KP.ui.rc[id] = null;
    KP.toast(`Noté : ${KP.resTxt({ [b.u]: n })}`, undo);
    const f = next && next.id && $("rn-" + next.id); if (f) f.focus();
  };
  /* corriger les chiffres d'une diffusion : les quatre unités, dans une petite fenêtre */
  KP.resEdit = (anchor, id) => {
    const it = store.get(id); if (!it) return;
    const res = it.res || {};
    const p = KP.pop(anchor, `<form class="r-pop"><h4>Résultat</h4>${KP.UNITES.map((u) => `<label><span>${u.nom}</span><input class="input" name="${u.k}" value="${res[u.k] != null ? nb(res[u.k]) : ""}" inputmode="numeric" autocomplete="off" placeholder="—"></label>`).join("")}
      <div class="foot">${aRes(it) ? `<button type="button" class="link soft" data-x="vider">Tout effacer</button>` : ""}<span class="sp"></span><button class="btn primary small">Noter</button></div></form>`, { role: "dialog", label: "Résultat", right: true });
    const f = p.el.querySelector("form"), first = f.querySelector("input"); if (first) { first.focus(); first.select(); }
    const done = (r) => { const bad = Object.entries(r).find(([, v]) => v != null && !(v >= 0 && v <= 1e9));
      if (bad) { const x = f.elements[bad[0]]; x.focus(); x.select(); return KP.toast(IMPOSSIBLE); }
      const u = store.setRes(id, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : v])), true); if (!u) return KP.toast(IMPOSSIBLE);
      p.close(); const x = store.get(id); KP.toast(x && x.res ? `Noté : ${KP.resTxt(x.res)}` : "Résultats effacés", u); };
    f.addEventListener("submit", (e) => { e.preventDefault(); done(Object.fromEntries(KP.UNITES.map((u) => [u.k, valeur(f.elements[u.k].value)]))); });
    p.el.addEventListener("click", (e) => { if (e.target.closest('[data-x="vider"]')) done(Object.fromEntries(KP.UNITES.map((u) => [u.k, null]))); });
  };
  /* le budget d'un partenariat, depuis sa fiche */
  KP.prixEdit = (anchor, id) => {
    const it = store.get(id), m = store.montant(id);
    const p = KP.pop(anchor, `<form class="r-pop"><h4>Budget</h4><label><span>Montant</span><span class="r-eur"><input class="input" name="m" value="${m != null ? nb(m) : ""}" inputmode="numeric" autocomplete="off" placeholder="—"><span aria-hidden="true">€</span></span></label>
      <div class="foot"><span class="sp"></span><button class="btn primary small">Noter</button></div></form>`, { role: "dialog", label: "Budget", right: true });
    const f = p.el.querySelector("form"), inp = f.querySelector("input"); inp.focus(); inp.select();
    f.addEventListener("submit", (e) => { e.preventDefault(); const v = valeur(inp.value), u = Number.isNaN(v) ? null : store.setMontant(it.id, v);
      if (!u) { inp.focus(); inp.select(); return KP.toast(IMPOSSIBLE_EUR); }
      p.close(); KP.toast(v != null ? `Budget : ${eur(v)}` : "Montant retiré", u); });
  };

  /* le nombre se lit groupé (« 14 200 ») pendant qu'on le tape */
  document.addEventListener("input", (e) => {
    const t = e.target; if (!t.classList || !(t.classList.contains("r-n") || t.classList.contains("r-m") || t.classList.contains("r-e"))) return;
    if (!/^[\d\s\u00a0\u202f]*$/.test(t.value)) { if (t.classList.contains("r-n")) { const it = store.get(t.dataset.id); if (it) brouillon(it).n = t.value; } return; }
    const avant = t.value.slice(0, t.selectionStart).replace(/[^\d]/g, "").length;
    t.value = groupe(t.value); const n = t.value.replace(/\D/g, "");
    let pos = 0, vus = 0; while (pos < t.value.length && vus < avant) { if (/\d/.test(t.value[pos])) vus++; pos++; }
    try { t.setSelectionRange(pos, pos); } catch (err) { /* rien */ }
    if (t.classList.contains("r-n")) { const it = store.get(t.dataset.id); if (it) brouillon(it).n = n; }
  });
  /* un montant part quand on quitte le champ (ou Entrée) : pas d'enregistrement à chaque chiffre */
  /* après le déplacement du focus : le rendu qui suit le rend au champ suivant au lieu de le perdre */
  document.addEventListener("change", (e) => {
    const t = e.target; if (!t.classList || !(t.classList.contains("r-m") || t.classList.contains("r-e"))) return;
    const n = valeur(t.value), { id, k } = t.dataset, m = t.classList.contains("r-m");
    setTimeout(() => {
      const u = Number.isNaN(n) ? null : m ? store.setMontant(id, n) : store.setEnveloppe(k, n);
      if (!u) { t.value = t.dataset.v || ""; return KP.toast(IMPOSSIBLE_EUR); }
      const nom = m ? (store.get(id) || {}).t || "Montant" : "Enveloppe";
      KP.toast(n != null ? `${nom} : ${eur(n)}` : `${nom} : montant retiré`, u);
    }, 0);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target; if (!t.classList || e.isComposing) return;
    /* Échap : on retrouve le montant d'avant, rien ne part */
    if (e.key === "Escape" && (t.classList.contains("r-m") || t.classList.contains("r-e"))) { e.preventDefault(); e.stopPropagation(); t.value = t.dataset.v || ""; t.blur(); return; }
    if (e.key !== "Enter") return;
    if (t.classList.contains("r-n")) { e.preventDefault(); noter(t.dataset.id); }
    if (t.classList.contains("r-m") || t.classList.contains("r-e")) {
      e.preventDefault(); const all = [...document.querySelectorAll(".r-m")], i = all.indexOf(t);
      if (t.classList.contains("r-m") && all[i + 1]) all[i + 1].focus(); else t.blur();
    }
  });

  Object.assign(KP.acts, {
    rtab: (a) => KP.go({ tab: a.dataset.k, fiche: "" }),
    rper: (a) => KP.go({ per: a.dataset.k }),
    "r-u": (a, e) => { e.stopPropagation(); const it = store.get(a.dataset.id), b = brouillon(it), inp = $("rn-" + it.id); if (inp) b.n = inp.value; b.u = a.dataset.k;
      a.parentNode.querySelectorAll(".r-u").forEach((x) => { const on = x.dataset.k === b.u; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      if (inp) inp.focus(); },
    "r-ok": (a, e) => { e.stopPropagation(); noter(a.dataset.id); },
    "r-edit": (a, e) => { e.stopPropagation(); KP.resEdit(a, a.dataset.id); },
    "r-prix": (a, e) => { e.stopPropagation(); KP.prixEdit(a, a.dataset.id); },
  });
})();
