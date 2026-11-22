/* Road to 7th — la barre de commandes, en haut de l'accueil.
   On écrit comme on parle ; la barre surligne ce qu'elle a compris, montre la modification avant de la faire,
   propose de choisir quand plusieurs actions correspondent, et tout se défait avec « Annuler ». Sans IA, sans serveur. */
(() => {
  const KP = window.KP, { h, ic, store } = KP, C = KP.commande;
  const S = (KP.cmd = { texte: "", choix: {}, cur: 0, dernier: null, ouvert: false });
  const J = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const jour = (d) => `${J[KP.parse(d).getDay()]} ${KP.fmt.moyen(d)}`;
  const quand = (it) => it.flou ? `courant ${KP.fmt.mois(it.date)}` : jour(it.date);
  const ICONE = { move: "shift", cancel: "close", restore: "undo", help: "info", euro: "chart", users: "people", send: "chat", note: "edit", arrow: "arrow" };
  const ico = (k) => ic(ICONE[k] || k);
  const ctx = () => ({ today: KP.TODAY, services: KP.SERVICES, people: KP.PEOPLE });
  const titreDe = (id) => (store.get(id) || {}).t || "";

  /* ---------- le texte d'une action : sans articles devant, sans préposition qui traîne derrière ---------- */
  const nettoie = (s) => { let t = String(s || "").trim(), a;
    do { a = t; t = t.replace(/^(?:(?:le|la|les|un|une|des|du|de|au|aux|mon|ma|mes|notre|nos|ce|cet|cette|ces|celle|celui|la fiche)\s+|[ld]['’]\s*)/i, ""); } while (t !== a);
    do { a = t; t = t.replace(/\s+(pour|de|du|des|d['’]|à|a|au|aux|avec|sur|le|la|les|et|en|par|chez)$/i, ""); } while (t !== a);
    return t.replace(/^[«"“\s]+|[»"”\s]+$/g, ""); };
  const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const svcCourt = (k) => (KP.service(k) || {}).court || "";
  const mini = (it, extra = "") => `<span class="cb-it${it.kind === "tf" ? " tf" : ""}${it.annule ? " barre" : ""}"><span class="cb-d">${h(quand(it))}</span><b>${h(it.t)}</b>${it.kind === "tf" ? `<small>Temps fort</small>` : it.variant === "partenariat" ? `<small>${h(it.partner || "Payant")}</small>` : `<small>${h(svcCourt(it.svc))}</small>`}${extra}</span>`;

  /* ---------- retrouver l'action dont on parle ---------- */
  function cible(txt, filtre = () => true, garde = () => true) {
    const q = nettoie(txt); let base = store.items().filter((it) => filtre(it) && garde(it));
    /* « l'action de jeudi » : un mot passe-partout + une date, on prend ce qui tombe ce jour-là */
    if (/^(?:action|actions|truc|chose|fiche|ca|ça|celle|celui)$/i.test(q.trim())) { const j = base.filter((it) => it.variant !== "sujet").sort((a, b) => a.date.localeCompare(b.date)); if (j.length && j.length < store.items().filter(filtre).length) return j.length === 1 ? { it: j[0], q } : { cands: j.slice(0, 5), q }; }
    const plein = (b) => C.trouver(q, b, { today: KP.TODAY, titre: titreDe }).some((x) => x.score >= 0.99);
    if (!plein(base) && plein(store.items().filter(filtre))) base = store.items().filter(filtre); /* le filtre de date ne doit pas cacher l'action nommée */
    else if (!C.trouver(q, base, { today: KP.TODAY, titre: titreDe }).length) base = store.items().filter(filtre);
    const list = C.trouver(q, base, { today: KP.TODAY, titre: titreDe });
    let pleins = list.filter((x) => x.score >= 0.99);
    /* « le gala » : le Gala lui-même passe avant les actions qui ne font que s'y rattacher */
    if (pleins.length > 1) { const qw = C.mots(q), propres = pleins.filter((x) => C.note(qw, C.texteDe(x.it, {})) >= 0.99); if (propres.length) pleins = propres; pleins = pleins.filter((x) => x.it.kind === "tf").concat(pleins.filter((x) => x.it.kind !== "tf")); }
    if (pleins.length === 1) return { it: pleins[0].it, q };
    if (pleins.length > 1) { const pile = pleins.find((x) => KP.norm(x.it.t) === KP.norm(q)); return pile ? { it: pile.it, q } : { cands: pleins.slice(0, 5).map((x) => x.it), q }; }
    return { cands: list.slice(0, 4).map((x) => x.it), approx: true, q };
  }
  const zoneDate = (slot) => slot && slot.zones.find((z) => z.k === "d");
  const memeJour = (it, z) => { if (!z) return true; const d = KP.diff(it.date, z.iso); return d === 0 || (z.du && it.date >= z.du && it.date <= z.au) || (Math.abs(d) <= 7 && KP.parse(it.date).getDay() === KP.parse(z.iso).getDay()); };
  /* une période (« semaine prochaine ») garde le même jour de la semaine ; un mois entier = « courant décembre » */
  const nouvelle = (it, z) => {
    if (z.mois) return { date: z.du, flou: true };
    if (z.periode) { const l = KP.monday(z.du), j = (KP.parse(it.date).getDay() + 6) % 7, d = KP.addDays(l, j); return { date: d < z.du ? z.du : d > z.au ? z.au : d, flou: false }; }
    return { date: z.iso, flou: false };
  };
  const deviner = (liste, t) => { const p = KP.norm(t); return liste.filter(([, re]) => new RegExp("(^|[^a-z0-9])(" + KP.norm(re) + ")([^a-z0-9]|$)").test(p)).map(([k]) => k); };

  /* ---------- ce que la barre a compris, prêt à montrer ---------- */
  function comprendre(texte) {
    const a = C.analyser(texte, ctx()), b = a.best, u = KP.me();
    const vm = { a, k: b ? b.k : "rien", icone: b ? b.icone : "search" };
    if (!b) return rien(vm, texte);
    const s = b.slots, motif = a.glob.motif ? a.glob.motif.txt : "";
    const droits = (it) => store.canEdit(it) ? "" : `Seuls les chefs de projet et ${svcCourt(it.svc) || "son service"} peuvent la modifier.`;
    /* une action à toucher : retrouvée → on prépare ; plusieurs → on fait choisir ; rien → on le dit */
    const surUne = (res, prepare) => {
      if (res.it) { const p = prepare(res.it); if (p.refus === undefined) p.refus = droits(res.it); return Object.assign(vm, p, { it: res.it }); }
      if (res.cands && res.cands.length) { vm.choisir = res.cands.map((it) => { const p = prepare(it); return { it, danger: vm.danger, ...p, refus: p.refus === undefined ? droits(it) : p.refus }; }); vm.approx = res.approx; vm.q = res.q; return vm; }
      vm.introuvable = res.q; return vm;
    };
    const vivantes = (it) => !it.annule && it.variant !== "sujet";
    switch (b.k) {
      case "defaire": vm.titre = "Défaire"; if (!S.dernier) { vm.vide = "Rien à défaire pour l'instant."; return vm; }
        vm.corps = `<p class="cb-l">${h(S.dernier.label)}</p>`; vm.bouton = "Défaire"; vm.faire = () => { const l = S.dernier.label; S.dernier.undo(); S.dernier = null; return { toast: `Défait : ${l}` }; }; return vm;

      case "creer": {
        const tf = /temps fort/.test(b.tpl), part = /partenariat/.test(b.tpl);
        let t = majuscule(nettoie(s.quoi.txt)), partner = "";
        if (part) { partner = (store.partners() || []).find((p) => KP.norm(p).replace(/[^a-z0-9]/g, "").includes(KP.norm(t).replace(/[^a-z0-9]/g, ""))) || t; t = `Partenariat ${partner}`; }
        const z = zoneDate(s.date) || zoneDate(s.date2), svcZ = s.service && s.service.zones[0];
        const dv = deviner(KP.REGLES.DEVINER.service, t), mv = deviner(KP.REGLES.DEVINER.message, t).filter((k) => KP.message(k));
        const cle = t + "|" + (z ? z.iso : "");
        if (S.choix.cle !== cle) { const g = S.choix.main || {}; S.choix = { cle, main: g, svc: svcZ ? svcZ.svc : g.svc || dv[0] || u.svc || (KP.SERVICES[0] || {}).k, m: g.m || mv.slice(0, 1), devine: !svcZ && !!dv[0] }; }
        if (u.role !== "pilote" && u.svc) S.choix.svc = u.svc; /* un service crée pour lui-même (la base refuse le reste) */
        const ch = S.choix, d = z ? (z.mois ? { date: z.du, flou: true } : { date: z.du || z.iso, flou: false }) : null;
        vm.titre = tf ? "Nouveau temps fort" : part ? "Nouveau partenariat payant" : "Nouvelle action";
        vm.refus = !store.canCreate() ? "Ton compte est en lecture seule." : part && u.role !== "pilote" ? "Les partenariats payants sont réservés aux chefs de projet." : "";
        const heure = a.glob.heure ? a.glob.heure.txt : "";
        vm.corps = `<p class="cb-titre">${h(t)}</p><div class="cb-puces">
          <span class="cb-puce date">${ic("calendar")}${d ? h(d.flou ? `courant ${KP.fmt.mois(d.date)}` : jour(d.date)) + (heure ? ` · ${h(heure)}` : "") : "Date ?"}</span>
          ${tf || part ? "" : u.role !== "pilote" ? `<span class="cb-puce">${ic("people")}${h(svcCourt(ch.svc))}</span>` : `<label class="cb-puce sel">${ic("people")}<select id="cb-svc" aria-label="Service">${KP.SERVICES.map((x) => `<option value="${x.k}" ${x.k === ch.svc ? "selected" : ""}>${h(x.court)}</option>`).join("")}</select></label>`}
          <label class="cb-puce sel">${ic("flag")}<select id="cb-msg" aria-label="Message"><option value="">Message ?</option>${KP.MESSAGES.map((m) => `<option value="${m.k}" ${ch.m[0] === m.k ? "selected" : ""}>${h(m.nom)}</option>`).join("")}</select></label>
          <span class="cb-puce etat">À confirmer</span></div>`;
        if (!d) { vm.manque = "date"; vm.aide = ["demain", "lundi", "la semaine prochaine", `courant ${KP.fmt.mois(KP.addDays(KP.monthEnd(KP.TODAY), 1))}`]; return vm; }
        vm.bouton = "Ajouter";
        vm.faire = () => { const it = store.add({ kind: tf ? "tf" : "action", variant: part ? "partenariat" : "", partner, t, date: d.date, flou: d.flou, svc: tf || part ? "" : ch.svc, m: ch.m.filter(Boolean), note: heure ? `À ${heure}` : "", st: tf ? "prevu" : "confirmer" });
          return { undo: () => store.unadd(it.id), toast: `Ajouté : ${t}`, ouvre: it.id }; };
        return vm;
      }

      case "decaler": {
        const z1 = zoneDate(s.date), seulDe = !s.date2 && z1 && /(?:^|\s)(de|du|d['’])\s*$/i.test(a.src.slice(0, z1.at));
        const avant = s.date2 || seulDe ? z1 : null, apres0 = seulDe ? null : zoneDate(s.date2) || z1, dec = s.decalage && s.decalage.zones[0];
        /* « la semaine d'après » : une semaine après l'action, pas la semaine prochaine */
        const semRel = !!apres0 && /semaine\s+(?:d['’]\s*apr[eè]s|suivante)/i.test(a.src.slice(apres0.at, apres0.end)), apres = semRel ? null : apres0;
        const hors = a.tok.replace(s.quoi.tok, " "), tot = /avanc|plus tot|avant/.test(hors) && !/apres|plus tard/.test(hors), semApres = semRel || (/apres|suivante/.test(hors) && !apres && !dec);
        vm.titre = "Décaler";
        return surUne(cible(s.quoi.txt, vivantes, (it) => memeJour(it, avant)), (it) => {
          if (!apres && !dec && !semApres) return { manque: "date", corps: `<div class="cb-l">${mini(it)}</div>`, aide: ["à demain", "à lundi prochain", "d'une semaine", `à courant ${KP.fmt.mois(KP.addDays(KP.monthEnd(KP.TODAY), 1))}`], refus: "" };
          if (!apres && it.flou) return { manque: "date", corps: `<div class="cb-l">${mini(it)}</div>`, aide: ["à lundi prochain", "au 1er décembre", `à courant ${KP.fmt.mois(KP.addDays(KP.monthEnd(KP.TODAY), 1))}`], refus: "" };
          const sg = tot ? -1 : 1, n = apres ? nouvelle(it, apres) : dec && dec.mois ? (() => { const d = KP.parse(it.date), x = new Date(d.getFullYear(), d.getMonth() + sg * dec.mois, 1), fin = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return { date: KP.iso(new Date(x.getFullYear(), x.getMonth(), Math.min(d.getDate(), fin))), flou: false }; })() : { date: KP.addDays(it.date, (semApres ? 7 : dec.n) * sg), flou: false };
          if (n.date === it.date && n.flou === !!it.flou) return { corps: `<div class="cb-l">${mini(it)}</div>`, refus: `Elle est déjà ${n.flou ? "en" : "au"} ${n.flou ? KP.fmt.mois(n.date) : jour(n.date)}.` };
          const rel = it.kind === "tf" && !n.flou && !it.flou ? store.relais(it.id).filter((r) => !r.flou && r.st !== "diffuse" && !r.annule && store.canEdit(r)).length : 0;
          const passe = !n.flou && n.date < KP.TODAY, nom = n.flou ? `courant ${KP.fmt.mois(n.date)}` : jour(n.date);
          return { corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche"><s>${h(quand(it))}</s>${ic("arrow")}<b>${h(nom)}</b>${passe ? `<span class="cb-alerte">déjà passé</span>` : ""}${rel ? `<span class="cb-plus">+ ${rel} relais suivent</span>` : ""}</p>${motif ? `<p class="cb-motif">${h(motif)}</p>` : ""}`,
            bouton: "Décaler", faire: () => ({ undo: store.setDate(it.id, n.date, n.flou, motif || null), toast: `Décalé ${n.flou ? "à" : "au"} ${nom}` }) };
        });
      }

      case "annuler": vm.titre = "Laisser tomber";
        return surUne(cible(s.quoi.txt, vivantes, (it) => memeJour(it, zoneDate(s.date))), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-sous">${ic("close")}Reste barrée dans le plan${motif ? ` : ${h(motif)}` : ", pour que les services sachent"}</p>`,
          bouton: "Barrer", faire: () => ({ undo: store.cancel(it.id, motif), toast: `Barrée : ${it.t}` }) }));

      case "supprimer": vm.titre = "Supprimer"; vm.danger = true;
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-sous rouge">${ic("trash")}Définitif, avec ses demandes et son historique. Pour garder une trace, écris plutôt « on laisse tomber ».</p>`,
          bouton: "Supprimer", faire: () => ({ undo: store.remove(it.id), toast: `Supprimée : ${it.t}` }), refus: u.role === "pilote" ? "" : "Seuls les chefs de projet suppriment une fiche." }));

      case "retablir": vm.titre = "Rétablir";
        return surUne(cible(s.quoi.txt, (it) => !!it.annule), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div>`, bouton: "Rétablir", faire: () => ({ undo: store.restore(it.id), toast: `Rétablie : ${it.t}` }) }));

      case "diffuser": case "confirmer": case "aconfirmer": {
        const st = { diffuser: "diffuse", confirmer: "prevu", aconfirmer: "confirmer" }[b.k], nom = KP.STATUTS.find((x) => x.k === st).nom;
        vm.titre = nom;
        return surUne(cible(s.quoi.txt, vivantes, (it) => memeJour(it, zoneDate(s.date))), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche">${KP.pill(it)}${ic("arrow")}<span class="pill ${st}">${st === "diffuse" ? ic("check") : ""}${h(nom)}</span></p>`,
          bouton: nom, refus: it.st === st ? `C'est déjà « ${nom} ».` : undefined, faire: () => ({ undo: store.update(it.id, { st }, `a passé l'état à « ${nom} »`), toast: `${it.t} : ${nom.toLowerCase()}` }) }));
      }

      case "resultats": {
        const res = {}; s.nombre.zones.forEach((z) => { if (z.unite) res[z.unite] = z.n; });
        vm.titre = "Résultats";
        return surUne(cible(s.quoi.txt, (it) => !it.annule, (it) => memeJour(it, zoneDate(s.date))), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-chiffres">${Object.entries(res).map(([k, n]) => `<span><b>${KP.nb(n)}</b> ${h((KP.UNITES.find((x) => x.k === k) || {}).nom || k).toLowerCase()}</span>`).join("")}</p>`,
          bouton: "Noter", refus: store.resOk() ? undefined : "La base n'est pas encore prête pour les résultats.",
          faire: () => { const u0 = store.setRes(it.id, res); if (!u0) return { toast: "Chiffre impossible : rien n'a changé." }; const undos = [u0]; if (it.st !== "diffuse") undos.push(store.update(it.id, { st: "diffuse" }, "a passé l'état à « Diffusé »")); return { undo: () => undos.reverse().forEach((f) => f && f()), toast: `Noté : ${KP.resTxt(res)}` }; } }));
      }

      case "budget": { const n = s.montant.zones[0].n; vm.titre = "Budget";
        return surUne(cible(s.quoi.txt, (it) => it.variant === "partenariat"), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-chiffres"><span><b>${KP.nb(n)} €</b></span></p>`,
          bouton: "Noter", refus: store.voitBudget() ? undefined : "Le budget est réservé aux chefs de projet.", faire: () => { const u0 = store.setMontant(it.id, n); return u0 ? { undo: u0, toast: `Budget noté : ${KP.nb(n)} €` } : { toast: "Montant impossible : rien n'a changé." }; } })); }

      case "service": { const k = s.service.zones[0].svc; vm.titre = "Changer de service";
        return surUne(cible(s.quoi.txt, (it) => vivantes(it) && it.kind === "action" && it.variant !== "partenariat"), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche"><s>${h(svcCourt(it.svc))}</s>${ic("arrow")}<b>${h(svcCourt(k))}</b></p>`,
          bouton: "Confier", refus: u.role !== "pilote" ? "Seuls les chefs de projet changent le service d'une action." : it.svc === k ? `C'est déjà ${svcCourt(k)}.` : undefined, faire: () => ({ undo: store.update(it.id, { svc: k }, `a confié l'action à ${(KP.service(k) || {}).nom}`), toast: `Confiée à ${svcCourt(k)}` }) })); }

      case "lier": { const t = cible(s.texte.txt, (it) => it.kind === "tf" && !it.annule); vm.titre = "Rattacher à un temps fort";
        if (!t.it && !(t.cands && t.cands.length)) { vm.introuvable = nettoie(s.texte.txt); vm.quoiManque = "temps fort"; return vm; }
        if (!t.it) { const a1 = cible(s.quoi.txt, (it) => vivantes(it) && it.kind === "action"); if (!a1.it) { vm.introuvable = nettoie(s.quoi.txt); return vm; }
          return surUne({ cands: t.cands, approx: t.approx, q: t.q }, (tf) => ({ corps: `<div class="cb-l">${mini(tf)}</div>`, bouton: "Rattacher ici", refus: droits(a1.it), faire: () => ({ undo: store.update(a1.it.id, { tf: tf.id }, `a rattaché à « ${tf.t} »`), toast: `Rattachée à ${tf.t}` }) })); }
        return surUne(cible(s.quoi.txt, (it) => vivantes(it) && it.kind === "action"), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche">${ic("link")}${mini(t.it)}</p>`,
          bouton: "Rattacher", faire: () => ({ undo: store.update(it.id, { tf: t.it.id }, `a rattaché à « ${t.it.t} »`), toast: `Rattachée à ${t.it.t}` }) })); }

      case "renommer": { const nv = majuscule(nettoie(s.texte.txt)); vm.titre = "Renommer";
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<p class="cb-fleche"><s>${h(it.t)}</s>${ic("arrow")}<b>${h(nv)}</b></p>`, bouton: "Renommer", faire: () => ({ undo: store.update(it.id, { t: nv }, "a renommé la fiche"), toast: `Renommée : ${nv}` }) })); }

      case "dupliquer": { const z = zoneDate(s.date); vm.titre = "Dupliquer";
        return surUne(cible(s.quoi.txt), (it) => { const n = z ? nouvelle(it, z) : null;
          return { corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche">${ic("copy")}<b>${h(n ? (n.flou ? `courant ${KP.fmt.mois(n.date)}` : jour(n.date)) : "même date")}</b></p>`, bouton: "Dupliquer", refus: !store.canCreate() ? "Ton compte est en lecture seule." : u.role !== "pilote" && (it.svc !== u.svc || it.kind !== "action" || it.variant === "partenariat") ? "Tu peux dupliquer les actions de ton service." : "",
            faire: () => { const c = store.duplicate(it.id); if (n) store.setDate(c.id, n.date, n.flou); return { undo: () => store.unadd(c.id), toast: `Copie créée${n ? (n.flou ? ` pour courant ${KP.fmt.mois(n.date)}` : " pour " + jour(n.date)) : ""}`, ouvre: c.id }; } }; }); }

      case "demander": case "rappel": {
        const t = s.texte, z = zoneDate(t) || zoneDate(s.texte2), qui = s.qui ? s.qui.zones[0].qui : u.k, p = KP.person(qui);
        /* l'action est en fin de phrase : « … pour le carrousel JPO Paris » ; on essaie chaque découpe et on garde la meilleure */
        const src = a.src, zt = z && z.at >= t.at && z.end <= t.end ? z : null;
        const brut = (zt ? src.slice(t.at, zt.at).replace(/\s*(avant|pour|d'ici|d’ici|au plus tard|pour le|avant le)\s*$/i, "") + " " + src.slice(zt.end, t.end) : t.txt).replace(/\s+/g, " ").trim();
        let meilleur = null;
        const coupes = [...brut.matchAll(/\s(pour|du|de la|de l'|des|de|sur|concernant|au sujet de|à propos de|dans)\s/gi)].map((m) => m.index + m[0].length);
        for (const c of coupes) { const r = cible(brut.slice(c), vivantes); const sc = r.it ? 2 : r.cands && r.cands.length && !r.approx ? 1 : 0; if (sc && (!meilleur || sc > meilleur.sc)) meilleur = { sc, r, c }; }
        const el = (KP.ELEMENTS.find((e) => new RegExp(KP.norm(e).slice(0, 6)).test(KP.norm(brut))) || (/\b(photo|logo|image)/i.test(brut) ? "Visuels" : /\b(rush|vid)/i.test(brut) ? "Rushs" : /\b(brief|contexte)/i.test(brut) ? "Contexte" : "Autre"));
        const quoiTxt = majuscule((meilleur ? brut.slice(0, meilleur.c).replace(/\s(pour|du|de la|de l'|des|de|sur|concernant|au sujet de|à propos de|dans)\s*$/i, "").trim() : brut).replace(/[,\s]*\bpour (info|information)\b[,\s]*/i, " ").trim());
        const rappel = b.k === "rappel" || qui === u.k;
        vm.titre = rappel ? "Rappel pour moi" : `Demander à ${p ? p.nom : ""}`; if (rappel) vm.prive = true;
        /* sans date : une demande attend une réponse pour la veille de l'action (au plus tôt demain) ; « pour info » seulement si on le dit */
        const info = /\bpour (info|information)\b|\bfyi\b/i.test(src), demain = KP.addDays(KP.TODAY, 1);
        const echeance = (it) => z ? z.iso : rappel || info ? "" : (KP.addDays(it.date, -1) > demain ? KP.addDays(it.date, -1) : demain);
        const prep = (it, pour = echeance(it)) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-msg">${rappel ? ic("clock") : KP.avatar(p, "cb-av")}<span>${h(quoiTxt)}</span>${pour ? `<span class="cb-puce date">${ic("calendar")}${h(jour(pour))}</span>` : `<span class="cb-puce">${rappel ? "sans date" : "pour info"}</span>`}</p>${!z && !rappel && !info ? `<p class="cb-sous">${ic("info")}Réponse attendue la veille de l'action. Une autre date ? Ajoute « pour mardi ».</p>` : ""}${!z && !rappel && info ? `<p class="cb-sous">${ic("info")}Juste prévenir : pas de réponse attendue, pas de relance.</p>` : ""}${!z && rappel ? `<p class="cb-sous">${ic("info")}Sans date, rien ne te le rappellera. Ajoute « lundi » par exemple.</p>` : ""}`,
          bouton: rappel ? "Noter le rappel" : "Envoyer", refus: store.canCreate() ? "" : "Ton compte est en lecture seule.",
          faire: () => { const r = store.ask({ item: it.id, a: qui, quoi: rappel ? "Autre" : pour ? el : "Info", txt: quoiTxt, pour: pour || null }); return { undo: () => store.dropReq(r.id), toast: rappel ? `Rappel noté${pour ? " pour " + KP.fmt.relatif(pour) : ""}` : `Envoyé à ${p ? p.nom : ""}` }; } });
        if (!meilleur) { vm.manque = "fiche"; vm.corps = `<p class="cb-msg">${rappel ? ic("clock") : KP.avatar(p, "cb-av")}<span>${h(quoiTxt)}</span></p>`; vm.aide = store.items().filter((it) => vivantes(it) && it.date >= KP.TODAY).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 3).map((it) => `pour ${nettoie(it.t).split(/\s+/).slice(0, 4).join(" ")}`); return vm; }
        return surUne(meilleur.r, prep);
      }

      case "note": vm.titre = "Ajouter une note";
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-msg">${ic("edit")}<span>${h(s.texte.txt)}</span></p>`, bouton: "Ajouter la note",
          faire: () => ({ undo: store.update(it.id, { note: (it.note ? it.note + "\n" : "") + s.texte.txt }, "a ajouté une note"), toast: "Note ajoutée" }) }));

      case "lieu": { const l = majuscule(nettoie(s.texte.txt)); vm.titre = "Lieu";
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div><p class="cb-fleche">${ic("pin")}<b>${h(l)}</b></p>`, bouton: "Noter le lieu",
          faire: () => { const avant = store.lieux().slice(), neuf = !avant.includes(l); store.addLieu(l); const u = store.update(it.id, { lieu: l }, `a noté le lieu : ${l}`); return { undo: () => { u(); if (neuf) { const L = store.lieux(); L.splice(0, L.length, ...avant); } }, toast: `Lieu : ${l}` }; } })); }

      case "epingler": case "desepingler": { const on = b.k === "epingler"; vm.titre = on ? "Épingler" : "Désépingler";
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div>`, bouton: on ? "Épingler" : "Désépingler", refus: !store.canCreate() ? "Ton compte est en lecture seule." : store.pinned(it.id) === on ? (on ? "Déjà épinglée." : "Pas épinglée.") : "",
          faire: () => { store.togglePin(it.id); return { undo: () => store.togglePin(it.id), toast: on ? "Épinglée" : "Désépinglée" }; } })); }

      case "ouvrir": vm.titre = "Ouvrir la fiche";
        return surUne(cible(s.quoi.txt), (it) => ({ corps: `<div class="cb-l">${mini(it)}</div>`, bouton: "Ouvrir", refus: "", faire: () => ({ ouvre: it.id, garde: true }) }));

      case "aller": {
        const z = zoneDate(s.date), ecr = KP.norm(a.src), per = s.texte ? KP.PERIODS.find((p) => KP.norm(p.nom).startsWith(KP.norm(nettoie(s.texte.txt)).slice(0, 4))) : null;
        const MO = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"], mo = s.texte ? MO.findIndex((m) => KP.norm(s.texte.txt).includes(m)) : -1;
        const moIso = mo >= 0 ? (() => { const t = KP.parse(KP.TODAY); let y = t.getFullYear(); if (new Date(y, mo + 1, 0) < t) y++; return KP.iso(new Date(y, mo, 15)); })() : "";
        const pk = per ? per.k : z ? KP.periodOf(z.du || z.iso).k : moIso ? KP.periodOf(moIso).k : KP.periodOf(KP.TODAY).k;
        const go = /resultat/.test(ecr) ? { screen: "resultats", tab: "diffusions", nom: "Résultats" } : /budget/.test(ecr) ? { screen: "resultats", tab: "budget", nom: "Budget" } : /bilan/.test(ecr) ? { screen: "reunion", tab: "bilan", nom: "Réunion, bilan" } : /reunion|ordre du jour/.test(ecr) ? { screen: "reunion", tab: "ordre", nom: "Réunion" }
          : /reglage|profil/.test(ecr) ? { screen: "reglages", set: "profil", nom: "Réglages" } : /accueil/.test(ecr) ? { screen: "accueil", nom: "Accueil" } : /liste/.test(ecr) ? { screen: "plan", vue: "liste", per: pk, nom: "Le plan, en liste" } : { screen: "plan", vue: "grille", per: pk, nom: "Le calendrier" };
        vm.titre = "Aller à"; vm.corps = `<p class="cb-titre">${h(go.nom)}${go.per ? ` <small>· période ${h(KP.PERIODS.find((p) => p.k === go.per).nom)}</small>` : ""}</p>`; vm.bouton = "Y aller"; const { nom, ...route } = go;
        vm.faire = () => { KP.go({ ...route, fiche: "" }); return { garde: true }; }; return vm;
      }

      case "chercher": return chercher(vm, s);
    }
    return rien(vm, texte);
  }

  /* ---------- les questions : la réponse s'affiche tout de suite, il n'y a rien à valider ---------- */
  const ALIAS_SVC = { rs: /^(rs|reseaux|social)$/, rp: /^(rp|presse)$/, video: /^(video|videos)$/, content: /^(content|contenu|contenus)$/ };
  function chercher(vm, s) {
    const sujet = s.sujet ? s.sujet : null, z = zoneDate(s.date) || (sujet && zoneDate(sujet));
    const svcs = new Set(sujet ? sujet.zones.filter((x) => x.k === "s").map((x) => x.svc) : []);
    const qui = sujet ? sujet.zones.filter((x) => x.k === "p").map((x) => KP.person(x.qui)) : [];
    let mots = C.mots(sujet ? sujet.tok.replace(/§[a-z]\d+/g, " ") : "").filter((w) => !/^(ont|a|as|avons|fait|font|prevus?|prevues?|cales?|programmes?|quoi|est|sont|il|y|on|nous|qu|ce|c|alors|pour|niveau|cote|actions?|lignes?|choses?|truc|trucs|nouveau|nouvelles?)$/.test(w));
    const filtres = [];
    const tx = KP.norm(sujet ? sujet.txt : "");
    if (/pas (encore )?diffus|non diffus|en attente|pas sorti/.test(tx)) { filtres.push((it) => it.st !== "diffuse"); mots = mots.filter((w) => !/^(pas|encore|diffuses?|diffusees?|non|attente|sortis?)$/.test(w)); }
    else if (/diffus|publi|sorti/.test(tx)) { filtres.push((it) => it.st === "diffuse"); mots = mots.filter((w) => !/^(diffuses?|diffusees?|publies?|sortis?)$/.test(w)); }
    if (/a confirmer|pas confirm|incertain/.test(tx)) { filtres.push((it) => it.st === "confirmer"); mots = mots.filter((w) => !/^(confirmer|pas|confirmes?|incertains?)$/.test(w)); }
    if (/temps forts?/.test(tx)) { filtres.push((it) => it.kind === "tf"); mots = mots.filter((w) => !/^(temps|forts?)$/.test(w)); }
    if (/partenariats?|payants?/.test(tx)) { filtres.push((it) => it.variant === "partenariat"); mots = mots.filter((w) => !/^(partenariats?|payants?)$/.test(w)); }
    const annules = /annul|barre/.test(tx); if (annules) mots = mots.filter((w) => !/^(annules?|annulees?|barres?|barrees?)$/.test(w));
    mots = mots.filter((w) => { const k = Object.keys(ALIAS_SVC).find((x) => ALIAS_SVC[x].test(w)); if (k && KP.service(k)) { svcs.add(k); return false; } return true; });
    qui.forEach((p) => { if (p && p.svc) svcs.add(p.svc); });
    const quandQ = /quand|ou en|qui (fait|s'occupe|gere)|quelle date/.test(KP.norm(vm.a.src));
    const du = z ? (z.du || z.iso) : quandQ || annules ? "" : KP.TODAY, au = z ? (z.au || z.iso) : "";
    let list = store.items().filter((it) => (annules ? !!it.annule : !it.annule) && it.variant !== "sujet" && (!du || KP.endOf(it) >= du) && (!au || it.date <= au) && filtres.every((f) => f(it)) && (!svcs.size || svcs.has(it.svc) || (it.kind === "tf" && !mots.length && false)));
    if (mots.length) { const q = mots.join(" "); const ex = (it) => [it.m.map((k) => (KP.message(k) || {}).nom).join(" "), (KP.service(it.svc) || {}).nom, it.kind === "tf" ? "temps fort" : ""].join(" ");
      list = C.trouver(q, list, { today: KP.TODAY, titre: titreDe, large: true, extra: ex }).filter((x) => x.score >= 0.99).map((x) => x.it); }
    list.sort((x, y) => x.date.localeCompare(y.date));
    const per = z ? (z.du && z.au && z.du !== z.au ? (z.mois ? KP.fmt.mois(z.du) : `du ${jour(z.du)} au ${jour(z.au)}`) : jour(z.iso)) : du ? "à venir" : "";
    const quoi = mots.length ? nettoie(sujet.txt.replace(/\b(ont|a|fait|font|prévus?|prévues?|calés?|de prévu)\b/gi, " ").replace(/\s+/g, " ")) : "";
    vm.titre = "Dans le plan"; vm.resultats = list; vm.entete = `${list.length || "Aucune"} ligne${list.length > 1 ? "s" : ""}${quoi || svcs.size ? ` · ${h([quoi, ...[...svcs].map(svcCourt).filter((x) => !KP.norm(quoi).includes(KP.norm(x)))].filter(Boolean).join(", "))}` : ""}${per ? ` · ${h(per)}` : ""}`;
    return vm;
  }
  function rien(vm, texte) {
    const list = texte.trim().length >= 2 ? C.trouver(texte, store.items().filter((it) => it.variant !== "sujet"), { today: KP.TODAY, titre: titreDe, large: true }).filter((x) => x.score >= 0.75).slice(0, 5).map((x) => x.it) : [];
    vm.titre = list.length ? "Dans le plan" : ""; vm.resultats = list; vm.rien = true; return vm;
  }

  /* ---------- exemples tirés du vrai plan : toujours valables ---------- */
  function exemples() {
    if (KP.cmdExemples) return KP.cmdExemples();
    const its = store.items().filter((it) => !it.annule && it.variant !== "sujet" && !it.flou), T = KP.TODAY;
    /* 2.8.2 : quatre mots au plus, jamais terminés par un petit mot (« page web de la » → « page web ») */
    const court = (it) => { const w = nettoie(it.t).replace(/\s*[:,(].*$/, "").split(/\s+/).slice(0, 4); while (w.length > 1 && /^(de|la|le|les|du|des|d'|d’|l'|l’|à|au|aux|et|en|pour|sur|un|une|avec)$/i.test(w[w.length - 1])) w.pop(); return w.join(" ").toLowerCase(); };
    const prochaine = its.filter((it) => it.kind === "action" && it.date > T && it.st !== "diffuse" && store.canEdit(it)).sort((a, b) => a.date.localeCompare(b.date))[0];
    const passee = its.filter((it) => it.kind === "action" && it.date < T && it.st === "diffuse").sort((a, b) => b.date.localeCompare(a.date))[0];
    const autre = its.filter((it) => it.kind === "action" && it.date > T && it !== prochaine && store.canEdit(it)).sort((a, b) => a.date.localeCompare(b.date))[1];
    const out = [];
    if (prochaine) out.push({ i: "shift", t: `Décale ${court(prochaine)} ${KP.diff(prochaine.date, T) < 7 ? "d'une semaine" : "à demain"}` });
    out.push({ i: "search", t: "Qu'est-ce qui est prévu la semaine prochaine ?" });
    if (store.canCreate()) out.push({ i: "plus", t: "Ajoute un post LinkedIn JPO jeudi à 10 h" });
    if (passee) out.push({ i: "chart", t: `${majuscule(court(passee))} a fait 8 400 vues` });
    if (autre) out.push({ i: "close", t: `On laisse tomber ${court(autre)}` });
    if (!KP.me() || KP.me().role !== "lecteur") out.push({ i: "chat", t: "Demande à Estelle les visuels pour la JPO avant vendredi" });
    /* 2.8.2 : on ne garde que les exemples que la barre comprend vraiment, sans refus, sans choix ni question */
    return out.filter((e) => { try { const vm = comprendre(e.t); return vm && (vm.resultats || (vm.faire && !vm.refus && !vm.manque && !vm.choisir)); } catch (x) { return false; } });
  }

  /* ---------- l'affichage ---------- */
  const surligne = (texte, a) => { let out = "", p = 0; const src = texte.normalize("NFC");
    for (const z of a.surligne) { if (z.at < p) continue; out += h(src.slice(p, z.at)) + `<mark class="cb-${z.k}">${h(src.slice(z.at, z.end))}</mark>`; p = z.end; }
    return out + h(src.slice(p)) + " "; };

  KP.barre = () => `<section class="cb${S.texte ? " plein" : ""}" id="cb" aria-label="Barre de commandes">
      <div class="cb-champ">${ic("spark")}<div class="cb-zone"><div class="cb-miroir" id="cb-miroir" aria-hidden="true"></div>
      <input id="cb-in" type="text" autocomplete="off" spellcheck="false" enterkeyhint="go" value="${h(S.texte)}" placeholder="Écris ce que tu veux faire : « décale le teaser à jeudi »" aria-label="Commande" aria-describedby="cb-res" aria-controls="cb-res"></div>
      <button type="button" class="ib cb-aide" data-act="cb-aide" aria-label="Ce que la barre comprend" data-tip="Ce que je comprends">${ic("info")}</button></div>
      <div class="cb-res" id="cb-res" role="region" aria-live="polite"></div></section>`;

  let vmCourant = null;
  /* 2.8 : une phrase de 3 mots ou plus que la barre ne comprend pas part (une seule fois) dans Réglages > Phrases, chez l'admin */
  const notees = new Set();
  const noter = (t, raison) => { const x = String(t || "").trim(); if (x.split(/\s+/).length < 3 || notees.has(x) || !store.logPhrase) return; notees.add(x); store.logPhrase(x, raison); };
  const incomprise = (t, vm) => vm && vm.rien && String(t).trim().split(/\s+/).length >= 3;
  const vides = new Set(); /* une recherche sans résultat, notée une fois */
  const rechercheVide = (t, vm) => { const x = String(t || "").trim(); if (!vm || x.length < 3 || vides.has(x) || !store.tele) return; if ((vm.k === "chercher" || (vm.rien && !incomprise(x, vm))) && !(vm.resultats && vm.resultats.length)) { vides.add(x); store.tele("recherche", x, { ou: "barre" }); } };
  let enSuspens = ""; /* la dernière phrase non comprise : si on l'efface pour réécrire, on la note */
  function maj(force) {
    const inp = document.getElementById("cb-in"), res = document.getElementById("cb-res"), mir = document.getElementById("cb-miroir"); if (!inp) return;
    const texte = inp.value; if (texte !== S.texte) { S.texte = texte; S.cur = 0; S.navigue = false; }
    if (enSuspens && !texte.startsWith(enSuspens.slice(0, Math.max(3, enSuspens.length - 4))) && texte.trim().length < enSuspens.trim().length - 3) { noter(enSuspens, "reecrit"); enSuspens = ""; }
    document.getElementById("cb").classList.toggle("plein", !!texte.trim());
    if (!texte.trim()) { mir.innerHTML = ""; vmCourant = null; res.innerHTML = S.ouvert || force ? vide() : ""; return; }
    const vm = (vmCourant = comprendre(texte));
    if (incomprise(texte, vm)) { if ([...notees].some((x) => x.startsWith(texte.trim()))) enSuspens = ""; /* un morceau d'une phrase déjà notée */ else if (!enSuspens || texte.startsWith(enSuspens) || !enSuspens.startsWith(texte)) enSuspens = texte; }
    else if (enSuspens && texte.startsWith(enSuspens)) enSuspens = ""; /* en continuant d'écrire, elle est devenue claire */
    mir.innerHTML = surligne(texte, vm.a); mir.scrollLeft = inp.scrollLeft;
    const cle = vm.k;
    res.innerHTML = carte(vm); if (cle === S.cleCarte) res.querySelectorAll(".cb-carte").forEach((c) => c.classList.add("calme")); S.cleCarte = cle;
  }
  function vide() {
    return `<div class="cb-carte cb-ex"><p class="cb-k">Essaie</p><div class="cb-exs">${exemples().map((e) => `<button type="button" class="cb-e" data-act="cb-ex" data-t="${h(e.t)}">${ic(e.i)}<span>${h(e.t)}</span></button>`).join("")}</div></div>`;
  }
  const btn = (vm, i, label, sel = S.cur === i) => `<button type="button" class="btn ${vm.danger ? "danger-bg" : "primary"} small cb-go${sel ? " cur" : ""}" data-act="cb-go" data-i="${i}">${h(label)}${sel && !vm.danger ? `<kbd>Entrée</kbd>` : ""}</button>`;
  function carte(vm) {
    const tete = vm.titre ? `<p class="cb-k">${ico(vm.icone)}${h(vm.titre)}</p>` : "";
    if (vm.vide) return `<div class="cb-carte">${tete}<p class="cb-sous">${h(vm.vide)}</p></div>`;
    if (vm.resultats) {
      const n = vm.resultats.length, l = vm.resultats.slice(0, 7);
      if (vm.rien && !n) return `<div class="cb-carte cb-flou"><p class="cb-sous">${ic("info")}Je n'ai pas compris. Commence par ce que tu veux faire : <i>décale</i>, <i>ajoute</i>, <i>on laisse tomber</i>, <i>qu'est-ce qui est prévu</i>…</p></div>`;
      return `<div class="cb-carte">${vm.rien ? `<p class="cb-k">${ic("search")}Dans le plan</p>` : `<p class="cb-k">${ic("search")}${vm.entete}</p>`}
        ${n ? `<div class="cb-liste">${l.map((it, i) => `<button type="button" class="cb-ligne${S.cur === i ? " cur" : ""}" data-act="cb-ouvre" data-id="${it.id}">${mini(it, KP.pill(it))}</button>`).join("")}</div>${n > 7 ? `<p class="cb-sous">et ${n - 7} autre${n - 7 > 1 ? "s" : ""}</p>` : ""}` : `<p class="cb-sous">Rien de prévu.</p>`}</div>`;
    }
    if (vm.introuvable != null) return `<div class="cb-carte">${tete}<p class="cb-sous">${ic("search")}Aucun${vm.quoiManque === "temps fort" ? " temps fort" : "e action"} ne ressemble à « ${h(vm.introuvable)} ».</p></div>`;
    if (vm.choisir) return `<div class="cb-carte">${tete}<p class="cb-sous">${vm.approx ? `Je ne trouve pas « ${h(vm.q)} » exactement. C'est l'une d'elles ?` : "Plusieurs correspondent. Laquelle ?"}</p>
      <div class="cb-choix">${vm.choisir.map((c, i) => { const sel = S.cur === i && (!vm.approx || S.navigue); return `<div class="cb-c${sel ? " cur" : ""}">${c.corps || mini(c.it)}${c.manque ? "" : c.refus ? `<p class="cb-refus">${ic("lock")}${h(c.refus)}</p>` : btn(c, i, c.bouton, sel)}</div>`; }).join("")}</div>
      ${vm.choisir.some((c) => c.manque) ? aide(vm.choisir[0]) : ""}</div>`;
    return `<div class="cb-carte${vm.danger ? " danger" : ""}">${tete}${vm.corps || ""}${vm.manque ? aide(vm) : vm.refus ? `<p class="cb-refus">${ic("lock")}${h(vm.refus)}</p>` : vm.bouton ? `<div class="cb-pied">${btn(vm, 0, vm.bouton)}${vm.it && !/ouvrir/.test(vm.k) ? `<button type="button" class="link soft" data-act="open" data-id="${vm.it.id}">Voir la fiche</button>` : ""}</div>` : ""}</div>`;
  }
  const aide = (vm) => `<p class="cb-manque">${vm.manque === "date" ? "Quand ?" : vm.manque === "fiche" ? "Sur quelle fiche ?" : ""}</p><div class="cb-aides">${(vm.aide || []).map((t) => `<button type="button" class="cb-a" data-act="cb-plus" data-t="${h(t)}">${h(t)}</button>`).join("")}</div>`;

  function appliquer(i = S.cur) {
    const vm = vmCourant; if (!vm) return;
    if (vm.resultats) { const it = vm.resultats[i]; if (it) KP.go({ fiche: it.id }); return; }
    const c = vm.choisir ? vm.choisir[i] : vm; if (!c || !c.faire || c.manque || c.refus) return;
    const r = c.faire() || {};
    const texte = S.texte;
    if (!r.garde) { S.texte = ""; S.choix = {}; S.cur = 0; S.ouvert = false; }
    if (r.undo) { const u0 = r.undo, t0 = Date.now(), k0 = vm.k, une = () => { if (S.dernier && S.dernier.undo === une) S.dernier = null; u0(); const sec = Math.round((Date.now() - t0) / 1000); if (sec <= 30 && store.tele) store.tele("annule", vm.prive ? "(rappel pour moi, texte privé)" : texte, { k: k0, sec }); setTimeout(() => { const i = document.getElementById("cb-in"); if (i && document.activeElement === document.body) i.focus({ preventScroll: true }); }); }; S.dernier = { undo: une, label: texte }; KP.toast(r.toast, une); } else if (r.toast) KP.toast(r.toast);
    if (r.ouvre) KP.go({ fiche: r.ouvre });
    KP.render();
    if (!r.garde) { const inp = document.getElementById("cb-in"); if (inp) { inp.value = ""; maj(); } }
  }

  /* ---------- l'aide : ce que la barre comprend, un exemple par geste ---------- */
  KP.acts["cb-aide"] = () => {
    const L = [["shift", "Décaler", "décale le teaser de vendredi à mardi prochain · reporte le gala d'une semaine"], ["plus", "Ajouter", "ajoute une relance PGE demain à 9 h · les RS font un carrousel JPO jeudi"], ["close", "Laisser tomber", "on laisse tomber le carrousel JPO Paris · plus besoin de la brève"],
      ["search", "Retrouver", "qu'est-ce qui est prévu pour le PGE la semaine prochaine ? · c'est quand la JPO ?"], ["check", "Changer l'état", "le carrousel JPO est en ligne · confirme le teaser"], ["chart", "Résultats", "le communiqué FT a fait 12 400 vues"],
      ["people", "Confier", "passe le teaser aux RS"], ["chat", "Demander", "demande à Estelle les visuels pour la JPO avant vendredi"], ["clock", "Rappel", "rappelle-moi de relancer la presse lundi pour le gala"],
      ["link", "Rattacher", "rattache le teaser à la journée portes ouvertes"], ["copy", "Dupliquer", "duplique le carrousel JPO Paris pour le 3 décembre"], ["edit", "Renommer, noter", "renomme le teaser en Teaser JPO · ajoute une note au gala : 2 photographes"],
      ["arrow", "Aller", "montre-moi le calendrier de décembre"], ["undo", "Défaire", "annule ça"]];
    const d = KP.dialog(`<div class="dlg-h"><h2>Ce que je comprends</h2><button type="button" class="ib" data-close aria-label="Fermer">${ic("close")}</button></div>
      <div class="cb-gestes">${L.map(([i, n, e]) => `<button type="button" class="cb-geste" data-t="${h(e.split(" · ")[0])}">${ic(i)}<b>${h(n)}</b><span>${h(e)}</span></button>`).join("")}</div>`);
    d.classList.add("cb-dlg");
    d.addEventListener("click", (e) => { const g = e.target.closest(".cb-geste"); if (!g) return; d.close(); remplir(g.dataset.t); });
  };
  function remplir(t, ajoute) {
    const inp = document.getElementById("cb-in"); if (!inp) return;
    inp.value = ajoute ? inp.value.replace(/\s*$/, " ") + t : t; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); maj();
  }
  KP.acts["cb-ex"] = (a) => remplir(a.dataset.t);
  KP.acts["cb-plus"] = (a) => remplir(a.dataset.t, true);
  KP.acts["cb-go"] = (a) => appliquer(+a.dataset.i);
  KP.acts["cb-ouvre"] = (a) => KP.go({ fiche: a.dataset.id });
  KP.cmdRemplir = remplir;

  document.addEventListener("input", (e) => { if (e.target.id === "cb-in") maj(); });
  document.addEventListener("change", (e) => {
    if (e.target.id === "cb-svc") { S.choix.svc = e.target.value; S.choix.devine = false; (S.choix.main = S.choix.main || {}).svc = e.target.value; }
    if (e.target.id === "cb-msg") { S.choix.m = [e.target.value]; (S.choix.main = S.choix.main || {}).m = [e.target.value]; }
  });
  document.addEventListener("focusin", (e) => { if (e.target.id === "cb-in") { S.ouvert = true; maj(); } });
  document.addEventListener("focusout", (e) => { if (e.target.id === "cb-in") rechercheVide(e.target.value, vmCourant); if (e.target.id === "cb-in" && incomprise(e.target.value, vmCourant)) noter(e.target.value, "rien"); if (e.target.id === "cb-in") setTimeout(() => { const c = document.getElementById("cb"); if (c && !c.contains(document.activeElement) && !S.texte.trim()) { S.ouvert = false; maj(); } }, 150); });
  document.addEventListener("scroll", (e) => { if (e.target.id === "cb-in") { const m = document.getElementById("cb-miroir"); if (m) m.scrollLeft = e.target.scrollLeft; } }, true);
  document.addEventListener("keydown", (e) => {
    if (e.target.id !== "cb-in") return;
    const vm = vmCourant, n = vm ? (vm.choisir ? vm.choisir.length : vm.resultats ? Math.min(7, vm.resultats.length) : 1) : 0;
    if (e.key === "Enter") { e.preventDefault(); if (vm && vm.choisir && vm.approx && !S.navigue) { const r = document.querySelector(".cb-choix"); if (r) { r.classList.remove("secoue"); void r.offsetWidth; r.classList.add("secoue"); } return; } if (incomprise(e.target.value, vm)) noter(e.target.value, "rien"); rechercheVide(e.target.value, vm);
      /* 2.8.1 : une suppression ne part jamais sur Entrée, il faut cliquer sur son bouton rouge */
      if (vm && vm.danger) { const r = document.querySelector(".cb-carte.danger .cb-go"); if (r) { r.classList.remove("secoue"); void r.offsetWidth; r.classList.add("secoue"); r.focus({ preventScroll: true }); } return; }
      appliquer(); }
    else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n >= 1) { e.preventDefault(); S.navigue = true; S.cur = (S.cur + (e.key === "ArrowDown" ? 1 : n - 1)) % n; document.getElementById("cb-res").innerHTML = carte(vm); }
    else if (e.key === "Escape" && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ""; maj(); }
    setTimeout(() => { const m = document.getElementById("cb-miroir"); if (m) m.scrollLeft = e.target.scrollLeft; });
  }, true);

  /* la barre se pose tout en haut de l'accueil */
  const accueil = KP.views.accueil;
  KP.views.accueil = () => accueil().replace('<div class="page home">', () => '<div class="page home">' + KP.barre()); /* une fonction : un « $ » tapé reste tel quel */
  const apres = KP.apresRendu;
  KP.apresRendu = (main, entre) => { if (apres) apres(main, entre); if (KP.route.screen === "accueil") maj(); };
  KP.comprendre = comprendre;

})();
