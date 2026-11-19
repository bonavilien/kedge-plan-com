/* Plan de com KEDGE · V2 — ce qui attend chacun, et les suggestions.
   Des règles simples, lisibles, calculées dans le navigateur : rien ne sort de la base.
   Chaque suggestion dit pourquoi elle est là. « Pas cette fois » la fait revenir dans 3 jours ;
   un type de suggestion écarté 3 fois ne revient plus. */
(() => {
  const KP = window.KP, { store } = KP;
  const mine = (r) => { const u = KP.me(); return r.a === u.k || (!!u.svc && r.a === u.svc) || (r.a === "chef" && u.role === "pilote"); };

  /* demandes qui m'attendent, la plus pressée d'abord */
  KP.inbox = () => KP.me().role === "lecteur" ? [] : store.reqs().filter((r) => !r.fait && mine(r) && store.get(r.item)).sort((a, b) => a.pour.localeCompare(b.pour));

  const sg = () => { const p = store.prefs(); p.sg = p.sg || { snooze: {}, n: {} }; return p.sg; };
  KP.skipSuggestion = (s) => { const x = sg(); x.snooze[s.key] = KP.addDays(KP.TODAY, 3); x.n[s.type] = (x.n[s.type] || 0) + 1; store.setPref("sg", x); };

  KP.suggestions = () => {
    const u = KP.me(); if (u.role === "lecteur") return [];
    const T = KP.TODAY, out = [], pilote = u.role === "pilote";
    const own = (it) => it.kind === "action" && (pilote ? true : it.svc === u.svc);
    const items = store.items().filter((i) => !i.annule);
    const push = (s) => out.push(s);
    const open = (id) => () => KP.go({ fiche: id });

    // 1. la date est passée : c'est diffusé ?
    const passed = items.filter((it) => own(it) && KP.endOf(it) < T && it.st !== "diffuse" && KP.diff(T, it.date) <= 60).sort((a, b) => b.date.localeCompare(a.date));
    if (passed.length >= 3) push({ key: "lot:" + passed.map((i) => i.id).join(), type: "diffuse", icon: "check", text: `${passed.length} actions sont passées. Elles sont diffusées ?`, why: passed.slice(0, 3).map((i) => i.t).join(" · ") + (passed.length > 3 ? "…" : ""),
      actions: [{ nom: "Tout marquer diffusé", run: () => { const undos = passed.map((i) => store.update(i.id, { st: "diffuse" }, "a passé l'état à « Diffusé »")); KP.toast(`${passed.length} actions marquées diffusées`, () => undos.forEach((f) => f())); } }, { nom: "Voir une par une", run: () => KP.go({ screen: "reunion", tab: "bilan", fiche: "" }) }], skip: "Pas encore" });
    else passed.forEach((it) => push({ key: "dif:" + it.id, type: "diffuse", icon: "check", text: `« ${it.t} » : c'est diffusé ?`, why: it.flou ? `C'était prévu courant ${KP.fmt.mois(it.date)}.` : `La date est passée ${KP.fmt.relatif(it.date)}.`,
      actions: [{ nom: "Oui, diffusé", run: () => KP.setStatus(it.id, "diffuse") }, { nom: "Changer la date", run: open(it.id) }], skip: "Pas encore" }));

    // 1 bis. on connaît le mois, pas le jour, et le mois est là (ou presque)
    items.filter((it) => it.flou && it.st !== "diffuse" && (pilote || it.svc === u.svc || it.by === u.k) && KP.monthEnd(it.date) >= T && KP.diff(it.date, T) <= 10).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
      .forEach((it) => push({ key: "flou:" + it.id, type: "flou", icon: "calendar", text: `« ${it.t} » est prévu courant ${KP.fmt.mois(it.date)}. Tu connais la date ?`, why: it.date <= T ? "Le mois est commencé et le jour reste à préciser." : "Le mois approche et le jour reste à préciser.",
        actions: [{ nom: "Fixer la date", run: open(it.id) }], skip: "Pas encore" }));

    // 1 ter. le temps fort est annulé ou reporté, mon action tient-elle toujours ?
    items.filter((it) => own(it) && it.tf && it.st !== "diffuse" && KP.endOf(it) >= T).forEach((it) => { const par = store.get(it.tf); if (!par) return;
      if (par.annule) push({ key: "ann:" + it.id, type: "annule", icon: "close", text: `${par.t} est annulé. « ${it.t} » tient toujours ?`, why: par.annule.txt || "Le temps fort a été annulé.", actions: [{ nom: "Ouvrir mon action", run: open(it.id) }], skip: "Oui, on garde" });
      else if (KP.recent(par.report) && par.report.qui !== u.k) push({ key: "rep:" + it.id + par.report.quand, type: "report", icon: "shift", text: `${par.t} est reporté ${par.flou ? "à courant " + KP.fmt.mois(par.date) : "au " + KP.fmt.moyen(par.date)}. La date de « ${it.t} » te va ?`, why: par.report.txt || "La date du temps fort a changé.", actions: [{ nom: "Ouvrir mon action", run: open(it.id) }], skip: "Oui, c'est bon" }); });

    // 2. bientôt, et toujours à confirmer
    items.filter((it) => own(it) && !it.flou && it.st === "confirmer" && it.date >= T && KP.diff(it.date, T) <= 15).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
      .forEach((it) => push({ key: "conf:" + it.id, type: "confirmer", icon: "clock", text: `« ${it.t} » est ${KP.fmt.relatif(it.date)}. On confirme ?`, why: "Elle est encore « À confirmer ».",
        actions: [{ nom: "Confirmer", run: () => KP.setStatus(it.id, "prevu") }, { nom: "Ouvrir", run: open(it.id) }], skip: "Plus tard" }));

    // 3. un temps fort approche et mon service n'a rien prévu (visible de moi seul)
    if (!pilote) items.filter((it) => it.kind === "tf" && it.variant !== "sujet" && !it.flou && it.date > T && KP.diff(it.date, T) <= 21 && !store.relais(it.id).some((r) => r.svc === u.svc)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
      .forEach((it) => push({ key: "tf:" + it.id, type: "tf", icon: "flag", text: `${it.t} ${KP.fmt.relatif(it.date)} : tu veux le traiter ?`, why: `Rien n'est prévu côté ${KP.service(u.svc).nom.toLowerCase()}. Toi seul vois cette suggestion.`,
        actions: [{ nom: "Ajouter une action", run: () => KP.nouveau({ tf: it.id, date: KP.addDays(it.date, -3) < T ? T : KP.addDays(it.date, -3) }) }, { nom: "Voir le temps fort", run: open(it.id) }], skip: "Pas cette fois" }));

    // 4. une demande que j'ai envoyée attend
    store.reqs().filter((r) => r.de === u.k && r.a !== u.k && !r.fait && r.pour < T && store.get(r.item)).forEach((r) => push({ key: "req:" + r.id, type: "relance", icon: "chat", text: `${KP.dest(r.a)} n'a pas encore répondu pour « ${store.get(r.item).t} ».`, why: `Tu attendais ${KP.ASK[r.quoi] || "des éléments"} pour ${KP.fmt.relatif(r.pour)}.`,
      actions: [{ nom: "Relancer", run: () => { store.relance(r.id); KP.skipSuggestion({ key: "req:" + r.id, type: "_" }); } }, { nom: "Ouvrir", run: open(r.item) }], skip: "Plus tard" }));

    if (pilote) {
      const p = KP.periodOf(T), inP = items.filter((it) => it.kind === "action" && it.date >= p.du && it.date <= p.au);
      // 5. un message sans aucune action sur la période
      KP.CLES.filter((m) => !inP.some((it) => it.m.includes(m.k))).slice(0, 1).forEach((m) => push({ key: `msg:${p.k}:${m.k}`, type: "message", icon: "spark", text: `Le message « ${m.nom} » n'a aucune action sur ${p.nom}.`, why: (() => { const n = KP.CLES.filter((x) => x.k !== m.k && inP.some((it) => it.m.includes(x.k))).length; return n === KP.CLES.length - 1 ? (n > 1 ? "Tous les autres en ont au moins une." : "L'autre en a au moins une.") : n ? `${n} autre${n > 1 ? "s" : ""} en ${n > 1 ? "ont" : "a"} au moins une.` : "Aucun message n'en a encore."; })(),
        actions: [{ nom: "Ajouter une action", run: () => KP.nouveau() }, { nom: "Voir le bilan", run: () => KP.go({ screen: "reunion", tab: "bilan", fiche: "" }) }], skip: "Pas cette fois" }));
      // 6. un temps fort passé garde un relais non diffusé
      items.filter((it) => it.kind === "tf" && KP.endOf(it) < T && KP.diff(T, it.date) <= 45 && store.relais(it.id).some((r) => r.st !== "diffuse")).slice(0, 1).forEach((it) => { const n = store.relais(it.id).filter((r) => r.st !== "diffuse").length;
        if (passed.length < 3) push({ key: "tfp:" + it.id, type: "tfpasse", icon: "flag", text: `${it.t} est passé, ${n} relais ${n > 1 ? "restent" : "reste"} à diffuser.`, why: `C'était ${KP.fmt.relatif(it.date)}.`, actions: [{ nom: "Voir", run: open(it.id) }], skip: "Plus tard" }); });
      // 7. la période se termine, la suivante est vide
      const i = KP.PERIODS.indexOf(p), nx = KP.PERIODS[i + 1], left = KP.diff(p.au, T);
      if (nx && left <= 30 && items.filter((it) => it.date >= nx.du && it.date <= nx.au).length < 3) push({ key: "per:" + nx.k, type: "periode", icon: "calendar", text: `${p.nom} se termine ${left <= 0 ? "aujourd'hui" : left === 1 ? "demain" : `dans ${left} jours`} et ${nx.nom} est presque vide.`, why: "Moins de trois lignes y sont prévues.", actions: [{ nom: `Ouvrir ${nx.nom}`, run: () => KP.go({ screen: "plan", per: nx.k, fiche: "" }) }], skip: "Plus tard" });
    }

    const x = sg();
    return out.filter((s) => !(x.snooze[s.key] && x.snooze[s.key] > T) && (x.n[s.type] || 0) < 3);
  };
})();
