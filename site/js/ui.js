/* Plan de com KEDGE · V2 — composants communs : menus, fenêtres, message avec « Annuler », calendrier. */
(() => {
  const KP = window.KP;
  const layer = () => document.getElementById("layer");

  KP.h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  KP.ic = (n) => `<span class="ic">${window.KUI_ICONS[n] || ""}</span>`;
  /* bouton icône : toujours un nom lisible (infobulle + lecteur d'écran) */
  KP.ib = (icon, label, act, extra = "") => `<button class="ib" type="button" data-act="${act}" data-tip="${KP.h(label)}" aria-label="${KP.h(label)}" ${extra}>${KP.ic(icon)}</button>`;
  KP.norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  KP.phone = () => window.matchMedia("(max-width: 767px)").matches;
  KP.acts = {};
  KP.views = {};
  KP.ui = { past: false, gx: null, gper: "" };

  /* ---------- menu ancré (feuille du bas sur téléphone) ---------- */
  let closePop = null;
  KP.closePop = () => { if (closePop) closePop(); };
  KP.pop = (anchor, html, opt = {}) => {
    KP.closePop();
    const scrim = document.createElement("div"); scrim.className = "scrim";
    const el = document.createElement("div"); el.className = "pop " + (opt.cls || ""); el.setAttribute("role", "menu"); el.innerHTML = html;
    (anchor.closest("dialog") || layer()).append(scrim, el);
    const place = () => {
      if (KP.phone()) return;
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
      let left = opt.right ? r.right - w : r.left; let top = r.bottom + 6;
      if (opt.side) { left = r.right + 8; top = r.bottom - hh; }
      left = Math.max(8, Math.min(left, innerWidth - w - 8));
      if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
      el.style.left = left + "px"; el.style.top = top + "px";
    };
    place();
    anchor.setAttribute("aria-expanded", "true");
    const out = (e) => { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); anchor.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const b = [...el.querySelectorAll("button:not([disabled])")]; if (!b.length) return;
        e.preventDefault(); const i = b.indexOf(document.activeElement);
        b[(i + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length].focus();
      }
    };
    function close() { el.remove(); scrim.remove(); anchor.removeAttribute("aria-expanded"); document.removeEventListener("mousedown", out, true); document.removeEventListener("keydown", key, true); closePop = null; if (opt.onClose) opt.onClose(); }
    closePop = close;
    scrim.addEventListener("click", close);
    setTimeout(() => { document.addEventListener("mousedown", out, true); document.addEventListener("keydown", key, true); }, 0);
    const first = el.querySelector("[autofocus], button"); if (first && !KP.phone()) first.focus({ preventScroll: true });
    return { el, close, place };
  };

  /* menu de choix : items = [{v, nom, info, icon, danger}] ou "—" pour un trait ; multi garde le menu ouvert */
  KP.menu = (anchor, items, onPick, opt = {}) => {
    const sel = new Set(opt.selected || []);
    const draw = () => (opt.title ? `<h4>${KP.h(opt.title)}</h4>` : "") + items.map((it) => it === "-" ? "<hr>" :
      `<button type="button" class="pop-i${it.danger ? " danger" : ""}" role="menuitem" data-v="${KP.h(it.v)}">${it.icon ? KP.ic(it.icon) : ""}<span>${KP.h(it.nom)}${it.info ? `<small>${KP.h(it.info)}</small>` : ""}</span>${sel.has(it.v) ? `<span class="r">${KP.ic("check")}</span>` : it.hint ? `<span class="r">${KP.h(it.hint)}</span>` : ""}</button>`).join("");
    const p = KP.pop(anchor, draw(), opt);
    p.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]"); if (!b) return;
      const v = b.dataset.v;
      if (opt.multi) { sel.has(v) ? sel.delete(v) : sel.add(v); onPick([...sel]); p.el.innerHTML = draw(); const again = p.el.querySelector(`[data-v="${CSS.escape(v)}"]`); if (again) again.focus(); }
      else { p.close(); onPick(v); }
    });
    return p;
  };

  /* ---------- fenêtre ---------- */
  KP.dialog = (html, opt = {}) => {
    const d = document.createElement("dialog"); d.className = "dlg " + (opt.cls || ""); d.innerHTML = html;
    layer().append(d);
    d.addEventListener("close", () => { d.remove(); if (opt.onClose) opt.onClose(); });
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); if (e.target.closest("[data-close]")) d.close(); });
    d.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { const f = d.querySelector("form"); if (f) f.requestSubmit(); } });
    d.showModal();
    return d;
  };

  /* ---------- message bref, avec « Annuler » pendant 5 secondes ---------- */
  KP.toast = (text, undo) => {
    const box = document.getElementById("toasts"); box.innerHTML = "";
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = `<span>${KP.h(text)}</span>` + (undo ? `<button type="button">Annuler</button>` : "");
    box.append(t);
    /* le message « nouvelle version » revient après chaque message bref, tant qu'on n'a pas mis à jour */
    const kill = setTimeout(() => { t.remove(); if (KP.maj) KP.maj(); }, undo ? 5000 : 2600);
    if (undo) t.querySelector("button").addEventListener("click", () => { clearTimeout(kill); t.remove(); undo(); KP.toast("Annulé"); });
  };

  /* ---------- calendrier français (jamais le champ date du navigateur) ---------- */
  KP.datepick = (anchor, value, onPick, opt = {}) => {
    let cur = KP.parse(value || KP.TODAY); cur.setDate(1);
    const draw = () => {
      const y = cur.getFullYear(), m = cur.getMonth();
      const start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
      let cells = "";
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const s = KP.iso(d);
        cells += `<button type="button" data-d="${s}" class="${d.getMonth() !== m ? "out" : ""}${s === KP.TODAY ? " today" : ""}${s === value ? " on" : ""}" aria-label="${KP.h(KP.fmt.long(s))}">${d.getDate()}</button>`;
      }
      return `<div class="cal"><div class="cal-h"><button type="button" class="ib" data-m="-1" aria-label="Mois précédent">${KP.ic("chevL")}</button><b>${KP.MOIS[m]} ${y}</b><button type="button" class="ib" data-m="1" aria-label="Mois suivant">${KP.ic("chevR")}</button></div>
        <div class="cal-g">${["L", "M", "M", "J", "V", "S", "D"].map((j) => `<span>${j}</span>`).join("")}${cells}</div>
        ${opt.month ? `<button type="button" class="cal-m" data-d="${y}-${String(m + 1).padStart(2, "0")}">${KP.ic("calendar")}<span>Courant ${KP.MOIS[m]}<small>Je n'ai pas encore la date précise</small></span></button>` : ""}
        <div class="cal-f"><button type="button" class="link soft" data-d="${KP.TODAY}">Aujourd'hui</button>${opt.clear ? `<button type="button" class="link soft" data-d="">Retirer</button>` : ""}</div></div>`;
    };
    const p = KP.pop(anchor, draw(), { ...opt, cls: "pop-cal" });
    p.el.addEventListener("click", (e) => {
      const m = e.target.closest("[data-m]"); if (m) { cur.setMonth(cur.getMonth() + +m.dataset.m); p.el.innerHTML = draw(); p.place(); return; }
      const d = e.target.closest("[data-d]"); if (d) { p.close(); onPick(d.dataset.d); }
    });
    const on = p.el.querySelector(".on") || p.el.querySelector(".today"); if (on && !KP.phone()) on.focus();
    return p;
  };

  /* zone de texte qui grandit avec son contenu */
  KP.autosize = (root) => root.querySelectorAll("textarea[data-auto]").forEach((t) => {
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
    fit(); t.addEventListener("input", fit);
  });

  /* ---------- petits morceaux partagés par les écrans ---------- */
  /* petite fenêtre qui demande un motif (facultatif) */
  KP.motif = (titre, sous, ok, cb) => {
    const d = KP.dialog(`<form method="dialog"><h2>${KP.h(titre)}</h2>${sous ? `<p class="muted" style="margin-top:-8px">${KP.h(sous)}</p>` : ""}
      <label class="field"><span>Pourquoi ? Les services concernés le liront</span><input class="input" name="m" id="motif" placeholder="Salle indisponible, intervenant absent…" autocomplete="off"></label>
      <div class="foot"><button type="button" class="btn quiet" data-close>Ne rien changer</button><button class="btn primary">${KP.h(ok)}</button></div></form>`);
    d.querySelector("input").focus();
    d.querySelector("form").addEventListener("submit", () => cb(new FormData(d.querySelector("form")).get("m").trim()));
  };
  KP.recent = (x) => !!x && x.quand > Date.now() - 14 * 864e5;
  KP.pill = (it, editable) => {
    if (it.annule) return `<span class="pill annule">Annulé</span>`;
    const s = KP.STATUTS.find((x) => x.k === it.st) || KP.STATUTS[0];
    const inner = (it.st === "diffuse" ? KP.ic("check") : "") + KP.h(s.nom);
    return editable ? `<button type="button" class="pill ${s.k}" data-act="row-st" data-id="${it.id}" aria-label="État : ${KP.h(s.nom)}. Changer">${inner}</button>` : `<span class="pill ${s.k}">${inner}</span>`;
  };
  KP.due = (r) => !r.fait && r.pour < KP.TODAY ? `attendu ${KP.fmt.relatif(r.pour)}` : `pour ${KP.fmt.relatif(r.pour)}`;
  KP.kindName = (it) => it.variant === "sujet" ? "Sujet de la période" : it.variant === "classement" ? "Classement" : it.kind === "tf" ? "Temps fort" : it.variant === "partenariat" ? "Partenariat payant" : "Action";
  KP.msgNames = (it) => it.m.map((k) => (KP.message(k) || {}).nom).filter(Boolean).join(", ");
  KP.dateLong = (it) => it.flou ? `courant ${KP.fmt.mois(it.date)}` : KP.fmt.plage(it.date, it.fin);
  KP.dateShort = (it) => it.flou ? `courant ${KP.fmt.moisC(it.date)}` : KP.fmt.moyen(it.date);
  KP.dateCell = (it) => it.flou ? `<span class="tbc"><span class="wide">courant </span>${KP.fmt.moisC(it.date)}</span>` : `<b>${KP.fmt.court(it.date)}</b>${it.fin && it.fin !== it.date ? ` → ${KP.parse(it.fin).getDate()}` : ""}`;
  /* une ligne du plan, la même partout (liste, accueil, réunion) */
  KP.row = (it, opt = {}) => {
    const par = it.tf && KP.store.get(it.tf);
    const svc = it.kind === "tf" ? "" : it.variant === "partenariat" ? it.partner || "Média à choisir" : (KP.service(it.svc) || {}).nom || "";
    return `<div class="row ${it.kind === "tf" ? "tf" : ""}${it.annule ? " off" : ""}${KP.route && KP.route.fiche === it.id ? " sel" : ""}" role="button" tabindex="0" data-act="open" data-id="${it.id}">
      <span class="d">${opt.date || KP.dateCell(it)}</span>
      <span class="t">${it.kind === "tf" ? '<i class="tfdot"></i>' : ""}<span class="tt">${KP.h(it.t)}</span>${it.variant === "classement" && it.rang ? `<span class="rang">${KP.h(it.rang)}</span>` : ""}${!it.annule && KP.recent(it.report) ? `<span class="badge">Reporté</span>` : ""}${it.variant === "partenariat" ? `<span class="badge">Payant</span>` : ""}${opt.sub ? `<small>${KP.h(opt.sub)}</small>` : par ? `<small>pour ${KP.h(par.t)}</small>` : it.variant === "classement" && it.cible ? `<small>objectif ${KP.h(it.cible)}</small>` : ""}</span>
      ${opt.slim ? "" : `<span class="svc">${KP.h(svc)}</span><span class="msg">${KP.h(KP.msgNames(it))}</span>`}
      ${opt.mid != null ? opt.mid : ""}
      <span class="st">${KP.pill(it, KP.store.canEdit(it))}</span>${opt.end || ""}
    </div>`;
  };
})();
