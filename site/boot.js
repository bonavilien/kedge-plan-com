// Plan de com KEDGE : écran d'accueil (la route vers le top SIGEM), connexion, puis chargement de l'appli (app.js).
(() => {
  const K = window.KUI, I = K.icons, esc = K.esc, Store = window.KStore, CFG = window.KPLAN_CONFIG, SIGEM = CFG.sigem;
  const app = document.getElementById("app"), brand = document.getElementById("brand"), form = document.getElementById("bs-form");
  I.bookmark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v16l-5-3.6L7 20z"/></svg>';
  I.megaphone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3.5L15 18.5v-13L7.5 10z"/><path d="M18.5 9.2a4 4 0 0 1 0 5.6"/><path d="M7.5 14l1.3 5h2.4l-1-4.4"/></svg>';
  I.board = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="11.5" rx="1.5"/><path d="M12 15.5V20M8.5 20h7"/><path d="M7.5 12l3-3 2 2 4-4"/></svg>';
  K.init(app, { storageKey: "kplan-theme" });
  // notifications et appli installable
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // la route vers le top SIGEM, vue de dessus : chaque école est une voiture ; KEDGE arrive et écrase l'école juste devant,
  // les deux suivantes attendent plus loin, le panneau de l'objectif au bout
  const roadSVG = (() => {
    const RY = "#FFD452", RA = "#333539", RW_ = "#FFFFFF", f = (v) => (+v).toFixed(1);
    // courbe lisse passant par des points, avec position et direction à une fraction de sa longueur
    function curve(pts, n = 600) {
      const seg = pts.length - 1, out = [], m = Math.ceil(n / seg);
      for (let i = 0; i < seg; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(seg, i + 2)];
        for (let k = 0; k < m; k++) {
          const t = k / m, t2 = t * t, t3 = t2 * t;
          const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
          out.push([c(0), c(1)]);
        }
      }
      out.push(pts[seg]);
      const L = [0];
      for (let i = 1; i < out.length; i++) L.push(L[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
      const tot = L[L.length - 1];
      const at = (s) => {
        const d = s * tot; let i = L.findIndex((v) => v >= d); if (i < 1) i = 1;
        const a = out[i - 1], b = out[i], r = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
        return { x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, a: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
      };
      // le point de la route le plus proche d'un repère, avec sa direction
      const near = (x, y) => {
        let i = 1, best = Infinity;
        out.forEach((q, j) => { const d = Math.hypot(q[0] - x, q[1] - y); if (j && d < best) { best = d; i = j; } });
        const a = out[i - 1], b = out[i];
        return { x: b[0], y: b[1], a: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
      };
      return { d: "M" + out.map((p) => f(p[0]) + " " + f(p[1])).join("L"), at, near };
    }

    // voiture vue de dessus, avant vers le haut
    function carTop(body, crushed) {
      const roof = body === RY ? "#EDBE34" : "#E4E4DF";
      if (crushed) return `<path d="M-13 -16Q-13 -24 -5 -24H5Q13 -24 13 -16V4L10 9 6 3 2 10 -2 3 -6 9 -10 3 -13 7Z" fill="${body}" stroke="${RA}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-10 -12Q0 -16 10 -12L8 -5H-8Z" fill="${RA}"/><path d="M-8 -3H8L7 2 3 0 0 3 -3 0 -7 2Z" fill="${roof}"/>`;
      return `<rect x="-13" y="-24" width="26" height="48" rx="8" fill="${body}" stroke="${RA}" stroke-width="1.6"/><path d="M-10 -12Q0 -16 10 -12L8 -4H-8Z" fill="${RA}"/><rect x="-8" y="-2" width="16" height="12" rx="3" fill="${roof}"/><path d="M-8 13H8L9.5 17.5Q0 19.5 -9.5 17.5Z" fill="${RA}"/>`;
    }
    function burst(r1, r2, n = 9) {
      const p = []; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = (Math.PI * i) / n - Math.PI / 2; p.push(f(Math.cos(a) * r) + "," + f(Math.sin(a) * r)); }
      return `<polygon points="${p.join(" ")}" fill="${RW_}" stroke="${RA}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    function label(x, y, rank, nom, anchor, big) {
      return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" fill="${RA}"><tspan font-size="${big ? 15 : 13}" font-weight="700" fill-opacity=".7">${rank}e</tspan><tspan dx="5" font-size="${big ? 24 : 19}" font-weight="800">${esc(nom)}</tspan></text>`;
    }
    function sign(x, y, cible, w = 68) {
      return `<g transform="translate(${f(x)} ${f(y)})"><line x1="0" y1="0" x2="0" y2="-26" stroke="${RA}" stroke-width="3" stroke-linecap="round"/><rect x="${-w / 2}" y="-66" width="${w}" height="42" rx="5" fill="${RW_}" stroke="${RA}" stroke-width="3"/><text y="-42" text-anchor="middle" font-size="19" font-weight="800" fill="${RA}">TOP ${cible}</text><text y="-30" text-anchor="middle" font-size="9" font-weight="700" letter-spacing=".12em" fill="${RA}">SIGEM</text></g>`;
    }

    // ordinateur : la route monte en lacets dans la colonne de gauche, les noms à côté des voitures
    const vertical = () => {
      const S = SIGEM;
      const road = curve([[188, 450], [186, 372], [154, 304], [150, 240], [194, 178], [216, 118], [198, 50], [192, -40]]);
      const RW = 66;
      const bed = `<path d="${road.d}" fill="none" stroke="${RA}" stroke-width="${RW}"/><path d="${road.d}" fill="none" stroke="${RW_}" stroke-width="${RW - 10}" stroke-opacity=".9"/><path d="${road.d}" fill="none" stroke="${RA}" stroke-width="${RW - 14}"/><path d="${road.d}" fill="none" stroke="${RY}" stroke-width="3" stroke-dasharray="13 13"/>`;
      // côté du libellé : celui où il y a le plus de place
      const side = (p) => (p.x < 180 ? 1 : -1);
      const place = (s, rank, nom, opts = {}) => {
        const p = road.at(s), rot = p.a + 90 + (opts.spin || 0), sc = opts.big ? 1.3 : 1.12;
        const sd = opts.side ?? side(p), lx = p.x + sd * (RW / 2 + 14), anchor = sd > 0 ? "start" : "end";
        const car = `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(rot)}) scale(${sc})">${opts.speed ? `<g stroke="${RW_}" stroke-width="2.4" stroke-linecap="round"><line x1="-8" y1="30" x2="-8" y2="42"/><line x1="0" y1="30" x2="0" y2="47"/><line x1="8" y1="30" x2="8" y2="40"/></g>` : ""}${carTop(opts.body || RW_, opts.crushed)}</g>`;
        return { car, lbl: label(lx, p.y + (opts.dy || 0) + 6, rank, nom, anchor, opts.big), p, rot };
      };
      const [gem, aud, neo] = S.devant;
      const k = place(0.19, S.kedge, "KEDGE", { body: RY, big: true, speed: true, side: 1 });
      const g = place(0.272, gem.r, gem.nom, { crushed: true, spin: -30, side: -1, dy: -4 });
      const hit = road.at(0.24);
      const a = place(0.51, aud.r, aud.nom, {}), n = place(0.705, neo.r, neo.nom, {});
      const end = road.at(0.86);
      return `<svg class="r-v" viewBox="0 0 360 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bed}${n.car}${a.car}${g.car}${k.car}<g transform="translate(${f(hit.x + 15)} ${f(hit.y - 2)})">${burst(11, 4.5)}</g>${k.lbl}${g.lbl}${a.lbl}${n.lbl}${sign(end.x + 66, Math.max(end.y + 20, 84), S.cible)}</svg>`;
    };
    // téléphone et tablette : la route traverse l'écran en lacets, de bord à bord, trois passages jusqu'au Top 7
    const across = () => {
      const S = SIGEM;
      const road = curve([[-700, 352], [-70, 352], [70, 352], [250, 348], [306, 318], [300, 258], [250, 230], [110, 228], [56, 200], [58, 140], [110, 112], [250, 108], [430, 100], [1000, 96]]);
      const RW = 58;
      const bed = `<path d="${road.d}" fill="none" stroke="${RA}" stroke-width="${RW}"/><path d="${road.d}" fill="none" stroke="${RW_}" stroke-width="${RW - 10}" stroke-opacity=".9"/><path d="${road.d}" fill="none" stroke="${RA}" stroke-width="${RW - 14}"/><path d="${road.d}" fill="none" stroke="${RY}" stroke-width="3" stroke-dasharray="13 13"/>`;
      // une voiture posée sur la route au plus près d'un repère ; son nom juste au-dessus
      const place = (x, y, rank, nom, opts = {}) => {
        const p = road.near(x, y), rot = p.a + 90 + (opts.spin || 0), sc = opts.big ? 1.25 : 1.1;
        const car = `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(rot)}) scale(${sc})">${opts.speed ? `<g stroke="${RW_}" stroke-width="2.4" stroke-linecap="round"><line x1="-8" y1="30" x2="-8" y2="42"/><line x1="0" y1="30" x2="0" y2="47"/><line x1="8" y1="30" x2="8" y2="40"/></g>` : ""}${carTop(opts.body || RW_, opts.crushed)}</g>`;
        return { car, lbl: label(p.x + (opts.lx || 0), p.y - RW / 2 - 10, rank, nom, "middle", opts.big) };
      };
      const [gem, aud, neo] = S.devant;
      const k = place(76, 352, S.kedge, "KEDGE", { body: RY, big: true, speed: true });
      const g = place(150, 350, gem.r, gem.nom, { crushed: true, spin: -35, lx: 26 });
      const hit = road.near(117, 351), a = place(176, 229, aud.r, aud.nom), n = place(170, 110, neo.r, neo.nom);
      return `<svg class="r-x" viewBox="0 0 360 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bed}${n.car}${a.car}${g.car}${k.car}<g transform="translate(${f(hit.x)} ${f(hit.y - 3)})">${burst(11, 4.5)}</g>${k.lbl}${g.lbl}${a.lbl}${n.lbl}${sign(314, 108 - RW / 2 - 2, S.cible)}</svg>`;
    };
    return () => vertical() + across();
  })();
  const roadEl = document.getElementById("bs-road");
  roadEl.innerHTML = roadSVG();
  roadEl.setAttribute("aria-label", `Classement SIGEM ${SIGEM.annee} : KEDGE ${SIGEM.kedge}e, juste derrière ${SIGEM.devant.map((s) => `${s.nom} ${s.r}e`).join(", ")}. Objectif top ${SIGEM.cible}.`);
  document.getElementById("bs-title").innerHTML = `Road to <em>Top ${esc(SIGEM.cible)} SIGEM</em>`;
  document.getElementById("bs-badge").textContent = CFG.titre;

  // ---------- connexion : un compte par personne, créé par le chef de projet ----------
  const loginHTML = (msg = "") => `<form class="login" id="login" novalidate>
      <label class="field"><span>E-mail</span><input class="in" id="lg-mail" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="prenom.nom@kedgebs.com"></label>
      <label class="field"><span>Mot de passe</span><input class="in" id="lg-pw" type="password" autocomplete="current-password"></label>
      <p class="err" id="lg-err" role="alert"${msg ? "" : " hidden"}>${esc(msg)}</p>
      <button type="submit" class="btn">Se connecter</button>
      <p class="login-help">Pas encore de compte, ou mot de passe oublié ? Demande-le à ton chef de projet com.</p>
    </form>`;
  const errText = (x) => {
    const m = x?.message || "";
    if (x?.code === "invalid_credentials" || /invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/not confirmed/i.test(m)) return "Ce compte n'est pas encore confirmé. Demande à ton chef de projet de le confirmer.";
    if (m === "periodes") return "La base n'a aucune période : ajoute-les dans Supabase (table periods).";
    if (x?.name === "AuthRetryableFetchError" || /fetch|network|load failed/i.test(m)) return "Pas de connexion à internet. Réessaie.";
    return `Connexion impossible : ${m || "erreur inconnue"}.`;
  };
  const showLogin = (msg) => {
    form.innerHTML = loginHTML(msg);
    brand.hidden = false;
    form.querySelector("#login").addEventListener("submit", onSubmit);
  };
  async function onSubmit(e) {
    e.preventDefault();
    const f = e.target, mail = f.querySelector("#lg-mail"), pw = f.querySelector("#lg-pw"), err = f.querySelector("#lg-err"), btn = f.querySelector("button");
    const say = (t, el) => { err.textContent = t; err.hidden = false; el?.setAttribute("aria-invalid", "true"); el?.focus(); };
    [mail, pw].forEach((x) => x.removeAttribute("aria-invalid"));
    if (!mail.value.trim()) return say("Écris ton e-mail.", mail);
    if (!pw.value) return say("Écris ton mot de passe.", pw);
    btn.disabled = true; btn.textContent = "Connexion…"; err.hidden = true;
    try { await Store.signIn(mail.value.trim(), pw.value); await start(true); }
    catch (x) { say(errText(x)); btn.disabled = false; btn.textContent = "Se connecter"; }
  }
  // données chargées : l'appli se dessine sous l'écran d'accueil, qui glisse vers le bas
  async function start(greet) {
    const data = await Store.load();
    if (!data.PERIODS.length) throw new Error("periodes");
    window.KPlan(data, { greet });
    if (!greet || K.reduceMotion()) { brand.hidden = true; return; }
    brand.classList.add("leaving"); setTimeout(() => { brand.hidden = true; brand.classList.remove("leaving"); }, 340);
  }

  (async () => {
    if (!Store.ready) { form.innerHTML = `<p class="login-help">Le site n'est pas encore relié à sa base de données : il faut remplir config.js.</p>`; brand.hidden = false; return; }
    let s = null;
    try { s = await Store.session(); } catch (x) { /* session illisible : on redemande la connexion */ }
    if (!s) return showLogin();
    try { await start(false); } catch (x) { showLogin(errText(x)); }
  })();
})();
