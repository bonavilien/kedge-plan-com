/* Road to 7th — 2.9 : le budget par devis, à l'année (Résultats > Budget, chefs de projet seulement).
   Un devis : un média, un programme, une année scolaire, un état (reçu, signé, DA faite, facturé), son PDF rangé dans l'appli.
   Ses lignes se relient aux actions du plan : la fiche de l'action montre alors sa part du devis.
   Base sans le script 2.9_0038 : rien de tout ça, l'ancien onglet Budget par période reste en place (js/resultats.js). */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const $ = (id) => document.getElementById(id);
  const nb = KP.nb, eur = (n) => nb(Math.round(n || 0)) + " €";
  const IMPOSSIBLE_EUR = "Ce montant n'est pas possible : de 0 à 100 millions d'euros";
  const etat = (k) => KP.DEVIS_ETATS.find((e) => e.k === k) || KP.DEVIS_ETATS[0];
  const pill = (k, btn, id) => { const e = etat(k), inner = (e.k === "facture" ? ic("check") : "") + h(e.nom);
    return btn ? `<button type="button" class="pill ${e.pill}" data-act="dv-etat-menu" data-id="${id}" aria-label="État du devis : ${h(e.nom)}. Changer">${inner}</button>` : `<span class="pill ${e.pill}">${inner}</span>`; };
  const anCourant = () => KP.anDe(KP.TODAY);
  const anVu = () => (KP.route.an >= 2000 && KP.route.an <= 2100 ? KP.route.an : anCourant());
  const ENGAGE = ["signe", "da", "facture"];
  const valeur = (s) => (KP.valeur ? KP.valeur(s) : (String(s || "").trim() ? Math.round(Number(String(s).replace(/[^\d,.-]/g, "").replace(",", "."))) : null));
  /* l'année d'une action : de septembre à août ; une action « courant décembre » compte dans son mois */
  const dansAn = (it, a) => KP.anDe(it.date) === +a;
  const titreDe = (dv) => dv.media || "Devis sans média";
  const aRelier = (dv) => dv.lignes.filter((l) => l.items.length < (l.qte || 1)).length;

  /* ---------- l'année, en haut de l'onglet ---------- */
  KP.devisAns = () => { const a = anVu();
    return `<div class="seg dv-ans" role="group" aria-label="Année"><button type="button" data-act="dv-an" data-k="${a - 1}" aria-label="Année ${h(KP.anLib(a - 1))}">${ic("chevL")}</button><button type="button" class="on" aria-current="true">${h(KP.anLib(a))}</button><button type="button" data-act="dv-an" data-k="${a + 1}" aria-label="Année ${h(KP.anLib(a + 1))}">${ic("chevR")}</button></div>`; };

  /* ---------- l'onglet ---------- */
  KP.devisVue = () => {
    const a = anVu(), tous = store.devisDe(a).slice().sort((x, y) => (y.recu || "").localeCompare(x.recu || ""));
    const progs = [...new Set(tous.map((d) => d.prog).filter(Boolean))].sort((x, y) => x.localeCompare(y, "fr"));
    const prog = progs.includes(KP.ui.dvProg) ? KP.ui.dvProg : "";
    const liste = prog ? tous.filter((d) => d.prog === prog) : tous;
    const tot = (d) => store.totalDevis(d).ht;
    const par = (k) => liste.filter((d) => d.etat === k).reduce((s, d) => s + tot(d), 0);
    const total = liste.reduce((s, d) => s + tot(d), 0), offert = liste.reduce((s, d) => s + store.totalDevis(d).offert, 0);
    const engage = ENGAGE.reduce((s, k) => s + par(k), 0), env = prog ? null : store.envAn(a);
    const base = Math.max(1, total, env || 0), w = (n) => Math.round((1000 * n) / base) / 10;
    const reste = env != null ? env - engage : null;
    const sous = env != null ? (reste >= 0 ? `engagés : ${eur(engage)} sur ${eur(env)}, reste ${eur(reste)}` : `engagés : ${eur(engage)}, l'enveloppe est dépassée de ${eur(-reste)}`)
      : total ? `dont ${eur(engage)} engagés (signés, DA faite ou facturés)` : "aucun devis cette année";
    const seg = (k) => { const n = par(k), e = etat(k); return n ? `<i class="dv-s dv-s-${k}" style="width:${w(n)}%" title="${h(e.nom)} : ${h(eur(n))}"></i>` : ""; };
    const leg = (k) => `<span class="dv-leg"><i class="dv-s-${k}" aria-hidden="true"></i>${h(etat(k).nom)} <b>${h(eur(par(k)))}</b></span>`;
    const cle = (d) => `devis-${d.id}`;
    const ligne = (d) => { const t = store.totalDevis(d), r = aRelier(d), sel = KP.route.fiche === cle(d);
      return `<div class="row dv-row${sel ? " sel" : ""}" data-act="open" data-id="${cle(d)}">
        <span class="d">${d.recu ? `<b>${h(KP.fmt.moyen(d.recu))}</b>` : "—"}</span>
        <span class="t"><button type="button" class="open" data-act="open" data-id="${cle(d)}" title="${h(titreDe(d))}"><span class="tt">${h(titreDe(d))}</span></button><small>${d.lignes.length} ligne${d.lignes.length > 1 ? "s" : ""}${r ? ` · ${r} à relier` : ""}</small></span>
        <span class="svc">${h(d.prog || "—")}</span>
        <span class="msg dv-num">${h(d.num || "")}</span>
        <span class="dv-m"><b>${h(eur(t.ht))}</b></span>
        <span class="st">${pill(d.etat, true, d.id)}</span>
      </div>`; };
    /* les partenariats qui ont encore un montant noté à l'ancienne, action par action, et qu'aucun devis ne paie */
    const sans = store.items().filter((i) => i.variant === "partenariat" && !i.annule && dansAn(i, a) && store.montant(i.id) != null && !store.partsDe(i.id).length).sort((x, y) => x.date.localeCompare(y.date));
    const sansTot = sans.reduce((s, i) => s + store.montant(i.id), 0);
    const sansL = sans.map((it) => { const m = store.montant(it.id);
      return `<div class="r-b" data-id="${it.id}">
        <span class="d">${KP.dateCell(it)}</span>
        <span class="t"><button type="button" class="open" data-act="open" data-id="${it.id}" title="${h(it.t)}"><span class="tt">${h(it.t)}</span></button></span>
        <span class="svc">${h(it.partner || "Média à choisir")}</span>
        <span class="r-eur"><input class="input r-m" id="bm-${it.id}" data-id="${it.id}" data-v="${nb(m)}" value="${nb(m)}" inputmode="numeric" autocomplete="off" aria-label="Montant de « ${h(it.t)} », en euros"><span aria-hidden="true">€</span></span>
        <span class="st">${KP.pill(it)}</span>
      </div>`; }).join("");
    return `<div class="ag dv-h"><h2>L'année<small>${h(KP.anLib(a))}${prog ? " · " + h(prog) : ""}</small></h2>
        ${prog ? "" : `<label class="r-env">Enveloppe <span class="r-eur"><input class="input r-ea" id="ea-${a}" data-an="${a}" data-v="${env != null ? nb(env) : ""}" value="${env != null ? nb(env) : ""}" inputmode="numeric" autocomplete="off" placeholder="—" aria-label="Enveloppe de l'année ${h(KP.anLib(a))}, en euros HT"><span aria-hidden="true">€ HT</span></span></label>`}</div>
      <section class="dv-tot${reste != null && reste < 0 ? " over" : ""}" aria-label="Où en est l'argent de l'année">
        <div class="dv-big"><b>${h(eur(total))}</b><span>HT · ${h(eur(total * 1.2))} TTC</span></div>
        <p class="dv-sous">${h(sous)}</p>
        <div class="dv-barre" role="img" aria-label="${h(KP.DEVIS_ETATS.map((e) => `${e.nom} ${eur(par(e.k))}`).join(", "))}">${["facture", "da", "signe", "recu"].map(seg).join("")}</div>
        <div class="dv-legs">${KP.DEVIS_ETATS.map((e) => leg(e.k)).join("")}${offert ? `<span class="dv-leg muted">+ ${h(eur(offert))} offerts</span>` : ""}</div>
      </section>
      <div class="ag dv-h"><h2>Devis<small>${liste.length}</small></h2>
        ${progs.length > 1 ? `<div class="seg dv-progs" role="group" aria-label="Programme"><button type="button" data-act="dv-prog" data-k="" class="${prog ? "" : "on"}" aria-pressed="${!prog}">Tous</button>${progs.map((p) => `<button type="button" data-act="dv-prog" data-k="${h(p)}" class="${prog === p ? "on" : ""}" aria-pressed="${prog === p}">${h(p)}</button>`).join("")}</div>` : ""}
        <button type="button" class="btn quiet small" data-act="dv-new">${ic("plus")}Nouveau devis</button></div>
      ${liste.length ? `<div class="rows dv-rows"><div class="colh dv-colh" aria-hidden="true"><span>Reçu le</span><span>Média</span><span>Programme</span><span>N°</span><span>Total HT</span><span>État</span></div>${liste.map(ligne).join("")}</div>`
        : `<div class="empty dv-vide">${KP.illu ? KP.illu() : ""}<h3>Aucun devis sur ${h(KP.anLib(a))}</h3><p>Ajoute le premier : son média, ses lignes, son PDF.</p><button type="button" class="btn primary" data-act="dv-new">${ic("plus")}Nouveau devis</button></div>`}
      ${sans.length ? `<div class="ag"><h2>Sans devis<small>montants notés action par action · ${h(eur(sansTot))}</small></h2></div>
        <div class="rows r-budget"><div class="colh r-bh" aria-hidden="true"><span>Date</span><span>Partenariat</span><span>Média</span><span>Montant</span><span>État</span></div>${sansL}</div>` : ""}`;
  };

  /* ---------- la fiche d'un devis, dans le panneau de droite ---------- */
  KP.devisFiche = (el, id) => {
    const dv = store.devis(id);
    if (!dv || !store.voitDevis()) { el.hidden = true; el.innerHTML = ""; if (!KP.hold) setTimeout(() => { if (!store.devis(id) && store.voitDevis()) KP.toast("Ce devis n'existe plus"); KP.go({ fiche: "" }, true); }, 0); return; }
    const body = el.querySelector(".f-body"), top = body && el.dataset.id === "devis-" + id ? body.scrollTop : 0;
    const t = store.totalDevis(dv), r = aRelier(dv);
    const progs = [...new Set(store.devisTous().map((d) => d.prog).filter(Boolean))];
    const inp = (f, val, ph, extra = "") => `<input class="val" data-dv="${f}" value="${h(val || "")}" placeholder="${h(ph)}" autocomplete="off" ${extra}>`;
    const items = (l) => l.items.map((x) => store.get(x)).filter(Boolean);
    const lignes = dv.lignes.map((l) => {
      const it = items(l), manque = Math.max(0, (l.qte || 1) - it.length);
      return `<div class="dv-l" data-l="${l.id}">
        <button type="button" class="dv-lt" data-act="dv-ligne" data-l="${l.id}" aria-label="Modifier la ligne « ${h(l.t || "sans nom")} »"><span class="tt">${h(l.t || "Ligne sans nom")}</span>${l.d ? `<small>${h(l.d)}</small>` : ""}</button>
        <span class="dv-lm">${l.offert ? `<small>offert</small> ${h(eur(l.montant))}` : `<b>${h(eur(l.montant))}</b>`}${l.qte > 1 ? `<small class="dv-pu">${h(eur(l.montant / l.qte))} par action</small>` : ""}</span>
        <div class="dv-lk">${it.map((x) => `<span class="dv-chip"><button type="button" class="dv-chip-o" data-act="open" data-id="${x.id}" title="Ouvrir la fiche"><span class="d">${h(KP.dateShort(x))}</span><span class="tt">${h(x.t)}</span></button><button type="button" class="ib" data-act="dv-delier" data-l="${l.id}" data-i="${x.id}" aria-label="Délier « ${h(x.t)} »">${ic("close")}</button></span>`).join("")}
          <button type="button" class="dv-relier${manque ? "" : " plein"}" data-act="dv-lier" data-l="${l.id}">${ic("link")}${manque ? (l.qte > 1 ? `Relier ${manque === l.qte ? l.qte + " actions" : "encore " + manque}` : "Relier à une action") : "Relier"}</button></div>
      </div>`; }).join("");
    el.hidden = false; el.dataset.id = "devis-" + id;
    el.innerHTML = `
      <div class="f-top">
        <span class="kind"><i class="tag">Devis</i></span>
        <span class="r-prive muted">${ic("lock")}Chefs de projet</span>
        ${KP.ib("kebab", "Plus", "dv-more", 'aria-haspopup="menu"')}
        <button type="button" class="ib tip-l" data-act="close-fiche" data-tip="Fermer (Échap)" aria-label="Fermer">${ic("close")}</button>
      </div>
      <div class="f-body">
        <h2 class="sr" id="f-h">Devis ${h(titreDe(dv))}</h2>
        <textarea class="f-title" data-dv="media" data-auto rows="1" aria-label="Média" placeholder="Média">${h(dv.media)}</textarea>
        <dl class="f-meta">
          <dt>Total</dt><dd><span class="val dv-total"><b>${h(eur(t.ht))} HT</b><small class="muted">${h(eur(t.ht * 1.2))} TTC</small></span></dd>
          <dt>Programme</dt><dd>${inp("prog", dv.prog, "PGE, Bachelor…", 'list="dl-dv-prog" maxlength="60"')}<datalist id="dl-dv-prog">${progs.map((p) => `<option value="${h(p)}"></option>`).join("")}</datalist></dd>
          <dt>N°</dt><dd>${inp("num", dv.num, "Numéro du devis", 'maxlength="60"')}</dd>
          <dt>Reçu le</dt><dd><button type="button" class="val${dv.recu ? "" : " none"}" data-act="dv-recu">${dv.recu ? h(KP.fmt.long(dv.recu)) : "Choisir"}</button></dd>
          <dt>Année</dt><dd><button type="button" class="val" data-act="dv-annee">${h(KP.anLib(dv.annee))}</button></dd>
          <dt>Paiement</dt><dd>${inp("paiement", dv.paiement, "30 % à la signature…", 'maxlength="200"')}</dd>
          <dt>Remise</dt><dd><span class="r-eur dv-remise"><input class="input" data-dv="remise" value="${dv.remise ? nb(dv.remise) : ""}" data-v="${dv.remise ? nb(dv.remise) : ""}" placeholder="—" inputmode="numeric" autocomplete="off" aria-label="Remise, en euros HT"><span aria-hidden="true">€ HT</span></span></dd>
          <dt>État</dt><dd><div class="seg dv-etats" role="group" aria-label="État du devis">${KP.DEVIS_ETATS.map((e) => `<button type="button" data-act="dv-etat" data-k="${e.k}" class="${dv.etat === e.k ? "on" : ""}" aria-pressed="${dv.etat === e.k}">${e.k === "facture" && dv.etat === e.k ? ic("check") : ""}${h(e.nom)}</button>`).join("")}</div></dd>
        </dl>
        <section class="f-sec"><h3>Lignes${dv.lignes.length ? " · " + dv.lignes.length : ""}${r ? `<small class="dv-ar">${r} à relier</small>` : ""}<button type="button" class="link" data-act="dv-ligne-add">Ajouter</button></h3>
          ${lignes || `<p class="muted">Une ligne par prestation du devis : son libellé, son montant HT, combien d'actions elle paie.</p>`}
          ${dv.remise ? `<div class="dv-l dv-rem"><span class="dv-lt muted">Remise, répartie sur les lignes</span><span class="dv-lm">− ${h(eur(dv.remise))}</span></div>` : ""}
          ${t.offert ? `<p class="muted dv-off">Lignes offertes : ${h(eur(t.offert))} de valeur, hors total.</p>` : ""}
        </section>
        <section class="f-sec"><h3>Le devis</h3>
          ${dv.pdf ? `<div class="dv-pdf"><button type="button" class="dv-pdf-o" data-act="dv-pdf"><span class="dv-pdf-i" aria-hidden="true">PDF</span><span class="dv-pdf-t"><span class="tt">${h(dv.pdfNom || "Devis.pdf")}</span><small>Ouvrir</small></span></button><button type="button" class="ib" data-act="dv-pdf-retirer" data-tip="Retirer le PDF" aria-label="Retirer le PDF">${ic("trash")}</button></div>` : ""}
          <label class="dv-drop" data-drop="1"><input type="file" accept="application/pdf,.pdf" class="dv-file" aria-label="${dv.pdf ? "Remplacer le PDF" : "Ajouter le PDF du devis"}">${ic("doc")}<span>${dv.pdf ? "Glisse ici la version signée pour remplacer le PDF" : "Glisse le PDF du devis ici, ou clique pour le choisir"}</span></label>
        </section>
      </div>`;
    el.querySelector(".f-body").scrollTop = top;
  };

  /* ---------- gestes ---------- */
  const curDv = () => { const f = KP.route.fiche || ""; return f.startsWith("devis-") ? store.devis(f.slice(6)) : null; };
  const toastU = (txt, u) => { if (!u) return KP.toast(IMPOSSIBLE_EUR); KP.toast(txt, u); };

  /* une ligne : libellé, détail, montant HT, combien d'actions, offerte */
  const ligneForm = (dv, l) => {
    const d = KP.dialog(`<form method="dialog" class="dv-form"><h2>${l ? "Modifier la ligne" : "Ajouter une ligne"}</h2>
      <label class="field"><span>Libellé</span><input class="input" name="t" required maxlength="200" value="${h(l ? l.t : "")}" placeholder="Série vidéo, double page, newsletter…" autocomplete="off"></label>
      <label class="field"><span>Détail <small class="muted">facultatif</small></span><input class="input" name="d" maxlength="400" value="${h(l ? l.d : "")}" placeholder="4 épisodes, 1 journée de tournage…" autocomplete="off"></label>
      <div class="dv-2"><label class="field"><span>Montant HT</span><span class="r-eur"><input class="input" name="m" inputmode="numeric" required value="${l ? nb(l.montant) : ""}" autocomplete="off"><span aria-hidden="true">€</span></span></label>
      <label class="field"><span>Actions payées</span><input class="input" name="q" type="number" min="1" max="99" step="1" value="${l ? l.qte : 1}"></label></div>
      <label class="check dv-off-c"><input type="checkbox" name="o" ${l && l.offert ? "checked" : ""}><span>Offerte : le montant est sa valeur, hors total</span></label>
      <div class="foot">${l ? `<button type="button" class="btn quiet dv-sup">Supprimer la ligne</button>` : ""}<span class="sp"></span><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">${l ? "Enregistrer" : "Ajouter"}</button></div></form>`);
    const f = d.querySelector("form"); f.elements.t.focus();
    f.addEventListener("submit", (e) => {
      const m = valeur(f.elements.m.value), q = Math.round(Number(f.elements.q.value || 1));
      if (m == null || Number.isNaN(m) || m < 0 || m > 1e8) { e.preventDefault(); f.elements.m.focus(); return KP.toast(IMPOSSIBLE_EUR); }
      if (!(q >= 1 && q <= 99)) { e.preventDefault(); f.elements.q.focus(); return KP.toast("De 1 à 99 actions"); }
      const o = { t: f.elements.t.value.trim(), d: f.elements.d.value.trim(), montant: m, qte: q, offert: f.elements.o.checked };
      if (l) toastU(`Ligne « ${o.t} » enregistrée`, store.setLigne(dv.id, l.id, o));
      else { const r = store.addLigne(dv.id, o); toastU(`Ligne « ${o.t} » ajoutée`, r && r.undo); }
    });
    const sup = d.querySelector(".dv-sup");
    if (sup) sup.addEventListener("click", () => { d.close(); KP.toast(`Ligne « ${l.t} » supprimée`, store.delLigne(dv.id, l.id)); });
  };

  /* relier une ligne à des actions : les actions de l'année, celles du même média d'abord */
  const lierPop = (a, dv, l) => {
    const media = (dv.media || "").toLowerCase();
    const cands = () => store.items().filter((i) => i.kind === "action" && !i.annule && (dansAn(i, dv.annee) || l.items.includes(i.id)))
      .sort((x, y) => (l.items.includes(y.id) - l.items.includes(x.id)) || (((y.partner || "").toLowerCase() === media) - ((x.partner || "").toLowerCase() === media)) || x.date.localeCompare(y.date));
    let q = "";
    const liste = () => { const ll = (store.devis(dv.id) || dv).lignes.find((x) => x.id === l.id) || l, t = KP.norm ? KP.norm(q) : q.toLowerCase();
      const res = cands().filter((i) => !q || (KP.norm ? KP.norm(i.t + " " + (i.partner || "")) : (i.t + " " + (i.partner || "")).toLowerCase()).includes(t)).slice(0, 40);
      return res.length ? res.map((i) => { const on = ll.items.includes(i.id); return `<button type="button" class="pop-i dv-c" role="menuitemcheckbox" aria-checked="${on}" data-i="${i.id}"><span class="dv-cb${on ? " on" : ""}" aria-hidden="true">${on ? ic("check") : ""}</span><span>${h(i.t)}<small>${h(KP.dateShort(i))}${i.partner ? " · " + h(i.partner) : i.svc ? " · " + h((KP.service(i.svc) || {}).nom || "") : ""}</small></span></button>`; }).join("")
        : `<p class="txt muted">Aucune action ${q ? "ne correspond" : "sur cette année"}.</p>`; };
    const p = KP.pop(a, `<h4 class="pop-h">Relier « ${h(l.t || "la ligne")} »</h4><div class="dv-q">${ic("search")}<input type="text" class="input" placeholder="Chercher une action" aria-label="Chercher une action" autocomplete="off" autofocus></div><div class="dv-cs" role="menu">${liste()}</div>`, { role: "dialog", label: "Relier à des actions", cls: "pop-dv", right: true });
    const inp = p.el.querySelector("input"), box = p.el.querySelector(".dv-cs");
    if (!KP.phone()) inp.focus();
    inp.addEventListener("input", () => { q = inp.value.trim(); box.innerHTML = liste(); });
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (!b) return;
      const on = b.getAttribute("aria-checked") !== "true", it = store.get(b.dataset.i);
      const u = store.lier(dv.id, l.id, b.dataset.i, on); if (u) KP.toast(on ? `Reliée à « ${it.t} »` : `Déliée de « ${it.t} »`, u);
      box.innerHTML = liste(); const again = box.querySelector(`[data-i="${b.dataset.i}"]`); if (again) again.focus(); });
  };

  /* le PDF : déposé dans l'appli (Supabase Storage) ; en démonstration, gardé dans cet onglet seulement */
  const demoPdf = {};
  const deposer = async (dv, file) => {
    if (!file) return;
    if (!/pdf$/i.test(file.type || "") && !/\.pdf$/i.test(file.name || "")) return KP.toast("Seulement un PDF");
    if (file.size > 20 * 1024 * 1024) return KP.toast("Ce PDF dépasse 20 Mo");
    const ancien = dv.pdf;
    try {
      let chemin;
      if (store.remote() && KP.remote && KP.remote.pdf) { KP.toast("Envoi du PDF…"); chemin = await KP.remote.pdf.deposer(dv.id, file); }
      else { chemin = "demo:" + dv.id + ":" + Date.now(); demoPdf[chemin] = URL.createObjectURL(file); }
      const u = store.setDevis(dv.id, { pdf: chemin, pdfNom: (file.name || "devis.pdf").slice(0, 200) });
      if (ancien && ancien !== chemin && store.remote() && KP.remote && KP.remote.pdf) KP.remote.pdf.retirer(ancien).catch(() => {});
      KP.toast(ancien ? "PDF remplacé" : store.remote() ? "PDF rangé dans l'appli" : "PDF ajouté (démonstration : gardé dans cet onglet)", store.remote() ? null : u);
    } catch (e) { console.error(e); KP.toast(/bucket|not found|404/i.test((e && e.message) || "") ? "Le dossier des PDF n'existe pas encore : colle 2.9_0038 dans Supabase" : "Le PDF n'est pas parti : " + ((e && e.message) || "pas de réseau ?")); }
  };
  const ouvrirPdf = async (dv) => {
    if (!dv.pdf) return;
    if (dv.pdf.startsWith("demo:")) { const u = demoPdf[dv.pdf]; return u ? window.open(u, "_blank", "noopener") : KP.toast("Démonstration : le PDF n'est gardé que dans l'onglet où il a été déposé"); }
    const w = window.open("", "_blank");
    try { const u = await KP.remote.pdf.lien(dv.pdf); if (w) w.location = u; else location.href = u; }
    catch (e) { if (w) w.close(); KP.toast("Impossible d'ouvrir le PDF : " + ((e && e.message) || "pas de réseau ?")); }
  };
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains("dv-file")) { const dv = curDv(); if (dv) deposer(dv, t.files && t.files[0]); t.value = ""; return; }
    /* champs de la fiche du devis : enregistrés en quittant le champ */
    if (t.dataset && t.dataset.dv && t.closest("#fiche")) {
      const dv = curDv(); if (!dv) return; const f = t.dataset.dv;
      if (f === "remise") { const n = valeur(t.value); setTimeout(() => { const u = n == null || !Number.isNaN(n) ? store.setDevis(dv.id, { remise: n || 0 }) : null; if (!u) { t.value = t.dataset.v || ""; return KP.toast(n > store.totalDevis(dv).paye ? "La remise dépasse le total des lignes" : IMPOSSIBLE_EUR); } KP.toast(n ? `Remise : ${eur(n)}` : "Remise retirée", u); }, 0); return; }
      const v = t.value.trim().slice(0, f === "paiement" ? 200 : f === "media" ? 120 : 60);
      if (v === (dv[f] || "")) return;
      const noms = { media: "Média", prog: "Programme", num: "N°", paiement: "Paiement" };
      setTimeout(() => KP.toast(`${noms[f]} enregistré`, store.setDevis(dv.id, { [f]: v })), 0);
    }
    /* l'enveloppe de l'année */
    if (t.classList && t.classList.contains("r-ea")) { const n = valeur(t.value), a = t.dataset.an;
      setTimeout(() => { const u = Number.isNaN(n) ? null : store.setEnvAn(a, n); if (!u) { t.value = t.dataset.v || ""; return KP.toast(IMPOSSIBLE_EUR); } KP.toast(n != null ? `Enveloppe ${KP.anLib(a)} : ${eur(n)}` : "Enveloppe retirée", u); }, 0); }
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target; if (!t.classList || e.isComposing) return;
    if (t.classList.contains("r-ea") || (t.dataset && t.dataset.dv && t.tagName === "INPUT")) {
      if (e.key === "Enter") { e.preventDefault(); t.blur(); }
      if (e.key === "Escape" && t.classList.contains("r-ea")) { e.preventDefault(); e.stopPropagation(); t.value = t.dataset.v || ""; t.blur(); }
    }
    /* le titre (média) : Entrée enregistre au lieu d'aller à la ligne */
    if (t.tagName === "TEXTAREA" && t.dataset && t.dataset.dv === "media" && e.key === "Enter") { e.preventDefault(); t.blur(); }
  });
  /* le nombre se lit groupé pendant qu'on le tape (« 25 000 ») */
  document.addEventListener("input", (e) => { const t = e.target; if (!t.classList || !(t.classList.contains("r-ea") || (t.dataset && t.dataset.dv === "remise"))) return;
    if (/^[\d\s  ]*$/.test(t.value) && KP.groupe) { t.value = KP.groupe(t.value); } });
  /* glisser-déposer le PDF sur la zone */
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { const z = e.target.closest && e.target.closest(".dv-drop"); if (!z) return; e.preventDefault(); z.classList.add("sur"); }));
  document.addEventListener("dragleave", (e) => { const z = e.target.closest && e.target.closest(".dv-drop"); if (z) z.classList.remove("sur"); });
  document.addEventListener("drop", (e) => { const z = e.target.closest && e.target.closest(".dv-drop"); if (!z) return; e.preventDefault(); z.classList.remove("sur"); const dv = curDv(); if (dv) deposer(dv, e.dataTransfer.files && e.dataTransfer.files[0]); });

  const nouveau = () => {
    const a = anVu(), medias = [...new Set([...store.partners(), ...store.devisTous().map((d) => d.media)].filter(Boolean))], progs = [...new Set(store.devisTous().map((d) => d.prog).filter(Boolean))];
    const d = KP.dialog(`<form method="dialog" class="dv-form"><h2>Nouveau devis</h2>
      <label class="field"><span>Média</span><input class="input" name="media" required maxlength="120" list="dl-dv-m" placeholder="Le média ou le prestataire" autocomplete="off"><datalist id="dl-dv-m">${medias.map((m) => `<option value="${h(m)}"></option>`).join("")}</datalist></label>
      <div class="dv-2"><label class="field"><span>Programme</span><input class="input" name="prog" maxlength="60" list="dl-dv-p" placeholder="PGE, Bachelor…" autocomplete="off"><datalist id="dl-dv-p">${progs.map((m) => `<option value="${h(m)}"></option>`).join("")}</datalist></label>
      <label class="field"><span>N° du devis</span><input class="input" name="num" maxlength="60" autocomplete="off"></label></div>
      <p class="muted dv-an-n">Année ${h(KP.anLib(a))}, reçu ${a === anCourant() ? "aujourd'hui" : "le 1er septembre"} : tout se change ensuite dans sa fiche.</p>
      <div class="foot"><span class="sp"></span><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary">Créer</button></div></form>`);
    const f = d.querySelector("form"); f.elements.media.focus();
    f.addEventListener("submit", () => {
      const r = store.addDevis({ annee: a, recu: a === anCourant() ? KP.TODAY : `${a}-09-01`, media: f.elements.media.value.trim(), prog: f.elements.prog.value.trim(), num: f.elements.num.value.trim() });
      KP.toast("Devis créé", r.undo); KP.go({ fiche: "devis-" + r.id });
      setTimeout(() => { const b = $("fiche").querySelector('[data-act="dv-ligne-add"]'); if (b) b.focus(); }, 60);
    });
  };

  Object.assign(KP.acts, {
    "dv-an": (a) => KP.go({ an: +a.dataset.k, fiche: "" }),
    "dv-prog": (a) => { KP.ui.dvProg = a.dataset.k; KP.render(); },
    "dv-new": () => nouveau(),
    "dv-etat": (a) => { const dv = curDv(); if (!dv || dv.etat === a.dataset.k) return; KP.toast(`Devis ${titreDe(dv)} : ${etat(a.dataset.k).nom}`, store.setDevis(dv.id, { etat: a.dataset.k })); },
    "dv-etat-menu": (a, e) => { e.stopPropagation(); const dv = store.devis(a.dataset.id); if (!dv) return;
      KP.menu(a, KP.DEVIS_ETATS.map((s) => ({ v: s.k, nom: s.nom, pill: s.pill })), (v) => { if (v !== dv.etat) KP.toast(`Devis ${titreDe(dv)} : ${etat(v).nom}`, store.setDevis(dv.id, { etat: v })); }, { selected: [dv.etat], right: true, title: "État du devis" }); },
    "dv-recu": (a) => { const dv = curDv(); if (!dv) return; KP.datepick(a, dv.recu || KP.TODAY, (v) => { if (!v || v === dv.recu) return;
      const an = KP.anDe(v); KP.toast(an !== dv.annee ? `Reçu le ${KP.fmt.moyen(v)} : passe sur ${KP.anLib(an)}` : `Reçu le ${KP.fmt.moyen(v)}`, store.setDevis(dv.id, { recu: v, annee: an })); }); },
    "dv-annee": (a) => { const dv = curDv(); if (!dv) return; const c = anCourant(); KP.menu(a, [c - 2, c - 1, c, c + 1, c + 2].map((x) => ({ v: String(x), nom: KP.anLib(x) })), (v) => { if (+v !== dv.annee) KP.toast(`Devis rangé sur ${KP.anLib(+v)}`, store.setDevis(dv.id, { annee: +v })); }, { selected: [String(dv.annee)], title: "Année scolaire" }); },
    "dv-ligne-add": () => { const dv = curDv(); if (dv) ligneForm(dv, null); },
    "dv-ligne": (a) => { const dv = curDv(), l = dv && dv.lignes.find((x) => x.id === a.dataset.l); if (l) ligneForm(dv, l); },
    "dv-lier": (a) => { const dv = curDv(), l = dv && dv.lignes.find((x) => x.id === a.dataset.l); if (l) lierPop(a, dv, l); },
    "dv-delier": (a, e) => { e.stopPropagation(); const dv = curDv(), it = store.get(a.dataset.i); if (!dv) return; KP.toast(`Déliée de « ${it ? it.t : "l'action"} »`, store.lier(dv.id, a.dataset.l, a.dataset.i, false)); },
    "dv-pdf": () => { const dv = curDv(); if (dv) ouvrirPdf(dv); },
    "dv-pdf-retirer": () => { const dv = curDv(); if (!dv || !dv.pdf) return; const ancien = dv.pdf;
      const u = store.setDevis(dv.id, { pdf: "", pdfNom: "" }); if (store.remote() && KP.remote && KP.remote.pdf && !ancien.startsWith("demo:")) KP.remote.pdf.retirer(ancien).catch(() => {});
      KP.toast("PDF retiré", store.remote() ? null : u); },
    "dv-more": (a) => { const dv = curDv(); if (!dv) return;
      KP.menu(a, [{ v: "sup", nom: "Supprimer le devis", icon: "trash", danger: true }], () => {
        const d = KP.dialog(`<form method="dialog"><h2>Supprimer le devis ${h(titreDe(dv))} ?</h2><p class="muted">Ses lignes${dv.pdf ? ", son PDF" : ""} et ses liens aux actions partent aussi. Les actions restent dans le plan.</p><div class="foot"><button type="button" class="btn quiet" data-close>Garder</button><button class="btn primary danger-bg">Supprimer</button></div></form>`);
        d.querySelector("form").addEventListener("submit", () => { KP.go({ fiche: "" }, true); const u = store.delDevis(dv.id); KP.toast("Devis supprimé", store.remote() ? null : u); });
      }, { right: true }); },
  });
})();
