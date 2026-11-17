/* Plan de com KEDGE · V2 — cadre : adresse par vue, menu, clavier, fenêtre « Nouveau », recherche. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const $ = (id) => document.getElementById(id);
  const curPer = () => KP.periodOf(KP.TODAY).k;

  /* ---------- une adresse par vue ---------- */
  const parseHash = () => {
    /* liens des notifications de la base, au format de la V1 : « #item=<id> » ouvre la fiche, « #afaire » l'accueil */
    const old = /^#item=([\w-]+)/.exec(location.hash);
    if (old) history.replaceState(null, "", "#/accueil?fiche=" + old[1]); else if (location.hash === "#afaire") history.replaceState(null, "", "#/accueil");
    const [path, q = ""] = location.hash.replace(/^#\/?/, "").split("?");
    const seg = path.split("/").filter(Boolean), p = new URLSearchParams(q);
    const r = { screen: ["accueil", "plan", "reunion", "reglages"].includes(seg[0]) ? seg[0] : "accueil", per: curPer(), tab: "ordre", vue: p.get("vue") === "grille" ? "grille" : "liste", svc: p.get("svc") || "", msg: p.get("msg") || "", type: p.get("type") || "", fiche: p.get("fiche") || "" };
    if (r.screen === "plan" && KP.PERIODS.some((x) => x.k === seg[1])) r.per = seg[1];
    r.set = r.screen === "reglages" && ["equipe", "services", "medias", "lieux", "contacts", "apropos"].includes(seg[1]) ? seg[1] : "profil";
    if (r.screen === "reunion") { r.tab = seg[1] === "bilan" ? "bilan" : "ordre"; if (KP.PERIODS.some((x) => x.k === p.get("per"))) r.per = p.get("per"); }
    return r;
  };
  const toHash = (r) => {
    const p = new URLSearchParams();
    if (r.screen === "plan") { if (r.vue === "grille") p.set("vue", "grille"); ["svc", "msg", "type"].forEach((k) => r[k] && p.set(k, r[k])); }
    if (r.screen === "reunion" && r.tab === "bilan" && r.per !== curPer()) p.set("per", r.per);
    if (r.fiche) p.set("fiche", r.fiche);
    const path = r.screen === "plan" ? `/plan/${r.per}` : r.screen === "reunion" ? `/reunion/${r.tab}` : r.screen === "reglages" ? `/reglages/${r.set || "profil"}` : "/accueil";
    const q = p.toString();
    return "#" + path + (q ? "?" + q : "");
  };
  KP.route = parseHash();
  KP.href = (patch) => toHash({ ...KP.route, fiche: "", ...patch });
  KP.go = (patch, replace) => {
    const hsh = toHash({ ...KP.route, ...patch });
    if (hsh === location.hash) return render();
    if (replace) { history.replaceState(null, "", hsh); KP.route = parseHash(); render(); } else location.hash = hsh;
  };
  window.addEventListener("hashchange", () => { const before = KP.route; KP.route = parseHash(); render(); if (before.screen !== KP.route.screen) $("main").scrollTop = 0; });

  /* ---------- rendu ---------- */
  const SCREENS = [["accueil", "Accueil", "home"], ["plan", "Le plan", "calendar"], ["reunion", "Réunion", "meet"]];
  function renderSide() {
    const u = KP.me(), n = KP.inbox().length, r = KP.route;
    const news = KP.notifs().some((j) => j.quand > (store.prefs().vu || 0));
    $("side").innerHTML = `
      <a class="brand" href="#/accueil" aria-label="Plan de com KEDGE, accueil"><img src="assets/kedge-logo-blanc.png" alt="KEDGE"><span>Plan de com</span></a>
      ${store.canCreate() ? `<button class="new" type="button" data-act="new">${ic("plus")}Nouveau<kbd>N</kbd></button>` : ""}
      <div class="nav">${SCREENS.map(([k, nom, i]) => `<a href="${KP.href({ screen: k })}" class="${r.screen === k ? "on" : ""}" ${r.screen === k ? 'aria-current="page"' : ""}>${ic(i)}${nom}${k === "accueil" && n ? `<span class="n" aria-label="${n} à traiter">${n}</span>` : ""}</a>`).join("")}</div>
      <div class="side-foot">
        <button type="button" data-act="search">${ic("search")}Rechercher<kbd>Ctrl K</kbd></button>
        <button type="button" data-act="notifs">${ic("bell")}Notifications${news ? '<span class="dot" aria-label="Du nouveau"></span>' : ""}</button>
        <button type="button" data-act="profile" data-side="1"><span class="avatar">${h((u.nom || "?")[0])}</span><span class="who">${h(u.nom)}<small>${h(u.fonction)}</small></span></button>
        <a class="ver" href="#/reglages/apropos" data-tip="Voir les nouveautés">Version ${h(KP.versionLabel(KP.VERSION.n))}</a>
      </div>`;
    $("topbar").innerHTML = `<b>Plan de com</b>${KP.ib("search", "Rechercher", "search")}${KP.ib("bell", "Notifications", "notifs")}<button class="ib" type="button" data-act="profile" aria-label="Profil"><span class="avatar">${h((u.nom || "?")[0])}</span></button>`;
    $("tabbar").innerHTML = SCREENS.map(([k, nom, i]) => `<a href="${KP.href({ screen: k })}" class="${r.screen === k ? "on" : ""}">${ic(i)}${nom}</a>`).join("") + (store.canCreate() ? `<button class="plus" type="button" data-act="new" aria-label="Nouveau">${ic("plus")}</button>` : "<span></span>");
  }
  function render() {
    if (KP.hold) return; /* branché sur la base : rien ne s'affiche avant la connexion */
    if (store.prefs().version !== KP.VERSION.n) { store.prefs().version = KP.VERSION.n; store.prefs().versionVue = Date.now(); }
    const t = store.prefs().theme; if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const main = $("main"), top = main.scrollTop, act = document.activeElement, fid = act && act.id, sel = act && act.selectionStart;
    const frow = act && act.classList && act.classList.contains("open") && act.closest(".row") ? act.dataset.id : "";
    const f0 = $("fiche"), fWas = f0.hidden ? "" : f0.dataset.id, inFiche = act && f0.contains(act);
    renderSide();
    main.innerHTML = KP.views[KP.route.screen]();
    main.scrollTop = top;
    KP.renderFiche();
    /* sur un grand écran, la fiche s'ouvre à côté du plan au lieu de le recouvrir */
    const fNow = $("fiche").hidden ? "" : $("fiche").dataset.id;
    /* la grille garde toute la largeur : la fiche passe par-dessus, comme avant */
    document.documentElement.classList.toggle("fiche-open", !!fNow && !(KP.route.screen === "plan" && KP.route.vue === "grille"));
    KP.autosize(document);
    /* la fiche qui s'ouvre prend le focus ; celle qui se ferme le rend à sa ligne */
    if (fNow && fNow !== fWas) $("fiche").focus({ preventScroll: true });
    else if (!fNow && fWas && (inFiche || !act || act === document.body)) { const x = main.querySelector(`.row[data-id="${fWas}"] .open, .g-i[data-id="${fWas}"]`); if (x) x.focus({ preventScroll: true }); }
    else if (fid && $(fid)) { $(fid).focus({ preventScroll: true }); try { if (sel != null) $(fid).setSelectionRange(sel, sel); } catch (e) {} }
    else if (frow) { const x = main.querySelector(`.row[data-id="${frow}"] .open`); if (x) x.focus({ preventScroll: true }); }
    document.title = ({ accueil: "Accueil", plan: "Le plan", reunion: "Réunion", reglages: "Réglages" })[KP.route.screen] + " · Plan de com KEDGE";
  }
  try { if (window.self !== window.top) document.documentElement.classList.add("embedded"); } catch (e) { document.documentElement.classList.add("embedded"); }
  KP.render = render;
  store.on(render);

  /* ---------- clics : un seul écouteur, des actions nommées ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const f = KP.acts[a.dataset.act]; if (f) { if (a.tagName !== "A") e.preventDefault(); f(a, e); }
  });
  const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); KP.palette(); return; }
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (e.key === "Escape") { if (typing(t)) { t.blur(); return; } if (KP.route.fiche) { KP.acts["close-fiche"](); } return; }
    if (typing(t) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "n" && store.canCreate()) { e.preventDefault(); KP.nouveau(); return; }
    if (e.key === "/") { e.preventDefault(); KP.palette(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (t.closest && t.closest(".pop, .fiche")) return;
      const rows = [...$("main").querySelectorAll(".row .open")]; if (!rows.length) return;
      e.preventDefault(); const i = rows.indexOf(t);
      rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
    }
  });

  Object.assign(KP.acts, {
    open: (a) => KP.go({ fiche: a.dataset.id }),
    "close-fiche": () => { const id = KP.route.fiche; KP.go({ fiche: "" }); const x = $("main").querySelector(`.row[data-id="${id}"] .open, .g-i[data-id="${id}"]`); if (x) x.focus({ preventScroll: true }); },
    new: (a) => KP.nouveau({ date: a.dataset.date, svc: a.dataset.svc, tf: a.dataset.tf, kind: a.dataset.kind }),
    search: () => KP.palette(),
    print: () => window.print(),
    "row-st": (a, e) => {
      e.stopPropagation(); const it = store.get(a.dataset.id);
      KP.menu(a, KP.STATUTS.map((s) => ({ v: s.k, nom: s.nom })), (v) => KP.setStatus(it.id, v), { selected: [it.st], right: true, title: "État" });
    },
    notifs: (a) => {
      const draw = () => { const list = KP.notifs().slice(0, 12);
        return `<h4 class="pop-h">Notifications${list.length ? `<button type="button" class="link soft" data-clear="all">Tout effacer</button>` : ""}</h4>` + (list.length ? list.map((j) => { const it = store.get(j.item); return `<div class="pop-n"><button type="button" class="pop-i" data-id="${j.item}"><span><b>${h(KP.nomDe(j.qui))}</b> ${h(j.txt)}<small>${h(it ? it.t : "")} · ${h(KP.fmt.quand(j.quand))}</small></span></button><button type="button" class="ib" data-clear="${j.id}" aria-label="Effacer cette notification">${ic("close")}</button></div>`; }).join("") : `<p class="txt">Rien de nouveau.</p>`); };
      const p = KP.pop(a, draw(), { side: !!a.closest(".side"), right: true, cls: "pop-notifs" });
      p.el.addEventListener("click", (e) => {
        const x = e.target.closest("[data-clear]");
        if (x) { const pr = store.prefs(); if (x.dataset.clear === "all") pr.nall = Date.now(); else pr.nx = [...(pr.nx || []), x.dataset.clear]; store.setPref("vu", Date.now()); p.el.innerHTML = draw(); return; }
        const b = e.target.closest("[data-id]"); if (b) { p.close(); KP.go({ fiche: b.dataset.id }); } });
      store.prefs().vu = Date.now(); const d = a.querySelector(".dot"); if (d) d.remove();
    },
    profile: (a) => {
      const u = KP.me();
      const p = KP.pop(a, `<button type="button" class="pop-i" data-go="reglages">${ic("gear")}<span>Réglages<small>${u.role === "pilote" ? "Mon profil, équipe, services, carnets" : "Mon profil, apparence, notifications"}</small></span></button>
        ` + (store.remote() ? `<hr><button type="button" class="pop-i" data-out="1">${ic("undo")}<span>Se déconnecter<small>${h(KP.remote.email || "")}</small></span></button>` : `<hr><h4>Démonstration : voir l'appli comme</h4>` + KP.PEOPLE.map((x) => `<button type="button" class="pop-i" data-user="${x.k}"><span class="avatar">${h((x.nom || "?")[0])}</span><span>${h(x.nom)}<small>${h(x.fonction)}</small></span>${x.k === u.k ? `<span class="r">${ic("check")}</span>` : ""}</button>`).join("") +
        `<hr><button type="button" class="pop-i" data-reset="1">${ic("undo")}<span>Remettre la démonstration à zéro</span></button>`), { side: !!a.dataset.side, right: true });
      p.el.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return; p.close();
        if (b.dataset.go) KP.go({ screen: "reglages", set: "profil", fiche: "" });
        if (b.dataset.user) { store.switchUser(b.dataset.user); KP.go({ screen: "accueil", fiche: "" }); KP.toast(`Tu vois l'appli comme ${KP.me().nom}`); }
        if (b.dataset.out) KP.remote.signOut();
        if (b.dataset.reset) { store.reset(); KP.go({ screen: "accueil", fiche: "" }); KP.toast("Démonstration remise à zéro"); }
      });
    },
  });

  KP.setStatus = (id, v) => {
    const it = store.get(id); if (!it || it.st === v) return;
    const nom = KP.STATUTS.find((s) => s.k === v).nom;
    KP.toast(`« ${it.t} » : ${nom.toLowerCase()}`, store.update(id, { st: v }, `a passé l'état à « ${nom} »`));
  };
  /* ce qui s'est passé récemment et qui me concerne (les pilotes voient tout) */
  KP.notifs = () => {
    const u = KP.me();
    const pr = store.prefs(), nx = pr.nx || [], on = pr.notif || {};
    const kind = (j) => /^a créé/.test(j.txt) ? "creations" : /demandé|répondu|relancé/.test(j.txt) ? "demandes" : "changements";
    return store.journal().filter((j) => j.qui !== u.k && j.quand > Date.now() - 10 * 864e5 && j.quand > (pr.nall || 0) && !nx.includes(j.id) && on[kind(j)] !== false).filter((j) => { const it = store.get(j.item); return it && (u.role !== "service" || it.svc === u.svc || it.by === u.k || store.relais(it.id).some((r) => r.svc === u.svc)); }).sort((a, b) => b.quand - a.quand);
  };

  /* ---------- fenêtre « Nouveau » ---------- */
  KP.nouveau = (pre = {}) => {
    if (!store.canCreate()) return;
    KP.closePop();
    const u = KP.me();
    /* un filtre actif sur le plan pré-remplit le service et le message : la nouvelle fiche reste visible */
    const fl = KP.route.screen === "plan" ? KP.route : {};
    const s = { kind: pre.kind === "tf" ? "tf" : "action", variant: "", t: "", date: pre.date || KP.TODAY, flou: false, fin: "", partner: "", svc: pre.svc || (fl.svc && KP.service(fl.svc) ? fl.svc : "") || u.svc || (KP.SERVICES[0] || {}).k || "", m: fl.msg && KP.message(fl.msg) ? [fl.msg] : [], tf: pre.tf || "", per: KP.route.screen === "plan" ? KP.route.per : curPer() };
    if (s.tf) { const par = store.get(s.tf); if (par) s.m = [...par.m]; }
    /* tous les temps forts, passés compris : on relaie souvent après l'événement */
    const tfs = store.items().filter((i) => i.kind === "tf" && (!i.annule || i.id === s.tf)).sort((a, b) => a.date.localeCompare(b.date));
    const tfAvenir = tfs.filter((x) => KP.endOf(x) >= KP.TODAY), tfPasses = tfs.filter((x) => KP.endOf(x) < KP.TODAY).reverse();
    const tfOpt = (x) => `<option value="${x.id}" ${x.id === s.tf ? "selected" : ""}>${h(x.t)}, ${h(KP.dateShort(x))}</option>`;
    /* les temps forts proches de la date choisie : on les propose en un clic plutôt que de faire chercher dans une liste */
    const near = () => s.flou ? [] : tfs.filter((x) => !x.flou && KP.diff(x.date, s.date) <= 21 && KP.diff(s.date, KP.endOf(x)) <= 10).sort((a, b) => Math.abs(KP.diff(a.date, s.date)) - Math.abs(KP.diff(b.date, s.date))).slice(0, 2);
    const form = () => `<form method="dialog" novalidate>
      <h2>Nouveau</h2>
      <div class="seg" role="group" aria-label="Type">${[["action", "Action"], ["tf", "Temps fort"]].map(([k, n]) => `<button type="button" data-kind="${k}" class="${s.kind === k ? "on" : ""}" aria-pressed="${s.kind === k}">${k === "tf" ? '<i class="tfdot"></i>' : ""}${n}</button>`).join("")}</div>
      <label class="field"><span>Titre</span><input class="input" name="t" id="n-t" value="${h(s.t)}" placeholder="${s.kind === "tf" ? "Journée portes ouvertes" : "Communiqué, vidéo, publication…"}" autocomplete="off" required></label>
      <div class="two">
        ${s.variant === "sujet"
          ? `<label class="field"><span>Période</span><select class="input" name="per">${KP.PERIODS.map((p) => `<option value="${p.k}" ${p.k === s.per ? "selected" : ""}>${p.nom}, ${p.lib}</option>`).join("")}</select></label>`
          : `<div class="field"><span>Date</span><button type="button" class="input" data-pick="date">${ic("calendar")}${s.flou ? `<span class="tbc">courant ${h(KP.fmt.mois(s.date))}</span>` : h(KP.fmt.long(s.date))}</button></div>`}
        ${s.kind === "action" && s.variant === "partenariat"
          ? `<label class="field"><span>Média partenaire</span><select class="input" name="partner"><option value="">À choisir</option>${store.partners().map((x) => `<option ${x === s.partner ? "selected" : ""}>${h(x)}</option>`).join("")}</select></label>`
          : s.kind === "action"
          ? `<label class="field"><span>Service</span><select class="input" name="svc" ${u.role === "service" ? "disabled" : ""}>${KP.SERVICES.map((x) => `<option value="${h(x.k)}" ${x.k === s.svc ? "selected" : ""}>${h(x.nom)}</option>`).join("")}</select></label>`
          : `<label class="field"><span>Forme</span><select class="input" name="variant"><option value="">Un jour ou quelques jours</option><option value="sujet" ${s.variant === "sujet" ? "selected" : ""}>Sujet sur toute la période</option>${u.role === "pilote" ? `<option value="classement" ${s.variant === "classement" ? "selected" : ""}>Classement</option>` : ""}</select></label>`}
      </div>
      ${s.kind === "tf" && s.variant !== "sujet" && !s.flou ? `<div class="field"><span>Jusqu'au, si ça dure plusieurs jours</span><button type="button" class="input" data-pick-fin>${ic("calendar")}${s.fin ? h(KP.fmt.long(s.fin)) : '<span class="muted">Un seul jour</span>'}</button></div>` : ""}
      <div class="field"><span>Messages</span><div class="picks">${KP.MESSAGES.map((m) => `<button type="button" class="pick" data-m="${m.k}"${m.hors ? ' data-hors' : ""} aria-pressed="${s.m.includes(m.k)}" title="${h(m.info)}">${m.nom}</button>`).join("")}</div></div>
      ${s.kind === "action" && !s.tf && near().length ? `<div class="field"><span>C'est pour un temps fort ?</span><div class="picks">${near().map((x) => `<button type="button" class="pick" data-tf="${x.id}"><i class="tfdot"></i> ${h(x.t)} · ${h(KP.dateShort(x))}</button>`).join("")}<button type="button" class="pick" data-tf-other>Un autre</button><button type="button" class="pick" aria-pressed="true" disabled>Non</button></div></div>` : ""}
      ${s.kind === "action" && (s.tf || s.other || !near().length) ? `<label class="field"><span>Pour un temps fort</span><select class="input" name="tf"><option value="">Aucun</option>${tfAvenir.length ? `<optgroup label="À venir">${tfAvenir.map(tfOpt).join("")}</optgroup>` : ""}${tfPasses.length ? `<optgroup label="Déjà passés">${tfPasses.map(tfOpt).join("")}</optgroup>` : ""}</select></label>` : ""}
      ${s.kind === "action" && u.role === "pilote" ? `<button type="button" class="check" data-pay aria-pressed="${s.variant === "partenariat"}"><span class="box">${ic("check")}</span>Partenariat média payant</button>` : ""}
      <div class="foot"><span class="hint">Ctrl + Entrée pour créer</span><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary" type="submit">Créer</button></div>
    </form>`;
    const d = KP.dialog(form());
    const keep = () => { const t = d.querySelector("[name=t]"); if (t) s.t = t.value; ["svc", "tf", "per", "variant", "partner"].forEach((k) => { const x = d.querySelector(`[name=${k}]`); if (x) s[k] = x.value; }); };
    const redraw = (focus) => { keep(); d.innerHTML = form(); const f = d.querySelector(focus || "[name=t]"); if (f) f.focus(); };
    d.querySelector("[name=t]").focus();
    d.addEventListener("click", (e) => {
      const k = e.target.closest("[data-kind]"); if (k) { s.kind = k.dataset.kind; s.variant = ""; return redraw(); }
      const m = e.target.closest("[data-m]"); if (m) { const v = m.dataset.m; s.m = s.m.includes(v) ? s.m.filter((x) => x !== v) : [...s.m, v]; m.setAttribute("aria-pressed", s.m.includes(v)); return; }
      const lk = e.target.closest("[data-tf]"); if (lk) { keep(); s.tf = lk.dataset.tf; const par = store.get(s.tf); if (par && !s.m.length) s.m = [...par.m]; return redraw("[name=tf]"); }
      if (e.target.closest("[data-tf-other]")) { keep(); s.other = true; return redraw("[name=tf]"); }
      const pay = e.target.closest("[data-pay]"); if (pay) { keep(); s.variant = s.variant === "partenariat" ? "" : "partenariat"; return redraw(s.variant ? "[name=partner]" : "[data-pay]"); }
      const pf = e.target.closest("[data-pick-fin]"); if (pf) return KP.datepick(pf, s.fin || s.date, (v) => { s.fin = v && v > s.date ? v : ""; redraw("[data-pick-fin]"); }, { clear: !!s.fin });
      const pk = e.target.closest("[data-pick]"); if (pk) KP.datepick(pk, s.date, (v) => { if (v) { s.flou = v.length === 7; s.date = s.flou ? v + "-01" : v; if (s.flou || s.fin <= s.date) s.fin = ""; } redraw("[data-pick]"); }, { month: true });
    });
    d.addEventListener("change", (e) => { if (e.target.name === "variant") { keep(); redraw("[name=variant]"); } });
    d.addEventListener("submit", (e) => {
      keep();
      if (!s.t.trim()) { e.preventDefault(); const t = d.querySelector("[name=t]"); t.focus(); t.placeholder = "Un titre, pour le retrouver"; return; }
      const o = { kind: s.kind, variant: s.variant, t: s.t.trim(), date: s.date, flou: s.flou, fin: s.kind === "tf" && !s.flou ? s.fin : "", m: s.m, st: "confirmer", partner: s.variant === "partenariat" ? s.partner : "" };
      if (s.kind === "action") Object.assign(o, { svc: s.variant === "partenariat" ? "" : u.role === "service" ? u.svc : s.svc, tf: s.tf });
      if (s.variant === "sujet") { const p = KP.PERIODS.find((x) => x.k === s.per); Object.assign(o, { per: p.k, date: p.du, fin: p.au, flou: false, st: "prevu" }); }
      const it = store.add(o);
      const per = KP.periodOf(it.date).k;
      KP.go(KP.route.screen === "plan" ? { per: it.variant === "sujet" ? s.per : per, fiche: it.id } : { fiche: it.id });
      KP.toast(it.kind === "tf" ? "Temps fort créé" : "Action créée", () => { store.unadd(it.id); KP.go({ fiche: "" }); });
    });
  };

  /* ---------- recherche et commandes (Ctrl K) ---------- */
  KP.palette = () => {
    if (document.querySelector("dialog.cmdk")) return;
    KP.closePop();
    const cmds = [
      ...(store.canCreate() ? [{ nom: "Nouvelle action", icon: "plus", go: () => KP.nouveau() }, { nom: "Nouveau temps fort", icon: "plus", go: () => KP.nouveau({ kind: "tf" }) }] : []),
      { nom: "Accueil", icon: "home", go: () => KP.go({ screen: "accueil", fiche: "" }) },
      { nom: "Le plan, en liste", icon: "list", go: () => KP.go({ screen: "plan", vue: "liste", fiche: "" }) },
      { nom: "Le plan, en grille", icon: "grid", go: () => KP.go({ screen: "plan", vue: "grille", fiche: "" }) },
      { nom: "Réunion, ordre du jour", icon: "meet", go: () => KP.go({ screen: "reunion", tab: "ordre", fiche: "" }) },
      { nom: "Réunion, bilan", icon: "meet", go: () => KP.go({ screen: "reunion", tab: "bilan", fiche: "" }) },
      { nom: "Nouveautés et version", icon: "info", go: () => KP.go({ screen: "reglages", set: "apropos", fiche: "" }) },
      { nom: "Réglages", icon: "gear", go: () => KP.go({ screen: "reglages", set: "profil", fiche: "" }) },
      ...KP.PERIODS.map((p) => ({ nom: `Période ${p.nom}`, icon: "calendar", go: () => KP.go({ screen: "plan", per: p.k, fiche: "" }) })),
    ];
    const d = KP.dialog(`<div class="q">${ic("search")}<input type="text" placeholder="Chercher une action, un temps fort, un écran…" aria-label="Rechercher" autocomplete="off"><kbd>Échap</kbd><button type="button" class="ib cmdk-x" data-close aria-label="Fermer la recherche">${ic("close")}</button></div><div class="res" role="listbox"></div>`, { cls: "cmdk" });
    const inp = d.querySelector("input"), res = d.querySelector(".res");
    let list = [], cur = 0;
    const draw = () => {
      const q = KP.norm(inp.value.trim());
      const its = store.items().filter((i) => !q || KP.norm(i.t + " " + (i.lieu || "") + " " + (i.partner || "")).includes(q)).sort((a, b) => Math.abs(KP.diff(a.date, KP.TODAY)) - Math.abs(KP.diff(b.date, KP.TODAY))).slice(0, q ? 12 : 5);
      const cs = cmds.filter((c) => !q || KP.norm(c.nom).includes(q)).slice(0, q ? 6 : 7);
      list = [...its.map((i) => ({ it: i })), ...cs]; cur = Math.min(cur, Math.max(0, list.length - 1));
      let n = 0;
      res.innerHTML = (its.length ? `<h4>${q ? "Dans le plan" : "Proche d'aujourd'hui"}</h4>` + its.map((i) => `<button type="button" class="pop-i${n === cur ? " cur" : ""}" data-n="${n++}">${i.kind === "tf" ? '<i class="tfdot"></i>' : ic("doc")}<span>${h(i.t)}<small>${h(KP.kindName(i))} · ${h(KP.dateLong(i))}</small></span></button>`).join("") : "") +
        (cs.length ? `<h4>Aller à</h4>` + cs.map((c) => `<button type="button" class="pop-i${n === cur ? " cur" : ""}" data-n="${n++}">${ic(c.icon)}<span>${h(c.nom)}</span></button>`).join("") : "") +
        (!list.length ? `<p class="txt" style="padding:18px 12px">Rien ne correspond à « ${h(inp.value)} ».</p>` : "");
      const c = res.querySelector(".cur"); if (c) c.scrollIntoView({ block: "nearest" });
    };
    const run = (i) => { const x = list[i]; if (!x) return; d.close(); if (x.it) KP.go({ screen: "plan", per: x.it.variant === "sujet" ? x.it.per : KP.periodOf(x.it.date).k, svc: "", msg: "", type: "", fiche: x.it.id }); else x.go(); };
    inp.addEventListener("input", () => { cur = 0; draw(); });
    d.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); cur = Math.min(list.length - 1, cur + 1); draw(); }
      if (e.key === "ArrowUp") { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
      if (e.key === "Enter") { e.preventDefault(); run(cur); }
    });
    res.addEventListener("click", (e) => { const b = e.target.closest("[data-n]"); if (b) run(+b.dataset.n); });
    draw(); inp.focus();
  };

  /* ---------- version : qui utilise quoi, et prévenir quand une plus récente est en ligne ---------- */
  KP.embedded = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  let latest = "";
  KP.checkVersion = async (manual) => {
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw 0;
      const v = (await r.json()).version;
      if (v && v !== KP.VERSION.n) { if (latest !== v || manual) { latest = v; KP.maj = () => { const box = $("toasts"); if (!box.querySelector(".toast")) box.innerHTML = `<div class="toast"><span>La version ${h(KP.versionLabel(v))} est en ligne.</span><button type="button" data-act="reload">Mettre à jour</button></div>`; }; $("toasts").innerHTML = ""; KP.maj(); } }
      else if (manual) KP.toast("Tu as la dernière version");
    } catch (e) { if (manual) KP.toast("Impossible de vérifier, pas de réseau ?"); }
  };
  KP.acts.reload = async () => { try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) {} location.reload(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) KP.checkVersion(); });
  setInterval(() => KP.checkVersion(), 30 * 60 * 1000);
  if (!KP.embedded && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

  document.addEventListener("DOMContentLoaded", () => { if (!location.hash) history.replaceState(null, "", "#/accueil"); KP.route = parseHash(); render(); });
})();
