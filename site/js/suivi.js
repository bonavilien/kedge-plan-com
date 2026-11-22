/* Plan de com KEDGE · 2.8 — le suivi de l'outil, pour l'admin seul (Réglages > Suivi).
   Ce qui est noté : les phrases que la barre n'a pas comprises, les erreurs de l'appli, les « Annuler » juste après
   une commande de la barre, les recherches sans résultat, et les écrans ouverts (comptés, sans nom).
   « Exporter pour Claude » télécharge tout dans un fichier Markdown à lui coller. Rien ne suit les personnes. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;

  /* ---------- 1. les erreurs de l'appli (une fois chacune, 10 au plus par visite) ---------- */
  const vues = new Set();
  const erreur = (msg, ou) => {
    const m = String(msg || "").slice(0, 300); if (!m || vues.has(m) || vues.size >= 10 || !store.tele) return;
    if (/ResizeObserver|Script error\.?$|extension:\/\//i.test(m)) return; /* bruit des navigateurs et des extensions */
    vues.add(m); store.tele("erreur", m, { ecran: KP.route && KP.route.screen, ou: ou || "" });
  };
  window.addEventListener("error", (e) => erreur(e.message, e.filename ? `${String(e.filename).split("/").pop()}:${e.lineno}` : ""));
  window.addEventListener("unhandledrejection", (e) => erreur(e.reason && (e.reason.message || (typeof e.reason === "object" ? (() => { try { return JSON.stringify(e.reason).slice(0, 200); } catch (_) { return "promesse refusée"; } })() : e.reason)) || "promesse refusée sans message", "promesse"));

  /* ---------- 2. les écrans ouverts : comptés sur l'appareil, envoyés en paquet, sans nom ---------- */
  const CLE = "kplan-ecrans";
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; } };
  const ecrire = (o) => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) {} };
  const semaine = () => { const d = KP.parse(KP.TODAY); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return KP.iso(d); };
  let dernier = "";
  const compte = () => {
    const r = KP.route || {}; const e = r.screen + (r.screen === "plan" && r.vue ? " " + r.vue : /^(resultats|reunion)$/.test(r.screen) && r.tab ? " " + r.tab : "");
    if (!r.screen || e === dernier) return; dernier = e;
    const o = lire(); o[e] = (o[e] || 0) + 1; o._n = (o._n || 0) + 1; ecrire(o); if (o._n >= 25) envoie();
  };
  const envoie = () => {
    const o = lire(); if (!store.tele || !o._n) return; ecrire({});
    Object.entries(o).filter(([k]) => k !== "_n").forEach(([k, n]) => store.tele("ecran", k, { n, semaine: semaine() }));
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") envoie(); });
  setInterval(envoie, 15 * 60 * 1000);

  /* ---------- 3. la santé du plan : calculée avec ce que la base a déjà, rien de nouveau n'est noté ---------- */
  const sante = () => {
    const its = store.items().filter((i) => !i.annule), auj = KP.TODAY;
    const sansMsg = its.filter((i) => i.kind !== "tf" && i.variant !== "sujet" && i.date >= auj && !(i.m && i.m.length));
    const sansChiffre = its.filter((i) => i.kind !== "tf" && i.st === "diffuse" && !(i.res && Object.values(i.res).some((n) => n !== null && n !== undefined && n !== ""))); /* 0 est un chiffre */
    const enRetard = (store.reqs() || []).filter((r) => !r.fait && r.pour && r.pour < auj && r.a !== r.de);
    const aConfirmer = its.filter((i) => i.st === "confirmer" && !i.flou && (i.fin || i.date) < auj); /* sur plusieurs jours : seulement une fois finie */
    return [
      { k: "Actions à venir sans message", n: sansMsg.length, ex: sansMsg },
      { k: "Diffusées sans chiffre", n: sansChiffre.length, ex: sansChiffre },
      { k: "Demandes en retard", n: enRetard.length, ex: enRetard.map((r) => store.items().find((i) => i.id === r.item)).filter(Boolean) },
      { k: "« À confirmer » déjà passées", n: aConfirmer.length, ex: aConfirmer },
    ];
  };

  /* ---------- 4. l'onglet Réglages > Suivi ---------- */
  const T = { phrases: null, suivi: null, erreur: "", vider: 0 };
  const charge = async () => {
    try { [T.phrases, T.suivi] = await Promise.all([store.listPhrases(), store.listSuivi()]); T.erreur = ""; }
    catch (e) { T.phrases = T.phrases || []; T.suivi = T.suivi || []; T.erreur = "Le suivi n'est pas encore prêt : il manque le script SQL 2.8 dans Supabase."; }
    const el = document.getElementById("su-corps"); if (el) el.innerHTML = corps();
  };
  const nom = (k) => { const p = k && KP.person(k); return p ? p.nom.split(/\s+/)[0] : ""; };
  const date = (t) => KP.fmt.moyen(KP.iso(new Date(t)));
  const de = (type) => (T.suivi || []).filter((x) => x.type === type);
  /* 2.8.2 : la même phrase (majuscules et accents mis à part) n'apparaît qu'une fois, avec le nombre de fois */
  const groupe = (l) => { const m = new Map(); (l || []).forEach((x) => { const k = KP.norm(String(x.txt || "")).trim(); const g = m.get(k); if (g) g.n++; else m.set(k, { ...x, n: 1 }); }); return [...m.values()]; };
  const fois = (x) => (x.n > 1 ? `<b>×${x.n}</b> · ` : "");
  const ecrans = () => { const o = {}; de("ecran").forEach((x) => { o[x.txt] = (o[x.txt] || 0) + Math.min(1000, Math.max(1, Math.round(Number(x.detail && x.detail.n)) || 1)); }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const NOMS = { accueil: "Accueil", "plan liste": "Le plan, liste", "plan grille": "Le plan, calendrier", plan: "Le plan", "resultats diffusions": "Résultats", "resultats budget": "Budget", resultats: "Résultats", "reunion ordre": "Réunion, ordre du jour", "reunion bilan": "Réunion, bilan", reunion: "Réunion", reglages: "Réglages" };
  const ligne = (txt, meta) => `<div class="tr su-l"><span class="su-t">${h(txt)}</span><span class="muted su-m">${meta}</span></div>`;
  const bloc = (titre, icone, l, vide, f) => `<section class="su-b"><h3>${ic(icone)}${titre}<span class="su-n">${l.length}</span></h3>
      <div class="tbl t-one">${l.length ? l.slice(0, 30).map(f).join("") + (l.length > 30 ? `<p class="muted su-plus">et ${l.length - 30} de plus dans l'export</p>` : "") : `<p class="muted">${vide}</p>`}</div></section>`;
  const corps = () => {
    if (!T.suivi) return `<p class="muted">Chargement…</p>`;
    const s = sante(), ec = ecrans(), max = Math.max(1, ...ec.map((x) => x[1]));
    return `${T.erreur ? `<p class="su-alerte">${ic("info")}${h(T.erreur)}</p>` : ""}
      <div class="su-sante">${s.map((x) => `<div class="su-tuile${x.n ? " a" : ""}"><b>${x.n}</b><span>${h(x.k)}</span></div>`).join("")}</div>
      ${bloc("Phrases non comprises", "spark", groupe(T.phrases), "La barre a tout compris.", (p) => ligne(p.txt, `${fois(p)}${p.raison === "reecrit" ? `<span class="pill">réécrite</span>` : ""}${h(nom(p.qui))} · ${date(p.quand)}`))}
      ${bloc("Erreurs de l'appli", "alert", de("erreur"), "Aucune erreur. Ça ne durera pas.", (x) => ligne(x.txt, `${h((x.detail && x.detail.ecran) || "")} · ${h(x.version || "")} · ${date(x.quand)}`))}
      ${bloc("Annulé juste après la barre", "undo", de("annule"), "Personne n'a dû défaire une commande.", (x) => ligne(x.txt, `${x.detail && Number.isFinite(Number(x.detail.sec)) && x.detail.sec !== null ? `${Math.round(Number(x.detail.sec))} s · ` : ""}${h(nom(x.qui))} · ${date(x.quand)}`))}
      ${bloc("Recherches sans résultat", "search", groupe(de("recherche")), "Tout ce qui a été cherché a été trouvé.", (x) => ligne(x.txt, `${fois(x)}${x.detail && x.detail.ou === "ctrlk" ? "Ctrl K" : "barre"} · ${date(x.quand)}`))}
      <section class="su-b"><h3>${ic("chart")}Écrans ouverts<span class="su-n">${ec.reduce((a, x) => a + x[1], 0)}</span></h3>
        ${ec.length ? `<div class="su-ec">${ec.map(([k, n]) => `<div class="su-e"><span>${h(NOMS[k] || k)}</span><i style="--w:${Math.round((n / max) * 100)}%"></i><b>${n}</b></div>`).join("")}</div>` : `<p class="muted">Rien encore : les écrans partent par paquets, quelques minutes après.</p>`}</section>`;
  };
  KP.suiviVue = () => `<section class="set su"><h2>Suivi de l'outil</h2>
      <p class="muted" style="margin-top:-6px">Ce qui coince dans l'appli. Exporte et colle le fichier à Claude. Effacé après 3 mois, visible par toi seul.</p>
      <div class="ph-outils"><button type="button" class="btn primary" data-act="su-export">${ic("doc")}Exporter pour Claude</button><button type="button" class="btn quiet" data-act="su-vider">${ic("trash")}${T.vider ? "Sûr ? Tout effacer" : "Tout effacer"}</button></div>
      <div id="su-corps">${corps()}</div></section>`;

  /* ---------- 5. l'export : un fichier Markdown que Claude lit tel quel ---------- */
  const md = () => {
    const l = [], s = sante(), ec = ecrans(), cel = (t) => String(t == null ? "" : t).replace(/\|/g, "\\|").replace(/\s+/g, " ");
    const table = (tete, rows) => { l.push(`| ${tete.join(" | ")} |`, `|${tete.map(() => "---").join("|")}|`); rows.forEach((r) => l.push(`| ${r.map(cel).join(" | ")} |`)); l.push(""); };
    l.push(`# Suivi de l'outil — ${document.title.replace(/^\(\d+\)\s*/, "").split(" · ").pop()}`, "", `Exporté le ${KP.fmt.moyen(KP.TODAY)} · version ${(KP.VERSION || {}).n || "?"} · ${store.items().length} fiches dans le plan.`, "",
      "> Pour Claude : complète le catalogue de la barre (site/js/commandes-regles.js) avec les phrases non comprises et les annulations, corrige les erreurs, propose des réponses aux recherches vides. Ajoute chaque phrase traitée à test/commandes/phrases.mjs.", "");
    l.push("## Santé du plan", ""); table(["Point", "Nombre", "Exemples"], s.map((x) => [x.k, x.n, x.ex.slice(0, 5).map((i) => i.t).join(" ; ")]));
    l.push(`## Phrases non comprises (${T.phrases.length})`, ""); table(["Phrase", "Fois", "Comment", "Qui (dernière)", "Quand (dernière)"], groupe(T.phrases).map((p) => [p.txt, p.n, p.raison === "reecrit" ? "effacée pour réécrire" : "pas comprise", nom(p.qui), date(p.quand)]));
    l.push(`## Annulé juste après la barre (${de("annule").length})`, ""); table(["Phrase", "Ce que la barre a fait", "Annulé après", "Qui", "Quand"], de("annule").map((x) => [x.txt, (x.detail || {}).k, (x.detail || {}).sec != null ? x.detail.sec + " s" : "", nom(x.qui), date(x.quand)]));
    l.push(`## Recherches sans résultat (${de("recherche").length})`, ""); table(["Recherche", "Fois", "Où", "Qui (dernière)", "Quand (dernière)"], groupe(de("recherche")).map((x) => [x.txt, x.n, (x.detail || {}).ou === "ctrlk" ? "Ctrl K" : "barre", nom(x.qui), date(x.quand)]));
    l.push(`## Erreurs de l'appli (${de("erreur").length})`, ""); table(["Message", "Écran", "Où", "Version", "Quand"], de("erreur").map((x) => [x.txt, (x.detail || {}).ecran, (x.detail || {}).base ? "base" : (x.detail || {}).ou, x.version, date(x.quand)]));
    l.push("## Écrans ouverts (toute l'équipe, sans nom)", ""); table(["Écran", "Ouvertures"], ec.map(([k, n]) => [NOMS[k] || k, n]));
    return l.join("\n");
  };
  Object.assign(KP.acts, {
    "su-export": async () => {
      if (!T.suivi) await charge();
      const nomF = `suivi-outil-${KP.TODAY}.md`, b = new Blob([md()], { type: "text/markdown;charset=utf-8" }), a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = nomF; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      KP.toast(`${nomF} téléchargé : colle-le à Claude`);
    },
    "su-vider": async () => {
      if (!T.vider) { const n = T.vider = Date.now(); KP.render(); setTimeout(() => { if (T.vider === n) { T.vider = 0; KP.render(); } }, 4000); return; }
      T.vider = 0; try { await Promise.all([store.clearPhrases(), store.clearSuivi()]); T.phrases = []; T.suivi = []; KP.toast("Suivi effacé"); } catch (e) { KP.toast("Impossible d'effacer : " + (e.message || e)); } KP.render();
    },
  });

  const apres = KP.apresRendu;
  KP.apresRendu = (main, entre) => {
    if (apres) apres(main, entre); compte();
    if (KP.route.screen === "reglages" && KP.route.set === "suivi" && KP.me().admin && (entre || !T.suivi)) charge();
  };
  KP._suiviMd = md; /* pour les tests */
})();
