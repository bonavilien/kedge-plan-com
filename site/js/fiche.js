/* Plan de com KEDGE · V2 — la fiche : panneau de droite, modification sur place, « Annuler » après chaque geste. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const $ = (id) => document.getElementById(id);
  KP.dest = (k) => (KP.person(k) || KP.service(k) || { nom: k }).nom;
  const mine = (r) => { const u = KP.me(); return r.a === u.k || (u.svc && r.a === u.svc) || (r.a === "chef" && u.role === "pilote"); };
  KP.reqMine = mine;

  KP.renderFiche = () => {
    const el = $("fiche"), it = KP.route.fiche && store.get(KP.route.fiche);
    if (!it) { el.hidden = true; el.innerHTML = ""; if (KP.route.fiche && !KP.hold) { setTimeout(() => { KP.toast("Cette fiche n'existe plus. Je n'y suis pour rien."); KP.go({ fiche: "" }, true); }, 0); } return; }
    const body = el.querySelector(".f-body"), top = body && el.dataset.id === it.id ? body.scrollTop : 0;
    const can = store.canEdit(it), u = KP.me(), reader = u.role === "lecteur";
    const tf = it.kind === "tf", pinned = store.pinned(it.id), par = it.tf && store.get(it.tf);
    const v = (act, txt, none) => can ? `<button type="button" class="val${none ? " none" : ""}" data-act="${act}">${txt}</button>` : `<span class="val${none ? " none" : ""}">${none ? "—" : txt}</span>`;
    const inp = (f, val, ph) => can ? `<input class="val" id="f-${f}" data-f="${f}" value="${h(val || "")}" placeholder="${h(ph)}" autocomplete="off">` : `<span class="val${val ? "" : " none"}">${h(val || "—")}</span>`;
    const flag = (x) => x.annule ? `<p class="flag late">${ic("close")}<span><b>Annulé</b>${x.annule.txt ? " · " + h(x.annule.txt) : ""} <small class="muted">${h(KP.nomDe(x.annule.qui))}, ${h(KP.fmt.quand(x.annule.quand))}</small></span></p>`
      : x.report ? `<p class="flag">${ic("shift")}<span><b>Reporté</b>, c'était ${h(x.report.de)}${x.report.txt ? " · " + h(x.report.txt) : ""} <small class="muted">${h(KP.nomDe(x.report.qui))}, ${h(KP.fmt.quand(x.report.quand))}</small></span></p>` : "";
    const cts = (x) => (x.contacts || []).map((id) => store.contact(id)).filter(Boolean);
    const ct = (c, rm) => `<div class="ct"><span><b>${h(c.nom)}</b>${c.role ? ` <small class="muted">${h(c.role)}</small>` : ""}<br><span class="copy">${h([c.mail, c.tel].filter(Boolean).join(" · "))}</span></span>${rm ? `<button type="button" class="ib" data-act="rm-ct" data-id="${c.id}" data-tip="Retirer" aria-label="Retirer ${h(c.nom)}">${ic("close")}</button>` : ""}</div>`;
    const rel = store.relais(it.id), all = store.reqsOf(it.id), reqs = all.filter((r) => r.de !== r.a), memos = all.filter((r) => r.de === r.a && r.de === KP.me().k && !r.fait), acts = store.journalOf(it.id);
    const rows = [];
    if (it.variant === "sujet") rows.push(["Période", `<span class="val">${h(KP.PERIODS.find((p) => p.k === it.per).nom)}, ${h(KP.PERIODS.find((p) => p.k === it.per).lib)}</span>`]);
    else {
      rows.push(["Date", v("f-date", it.flou ? `<span class="tbc">${h(KP.dateLong(it))}</span> <small class="muted">date à préciser</small>` : `${h(KP.fmt.long(it.date))} <small class="muted">${h(KP.fmt.relatif(it.date))}</small>`)]);
      if (tf && !it.flou && (can || it.fin)) rows.push(["Jusqu'au", v("f-fin", it.fin ? h(KP.fmt.long(it.fin)) : "Un seul jour", !it.fin)]);
    }
    if (it.variant === "partenariat") rows.push(["Média", v("f-partner", h(it.partner) || "Choisir le média", !it.partner)]);
    else if (!tf) rows.push(["Service", u.role === "pilote" ? v("f-svc", h((KP.service(it.svc) || {}).nom || "")) : `<span class="val">${h((KP.service(it.svc) || {}).nom || "—")}</span>`]);
    rows.push(["Messages", v("f-msg", h(KP.msgNames(it)) || "Choisir", !it.m.length)]);
    if (!tf) rows.push(["Temps fort", v("f-tf", par ? `<i class="tfdot"></i>${h(par.t)}` : "Aucun", !par) + (par ? `<button type="button" class="ib" data-act="open" data-id="${par.id}" data-tip="Ouvrir le temps fort" aria-label="Ouvrir le temps fort">${ic("chevR")}</button>` : "")]);
    if (tf && it.variant !== "sujet") rows.push(["Lieu", can ? `<input class="val" id="f-lieu" data-f="lieu" list="dl-lieux" value="${h(it.lieu || "")}" placeholder="Choisir ou écrire un lieu" autocomplete="off"><datalist id="dl-lieux">${store.lieux().map((l) => `<option value="${h(l)}"></option>`).join("")}</datalist>` : `<span class="val${it.lieu ? "" : " none"}">${h(it.lieu || "—")}</span>`]);
    if (it.variant === "classement") rows.push(["Rang", inp("rang", it.rang, "À la parution")], ["Objectif", inp("cible", it.cible, "Top…")]);
    rows.push(["État", it.annule ? KP.pill(it) : can ? `<div class="seg" role="group" aria-label="État">${KP.STATUTS.map((s) => `<button type="button" data-act="f-st" data-k="${s.k}" class="${it.st === s.k ? "on" : ""}" aria-pressed="${it.st === s.k}">${s.k === "diffuse" && it.st === s.k ? ic("check") : ""}${s.nom}</button>`).join("")}</div>` : KP.pill(it)]);

    const req = (r) => {
      const late = !r.fait && r.pour < KP.TODAY;
      return `<div class="req"><div class="meta">${r.de === r.a ? "Rappel pour moi" : `${h(KP.dest(r.de))} demande à ${h(KP.dest(r.a))}`} · <span class="${late ? "late" : ""}">${h(KP.due(r))}</span></div>
        <p>${r.de === r.a && r.txt ? `<b>${h(r.txt)}</b>` : `<b>${h(r.quoi)}</b>${r.txt ? " · " + h(r.txt) : ""}`}</p>
        ${r.fait ? `<div class="rep">${ic("check")} ${h(r.rep || "Reçu")}</div>` : r.de === u.k && r.a === u.k ? `<div class="req-do"><button type="button" class="link" data-act="memo-fait" data-id="${r.id}">C'est fait</button><span class="sp"></span>${KP.ib("edit", "Modifier le rappel", "memo", `data-id="${r.id}"`)}${KP.ib("trash", "Effacer le rappel", "req-drop", `data-id="${r.id}"`)}</div>` : r.de === u.k ? `<div class="req-do"><button type="button" class="link soft" data-act="relance" data-id="${r.id}">Relancer</button><span class="sp"></span>${KP.ib("edit", "Changer la date", "req-date", `data-id="${r.id}"`)}${KP.ib("trash", "Retirer la demande", "req-drop", `data-id="${r.id}"`)}</div>` : (mine(r) || u.role === "pilote") && !reader ? `<button type="button" class="link" data-act="answer" data-id="${r.id}">Répondre</button>` : ""}</div>`;
    };
    const showAct = KP.ui.allAct === it.id ? acts : acts.slice(0, 3);

    el.hidden = false; el.dataset.id = it.id;
    el.innerHTML = `
      <div class="f-top">
        <span class="kind"><i class="tag${tf ? " tf" : ""}">${h(KP.kindName(it))}</i></span>
        ${reader ? "" : `<button type="button" class="ib f-x${pinned ? " on" : ""}" data-act="f-pin" aria-pressed="${pinned}" data-tip="${pinned ? "Retirer de mon accueil" : "Épingler sur mon accueil"}" aria-label="${pinned ? "Retirer de mon accueil" : "Épingler sur mon accueil"}">${ic("bookmark")}</button>`}
        ${reader || it.annule ? "" : KP.ib("clock", "Rappel pour moi", "memo", 'data-x="1"')}
        ${reader || it.annule || tf ? "" : KP.ib("megaphone", "Prévenir un service", "prevenir", 'data-x="1"')}
        ${KP.ib("link", "Copier le lien", "f-link", 'data-x="1"')}
        ${KP.outils ? KP.outils.bouton(it) : ""}
        ${KP.ib("kebab", "Plus", "f-more", `aria-haspopup="menu"${can ? "" : ' data-phone="1"'}`)}
        <button type="button" class="ib tip-l" data-act="close-fiche" data-tip="Fermer (Échap)" aria-label="Fermer">${ic("close")}</button>
      </div>
      <div class="f-body">
        <h2 class="sr" id="f-h">${h(it.t)}</h2>
        <textarea class="f-title" id="f-t" data-f="t" data-auto rows="1" aria-label="Titre" ${can ? "" : "readonly"}>${h(it.t)}</textarea>
        ${flag(it)}
        <dl class="f-meta">${rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join("")}</dl>
        ${reader || it.annule ? "" : `<div class="f-actions"><button type="button" class="btn primary" data-act="ask">Demander des éléments</button>
          ${can || u.role === "pilote" ? `<button type="button" class="check" data-act="f-reunion" aria-pressed="${!!it.reunion}"><span class="box">${ic("check")}</span>À voir en réunion</button>` : ""}</div>`}
        ${par ? (() => { const ans = store.reqsOf(par.id).filter((q) => q.fait && q.rep);
          return `<section class="f-sec from"><h3><i class="tfdot"></i>Vient du temps fort<button type="button" class="link" data-act="open" data-id="${par.id}">Ouvrir</button></h3>
            <p><b>${h(par.t)}</b> · ${h(KP.dateLong(par))}${par.lieu ? " · " + h(par.lieu) : ""}</p>
            ${flag(par)}
            ${cts(par).map((c) => `<p class="il">${ic("user")}<span><b>${h(c.nom)}</b>${c.role ? ", " + h(c.role) : ""} <span class="sel muted">${h([c.mail, c.tel].filter(Boolean).join(" · "))}</span></span></p>`).join("")}
            ${par.note ? `<p class="muted from-note">${h(par.note)}</p>` : ""}
            ${par.docs.map((d) => `<p class="il">${ic("doc")}<span><a class="link" href="${h(d.url)}" target="_blank" rel="noopener">${h(d.t)}</a></span></p>`).join("")}
            ${ans.map((q) => `<p class="il">${ic("chat")}<span><b>${h(q.quoi)}</b> · ${h(q.rep)} <small class="muted">${h(KP.dest(q.a))}</small></span></p>`).join("")}</section>`; })() : ""}
        ${tf ? `<section class="f-sec"><h3>Relais${rel.length ? " · " + rel.length : ""}${store.canCreate() ? `<button type="button" class="link" data-act="new" data-tf="${it.id}" data-date="${it.variant === "sujet" ? KP.TODAY : it.date}">Ajouter</button>` : ""}</h3>
          ${rel.length ? rel.map((r) => `<button type="button" class="mini" data-act="open" data-id="${r.id}"><span class="d">${h(KP.dateShort(r))}</span><span class="tt">${h(r.t)} <small>· ${h((KP.service(r.svc) || {}).court || "")}</small></span>${KP.pill(r)}</button>`).join("") : `<p class="muted">Aucun service ne s'en est encore saisi.</p>`}</section>` : ""}
        ${memos.length ? `<div class="memos">${memos.map((r) => `<div class="memo${r.pour < KP.TODAY ? " late" : ""}">${ic("clock")}<span class="tt">${h(r.txt || r.quoi)}</span><small>${h(KP.fmt.court(r.pour))}</small>${KP.ib("edit", "Modifier le rappel", "memo", `data-id="${r.id}"`)}${KP.ib("trash", "Effacer le rappel", "req-drop", `data-id="${r.id}"`)}<button type="button" class="ib" data-act="memo-fait" data-id="${r.id}" data-tip="C'est fait" aria-label="C'est fait">${ic("check")}</button></div>`).join("")}</div>` : ""}
        ${reqs.length ? `<section class="f-sec"><h3>Demandes · ${reqs.length}</h3>${reqs.map(req).join("")}</section>` : ""}
        ${it.docs.length || can || rel.some((r) => r.docs.length) ? `<section class="f-sec"><h3>Documents${can ? `<button type="button" class="link" data-act="add-doc">Ajouter un lien</button>` : ""}</h3>
          ${it.docs.map((d, i) => `<div class="mini" style="grid-template-columns:minmax(0,1fr) auto"><a class="link" href="${h(d.url)}" target="_blank" rel="noopener">${h(d.t)}</a>${can ? `<button type="button" class="ib" data-act="rm-doc" data-i="${i}" data-tip="Retirer" aria-label="Retirer ${h(d.t)}">${ic("close")}</button>` : ""}</div>`).join("") || (rel.some((r) => r.docs.length) ? "" : `<p class="muted">Les liens SharePoint utiles à tous.</p>`)}
          ${rel.map((r) => r.docs.map((d) => `<div class="mini" style="grid-template-columns:minmax(0,1fr) auto"><a class="link" href="${h(d.url)}" target="_blank" rel="noopener">${h(d.t)}</a><small class="muted">${h((KP.service(r.svc) || {}).court || "")} · ${h(r.t)}</small></div>`).join("")).join("")}</section>` : ""}
        ${cts(it).length || can ? `<section class="f-sec"><h3>Contacts${can ? `<button type="button" class="link" data-act="add-ct" aria-haspopup="menu">Ajouter</button>` : ""}</h3>
          ${cts(it).map((c) => ct(c, can)).join("") || `<p class="muted">Qui appeler, côté programme ou côté presse.</p>`}</section>` : ""}
        ${it.note || can ? `<section class="f-sec"><h3>Note</h3><textarea class="note" id="f-note" data-f="note" data-auto placeholder="Ce qu'il faut savoir" ${can ? "" : "readonly"}>${h(it.note)}</textarea></section>` : ""}
        ${acts.length ? `<section class="f-sec"><h3>Activité${acts.length > 3 && KP.ui.allAct !== it.id ? `<button type="button" class="link" data-act="all-act">Tout voir</button>` : ""}</h3>
          ${showAct.map((j) => `<p class="act"><b>${h(KP.nomDe(j.qui))}</b> ${h(j.txt)} · ${h(KP.fmt.quand(j.quand))}</p>`).join("")}</section>` : ""}
      </div>`;
    el.querySelector(".f-body").scrollTop = top;
  };

  /* champs de texte : enregistrés en quittant le champ */
  document.addEventListener("change", (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || !e.target.closest("#fiche")) return;
    const id = KP.route.fiche, val = e.target.value.trim(), it = store.get(id);
    if (f === "t" && !val) { e.target.value = it.t; return; }
    if (it[f] === val) return;
    if (f === "lieu") store.addLieu(val);
    setTimeout(() => KP.toast("Enregistré", store.update(id, { [f]: val }, f === "t" ? "a renommé" : f === "lieu" ? "a changé le lieu" : "")), 0);
  });
  document.addEventListener("keydown", (e) => { if (e.target.id === "f-t" && e.key === "Enter") { e.preventDefault(); e.target.blur(); } if (e.key === "Enter" && e.target.matches && e.target.matches("#fiche input.val")) e.target.blur(); });

  const cur = () => store.get(KP.route.fiche);
  KP.contactForm = (c, done) => {
    const d = KP.dialog(`<form method="dialog"><h2>${c ? "Modifier le contact" : "Nouveau contact"}</h2>
      <label class="field"><span>Nom</span><input class="input" name="nom" value="${h(c ? c.nom : "")}" required autocomplete="off"></label>
      <label class="field"><span>Rôle ou organisme</span><input class="input" name="role" value="${h(c ? c.role : "")}" placeholder="Direction, service, journaliste…" autocomplete="off"></label>
      <div class="two"><label class="field"><span>E-mail</span><input class="input" name="mail" type="email" value="${h(c ? c.mail : "")}" autocomplete="off"></label><label class="field"><span>Téléphone</span><input class="input" name="tel" value="${h(c ? c.tel : "")}" autocomplete="off"></label></div>
      <div class="foot"><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    d.querySelector("input").focus();
    d.querySelector("form").addEventListener("submit", () => { const f = new FormData(d.querySelector("form")); const o = { nom: f.get("nom").trim(), role: f.get("role").trim(), mail: f.get("mail").trim(), tel: f.get("tel").trim() }; if (c) o.id = c.id; const r = store.saveContact(o); if (done) done(r); });
  };
  Object.assign(KP.acts, {
    "f-date": (a) => { const it = cur(); KP.datepick(a, it.flou ? (it.date < KP.TODAY && KP.monthEnd(it.date) >= KP.TODAY ? KP.TODAY : it.date) : it.date, (d) => {
      if (!d) return;
      const flou = d.length === 7, date = flou ? d + "-01" : d;
      if (date === it.date && flou === !!it.flou) return;
      const n = it.kind === "tf" ? store.relais(it.id).length : 0, txt = flou ? `courant ${KP.fmt.mois(date)}` : `au ${KP.fmt.moyen(date)}`;
      const apply = (motif) => { const moved = motif != null && !flou && !it.flou ? store.relais(it.id).filter((r) => !r.flou).length : 0;
        KP.toast(motif != null ? `Reporté ${txt}${moved ? `, avec ${moved > 1 ? "ses " + moved + " relais" : "son relais"}` : ""}` : flou ? `Placé ${txt}, date à préciser` : `Date fixée ${txt}`, store.setDate(it.id, date, flou, motif)); };
      /* un temps fort déjà relayé ou déjà prévu : d'autres comptent dessus, on dit pourquoi */
      if (!it.flou && (n || it.st !== "confirmer")) KP.motif(`Reporter ${txt}`, n ? `${n} relais ${n > 1 ? "suivent" : "suit"} ce temps fort.` : `« ${it.t} »`, "Reporter", apply); else apply(null);
    }, { month: true }); },
    "f-partner": (a) => { const it = cur(); KP.menu(a, [...store.partners().map((x) => ({ v: x, nom: x })), "-", { v: "+", nom: "Ajouter un média", icon: "plus" }], (v) => {
      if (v !== "+") return v !== it.partner && KP.toast(`Média : ${v}`, store.update(it.id, { partner: v }));
      const d = KP.dialog(`<form method="dialog"><h2>Ajouter un média</h2><label class="field"><span>Nom du média partenaire</span><input class="input" name="n" required autocomplete="off"></label><div class="foot"><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Ajouter</button></div></form>`);
      d.querySelector("form").addEventListener("submit", () => { const n = new FormData(d.querySelector("form")).get("n").trim(); if (n) { store.addPartner(n); KP.toast(`Média : ${n}`, store.update(it.id, { partner: n })); } });
    }, { selected: [it.partner], title: "Média partenaire" }); },
    "f-fin": (a) => { const it = cur(); KP.datepick(a, it.fin || it.date, (d) => { if (d && d < it.date) return KP.toast("La fin vient après le début"); KP.toast(d ? "Fin enregistrée" : "Fin retirée", store.update(it.id, { fin: d })); }, { clear: !!it.fin }); },
    "f-svc": (a) => { const it = cur(); KP.menu(a, KP.SERVICES.map((s) => ({ v: s.k, nom: s.nom })), (v) => v !== it.svc && KP.toast("Service changé. La patate chaude a changé de mains.", store.update(it.id, { svc: v }, `a confié l'action à ${KP.service(v).nom}`)), { selected: [it.svc] }); },
    "f-msg": (a) => { const it = cur(); KP.menu(a, KP.MESSAGES.map((m) => ({ v: m.k, nom: m.nom, info: m.info })), (m) => { const next = KP.MESSAGES.map((x) => x.k).filter((k) => m.includes(k)); if (next.join() !== it.m.join()) KP.toast("Messages enregistrés", store.update(it.id, { m: next })); }, { selected: it.m, multi: true }); },
    "f-tf": (a) => { const it = cur(); const tfs = store.items().filter((i) => i.kind === "tf").sort((x, y) => x.date.localeCompare(y.date)); KP.menu(a, [{ v: "", nom: "Aucun" }, "-", ...tfs.map((x) => ({ v: x.id, nom: x.t, info: KP.dateLong(x) }))], (v) => v !== it.tf && KP.toast(v ? "Rattachée au temps fort" : "Détachée", store.update(it.id, { tf: v })), { selected: [it.tf] }); },
    "f-st": (a) => KP.setStatus(KP.route.fiche, a.dataset.k),
    "f-reunion": () => { const it = cur(); store.update(it.id, { reunion: !it.reunion }, it.reunion ? "" : "a mis à l'ordre du jour"); KP.toast(it.reunion ? "À l'ordre du jour de la prochaine réunion" : "Retiré de l'ordre du jour"); },
    "f-pin": () => { const id = KP.route.fiche, was = store.pinned(id); store.togglePin(id); KP.toast(was ? "Retiré de ton accueil" : "Épinglé sur ton accueil"); },
    "f-link": async () => { try { await navigator.clipboard.writeText(location.href); KP.toast("Lien copié"); } catch (e) { KP.toast("Le lien est dans la barre d'adresse"); } },
    "all-act": () => { KP.ui.allAct = KP.route.fiche; KP.render(); },
    "f-more": (a) => {
      const it = cur(), can = store.canEdit(it);
      /* sur téléphone, les icônes de la barre passent ici, avec leur nom */
      const x = matchMedia("(max-width: 767px)").matches ? [...$("fiche").querySelectorAll(".f-top .f-x, .f-top [data-x]")].map((b) => ({ v: "x:" + b.dataset.act, nom: b.getAttribute("aria-label"), icon: b.dataset.act === "f-pin" ? "bookmark" : b.dataset.act === "memo" ? "clock" : b.dataset.act === "prevenir" ? "megaphone" : b.dataset.act === "f-export" ? "sync" : "link" })) : [];
      const own = can ? [{ v: "dup", nom: "Dupliquer", icon: "copy" }, it.annule ? { v: "res", nom: "Rétablir", icon: "undo" } : { v: "ann", nom: it.kind === "tf" ? "Annuler ce temps fort" : "Annuler cette action", icon: "close" }, "-", { v: "del", nom: "Supprimer", icon: "trash", danger: true }] : [];
      KP.menu(a, [...x, ...(x.length && own.length ? ["-"] : []), ...own], (v) => {
        if (v.startsWith("x:")) { setTimeout(() => KP.acts[v.slice(2)](a), 0); return; }
        if (v === "dup") { const n = store.duplicate(it.id); KP.go({ fiche: n.id }); KP.toast("Copie créée. L'original n'en saura rien.", () => { store.unadd(n.id); KP.go({ fiche: it.id }); }); }
        if (v === "ann") KP.motif(it.kind === "tf" ? "Annuler ce temps fort" : "Annuler cette action", `« ${it.t} » reste dans le plan, barré, avec le motif.`, "Annuler", (m) => KP.toast(`« ${it.t} » est annulé`, store.cancel(it.id, m)));
        if (v === "res") KP.toast("Rétabli", store.restore(it.id));
        if (v === "del") { const go = () => { const undo = store.remove(it.id); KP.go({ fiche: "" }); KP.toast(`« ${it.t} » supprimé. Paix à son âme.`, undo); };
          /* branché, une suppression ne s'annule pas : on demande avant */
          if (!store.remote()) return go();
          const d = KP.dialog(`<form method="dialog"><h2>Supprimer « ${h(it.t)} » ?</h2><p class="muted">Ses demandes, ses liens et son historique partent aussi. Pour garder une trace, annule-la plutôt.</p><div class="foot"><button type="button" class="btn quiet" data-close>Garder</button><button class="btn primary danger-bg">Supprimer</button></div></form>`);
          d.querySelector("form").addEventListener("submit", go); }
      }, { right: true });
    },
    "rm-ct": (a) => { const it = cur(); KP.toast("Contact retiré de la fiche", store.update(it.id, { contacts: (it.contacts || []).filter((c) => c !== a.dataset.id) })); },
    "add-ct": (a) => { const it = cur(), have = it.contacts || [];
      KP.menu(a, [...store.contacts().filter((c) => !have.includes(c.id)).map((c) => ({ v: c.id, nom: c.nom, info: c.role })), "-", { v: "+", nom: "Nouveau contact", icon: "plus" }], (v) => {
        if (v !== "+") return KP.toast("Contact ajouté", store.update(it.id, { contacts: [...have, v] }, "a ajouté un contact"));
        KP.contactForm(null, (c) => KP.toast("Contact ajouté au carnet et à la fiche", store.update(it.id, { contacts: [...have, c.id] }, "a ajouté un contact")));
      }, { right: true, title: "Carnet de contacts" }); },
    "rm-doc": (a) => { const it = cur(); KP.toast("Lien retiré", store.update(it.id, { docs: it.docs.filter((_, i) => i !== +a.dataset.i) })); },
    "add-doc": () => {
      const it = cur();
      const d = KP.dialog(`<form method="dialog"><h2>Ajouter un lien</h2>
        <label class="field"><span>Nom</span><input class="input" name="t" placeholder="Programme de la journée" required autocomplete="off"></label>
        <label class="field"><span>Adresse SharePoint</span><input class="input" name="url" type="url" placeholder="https://…" required autocomplete="off"></label>
        <div class="foot"><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Ajouter</button></div></form>`);
      d.querySelector("form").addEventListener("submit", (e) => { const f = new FormData(d.querySelector("form")); if (!/^https:\/\//i.test(f.get("url").trim())) { e.preventDefault(); const u2 = d.querySelector("[name=url]"); u2.value = ""; u2.placeholder = "Une adresse qui commence par https://"; u2.focus(); return; } KP.toast("Lien ajouté", store.update(it.id, { docs: [...it.docs, { t: f.get("t").trim(), url: f.get("url").trim() }] }, "a ajouté un document")); });
    },
    ask: (a) => {
      const it = store.get(a.dataset.id || KP.route.fiche), u = KP.me();
      const pil = KP.PEOPLE.find((x) => x.role === "pilote" && x.k !== u.k) || {};
      const s = { a: u.role === "pilote" ? it.svc || (store.relais(it.id)[0] || {}).svc || "rp" : pil.k, quoi: KP.ELEMENTS[0], pour: [KP.addDays(it.date, -7), KP.addDays(KP.TODAY, 1)].sort().pop() };
      const d = KP.dialog(`<form method="dialog"><h2>Demander des éléments</h2><p class="muted" style="margin-top:-8px">Pour « ${h(it.t)} »</p>
        <label class="field"><span>À qui</span><select class="input" name="a"><optgroup label="Un service">${KP.SERVICES.filter((x) => x.k !== u.svc).map((x) => `<option value="${h(x.k)}" ${x.k === s.a ? "selected" : ""}>${h(x.nom)}</option>`).join("")}</optgroup><optgroup label="Une personne">${KP.PEOPLE.filter((x) => x.k !== u.k && x.role !== "lecteur").map((x) => `<option value="${h(x.k)}" ${x.k === s.a ? "selected" : ""}>${h(x.nom)}${x.fonction ? ", " + h(x.fonction.toLowerCase()) : ""}</option>`).join("")}</optgroup></select></label>
        <div class="field"><span>Quoi</span><div class="picks">${KP.ELEMENTS.map((x, i) => `<button type="button" class="pick" data-q="${h(x)}" aria-pressed="${i === 0}">${h(x)}</button>`).join("")}</div></div>
        <label class="field"><span>Précision</span><textarea class="input" name="txt" placeholder="Ce dont tu as besoin, en une phrase"></textarea></label>
        <div class="field"><span>Pour le</span><button type="button" class="input" data-pick>${ic("calendar")}<span>${h(KP.fmt.long(s.pour))}</span></button></div>
        <div class="foot"><span class="hint" data-hint>La personne est prévenue.</span><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Envoyer</button></div></form>`);
      d.addEventListener("click", (e) => {
        const q = e.target.closest("[data-q]"); if (q) { s.quoi = q.dataset.q; d.querySelectorAll("[data-q]").forEach((b) => b.setAttribute("aria-pressed", b === q)); }
        const pk = e.target.closest("[data-pick]"); if (pk) KP.datepick(pk, s.pour, (v) => { if (v) { s.pour = v; pk.querySelector("span:last-child").textContent = KP.fmt.long(v); } });
      });
      d.querySelector("form").addEventListener("submit", () => { const f = new FormData(d.querySelector("form")); const r = store.ask({ item: it.id, a: f.get("a"), quoi: s.quoi, txt: f.get("txt").trim(), pour: s.pour }); KP.toast(`Demande envoyée à ${KP.dest(r.a)}`); });
    },
    answer: (a) => {
      const r = store.reqs().find((x) => x.id === a.dataset.id), it = store.get(r.item);
      const d = KP.dialog(`<form method="dialog"><h2>Répondre à ${h(KP.dest(r.de))}</h2><p class="muted" style="margin-top:-8px">${h(r.quoi)} pour « ${h(it.t)} »${r.txt ? " : " + h(r.txt) : ""}</p>
        <label class="field"><span>Ta réponse</span><textarea class="input" name="rep" placeholder="Un lien SharePoint, une phrase, un contact…"></textarea></label>
        <div class="foot"><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Envoyer</button></div></form>`);
      d.querySelector("textarea").focus();
      d.querySelector("form").addEventListener("submit", () => KP.toast(`Réponse envoyée à ${KP.dest(r.de)}`, store.answer(r.id, new FormData(d.querySelector("form")).get("rep").trim())));
    },
    "memo-fait": (a) => { store.answer(a.dataset.id, "Fait"); KP.toast("Rappel fait. Bravo, sincèrement."); },
    /* noter un rappel pour moi, ou modifier le sien (texte et date) */
    memo: (a) => {
      const it = cur(), old = a && a.dataset.id && store.reqs().find((x) => x.id === a.dataset.id);
      const s = { pour: old ? old.pour : [KP.addDays(it.date, -7), KP.addDays(KP.TODAY, 1)].sort().pop() };
      const d = KP.dialog(`<form method="dialog"><h2>Rappel pour moi</h2>
        <input class="input" name="txt" placeholder="Me rappeler de…" aria-label="Me rappeler de" maxlength="200" required autocomplete="off" value="${h(old ? old.txt : "")}">
        <div class="foot"><button type="button" class="input" data-pick style="width:auto;margin-right:auto">${ic("calendar")}<span>${h(KP.fmt.court(s.pour))}</span></button><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">${old ? "Enregistrer" : "Noter"}</button></div></form>`);
      d.querySelector("[name=txt]").focus();
      d.addEventListener("click", (e) => { const pk = e.target.closest("[data-pick]"); if (pk) KP.datepick(pk, s.pour, (v) => { if (v) { s.pour = v; pk.querySelector("span:last-child").textContent = KP.fmt.court(v); } }); });
      d.querySelector("form").addEventListener("submit", () => { const txt = new FormData(d.querySelector("form")).get("txt").trim(); if (!txt) return; if (old) { store.editReq(old.id, { txt, pour: s.pour }); KP.toast("Rappel modifié"); } else { store.ask({ item: it.id, a: KP.me().k, quoi: "Autre", txt, pour: s.pour }); KP.toast("Rappel noté"); } });
    },
    /* une action ne prévient que son service : « Prévenir » alerte un autre service, au cas par cas */
    prevenir: (a) => { const it = cur(), u = KP.me(); KP.menu(a, KP.SERVICES.filter((s) => s.k !== it.svc && s.k !== u.svc).map((s) => ({ v: s.k, nom: s.nom })), (v) => store.prevenir(it.id, v), { right: true, title: "Prévenir un service" }); },
    "req-date": (a) => { const r = store.reqs().find((x) => x.id === a.dataset.id); if (r) KP.datepick(a, r.pour, (v) => { if (v && v !== r.pour) { store.editReq(r.id, { pour: v }); KP.toast(`Pour le ${KP.fmt.moyen(v)}`); } }); },
    "req-drop": (a) => { const r = store.reqs().find((x) => x.id === a.dataset.id); if (!r) return; store.dropReq(r.id); KP.toast(r.a === r.de ? "Rappel effacé" : `Demande à ${KP.dest(r.a)} retirée`); },
    relance: (a) => { const r = store.reqs().find((x) => x.id === a.dataset.id); if (r) store.relance(r.id); },
  });
})();
