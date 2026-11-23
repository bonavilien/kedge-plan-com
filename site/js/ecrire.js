/* Road to 7th — « Demander en une phrase ». Sur la fiche, une seule ligne pour demander (« @Estelle les visuels pour
   vendredi dans 2 semaines »), prévenir pour info, se noter un rappel, répondre « c'est envoyé » ou décaler l'action.
   La phrase est lue par des règles (phrase.js) ; ce qui est reconnu est surligné, et rien ne part sans un clic. */
(() => {
  const KP = window.KP, { h, ic, store } = KP, P = KP.phrase;
  const $ = (id) => document.getElementById(id);
  const etat = (id) => { KP.ui.ph = KP.ui.ph || {}; return KP.ui.ph[id] || (KP.ui.ph[id] = { txt: "", noDate: false, quick: "", dates: false, sansDoc: false, res: null, sansPrix: false, sel: 0, pos: null, ferme: false }); };
  const recents = () => { try { const v = JSON.parse(localStorage.getItem("kplan-recents") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const retenir = (ks) => { try { localStorage.setItem("kplan-recents", JSON.stringify([...ks, ...recents().filter((k) => !ks.includes(k))].slice(0, 8))); } catch (e) { /* rien */ } };
  const cur = () => store.get(KP.route.fiche);
  const defaut = (it) => [KP.addDays(it.date, -7), KP.addDays(KP.TODAY, 1)].sort().pop();
  const moi = () => KP.me();
  /* à qui on peut écrire : l'équipe (sauf soi et les visiteurs) et les services (sauf le sien) */
  const gens = () => KP.PEOPLE.filter((p) => p.k !== moi().k && p.role !== "lecteur").map((p) => ({ k: p.k, nom: p.nom }));
  const services = () => KP.SERVICES.filter((s) => s.k !== moi().svc);
  const ctx = (it) => ({ today: KP.TODAY, action: it.date, people: gens(), services: services(), items: store.items().filter((x) => x.id !== it.id) });
  const date = (v) => `${KP.fmt.court(v)} ${KP.fmt.moyen(v).split(" ").slice(1).join(" ")}`;   /* « ven. 4 déc. » */

  /* ce que la phrase deviendra si on l'envoie */
  const analyse = (it) => {
    const s = etat(it.id), r = P.lire(s.txt, ctx(it)), can = store.canEdit(it), a = { r, s };
    const ouvertes = store.reqsOf(it.id).filter((q) => !q.fait && q.de !== q.a && q.pour && KP.reqMine(q));
    if (r.intention === "fait" && ouvertes.length)
      a.cible = ouvertes.find((q) => r.qui.some((w) => w.k === q.de)) || ouvertes.find((q) => r.quoi && q.quoi === r.quoi.nom) || [...ouvertes].sort((x, y) => x.pour.localeCompare(y.pour))[0];
    /* « @RS on décale au 4 décembre » : la date est celle de l'action, RS est prévenu pour info */
    const datee = r.intention === "demande" && !s.noDate;
    a.mode = r.intention === "rappel" ? "rappel" : a.cible ? "reponse" : r.qui.length ? datee || s.quick ? "demande" : "info" : "";
    a.date = a.mode === "rappel" ? (r.date ? r.date.iso : defaut(it)) : a.mode === "demande" ? (s.quick || r.date.iso) : "";
    a.lue = a.mode === "demande" && !s.quick;   /* la date vient de la phrase (et pas d'un bouton) */
    a.decaler = r.intention === "decaler" && can && r.date && r.date.iso !== it.date && it.variant !== "sujet" ? r.date.iso : "";
    a.docs = can && !it.annule ? r.liens.filter((l) => l.sp && !it.docs.some((d) => d.url === l.url)) : [];
    /* « 12 000 vues » sur une action diffusée (ou passée) : ses résultats ; « 1 500 € » sur un partenariat, écrit par un chef de projet : son budget */
    const ch = r.chiffres.filter((c, i, l) => l.findIndex((x) => x.unite === c.unite) === i);
    a.res = can && store.resOk() && ch.length && it.kind === "action" && !it.annule && (it.st === "diffuse" || (!it.flou && it.date <= KP.TODAY)) ? Object.fromEntries(ch.map((c) => [c.unite, c.n])) : null;
    a.prix = r.montant && it.variant === "partenariat" && !it.annule && store.voitBudget() && !(store.voitDevis() && store.partsDe(it.id).length) && r.montant.n >= 0 && r.montant.n <= 1e8 ? Math.round(r.montant.n) : null;
    /* noter les chiffres : proposé coché seulement quand la phrase ne demande rien à personne (« 12 400 vues » tout seul) */
    a.noteRes = !!a.res && (s.res != null ? s.res : !r.qui.length && r.intention !== "rappel"); a.notePrix = a.prix != null && !s.sansPrix;
    const fin = it.variant === "sujet" ? KP.endOf(it) : it.date;
    a.alerte = a.mode === "demande" ? (a.date < KP.TODAY ? "date passée" : a.date > fin && !it.flou && it.variant !== "sujet" ? `après ${it.kind === "tf" ? "le temps fort" : "la diffusion"} du ${date(it.date)}` : "") : "";
    /* un montant écrit dans un message part à la personne : le budget, lui, est réservé aux chefs de projet */
    a.montantVu = r.montant && r.qui.length && (a.mode === "demande" || a.mode === "info") && !a.notePrix ? r.qui.map((q) => q.nom).join(", ") : "";
    return a;
  };

  /* ---------- la ligne pour écrire ---------- */
  const html = (it) => `<div class="ph" data-ph="${it.id}">
      <div class="ph-box"><div class="ph-champ"><div class="ph-miroir" aria-hidden="true"></div>
        <textarea id="ph-t" rows="1" placeholder="@quelqu'un et ton message" aria-label="Écrire : @ et un nom, ton message, et pour quand" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="ph-sugg" aria-expanded="false"></textarea></div>
        <button type="button" class="ph-go" data-act="ph-send" aria-label="Envoyer" data-tip="Envoyer (Entrée)">${ic("arrow")}</button></div>
      <div class="ph-sugg" id="ph-sugg" role="listbox" aria-label="Suggestions" hidden></div>
      <div class="ph-apercu" aria-live="polite"></div>
    </div>`;

  /* le surlignage : un miroir du texte sous le champ ; la date passe au surligneur à chaque nouvelle date reconnue */
  let vu = "", tour = 0;
  const peindre = (root, it) => {
    const box = root.querySelector(".ph"); if (!box) return;
    const a = analyse(it), { r, s } = a, ta = box.querySelector("textarea");
    /* le @ ou le # en cours : juste avant le curseur, même au milieu de la phrase */
    const pos = s.pos == null || s.pos > s.txt.length ? s.txt.length : s.pos;
    const rc0 = pos === s.txt.length ? r : P.lire(s.txt.slice(0, pos), ctx(it));
    const clef = r.date && a.mode !== "info" ? r.date.txt : ""; if (clef && clef !== vu) tour++; vu = clef;
    const cls = (k) => (k === "chiffre" && a.noteRes) || (k === "montant" && a.notePrix) ? "z-res" : k === "qui" ? "z-qui" : k === "rappel" ? "z-qui" : k === "ref" ? "z-ref" : k === "date" && (a.lue || a.mode === "rappel" || a.decaler) ? `z-date${a.alerte ? " alerte" : ""} t${tour % 2}` : "";
    box.querySelector(".ph-miroir").innerHTML = P.morceaux(s.txt, r).map((m) => m.k && cls(m.k) ? `<mark class="${cls(m.k)}">${h(m.t)}</mark>` : h(m.t)).join("") + "​";
    /* ce que l'appli a compris */
    const chips = [];
    r.qui.forEach((q) => chips.push(`<span class="ph-c qui">${h(q.nom)}</span>`));
    if (a.mode === "rappel") chips.push(`<span class="ph-c memo">${ic("clock")}Rappel pour moi · ${h(date(a.date))}</span>`);
    if (a.mode === "reponse") chips.push(`<span class="ph-c ok">${ic("check")}Répond à ${h(KP.dest(a.cible.de))} · ${h(a.cible.quoi !== "Autre" && a.cible.quoi !== "Info" ? a.cible.quoi : (a.cible.txt || "").slice(0, 32))}</span>`);
    if (a.mode === "demande") chips.push(`<button type="button" class="ph-c date t${tour % 2}" data-act="ph-nodate" aria-label="Retirer la date : pour le ${h(date(a.date))}">pour le ${h(date(a.date))}${ic("close")}</button>`) ;
    if (a.alerte) chips.push(`<span class="ph-alerte">${h(a.alerte)}</span>`);
    if (a.montantVu) chips.push(`<span class="ph-alerte">${ic("lock")}montant lu par ${h(a.montantVu)}</span>`);
    if (a.mode === "info") {
      chips.push(`<span class="ph-c info">${ic("bell")}pour info</span>`);
      if (!s.dates) chips.push(`<button type="button" class="ph-c rond" data-act="ph-dates" aria-label="Ajouter une échéance" data-tip="Ajouter une échéance">${ic("calendar")}</button>`);
      else [["J-7", KP.addDays(it.date, -7)], ["J-3", KP.addDays(it.date, -3)], ["Demain", KP.addDays(KP.TODAY, 1)]].filter(([, v], i, l) => v > KP.TODAY && l.findIndex(([, w]) => w === v) === i)
        .forEach(([l, v]) => chips.push(`<button type="button" class="ph-c choix" data-act="ph-quick" data-v="${v}">${l} · ${h(date(v))}</button>`));
    }
    if (a.decaler) { const n = it.kind === "tf" ? store.relaisQuiSuivent(it.id).length : 0;
      chips.push(`<button type="button" class="ph-c propose" data-act="ph-decaler">${ic("shift")}Déplacer ${it.kind === "tf" ? "le temps fort" : "l'action"} au ${h(date(a.decaler))}${n ? ` avec ${n > 1 ? `ses ${n} relais` : "son relais"}` : ""}</button>`); }
    if (a.docs.length) chips.push(`<button type="button" class="ph-c propose${s.sansDoc ? "" : " on"}" data-act="ph-doc" aria-pressed="${!s.sansDoc}">${ic("doc")}Ranger ${a.docs.length > 1 ? "les liens" : "le lien"} dans les documents</button>`);
    if (a.res) chips.push(`<button type="button" class="ph-c propose${a.noteRes ? " on" : ""}" data-act="ph-res" aria-pressed="${a.noteRes}">${ic("chart")}Noter ${h(KP.resTxt(a.res))}${it.st !== "diffuse" ? " et passer en Diffusé" : ""}</button>`);
    if (a.prix != null) chips.push(`<button type="button" class="ph-c propose${a.notePrix ? " on" : ""}" data-act="ph-prix" aria-pressed="${a.notePrix}">${ic("lock")}Budget : ${h(KP.nb(a.prix))} €</button>`);
    if (!a.mode && !a.noteRes && !a.notePrix && s.txt.trim() && rc0.tape === undefined && rc0.cherche === undefined && !a.decaler) chips.push(`<span class="muted">Tape @ pour choisir à qui</span>`);
    const ap = box.querySelector(".ph-apercu"); ap.innerHTML = chips.join(""); ap.hidden = !chips.length;
    box.querySelector(".ph-go").disabled = !a.mode && !a.noteRes && !a.notePrix;
    /* suggestions : @ puis des lettres, ou # puis le début d'un titre */
    const sg = box.querySelector(".ph-sugg"); let list = [];
    const tape = s.ferme ? undefined : rc0.tape, cherche = s.ferme ? undefined : rc0.cherche;
    if (tape !== undefined) {
      const t = P.plat(tape), rc = recents(), deja = r.qui.map((q) => q.k);
      list = [...gens().map((p) => ({ k: p.k, nom: p.nom, mot: p.nom })), ...services().map((x) => ({ k: x.k, nom: x.nom, mot: x.court || x.nom }))]
        .filter((c) => !deja.includes(c.k) && (P.plat(c.nom).startsWith(t) || P.plat(c.mot).startsWith(t)))
        .sort((x, y) => ((rc.indexOf(x.k) + 1 || 99) - (rc.indexOf(y.k) + 1 || 99)) || x.nom.localeCompare(y.nom)).slice(0, 5)
        .map((c) => ({ v: "@" + c.mot + " ", lib: "@" + c.mot, info: c.mot !== c.nom ? c.nom : "" }));
    } else if (cherche !== undefined && cherche.trim().length) {
      const t = P.plat(cherche.trim());
      const rang = (x) => { const n = P.plat(x.t); return n.startsWith(t) ? 0 : new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(n) ? 1 : 2; };
      list = store.items().filter((x) => x.id !== it.id && P.plat(x.t).includes(t)).sort((x, y) => rang(x) - rang(y) || (x.date < KP.TODAY) - (y.date < KP.TODAY) || x.date.localeCompare(y.date)).slice(0, 5)
        .map((x) => ({ v: "#" + x.t + " ", lib: x.t, info: KP.dateShort(x) }));
    }
    s.sel = Math.min(s.sel, Math.max(0, list.length - 1));
    sg.hidden = !list.length; ta.setAttribute("aria-expanded", String(!!list.length));
    if (list.length) ta.setAttribute("aria-activedescendant", "ph-s" + s.sel); else ta.removeAttribute("aria-activedescendant");
    sg.innerHTML = list.map((c, i) => `<button type="button" role="option" id="ph-s${i}" tabindex="-1" class="ph-s${i === s.sel ? " on" : ""}" aria-selected="${i === s.sel}" data-act="ph-pick" data-v="${h(c.v)}">${h(c.lib)}${c.info ? ` <small>${h(c.info)}</small>` : ""}</button>`).join("");
    /* la hauteur suit le texte */
    ta.style.height = "auto"; ta.style.height = box.querySelector(".ph-miroir").offsetHeight + "px";
  };

  /* après chaque rendu de la fiche : remettre le brouillon, et le curseur s'il y était */
  const monte = (root, it, foc) => {
    const ta = root.querySelector("#ph-t"); if (!ta) return;
    ta.value = etat(it.id).txt; peindre(root, it);
    if (foc) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(foc[0], foc[1]); } catch (e) { /* rien */ } }
  };

  /* remplacer le @… ou le #… en cours par la suggestion choisie */
  const choisir = (v) => {
    const it = cur(), s = etat(it.id), ta = $("ph-t"), pos = s.pos == null || s.pos > s.txt.length ? s.txt.length : s.pos;
    const avant = s.txt.slice(0, pos).replace(v.startsWith("@") ? /@[^\s@#]*$/ : /#[^#@]*$/, v), apres = s.txt.slice(pos).replace(/^\S*\s?/, (x) => (v.startsWith("@") ? "" : x));
    s.txt = avant + apres; s.sel = 0; s.pos = avant.length;
    ta.value = s.txt; ta.focus(); ta.setSelectionRange(avant.length, avant.length); peindre($("fiche"), it);
  };

  document.addEventListener("input", (e) => {
    if (e.target.id !== "ph-t") return;
    const it = cur(); if (!it) return;
    Object.assign(etat(it.id), { txt: e.target.value, noDate: false, quick: "", dates: false, sel: 0, pos: e.target.selectionStart, ferme: false });
    peindre($("fiche"), it);
  });
  /* le curseur bouge sans taper (clic, flèches) : les suggestions suivent */
  const suit = (e) => { if (e.target.id !== "ph-t") return; const it = cur(); if (!it) return; const s = etat(it.id); if (s.pos !== e.target.selectionStart) { s.pos = e.target.selectionStart; peindre($("fiche"), it); } };
  document.addEventListener("click", suit);
  document.addEventListener("keyup", (e) => { if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) suit(e); });
  document.addEventListener("keydown", (e) => {
    /* Safari : la touche qui valide une saisie japonaise ou une correction arrive avec le code 229 */
    if (e.target.id !== "ph-t" || e.isComposing || e.keyCode === 229) return;
    const it = cur(), s = etat(it.id), opts = [...document.querySelectorAll(".ph-sugg:not([hidden]) .ph-s")];
    /* Échap ferme d'abord les suggestions, sans quitter la ligne */
    if (opts.length && e.key === "Escape") { e.preventDefault(); s.ferme = true; peindre($("fiche"), it); return; }
    if (opts.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); s.sel = (s.sel + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length; peindre($("fiche"), it); return; }
    if (opts.length && (e.key === "Enter" || e.key === "Tab") && !e.shiftKey) { e.preventDefault(); choisir(opts[s.sel].dataset.v); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); KP.acts["ph-send"](); }
  });

  const titreLien = (url) => { try { const p = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || ""); return p.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 80) || "Lien SharePoint"; } catch (e) { return "Lien SharePoint"; } };

  Object.assign(KP.acts, {
    "ph-pick": (b) => choisir(b.dataset.v),
    "ph-nodate": () => { const it = cur(), s = etat(it.id); if (s.quick) s.quick = ""; else s.noDate = true; peindre($("fiche"), it); $("ph-t").focus(); },
    "ph-dates": () => { const it = cur(); etat(it.id).dates = true; peindre($("fiche"), it); const b = document.querySelector(".ph-c.choix"); if (b) b.focus(); },
    "ph-quick": (b) => { const it = cur(); etat(it.id).quick = b.dataset.v; peindre($("fiche"), it); $("ph-t").focus(); },
    "ph-res": () => { const it = cur(), s = etat(it.id), a = analyse(it); s.res = !a.noteRes; peindre($("fiche"), it); $("ph-t").focus(); },
    "ph-prix": () => { const it = cur(), s = etat(it.id); s.sansPrix = !s.sansPrix; peindre($("fiche"), it); $("ph-t").focus(); },
    "ph-doc": () => { const it = cur(), s = etat(it.id); s.sansDoc = !s.sansDoc; peindre($("fiche"), it); $("ph-t").focus(); },
    "ph-decaler": () => {
      const it = cur(), a = analyse(it); if (!a.decaler) return;
      const motif = P.propre(a.s.txt, a.r), moved = it.kind === "tf" ? store.relaisQuiSuivent(it.id).length : 0;
      KP.toast(`Déplacé au ${KP.fmt.moyen(a.decaler)}${moved ? `, avec ${moved > 1 ? `ses ${moved} relais` : "son relais"}` : ""}`, store.setDate(it.id, a.decaler, false, it.flou || it.st === "confirmer" && !moved ? null : motif));
      setTimeout(() => { const ta = $("ph-t"); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 0);
    },
    "ph-send": () => {
      const it = cur(); if (!it) return;
      const a = analyse(it), { r, s } = a, ta = $("ph-t");
      /* sans @ : seulement noter les chiffres ou le montant */
      const notes = [], undos = [];
      /* les chiffres d'abord : s'ils sont refusés, l'état ne passe pas en Diffusé */
      if (a.noteRes) { const u = store.setRes(it.id, a.res); if (!u) return KP.toast("Ce chiffre n'est pas possible : un nombre entier, de 0 à un milliard"); undos.push(u);
        if (it.st !== "diffuse") undos.push(store.update(it.id, { st: "diffuse" }, "a passé l'état à « Diffusé »")); notes.push(KP.resTxt(a.res)); }
      if (a.notePrix) { const u = store.setMontant(it.id, a.prix); if (u) { undos.push(u); notes.push(`budget ${KP.nb(a.prix)} €`); } }
      const annuler = undos.length ? () => [...undos].reverse().forEach((u) => u && u()) : null;
      if (!a.mode && notes.length) { KP.ui.ph[it.id] = null; KP.render(); return KP.toast(`Noté : ${notes.join(", ")}`, annuler); }
      if (!a.mode) { if (ta) ta.focus(); return KP.toast(a.decaler ? "Pour prévenir quelqu'un du changement, ajoute @ et son nom" : "Commence par @ et le nom de la personne"); }
      /* le montant noté au budget ne part pas dans le message : seuls les chefs de projet le voient */
      const r2 = a.notePrix ? { ...r, zones: [...r.zones.filter((z) => z.k !== "montant"), ...(r.montant ? [{ k: "rappel", at: r.montant.at, end: r.montant.end }] : [])] } : r;
      const txt = P.propre(s.txt, r2, { sansDate: a.mode === "rappel" }) || (a.notePrix ? "" : s.txt.trim());
      /* 2.8.1 : « @Aurélie » tout seul n'envoie rien (une notification vide) */
      if (!a.notePrix && a.mode !== "rappel" && !P.propre(s.txt, r2, { sansDate: false }) && !(a.docs && a.docs.length)) { if (ta) ta.focus(); return KP.toast("Écris ton message après le nom"); }
      if (!txt && a.notePrix) { KP.ui.ph[it.id] = null; KP.render(); return KP.toast(`Noté : ${notes.join(", ")}`, annuler); }
      if (a.docs.length && !s.sansDoc) store.update(it.id, { docs: [...it.docs, ...a.docs.map((l) => ({ t: titreLien(l.url), url: l.url }))] }, "a ajouté un document");
      KP.ui.ph[it.id] = null;
      KP.ecrire.dernier = { id: it.id, txt: s.txt, quand: Date.now(), ids: [] };
      if (a.mode === "rappel") { KP.ecrire.dernier.ids = [store.ask({ item: it.id, a: moi().k, quoi: "Autre", txt, pour: a.date }).id]; return KP.toast(`Rappel noté pour ${KP.fmt.relatif(a.date)}`); }
      if (a.mode === "reponse") { const undo = store.answer(a.cible.id, txt); return KP.toast(`Réponse envoyée à ${KP.dest(a.cible.de)}`, undo); }
      KP.ecrire.dernier.ids = store.askAll(r.qui.map((q) => ({ item: it.id, a: q.k, quoi: r.quoi ? r.quoi.nom : a.date ? "Autre" : "Info", txt, pour: a.date }))).map((x) => x.id);
      retenir(r.qui.map((q) => q.k));
      const noms = r.qui.map((q) => q.nom), n = noms.length;
      KP.toast(`${n > 1 ? noms.slice(0, -1).join(", ") + " et " + noms[n - 1] : noms[0]} ${n > 1 ? "reçoivent" : "reçoit"} une notification${a.date ? ", puis un rappel la veille" : ""}`);
    },
    /* l'ancien bouton « Demander des éléments » (et ce qui y menait) : le curseur dans la ligne, prêt pour un @ */
    ask: (b) => { const id = (b && b.dataset.id) || KP.route.fiche; if (id !== KP.route.fiche) KP.go({ fiche: id });
      setTimeout(() => { const it = cur(), ta = $("ph-t"); if (!it || !ta) return; const s = etat(it.id); if (!s.txt) { s.txt = "@"; ta.value = "@"; } ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); peindre($("fiche"), it); }, 0); },
  });

  /* ---------- le fil des messages ---------- */
  /* le texte d'un message : les liens s'ouvrent, les #actions mènent à leur fiche */
  const texte = (txt, it) => {
    const src = (txt || "").normalize("NFC"), r = P.lire(src, ctx(it));
    return P.morceaux(txt || "", r).map((m) => m.k === "lien" ? `<a class="link" href="${h(m.t)}" target="_blank" rel="noopener">${h(m.t.replace(/^https?:\/\//, "").slice(0, 48))}${m.t.length > 56 ? "…" : ""}</a>`
      : m.k === "ref" ? (() => { const ref = r.refs.find((y) => src.slice(y.at, y.end) === m.t); return ref ? `<button type="button" class="link" data-act="open" data-id="${ref.id}">${h(m.t)}</button>` : h(m.t); })()
      : h(m.t)).join("");
  };
  const carte = (r, it) => {
    const u = moi(), late = !r.fait && r.pour && r.pour < KP.TODAY, reader = u.role === "lecteur";
    const pastille = !r.pour ? `<span class="ph-c info petit">${ic("bell")}pour info</span>` : `<span class="ph-c petit ${r.fait ? "ok" : late ? "retard" : "date"}" title="${h(KP.due(r))}">pour le ${h(date(r.pour))}</span>`;
    const parle = r.txt && P.plat(r.txt).includes(P.plat(r.quoi)) || ["Autre", "Info"].includes(r.quoi);
    const actions = r.fait ? `<div class="rep">${ic("check")}<span>${texte(r.rep || "Reçu", it)}</span></div>`
      : r.de === u.k ? `<div class="req-do">${r.pour ? `<button type="button" class="link soft" data-act="relance" data-id="${r.id}">Relancer</button>` : ""}<span class="sp"></span>${r.pour ? KP.ib("edit", "Changer la date", "req-date", `data-id="${r.id}"`) : ""}${KP.ib("trash", "Retirer le message", "req-drop", `data-id="${r.id}"`)}</div>`
      : r.pour && (KP.reqMine(r) || u.role === "pilote") && !reader ? `<button type="button" class="link" data-act="answer" data-id="${r.id}">Répondre</button>` : "";
    return `<div class="ph-msg"><div class="ph-msg-h"><span class="ph-c qui petit">${h(KP.dest(r.a))}</span>${pastille}<span class="sp"></span><small class="muted">${h(KP.dest(r.de))}, ${h(KP.fmt.quand(r.quand))}</small></div>
      <p>${parle ? "" : `<b>${h(r.quoi)}</b>${r.txt ? " · " : ""}`}${texte(r.txt, it)}</p>${actions}</div>`;
  };

  /* la base a refusé l'envoi (un destinataire refusé, plus de réseau…) : la phrase revient dans la ligne, rien n'est perdu */
  document.addEventListener("kp:refus", () => {
    const d = KP.ecrire.dernier; if (!d || Date.now() - d.quand > 20000 || !d.ids.length) return;
    /* seulement si rien n'est parti : sinon on renverrait aux autres le même message */
    if (d.ids.some((id) => store.reqs().some((q) => q.id === id))) { KP.ecrire.dernier = null; return; }
    const s = etat(d.id); if (s.txt) return; s.txt = d.txt; KP.ecrire.dernier = null;
    const it = cur(); if (it && it.id === d.id) monte($("fiche"), it, [d.txt.length, d.txt.length]);
  });

  KP.ecrire = { html, monte, carte, texte, analyse, dernier: null };
})();
