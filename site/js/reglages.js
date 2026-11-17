/* Plan de com KEDGE · V2 — réglages : chacun son profil ; les pilotes administrent l'équipe, les services et les carnets. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const ROLES = [["pilote", "Pilote", "modifie tout, administre"], ["service", "Service", "modifie ses actions"], ["lecteur", "Lecture seule", "consulte"]];
  const TABS = [["profil", "Mon profil"], ["equipe", "Équipe"], ["services", "Services"], ["medias", "Médias"], ["lieux", "Lieux"], ["contacts", "Contacts"], ["apropos", "Version"]];
  const svcSel = (id, v, attr = "") => `<select class="input" id="${id}" ${attr}><option value="">Aucun</option>${KP.SERVICES.map((s) => `<option value="${s.k}" ${s.k === v ? "selected" : ""}>${h(s.nom)}</option>`).join("")}</select>`;
  const field = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;

  KP.views.reglages = () => {
    const u = KP.me(), admin = u.role === "pilote", tab = admin || KP.route.set === "apropos" ? KP.route.set : "profil";
    return `<div class="page narrow wide-set">
      <div class="head"><h1>Réglages</h1></div>
      <div class="bar"><div class="seg" role="group" aria-label="Réglages">${TABS.filter(([k]) => admin || k === "profil" || k === "apropos").map(([k, n]) => `<button type="button" data-act="set-tab" data-k="${k}" class="${k === tab ? "on" : ""}" aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div>
      ${({ apropos, profil, equipe, services, medias: () => liste("partners", "Médias partenaires", "Proposés quand une action est un partenariat payant.", "Nom du média"), lieux: () => liste("lieux", "Lieux", "Proposés dans le champ Lieu d'un temps fort.", "Nom du lieu"), contacts })[tab]()}
    </div>`;
  };

  function profil() {
    const u = KP.me(), admin = u.role === "pilote", ro = u.role === "lecteur" ? "readonly" : "", th = store.prefs().theme || "auto", on = store.prefs().notif || {};
    const chk = (k, t) => `<button type="button" class="check" data-act="set-notif" data-k="${k}" aria-pressed="${on[k] !== false}"><span class="box">${ic("check")}</span>${t}</button>`;
    return `<section class="set"><h2>Mes infos</h2>
        <div class="two">${field("Prénom", `<input class="input" id="me-nom" data-set="me:nom" value="${h(u.nom)}" maxlength="40" autocomplete="off" ${ro}>`)}${field("Fonction", `<input class="input" id="me-fonction" data-set="me:fonction" value="${h(u.fonction)}" maxlength="80" autocomplete="off" ${ro}>`)}</div>
        <div class="two">${field("Service", admin ? svcSel("me-svc", u.svc, 'data-set="me:svc"') : `<span class="ro">${h((KP.service(u.svc) || { nom: "Aucun" }).nom)}</span>`)}${field("Droits", `<span class="ro">${ROLES.find((r) => r[0] === u.role)[1]} <small class="muted">${ROLES.find((r) => r[0] === u.role)[2]}</small></span>`)}</div>
        ${admin ? "" : `<p class="muted">Ton service et tes droits sont réglés par Julien ou Estelle.</p>`}
      </section>
      <section class="set"><h2>Apparence</h2>
        <div class="seg" role="group" aria-label="Apparence">${[["auto", "Comme l'appareil"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, n]) => `<button type="button" data-act="set-theme" data-k="${k}" class="${th === k ? "on" : ""}" aria-pressed="${th === k}">${n}</button>`).join("")}</div>
      </section>
      ${ro ? "" : `<section class="set"><h2>Me prévenir</h2>
        <div class="checks">${chk("demandes", "Quand on me demande des éléments, ou qu'on me répond")}${chk("changements", "Quand un temps fort que je relaie change, est reporté ou annulé")}${chk("creations", "À chaque nouvelle action ou nouveau temps fort")}</div>
        ${store.remote() && KP.remote.push.can() ? `<p class="muted push-row">${KP.remote.push.blocked() ? "Les notifications sont bloquées pour ce site dans les réglages du navigateur." : KP.remote.push.on ? "Cet appareil reçoit les notifications." : "Cet appareil ne reçoit pas encore les notifications."}
          ${KP.remote.push.blocked() ? "" : `<button type="button" class="btn quiet small" data-act="push-toggle">${KP.remote.push.on ? "Ne plus recevoir ici" : "Recevoir sur cet appareil"}</button>`}</p>` : ""}
      </section>`}`;
  }

  function apropos() {
    const v = KP.VERSION, d = (s) => KP.fmt.moyen(s) + " " + s.slice(0, 4);
    return `<section class="set"><h2>Plan de com KEDGE</h2>
        <p class="vbig">Version ${h(KP.versionLabel(v.n))} <small class="muted">du ${h(d(v.date))} · ${h(v.n)}</small></p>
        ${KP.embedded ? `<p class="muted">Aperçu de démonstration : les données restent dans ce navigateur.</p>` : `<p class="muted">Sur téléphone, l'appli s'installe depuis le menu du navigateur : « Ajouter à l'écran d'accueil ».</p>`}
      </section>
      <section class="set"><h2>Nouveautés</h2>
        ${KP.VERSIONS.map((x) => `<div class="rel"><b>${h(KP.versionLabel(x.n))}</b><small class="muted">${h(d(x.date))}</small><ul>${x.notes.map((n) => `<li>${h(n)}</li>`).join("")}</ul></div>`).join("")}
      </section>`;
  }

  function equipe() {
    return `<section class="set"><h2>Équipe${store.remote() ? "" : `<button type="button" class="btn quiet small" data-act="set-add" data-k="people">${ic("plus")}Ajouter une personne</button>`}</h2>
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
      <p class="muted">Chaque service a sa colonne dans la grille. On rattache une personne à un service depuis l'onglet Équipe.</p></section>`;
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
      <div class="tbl t-ct">${store.contacts().map((c) => `<div class="tr"><span><b>${h(c.nom)}</b><br><small class="muted">${h(c.role)}</small></span><span class="sel">${h(c.mail)}${c.mail && c.tel ? "<br>" : ""}${h(c.tel)}</span><span>${KP.ib("edit", "Modifier", "set-edit-ct", `data-id="${c.id}"`)}${KP.ib("trash", "Retirer", "set-rm", `data-k="contacts" data-id="${c.id}"`)}</span></div>`).join("") || `<p class="muted">Aucun contact pour l'instant.</p>`}</div></section>`;
  }

  document.addEventListener("change", (e) => {
    const d = e.target.dataset && e.target.dataset.set; if (!d) return;
    const [k, id, f] = d.split(":"), v = e.target.value.trim();
    setTimeout(() => {
      if (k === "me") { if (id === "nom" && !v) return KP.render(); store.savePerson(KP.me().k, { [id]: v }); }
      else if ((f === "nom") && !v) return KP.render();
      else if (k === "people") { if (id === KP.me().k && f === "role" && v !== "pilote" && !KP.PEOPLE.some((p) => p.k !== id && p.role === "pilote")) { KP.toast("Il faut garder au moins un pilote"); return KP.render(); } store.savePerson(id, { [f]: v }); }
      else if (k === "services") store.saveService(id, { [f]: v });
      KP.toast("Enregistré");
    }, 0);
  });
  document.addEventListener("submit", (e) => {
    const k = e.target.dataset && e.target.dataset.add; if (!k) return; e.preventDefault();
    const v = e.target.querySelector("input").value.trim(); if (!v) return;
    store.listAdd(k, v); KP.toast("Ajouté"); const i = document.getElementById("add-" + k); if (i) { i.value = ""; i.focus(); }
  });

  Object.assign(KP.acts, {
    "push-toggle": async () => { const p = KP.remote.push; try { if (p.on) { await p.disable(); KP.toast("Cet appareil ne reçoit plus les notifications"); } else { await p.enable(); KP.toast("Notifications activées sur cet appareil"); } } catch (e) { KP.toast(e.message || "Impossible d'activer les notifications"); } KP.render(); },
    "set-tab": (a) => KP.go({ set: a.dataset.k }),
    "set-theme": (a) => store.setPref("theme", a.dataset.k),
    "set-notif": (a) => { const on = { ...(store.prefs().notif || {}) }; on[a.dataset.k] = on[a.dataset.k] === false; store.setPref("notif", on); },
    "set-edit-ct": (a) => KP.contactForm(store.contact(a.dataset.id), () => KP.toast("Contact enregistré")),
    "set-add": (a) => {
      const k = a.dataset.k;
      if (k === "contacts") return KP.contactForm(null, () => KP.toast("Contact ajouté au carnet"));
      const n = k === "people" ? store.addPerson() : store.addService();
      const i = document.getElementById(`${k === "people" ? "p" : "s"}-${n.k}-nom`); if (i) { i.focus(); i.select(); }
    },
    "set-rm": (a) => {
      const k = a.dataset.k, id = a.dataset.id;
      if (k === "people") { if (store.remote()) return KP.toast("Un compte se retire dans Supabase. Ici, passe la personne en lecture seule."); if (store.personUsed(id)) return KP.toast("Cette personne a déjà agi dans le plan. Passe-la en lecture seule."); return KP.toast("Personne retirée", store.removePerson(id)); }
      if (k === "services") { const n = store.serviceUsed(id); if (n) return KP.toast(`Ce service est utilisé ${n} fois (actions, personnes). Vide-le d'abord.`); return KP.toast("Service retiré", store.removeService(id)); }
      KP.toast("Retiré", store.listRemove(k, id));
    },
  });
})();
