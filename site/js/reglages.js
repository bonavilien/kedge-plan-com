/* Plan de com KEDGE · V2 — réglages : chacun son profil ; les pilotes administrent l'équipe, les services et les carnets. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const ROLES = [["pilote", "Pilote", "modifie tout, administre"], ["service", "Service", "modifie ses actions"], ["lecteur", "Lecture seule", "consulte"]];
  /* cinq onglets : moi, le projet (ce qui le distingue : nom, couleur, périodes, messages), les gens, les carnets, la version */
  const TABS = [["profil", "Mon profil"], ["projet", "Projet"], ["equipe", "Équipe"], ["carnets", "Carnets"], ["apropos", "Version"]];
  const svcSel = (id, v, attr = "") => `<select class="input" id="${id}" ${attr}><option value="">Aucun</option>${KP.SERVICES.map((s) => `<option value="${s.k}" ${s.k === v ? "selected" : ""}>${h(s.nom)}</option>`).join("")}</select>`;
  const field = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;

  KP.views.reglages = () => {
    const u = KP.me(), admin = u.role === "pilote", tab = admin || KP.route.set === "apropos" ? KP.route.set : "profil";
    return `<div class="page narrow wide-set">
      <div class="head"><h1>Réglages</h1></div>
      <div class="bar"><div class="seg" role="group" aria-label="Réglages">${TABS.filter(([k]) => admin || k === "profil" || k === "apropos").map(([k, n]) => `<button type="button" data-act="set-tab" data-k="${k}" class="${k === tab ? "on" : ""}" aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div>
      ${({ apropos, profil,
        projet: () => identite() + periodes() + messages(),
        equipe: () => equipe() + services(),
        carnets: () => liste("partners", "Médias partenaires", "Proposés quand une action est un partenariat payant.", "Nom du média") + liste("lieux", "Lieux", "Proposés dans le champ Lieu d'un temps fort.", "Nom du lieu") + contacts() })[tab]()}
    </div>`;
  };

  function profil() {
    const u = KP.me(), admin = u.role === "pilote", ro = u.role === "lecteur" ? "readonly" : "", th = store.prefs().theme || "auto", on = store.prefs().notif || {};
    const chk = (k, t) => `<button type="button" class="check" data-act="set-notif" data-k="${k}" aria-pressed="${on[k] !== false}"><span class="box">${ic("check")}</span>${t}</button>`;
    return `<section class="set"><h2>Mes infos</h2>
        <div class="two">${field("Prénom", `<input class="input" id="me-nom" data-set="me:nom" value="${h(u.nom)}" maxlength="40" autocomplete="off" ${ro}>`)}${field("Fonction", `<input class="input" id="me-fonction" data-set="me:fonction" value="${h(u.fonction)}" maxlength="80" autocomplete="off" ${ro}>`)}</div>
        <div class="two">${field("Service", admin ? svcSel("me-svc", u.svc, 'data-set="me:svc"') : `<span class="ro">${h((KP.service(u.svc) || { nom: "Aucun" }).nom)}</span>`)}${field("Droits", `<span class="ro">${ROLES.find((r) => r[0] === u.role)[1]} <small class="muted">${ROLES.find((r) => r[0] === u.role)[2]}</small></span>`)}</div>
        ${admin ? "" : `<p class="muted">Ton service et tes droits sont réglés par un pilote${(() => { const p = KP.PEOPLE.filter((x) => x.role === "pilote").map((x) => x.nom); return p.length ? ` (${h(p.join(", "))})` : ""; })()}.</p>`}
      </section>
      <section class="set"><h2>Apparence</h2>
        <div class="seg" role="group" aria-label="Apparence">${[["auto", "Comme l'appareil"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, n]) => `<button type="button" data-act="set-theme" data-k="${k}" class="${th === k ? "on" : ""}" aria-pressed="${th === k}">${n}</button>`).join("")}</div>
      </section>
      ${ro ? "" : `<section class="set"><h2>Me prévenir</h2>
        <div class="checks">${chk("demandes", "Quand on me demande des éléments, ou qu'on me répond")}${chk("changements", "Quand un temps fort que je relaie change, est reporté ou annulé")}${chk("creations", "À chaque nouvelle action ou nouveau temps fort")}</div>
        ${store.remote() && KP.remote.push.can() ? `<p class="muted push-row">${KP.remote.push.blocked() ? "Ton navigateur bloque mes notifications (voir ses réglages). Je ne le prends pas mal." : KP.remote.push.on ? "Cet appareil reçoit les notifications." : "Cet appareil ne reçoit pas encore les notifications."}
          ${KP.remote.push.blocked() ? "" : `<button type="button" class="btn quiet small" data-act="push-toggle">${KP.remote.push.on ? "Ne plus recevoir ici" : "Recevoir sur cet appareil"}</button>`}</p>` : ""}
      </section>`}`;
  }

  /* ---------- mise à jour en un clic : une copie suit le dépôt d'origine (pilotes seulement) ----------
     Le bouton appelle la fonction « mise-a-jour » du Supabase de la copie : la base d'abord, puis le code,
     puis on attend que GitHub Pages ait publié la nouvelle version, et l'appli se recharge. */
  const GUIDE = "https://github.com/bonavilien/kedge-plan-com/blob/main/DEPLOYER.md";
  const STEPS = [["Base", "data"], ["Code", "code"], ["En ligne", "online"]];
  const M = { st: "", etat: null, step: 0, msg: "" };
  const majOn = () => store.remote() && !!(window.KPLAN_CONFIG || {}).copie && KP.me().role === "pilote" && KP.remote && KP.remote.maj;
  async function majEtat() {
    M.st = "charge"; M.msg = "";
    try { M.etat = await KP.remote.maj("etat"); M.st = M.etat.origine ? "origine" : M.etat.aJour ? "ajour" : "dispo"; }
    catch (e) { M.st = e.code === "absente" ? "absente" : "erreur"; M.msg = e.message; }
    if (KP.route.screen === "reglages") KP.render();
  }
  async function majGo() {
    const cible = M.etat && M.etat.version ? M.etat.version.amont : "";
    M.st = "cours"; M.step = 0; M.msg = ""; KP.render();
    try {
      await KP.remote.maj("base"); M.step = 1; KP.render();
      const c = await KP.remote.maj("code"); M.step = 2; KP.render();
      /* GitHub Pages publie en une à trois minutes : on attend que le site serve la nouvelle version */
      const want = cible || c.version, t0 = Date.now();
      while (want && want !== KP.VERSION.n && Date.now() - t0 < 10 * 60 * 1000) {
        try { const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok && (await r.json()).version === want) break; } catch (e) {}
        await new Promise((ok) => setTimeout(ok, 5000));
      }
      M.step = 3; M.st = "fini"; KP.render();
      setTimeout(() => KP.acts.reload(), 1500);
    } catch (e) { M.st = "erreur"; M.msg = e.message; KP.render(); }
  }
  function majCard() {
    if (!majOn()) return "";
    if (!M.st) setTimeout(majEtat, 0);
    const e = M.etat || {}, v = e.version || {}, lab = (n) => h(KP.versionLabel(n || KP.VERSION.n));
    const steps = () => `<ol class="maj-steps" aria-label="Avancement">${STEPS.map(([n], i) => `<li class="${i < M.step ? "done" : i === M.step && M.st === "cours" ? "now" : ""}"><span class="dot">${i < M.step ? ic("check") : i + 1}</span>${n}</li>`).join("")}</ol>`;
    const notes = (e.nouveautes || []).flatMap((x) => x.notes).slice(0, 6);
    const body = {
      charge: () => `<div class="maj-v"><span class="vn">${lab()}</span><span class="spin" aria-label="Vérification"></span></div>`,
      ajour: () => `<div class="maj-v"><span class="ok-dot">${ic("check")}</span><span class="vn">${lab()}</span><b class="maj-tag">À jour</b></div>`,
      dispo: () => `<div class="maj-v"><span class="vn old">${lab(v.ici)}</span><span class="arrow" aria-hidden="true">→</span><span class="vn">${lab(v.amont)}</span></div>
        ${notes.length ? `<ul class="maj-notes">${notes.map((n) => `<li>${h(n)}</li>`).join("")}</ul>` : ""}
        <button type="button" class="btn primary" data-act="maj-go">Mettre à jour</button>
        ${e.base && e.base.length ? `<small class="muted maj-hint">+ ${e.base.length} mise${e.base.length > 1 ? "s" : ""} à jour de la base</small>` : ""}`,
      cours: () => `<div class="maj-v"><span class="vn old">${lab(v.ici)}</span><span class="arrow" aria-hidden="true">→</span><span class="vn">${lab(v.amont)}</span></div>${steps()}`,
      fini: () => `<div class="maj-v"><span class="ok-dot">${ic("check")}</span><span class="vn">${lab(v.amont)}</span><b class="maj-tag">Rechargement…</b></div>${steps()}`,
      erreur: () => `${M.step ? steps() : ""}<p class="maj-err" role="alert">${h(M.msg)}</p><button type="button" class="btn quiet" data-act="maj-retry">Réessayer</button>`,
      absente: () => `<p class="muted">Le bouton n'est pas encore installé.</p><a class="btn quiet" href="${GUIDE}#6-le-bouton-mettre-à-jour" target="_blank" rel="noopener">${ic("external")}Le guide, étape 6</a>`,
      origine: () => `<div class="maj-v"><span class="ok-dot">${ic("check")}</span><span class="vn">${lab()}</span><b class="maj-tag">Version d'origine</b></div>`,
    }[M.st] || (() => "");
    return `<section class="set maj maj-${M.st}" aria-live="polite"><h2>Mise à jour</h2>${body()}
      ${e.fonctionAmont > e.fonction && M.st !== "absente" ? `<p class="muted maj-hint">${ic("info")}Le bouton lui-même a une nouvelle version : <a href="${GUIDE}#6-le-bouton-mettre-à-jour" target="_blank" rel="noopener">recolle-le</a>.</p>` : ""}</section>`;
  }

  function apropos() {
    const v = KP.VERSION, d = (s) => KP.fmt.moyen(s) + " " + s.slice(0, 4);
    return `${majCard()}<section class="set"><h2>${h(KP.marque.titre)}</h2>
        <p class="vbig">Version ${h(KP.versionLabel(v.n))} <small class="muted">du ${h(d(v.date))} · ${h(v.n)}</small></p>
        ${KP.embedded ? `<p class="muted">Aperçu de démonstration : les données restent dans ce navigateur.</p>` : `<p class="muted">Sur téléphone, l'appli s'installe depuis le menu du navigateur : « Ajouter à l'écran d'accueil ».</p>`}
      </section>
      <section class="set"><h2>Nouveautés</h2>
        ${KP.VERSIONS.map((x) => `<div class="rel"><b>${h(KP.versionLabel(x.n))}</b><small class="muted">${h(d(x.date))}</small><ul>${x.notes.map((n) => `<li>${h(n)}</li>`).join("")}</ul></div>`).join("")}
      </section>`;
  }

  function equipe() {
    return `<section class="set"><h2>Personnes${store.remote() ? "" : `<button type="button" class="btn quiet small" data-act="set-add" data-k="people">${ic("plus")}Ajouter une personne</button>`}</h2>
      ${store.remote() ? `<p class="muted">Un compte se crée dans Supabase (Authentication, Add user). Il apparaît ensuite ici pour régler son rôle et son service.</p>` : ""}
      <div class="tbl t-people"><div class="th"><span>Prénom</span><span>Fonction</span><span>Droits</span><span>Service</span><span>Version</span><span></span></div>
      ${KP.PEOPLE.map((p) => `<div class="tr"><input class="input" id="p-${p.k}-nom" data-set="people:${p.k}:nom" value="${h(p.nom)}" aria-label="Prénom" autocomplete="off"><input class="input" id="p-${p.k}-fonction" data-set="people:${p.k}:fonction" value="${h(p.fonction)}" aria-label="Fonction" autocomplete="off">
        <select class="input" id="p-${p.k}-role" data-set="people:${p.k}:role" aria-label="Droits">${ROLES.map(([k, n]) => `<option value="${k}" ${k === p.role ? "selected" : ""}>${n}</option>`).join("")}</select>
        ${svcSel(`p-${p.k}-svc`, p.svc, `data-set="people:${p.k}:svc" aria-label="Service"`)}
        ${(() => { const v = store.versionOf(p.k); return `<span class="pv${v && v !== KP.VERSION.n ? " late" : ""}">${v ? h(KP.versionLabel(v)) : "—"}</span>`; })()}
        ${KP.ib("trash", "Retirer", "set-rm", `data-k="people" data-id="${p.k}"`)}</div>`).join("")}</div>
      <p class="muted">Version : celle que la personne avait à sa dernière visite, en rouge si elle n'est pas à jour. Pilote : modifie tout et administre. Service : crée et modifie les actions de son service. Lecture seule : consulte.</p></section>`;
  }

  function services() {
    return `<section class="set"><h2>Services<button type="button" class="btn quiet small" data-act="set-add" data-k="services">${ic("plus")}Ajouter un service</button></h2>
      <div class="tbl t-svc"><div class="th"><span>Nom</span><span>Nom court</span><span>Représenté par</span><span></span></div>
      ${KP.SERVICES.map((s) => `<div class="tr"><input class="input" id="s-${s.k}-nom" data-set="services:${s.k}:nom" value="${h(s.nom)}" aria-label="Nom" autocomplete="off"><input class="input" id="s-${s.k}-court" data-set="services:${s.k}:court" value="${h(s.court)}" aria-label="Nom court" autocomplete="off">
        <span class="muted">${h(KP.PEOPLE.filter((p) => p.svc === s.k).map((p) => p.nom).join(", ") || "Personne pour l'instant")}</span>${KP.ib("trash", "Retirer", "set-rm", `data-k="services" data-id="${s.k}"`)}</div>`).join("")}</div>
      <p class="muted">Chaque service a sa colonne dans la grille. On rattache une personne à un service juste au-dessus.</p></section>`;
  }

  /* le projet : un sous-titre et une couleur du brand book, qui distinguent cette appli des autres copies */
  function identite() {
    const pj = store.projet(), cur = KP.couleur.get(pj.couleur);
    const sw = (c) => `<button type="button" class="sw${c.fonce ? " duo" : ""}" data-act="set-couleur" data-k="${c.k}" style="--c:${c.hex};--d:${c.fonce || c.hex};--i:${KP.couleur.encre(c.hex)}" aria-pressed="${c.k === cur.k}" aria-label="${h(c.nom)}" data-tip="${h(c.nom)}">${c.k === cur.k ? ic("check") : ""}</button>`;
    const groupe = (g, n) => `<div class="sw-g"><span class="sw-l">${n}</span><div class="sws">${KP.COULEURS.filter((c) => c.gamme === g).map(sw).join("")}</div></div>`;
    return `<section class="set"><h2>Le projet</h2>
      ${field("Sous-titre", `<input class="input" id="pj-st" data-set="projet:sousTitre" value="${h(pj.sousTitre || "")}" maxlength="40" placeholder="Programme Grande École" autocomplete="off">`)}
      <div class="field"><span>Couleur</span>${groupe("corporate", "Corporate")}${groupe("vive", "Programmes, expertises, campus")}
        <p class="sw-now"><i style="--c:${cur.hex};--d:${cur.fonce || cur.hex}" class="${cur.fonce ? "duo" : ""}"></i><b>${h(cur.nom)}</b><span class="muted">${h(cur.pour)}</span></p></div></section>`;
  }

  function periodes() {
    const one = KP.PERIODS.length < 2;
    return `<section class="set"><h2>Périodes<button type="button" class="btn quiet small" data-act="set-add" data-k="periods">${ic("plus")}Ajouter une période</button></h2>
      <div class="tbl t-per"><div class="th"><span>Nom</span><span>Du</span><span>Au</span><span></span></div>
      ${KP.PERIODS.map((p) => `<div class="tr"><input class="input" id="pe-${p.k}-nom" data-set="periods:${p.k}:nom" value="${h(p.nom)}" aria-label="Nom" maxlength="40" autocomplete="off">
        <input class="input" type="date" id="pe-${p.k}-du" data-set="periods:${p.k}:du" value="${p.du}" aria-label="Premier jour"><input class="input" type="date" id="pe-${p.k}-au" data-set="periods:${p.k}:au" value="${p.au}" aria-label="Dernier jour">
        ${one ? "<span></span>" : KP.ib("trash", "Retirer", "set-rm", `data-k="periods" data-id="${p.k}"`)}</div>`).join("")}</div>
      <p class="muted">Le plan se lit par période. Elles se suivent sans se chevaucher.</p></section>`;
  }

  function messages() {
    const c = KP.CLES, hors = KP.MESSAGES.find((m) => m.hors);
    const line = (m, rm) => `<div class="tr"><input class="input" id="me-${m.k}-nom" data-set="messages:${m.k}:nom" value="${h(m.nom)}" aria-label="Nom" maxlength="30" autocomplete="off"><input class="input" id="me-${m.k}-info" data-set="messages:${m.k}:info" value="${h(m.info)}" aria-label="Ce qu'il couvre" maxlength="160" autocomplete="off">${rm ? KP.ib("trash", "Retirer", "set-rm", `data-k="messages" data-id="${m.k}"`) : "<span></span>"}</div>`;
    return `<section class="set"><h2>${c.length} message${c.length > 1 ? "s" : ""} clé${c.length > 1 ? "s" : ""}${c.length < 9 ? `<button type="button" class="btn quiet small" data-act="set-add" data-k="messages">${ic("plus")}Ajouter un message</button>` : ""}</h2>
      <div class="tbl t-msg"><div class="th"><span>Nom</span><span>Ce qu'il couvre</span><span></span></div>${c.map((m) => line(m, c.length > 1)).join("")}</div></section>
      <section class="set"><h2>Hors messages</h2><p class="muted" style="margin-top:-6px">Une étiquette à part, qui ne compte pas dans le bilan par message.</p>
      <div class="tbl t-msg">${line(hors, false)}</div></section>`;
  }

  function liste(k, titre, aide, ph) {
    const list = k === "partners" ? store.partners() : store.lieux();
    return `<section class="set"><h2>${titre}</h2><p class="muted" style="margin-top:-6px">${aide}</p>
      <form class="add-line" data-add="${k}"><input class="input" id="add-${k}" placeholder="${ph}" autocomplete="off" aria-label="${ph}"><button class="btn quiet">${ic("plus")}Ajouter</button></form>
      <div class="tbl t-one">${list.map((x) => `<div class="tr"><span>${h(x)}</span>${KP.ib("trash", "Retirer", "set-rm", `data-k="${k}" data-id="${h(x)}"`)}</div>`).join("") || `<p class="muted">La liste est vide.</p>`}</div></section>`;
  }

  function contacts() {
    return `<section class="set"><h2>Contacts<button type="button" class="btn quiet small" data-act="set-add" data-k="contacts">${ic("plus")}Nouveau contact</button></h2>
      <p class="muted" style="margin-top:-6px">Le carnet commun. Un contact s'ajoute à une fiche depuis sa section Contacts.</p>
      <div class="tbl t-ct">${store.contacts().map((c) => `<div class="tr"><span><b>${h(c.nom)}</b><br><small class="muted">${h(c.role)}</small></span><span class="copy">${h(c.mail)}${c.mail && c.tel ? "<br>" : ""}${h(c.tel)}</span><span>${KP.ib("edit", "Modifier", "set-edit-ct", `data-id="${c.id}"`)}${KP.ib("trash", "Retirer", "set-rm", `data-k="contacts" data-id="${c.id}"`)}</span></div>`).join("") || `<p class="muted">Aucun contact pour l'instant.</p>`}</div></section>`;
  }

  document.addEventListener("change", (e) => {
    const d = e.target.dataset && e.target.dataset.set; if (!d) return;
    const [k, id, f] = d.split(":"), v = e.target.value.trim();
    setTimeout(() => {
      if (k === "projet") { store.saveProjet({ [id]: v }); return KP.toast("Enregistré"); }
      if (k === "me") { if (id === "nom" && !v) return KP.render(); store.savePerson(KP.me().k, { [id]: v }); }
      else if ((f === "nom") && !v) return KP.render();
      else if (k === "people") { if (id === KP.me().k && f === "role" && v !== "pilote" && !KP.PEOPLE.some((p) => p.k !== id && p.role === "pilote")) { KP.toast("Il faut garder au moins un pilote"); return KP.render(); } store.savePerson(id, { [f]: v }); }
      else if (k === "services") store.saveService(id, { [f]: v });
      else if (k === "messages") store.saveMessage(id, { [f]: v });
      else if (k === "periods") {
        const p = KP.PERIODS.find((x) => x.k === id); if (!p) return;
        const next = { ...p, [f]: v };
        if (f !== "nom" && (!v || next.du > next.au)) { KP.toast("Le dernier jour vient après le premier"); return KP.render(); }
        const hit = f !== "nom" && KP.PERIODS.find((x) => x.k !== id && x.du <= next.au && x.au >= next.du);
        if (hit) { KP.toast(`Chevauche la période « ${hit.nom} »`); return KP.render(); }
        store.savePeriod(id, { [f]: v });
      }
      KP.toast("Enregistré");
    }, 0);
  });
  document.addEventListener("submit", (e) => {
    const k = e.target.dataset && e.target.dataset.add; if (!k) return; e.preventDefault();
    const v = e.target.querySelector("input").value.trim(); if (!v) return;
    store.listAdd(k, v); KP.toast("Ajouté"); const i = document.getElementById("add-" + k); if (i) { i.value = ""; i.focus(); }
  });

  Object.assign(KP.acts, {
    "maj-go": () => { if (M.st === "dispo") majGo(); },
    "maj-retry": () => { M.step = 0; M.etat = null; majEtat(); },
    "push-toggle": async () => { const p = KP.remote.push; try { if (p.on) { await p.disable(); KP.toast("Cet appareil ne reçoit plus les notifications"); } else { await p.enable(); KP.toast("Notifications activées sur cet appareil"); } } catch (e) { KP.toast(e.message || "Impossible d'activer les notifications"); } KP.render(); },
    "set-tab": (a) => KP.go({ set: a.dataset.k }),
    "set-couleur": (a) => { store.saveProjet({ couleur: a.dataset.k }); },
    "set-theme": (a) => store.setPref("theme", a.dataset.k),
    "set-notif": (a) => { const on = { ...(store.prefs().notif || {}) }; on[a.dataset.k] = on[a.dataset.k] === false; store.setPref("notif", on); },
    "set-edit-ct": (a) => KP.contactForm(store.contact(a.dataset.id), () => KP.toast("Contact enregistré")),
    "set-add": (a) => {
      const k = a.dataset.k;
      if (k === "contacts") return KP.contactForm(null, () => KP.toast("Contact ajouté au carnet"));
      const n = k === "people" ? store.addPerson() : k === "periods" ? store.addPeriod() : k === "messages" ? store.addMessage() : store.addService();
      if (!n) return;
      const i = document.getElementById(`${k === "people" ? "p" : k === "periods" ? "pe" : k === "messages" ? "me" : "s"}-${n.k}-nom`); if (i) { i.focus(); i.select(); }
    },
    "set-rm": (a) => {
      const k = a.dataset.k, id = a.dataset.id;
      if (k === "people") { if (store.remote()) return KP.toast("Un compte se retire dans Supabase. Ici, passe la personne en lecture seule."); if (store.personUsed(id)) return KP.toast("Cette personne a déjà agi dans le plan. Passe-la en lecture seule."); return KP.toast("Personne retirée", store.removePerson(id)); }
      if (k === "messages") { const n = store.messageUsed(id); if (n) return KP.toast(`${n} fiche${n > 1 ? "s citent" : " cite"} ce message. Retire-le d'abord de ${n > 1 ? "ces fiches" : "cette fiche"}.`); return KP.toast("Message retiré", store.removeMessage(id)); }
      if (k === "periods") { const n = store.periodUsed(id); if (n) return KP.toast(`${n} sujet${n > 1 ? "s couvrent" : " couvre"} cette période. Change-les d'abord.`); return KP.toast("Période retirée", store.removePeriod(id)); }
      if (k === "services") { const n = store.serviceUsed(id); if (n) return KP.toast(`Ce service est utilisé ${n} fois (actions, personnes). Vide-le d'abord.`); return KP.toast("Service retiré", store.removeService(id)); }
      KP.toast("Retiré", store.listRemove(k, id));
    },
  });
})();
