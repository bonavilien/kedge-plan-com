// =====================================================================
// KEDGE UI · comportements génériques, sans dépendance ni logique métier.
// Script classique (pas de module, pas de build) : expose window.KUI.
// Charger après icons.js :  <script src="components/icons.js"></script><script src="components/ui.js"></script>
// =====================================================================
window.KUI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const I = window.KUI_ICONS || {};
  // ---------- texte ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) => String(name).split(/[\s-]+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const plural = (n, word, many) => `${n} ${n > 1 ? many || word + "s" : word}`;
  const fr = {
    num: (n, d = 0) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }),
    day: (dt) => dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase()),
    list: (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} et ${a[a.length - 1]}`),
  };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAndroid = () => app?.dataset.os === "android";

  // ---------- coque, système, thème ----------
  let app = null, themeKey = "kui-theme", lastFocus = null, snackT = 0;
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");
  const state = { theme: "system", tab: null, stack: [], tabs: {} };

  function init(root = $(".app"), { os, theme, storageKey } = {}) {
    app = root;
    if (storageKey) themeKey = storageKey;
    app.dataset.os = os || app.dataset.os || (/Android/i.test(navigator.userAgent) ? "android" : "ios");
    let t = theme; if (!t) { try { t = localStorage.getItem(themeKey); } catch (e) {} }
    setTheme(t || "system", false);
    darkMQ.addEventListener?.("change", syncDark);
    overlays();
    app.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    if (reduceMotion()) $$("svg", app).forEach((s) => s.pauseAnimations?.());
    return api;
  }
  function setOS(os) { app.dataset.os = os; refresh(); app.dispatchEvent(new CustomEvent("kui:os", { detail: os })); }
  // « system » suit le téléphone ; « light » et « dark » forcent le thème (data-theme sur <html>)
  function setTheme(t, save = true) {
    state.theme = t;
    const r = document.documentElement;
    t === "system" ? r.removeAttribute("data-theme") : r.setAttribute("data-theme", t);
    if (save) { try { localStorage.setItem(themeKey, t); } catch (e) {} }
    syncDark();
  }
  function syncDark() {
    const t = document.documentElement.dataset.theme;
    const dark = t === "dark" || (t !== "light" && darkMQ.matches);
    if (app) app.dataset.dark = dark ? "1" : "0";
    $$('meta[name="theme-color"]').forEach((m) => { m.content = dark ? "#0F1012" : "#F2F2EF"; });
  }
  function overlays() {
    if (!$(".scrim", app)) app.insertAdjacentHTML("beforeend", `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="kui-sheet-title"></div><div class="alert-wrap"><div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="kui-alert-title" aria-describedby="kui-alert-text"><h2 id="kui-alert-title"></h2><p id="kui-alert-text"></p><div class="acts"></div></div></div><div class="snack" role="status" aria-live="polite"></div>`);
    $(".scrim", app).addEventListener("click", () => sheet.close());
  }

  // ---------- barre du haut ----------
  // back : libellé du bouton retour (iOS l'affiche, Android montre une flèche) ; actions : HTML des boutons de droite
  function navbar({ title = "", back = "", actions = "" } = {}) {
    const lead = back ? `<div class="nb-lead"><button type="button" class="back" data-kui="back" aria-label="Retour${back === "Retour" ? "" : " : " + esc(back)}">${isAndroid() ? I.arrowL : I.chevL}<span>${esc(back)}</span></button></div>` : `<div class="nb-lead"></div>`;
    return `<header class="nb">${lead}<span class="nb-title">${esc(title)}</span><div class="nb-trail">${actions}</div></header>`;
  }
  const iconBtn = (icon, label, attrs = "") => `<button type="button" class="icon-btn" aria-label="${esc(label)}" ${attrs}>${I[icon] || ""}</button>`;
  // le titre en ligne d'iOS apparaît quand le grand titre sort de l'écran
  function wireScroll(view) {
    const sc = $(".scroll", view); if (!sc || sc.dataset.kuiScroll) return;
    sc.dataset.kuiScroll = "1";
    const on = () => view.classList.toggle("scrolled", sc.scrollTop > 36);
    sc.addEventListener("scroll", on, { passive: true }); on();
  }
  function keepScroll(view, fn) {
    const keep = $(".scroll", view)?.scrollTop || 0;
    fn();
    const sc = $(".scroll", view); if (sc) { sc.scrollTop = keep; delete sc.dataset.kuiScroll; }
    wireScroll(view);
  }

  // ---------- navigation : onglets + pile d'écrans ----------
  // tabs({ accueil: { label, icon, render(el) }, … }) : crée les vues et la barre d'onglets
  function tabs(def, { first } = {}) {
    state.tabs = def;
    let views = $(".views", app);
    if (!views) { views = document.createElement("div"); views.className = "views"; app.prepend(views); }
    Object.entries(def).forEach(([k, t]) => {
      if (!$(`#v-${k}`, app)) views.insertAdjacentHTML("beforeend", `<section class="view" id="v-${k}" aria-label="${esc(t.label)}" hidden></section>`);
    });
    let bar = $(".tabbar", app);
    if (!bar) { bar = document.createElement("nav"); bar.className = "tabbar"; bar.setAttribute("aria-label", "Onglets"); views.after(bar); }
    bar.innerHTML = Object.entries(def).map(([k, t]) => `<button type="button" class="tab" data-kui-tab="${k}"><span class="pill">${I[t.icon] || ""}</span><span>${esc(t.label)}</span></button>`).join("");
    showTab(first || Object.keys(def)[0], { animate: false });
  }
  function showTab(k, { animate = true } = {}) {
    state.stack.forEach((e) => e.el.remove()); state.stack = [];
    state.tab = k; app.dataset.tab = k; app.dataset.pushed = "0";
    $$(".tab", app).forEach((b) => (b.dataset.kuiTab === k ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    Object.keys(state.tabs).forEach((key) => { $(`#v-${key}`, app).hidden = key !== k; });
    const v = $(`#v-${k}`, app);
    renderTab(k); syncInert();
    if (animate && isAndroid()) { v.classList.remove("fade"); void v.offsetWidth; v.classList.add("fade"); }
    if (animate) stagger(v);
    app.dispatchEvent(new CustomEvent("kui:tab", { detail: k }));
  }
  const renderTab = (k) => keepScroll($(`#v-${k}`, app), () => state.tabs[k].render($(`#v-${k}`, app)));
  // push(render, { title }) : ouvre un écran par-dessus ; render(el, { back }) remplit l'écran
  function push(render, { title = "" } = {}) {
    const el = document.createElement("section");
    el.className = "view pushed"; el.setAttribute("aria-label", title);
    $(".views", app).append(el);
    const back = state.stack.length ? state.stack[state.stack.length - 1].title : state.tabs[state.tab].label;
    const entry = { el, render, title, back: back.length > 13 ? "Retour" : back };
    state.stack.push(entry); app.dataset.pushed = "1";
    keepScroll(el, () => render(el, { back: entry.back })); syncInert();
    el.classList.add("enter"); setTimeout(() => el.classList.remove("enter"), 400);
    setTimeout(() => $(".back", el)?.focus({ preventScroll: true }), 50);
    return el;
  }
  function pop() {
    const e = state.stack.pop(); if (!e) return;
    app.dataset.pushed = state.stack.length ? "1" : "0";
    syncInert();
    const el = e.el; el.inert = true; el.classList.remove("enter"); void el.offsetWidth; el.classList.add("leave");
    reduceMotion() ? el.remove() : setTimeout(() => el.remove(), 300);
  }
  // re-dessine l'onglet et la pile (après un changement de données, de système ou de thème)
  function refresh() {
    if (state.tab) renderTab(state.tab);
    state.stack.forEach((e) => keepScroll(e.el, () => e.render(e.el, { back: e.back })));
    syncInert();
  }
  const topView = () => (state.stack.length ? state.stack[state.stack.length - 1].el : $(`#v-${state.tab}`, app));
  // keepBase() vrai : l'onglet reste utilisable sous l'écran ouvert par-dessus (fiche en panneau sur grand écran)
  let keepBase = () => false;
  const setKeepBase = (f) => { keepBase = f; syncInert(); };
  function syncInert() { const top = topView(), base = $(`#v-${state.tab}`, app), keep = state.stack.length && keepBase();
    $$(".views > .view", app).forEach((v) => { v.inert = v !== top && !(keep && v === base); }); }

  // ---------- feuille ----------
  // sheet.open({ title, cancel, ok, body, full, onOk }) : onOk peut renvoyer false (ou une promesse de false) pour garder la feuille ouverte
  const sheet = {
    open({ title = "", cancel = "Annuler", ok = "", body = "", full = false, onOk = null } = {}) {
      const s = $(".sheet", app);
      lastFocus = document.activeElement;
      const head = isAndroid()
        ? `<div class="sheet-grab"></div><div class="sheet-head"><button type="button" class="icon-btn" data-kui="close" aria-label="${esc(cancel)}">${I.close}</button><h2 id="kui-sheet-title">${esc(title)}</h2>${ok ? `<button type="button" class="txt-btn strong" data-kui="ok">${esc(ok)}</button>` : "<span></span>"}</div>`
        : `<div class="sheet-grab"></div><div class="sheet-head"><button type="button" class="txt-btn l" data-kui="close">${esc(cancel)}</button><h2 id="kui-sheet-title">${esc(title)}</h2>${ok ? `<button type="button" class="txt-btn strong r" data-kui="ok">${esc(ok)}</button>` : ""}</div>`;
      s.className = "sheet" + (full && isAndroid() ? " full" : "");
      s.innerHTML = head + `<div class="sheet-body">${body}</div>`;
      s._onOk = onOk;
      $(".scrim", app).classList.add("show"); requestAnimationFrame(() => s.classList.add("show"));
      setTimeout(() => (s.querySelector(".sheet-body input:not([type=checkbox]), .sheet-body select, .sheet-body button") || s).focus({ preventScroll: true }), 80);
      return s;
    },
    close() {
      $(".sheet", app)?.classList.remove("show"); $(".scrim", app)?.classList.remove("show");
      if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    },
    async ok(btn) {
      const s = $(".sheet", app); if (btn.disabled) return;
      btn.disabled = true;
      try { const r = s._onOk ? await s._onOk(s) : true; if (r !== false) sheet.close(); }
      finally { btn.disabled = false; }
    },
  };

  // ---------- alerte : renvoie une promesse (true = action confirmée) ----------
  function alert({ title = "", text = "", cancel = "Annuler", ok = "OK", danger = false } = {}) {
    return new Promise((resolve) => {
      const w = $(".alert-wrap", app);
      lastFocus = document.activeElement;
      $("#kui-alert-title", w).textContent = title; $("#kui-alert-text", w).innerHTML = text;
      $(".acts", w).innerHTML = `${cancel ? `<button type="button" data-a="0">${esc(cancel)}</button>` : ""}<button type="button" data-a="1"${danger ? ' class="danger"' : ""}>${esc(ok)}</button>`;
      w.classList.add("show"); setTimeout(() => $(".acts button:last-child", w).focus(), 50);
      w.onclick = (e) => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        w.classList.remove("show"); w.onclick = null;
        if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
        resolve(b.dataset.a === "1");
      };
    });
  }
  // ---------- message bref ----------
  function snack(html, ms = 3400) {
    const s = $(".snack", app); s.innerHTML = html; s.classList.add("show");
    clearTimeout(snackT); snackT = setTimeout(() => s.classList.remove("show"), ms);
  }

  // ---------- contrôles : délégation d'événements ----------
  // [data-seg] : un seul choix ; [data-chips="multi"] : plusieurs ; [data-stepper] : − / + bornés. Événement « kui:change ».
  function onClick(e) {
    const t = e.target.closest("button, a"); if (!t || !app.contains(t)) return;
    const k = t.dataset.kui;
    if (t.dataset.kuiTab) { if (t.dataset.kuiTab === state.tab && !state.stack.length) $(".scroll", topView())?.scrollTo({ top: 0, behavior: "smooth" }); else showTab(t.dataset.kuiTab); return; }
    if (k === "back") { pop(); return; }
    if (k === "close") { sheet.close(); return; }
    if (k === "ok") { sheet.ok(t); return; }
    const seg = t.closest("[data-seg]");
    if (seg && t.parentElement === seg) {
      $$("button", seg).forEach((b) => b.setAttribute("aria-pressed", b === t));
      seg.dispatchEvent(new CustomEvent("kui:change", { bubbles: true, detail: t.value || t.dataset.value || t.textContent.trim() }));
      return;
    }
    const chips = t.closest("[data-chips]");
    if (chips && t.classList.contains("chip")) {
      if (chips.dataset.chips === "multi") t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true");
      else $$(".chip", chips).forEach((b) => b.setAttribute("aria-pressed", b === t));
      chips.dispatchEvent(new CustomEvent("kui:change", { bubbles: true, detail: $$('.chip[aria-pressed="true"]', chips).map((b) => b.value || b.dataset.value) }));
      return;
    }
    const st = t.closest("[data-stepper]");
    if (st && t.dataset.step) {
      const min = +(st.dataset.min ?? -Infinity), max = +(st.dataset.max ?? Infinity), step = +t.dataset.step;
      const v = Math.min(max, Math.max(min, +(st.dataset.value || 0) + step));
      st.dataset.value = v;
      $$("[data-step]", st).forEach((b) => { b.disabled = (+b.dataset.step < 0 && v <= min) || (+b.dataset.step > 0 && v >= max); });
      const out = st.dataset.for && document.querySelector(st.dataset.for);
      if (out) { out.textContent = st.dataset.format === "pace" ? pace(v) : fr.num(v); tick(out, step > 0 ? "up" : "down"); }
      st.dispatchEvent(new CustomEvent("kui:change", { bubbles: true, detail: v }));
    }
  }
  // Échap = geste retour : alerte, puis feuille, puis écran
  function onKey(e) {
    if (e.key !== "Escape" || !app) return;
    const w = $(".alert-wrap.show", app); if (w) { $('[data-a="0"]', w)?.click(); return; }
    if ($(".sheet.show", app)) { sheet.close(); return; }
    if (state.stack.length) pop();
  }

  // ---------- petites animations ----------
  function stagger(view) {
    if (reduceMotion()) return;
    $$(".group > *, .panel, .seg", view).slice(0, 14).forEach((el, i) => el.style.setProperty("--i", i));
    view.classList.remove("stagger"); void view.offsetWidth; view.classList.add("stagger");
    setTimeout(() => view.classList.remove("stagger"), 1000);
  }
  function bump(el) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  function tick(el, dir = "up") { el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(dir === "up" ? "tick-up" : "tick-down"); }
  const pace = (s) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}`;

  // ---------- avatars ----------
  // avatars([{ name, hl, me }], 4) : pile de pastilles ; « me » s'affiche « TOI »
  function avatars(list, max = 4) {
    return `<span class="avs" aria-hidden="true">${list.slice(0, max).map((p) => (p.me ? `<i class="me">TOI</i>` : `<i class="${p.hl ? "hl" : ""}">${esc(p.initials || initials(p.name || ""))}</i>`)).join("")}</span>`;
  }

  // ---------- grands arcs sombres (illustration de marque) ----------
  // arcs({ animated }) : virage de piste à 5 couloirs, pions qui courent seulement si animated (écran d'accueil)
  function arcs({ animated = false } = {}) {
    const run = (r, dur, begin, dot) => `<g opacity="${animated ? 0 : 1}">${dot}${animated ? `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="M${430 - r} 340 A${r} ${r} 0 0 1 430 ${340 - r}"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.82;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` : ""}</g>`;
    const at = (r, a) => [430 - r * Math.cos(a), 340 - r * Math.sin(a)].map((v) => v.toFixed(1));
    const dot = (r, a, fill) => animated ? `<circle r="9" fill="${fill}"/>` : `<circle cx="${at(r, a)[0]}" cy="${at(r, a)[1]}" r="9" fill="${fill}"/>`;
    const me = (r, a) => animated ? `<rect x="-17" y="-10" width="34" height="20" rx="10" fill="#F4F4F2" stroke="var(--brand)" stroke-width="2.5"/><text y="4" font-size="9" font-weight="700" fill="#333539" text-anchor="middle" letter-spacing=".06em">TOI</text>`
      : `<g transform="translate(${at(r, a).join(" ")})"><rect x="-17" y="-10" width="34" height="20" rx="10" fill="#F4F4F2" stroke="var(--brand)" stroke-width="2.5"/><text y="4" font-size="9" font-weight="700" fill="#333539" text-anchor="middle" letter-spacing=".06em">TOI</text></g>`;
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" font-family="-apple-system, Segoe UI, Inter, Roboto, sans-serif">
      <path d="M130 340 A300 300 0 0 1 430 40 L430 170 A170 170 0 0 0 260 340 Z" fill="#333539"/>
      <g fill="none" stroke="#B3B4B6" stroke-width="1.5"><path d="M234 340 A196 196 0 0 1 430 144"/><path d="M208 340 A222 222 0 0 1 430 118"/><path d="M182 340 A248 248 0 0 1 430 92"/><path d="M156 340 A274 274 0 0 1 430 66"/></g>
      <path d="M130 312 H260" stroke="#F4F4F2" stroke-width="3"/>
      <g fill="#F4F4F2" font-size="13" font-weight="700" text-anchor="middle"><text x="247" y="333">1</text><text x="221" y="333">2</text><text x="195" y="333">3</text><text x="169" y="333">4</text><text x="143" y="333">5</text></g>
      ${run(209, 6.2, -1.5, dot(209, .55, "var(--brand)"))}${run(235, 7.4, -3.4, me(235, .95))}${run(261, 8.8, -5.5, dot(261, 1.25, "var(--brand)"))}${run(287, 9.9, -2.2, animated ? `<circle r="8" fill="#333539" stroke="#A3A5AA" stroke-width="1.5"/>` : `<circle cx="${at(287, .4)[0]}" cy="${at(287, .4)[1]}" r="8" fill="#333539" stroke="#A3A5AA" stroke-width="1.5"/>`)}
    </svg>`;
  }

  // ---------- virage de piste (visualisation de marque, à remplir avec ses propres données) ----------
  // bend(el, { lanes: 5, mine: 3, labels: ["…", …], tokens: [{ lane, at: 0..1, label, hl, me }] })
  // Un vrai virage d'athlétisme : arc de cercle puis ligne droite, ligne de départ blanche sur tous les couloirs.
  function bend(el, { lanes = 5, mine = Math.ceil(lanes / 2), labels = [], tokens = [] } = {}) {
    const w = Math.round(el.clientWidth || 340), h = Math.round(el.clientHeight || w * .9);
    const R = Math.max(110, Math.min((w - 10) * 1.22, h - 26)), cx = R + 10 <= w ? R + 10 : w + (R + 10 - w), cy = h;
    const lw = Math.round(Math.max(18, Math.min(30, R * .11))), r0 = R - lanes * lw, base = 28, tr = Math.min(12, lw / 2 - 2), labelW = labels.length ? 64 : 0;
    const rOf = (k) => r0 + (k - .5) * lw, xr = Math.max(cx, w + 2);
    const edgeY = (r, X) => (X >= cx ? cy - r : cy - Math.sqrt(Math.max(0, r * r - (cx - X) ** 2)));
    const pt = (k, s) => { const r = rOf(k), q = r * Math.PI / 2; if (s <= q) { const a = s / r; return [cx - r * Math.cos(a), cy - r * Math.sin(a)]; } return [cx + s - q, cy - r]; };
    const range = (k) => { const r = rOf(k), q = r * Math.PI / 2, s0 = r * Math.asin(Math.min(1, (base + tr + 6) / r)), xEnd = w - (labelW + tr + 10); const s1 = xEnd >= cx ? q + (xEnd - cx) : r * Math.acos(Math.min(1, (cx - xEnd) / r)); return [s0, Math.max(s0 + 20, s1)]; };
    const sector = (ri, ro) => `M${cx - ro} ${h}A${ro} ${ro} 0 0 1 ${cx} ${h - ro}H${xr}V${h - ri}H${cx}A${ri} ${ri} 0 0 0 ${cx - ri} ${h}Z`;
    const edge = (r) => `M${cx - r} ${h}A${r} ${r} 0 0 1 ${cx} ${h - r}H${xr}`;
    let s = "";
    for (let k = 1; k <= lanes; k++) { const ri = r0 + (k - 1) * lw; s += `<path class="${k === mine ? "bd-mine" : Math.abs(k - mine) === 1 ? "bd-zone" : "bd-ground"}" d="${sector(ri, ri + lw)}"/>`; }
    for (let k = 1; k < lanes; k++) s += `<path class="bd-line" d="${edge(r0 + k * lw)}"/>`;
    const yS = h - base, xa = cx - Math.sqrt(R * R - base * base), xb = cx - Math.sqrt(r0 * r0 - base * base);
    s += `<path class="bd-edge" d="${edge(r0)}"/><path class="bd-edge" d="${edge(R)}"/><path class="bd-start" d="M${(xa - 1.5).toFixed(1)} ${yS}H${(xb + 1.5).toFixed(1)}"/>`;
    for (let k = 1; k <= lanes; k++) { const r = rOf(k); s += `<text class="bd-num${k === mine ? " mine" : ""}" x="${(cx - Math.sqrt(r * r - 81)).toFixed(1)}" y="${h - 9}">${k}</text>`; }
    if (R >= 170) labels.forEach((l, i) => { const k = i + 1, x = w - 8; s += `<text class="bd-label${k === mine ? " mine" : ""}" x="${x}" y="${(edgeY(rOf(k), x - labelW / 2) + 4).toFixed(1)}">${esc(l)}</text>`; });
    tokens.forEach((t) => {
      const [s0, s1] = range(t.lane), [x, y] = pt(t.lane, s0 + Math.min(1, Math.max(0, t.at)) * (s1 - s0));
      s += t.me ? `<g class="bd-me" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${tr + 1}"/><text y="3">TOI</text></g>`
        : `<g class="bd-tok${t.hl ? " hl" : ""}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${tr}"/>${tr >= 7 ? `<text y="3.2">${esc(t.label || "")}</text>` : ""}</g>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${s}</svg>`;
  }

  const api = { init, setOS, setTheme, get theme() { return state.theme; }, isAndroid, navbar, iconBtn, wireScroll, keepScroll, tabs, showTab, push, pop, refresh, topView, setKeepBase, sheet, alert, snack, stagger, bump, tick, avatars, arcs, bend, esc, initials, plural, fr, pace, icons: I, reduceMotion };
  return api;
})();
