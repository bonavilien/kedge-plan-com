/* Plan de com KEDGE · V2 — « Quoi de neuf » et les guides.
   Quoi de neuf : à la première ouverture d'une nouvelle version, une fenêtre montre ce qui a changé et où le trouver
   (les entrées « nouveau » de version.js, depuis la dernière version que la personne a ouverte, rangée dans son profil).
   Les guides : des pas à pas dans l'appli (Asana et Trello pour commencer), ouverts depuis l'écran concerné ou Quoi de neuf. */
(() => {
  const KP = window.KP, { h, ic } = KP;
  const N = (KP.nouveautes = {});
  const num = (v) => String(v || "").split(".").map((x) => parseInt(x, 10) || 0);
  const apres = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

  /* à qui s'adresse une nouveauté : tout le monde, ceux qui modifient le plan, les chefs de projet, les administrateurs */
  const pourMoi = (x) => { const u = KP.me() || {};
    return !x.pour || (x.pour === "edition" ? u.role !== "lecteur" : x.pour === "chef" ? u.role === "pilote" : x.pour === "admin" ? !!u.admin : false); };
  /* le compte visiteur est partagé : on ne lui montre aucune nouveauté */
  const toutes = () => (KP.me() || {}).role === "lecteur" ? [] : KP.VERSIONS.filter((v) => v.nouveau).flatMap((v) => v.nouveau.map((x) => ({ ...x, n: v.n }))).filter(pourMoi);
  /* ce qui est nouveau depuis la version « avant », pour cette personne (les plus récentes d'abord) */
  N.depuis = (avant) => toutes().filter((x) => apres(x.n, avant));
  /* les dernières, pour Réglages, Nouveautés et version */
  N.dernieres = (k = 6) => toutes().slice(0, k);

  const carte = (x) => `<li class="qn-c">
      <span class="qn-ic">${ic(x.ic || "spark")}</span>
      <div class="qn-tx"><b>${h(x.t)}</b><span>${h(x.d)}</span></div>
      <div class="qn-go">${x.go ? `<button type="button" class="btn quiet small" data-act="qn-go" data-go="${h(JSON.stringify(x.go))}">Afficher</button>` : ""}${x.guide ? `<button type="button" class="btn quiet small" data-act="guide" data-k="${h(x.guide)}">Voir le guide</button>` : ""}</div>
    </li>`;
  N.cartes = (l) => `<ul class="qn-l">${l.map(carte).join("")}</ul>`;
  N.aller = (x) => { if (x && x.go) KP.go({ fiche: "", ...x.go }); };

  /* la fenêtre, une fois par nouvelle version (même famille : une refonte aura sa propre présentation) */
  N.verifier = (avant) => {
    if (!avant || num(avant)[0] !== num(KP.VERSION.n)[0] || !apres(KP.VERSION.n, avant)) return;
    const l = N.depuis(avant).slice(0, 5); if (!l.length) return;
    setTimeout(() => N.montrer(l), 400);
  };
  N.montrer = (l) => {
    if (document.querySelector("dialog.qn")) return;
    const d = KP.dialog(`<div class="qn-in">
        <h2>${l.length > 1 ? "Nouveautés depuis ta dernière connexion" : "Nouveauté depuis ta dernière connexion"}</h2>
        ${N.cartes(l)}
        <div class="foot"><a class="link soft" href="#/reglages/apropos" data-close>Voir toutes les nouveautés</a><button type="button" class="btn primary" data-close>Fermer</button></div>
      </div>`, { cls: "qn" });
    d.addEventListener("click", (e) => { if (e.target.closest('[data-act="guide"], [data-act="qn-go"]')) d.close(); });
    if (KP.store && KP.store.tele) KP.store.tele("ecran", "quoi de neuf");
  };

  /* ---------- les guides ---------- */
  const IMG = (n, alt, cls = "") => `<figure class="gd-f ${cls}"><img src="img/guide/${n}.webp" alt="${h(alt)}" loading="lazy"></figure>`;
  const ui = (t) => `<span class="gd-ui">${t}</span>`, chev = `<span class="gd-chev" aria-hidden="true">›</span>`;
  const A = (s) => `<span class="gd-a">${s}</span>`, T = (s) => `<span class="gd-t">${s}</span>`;
  const etape = (n, titre, corps) => `<section class="gd-s"><span class="gd-n">${n}</span><div class="gd-b"><h3>${titre}</h3>${corps}</div></section>`;
  const GUIDES = {
    "asana-trello": () => `
      <div class="gd-h">
        <h2>Relier Asana ou Trello au plan de com</h2>
        <p class="muted">Une fois ton outil relié, les actions que tu envoies depuis le plan y sont créées, et les tâches marquées « Plan de com » sont ajoutées au plan. La version gratuite d'Asana ou de Trello suffit.</p>
        <div class="seg gd-seg" role="radiogroup" aria-label="Outil">
          <label><input type="radio" name="gd-o" value="asana" checked>${ic("asana")}Asana</label>
          <label><input type="radio" name="gd-o" value="trello">${ic("trello")}Trello</label>
        </div>
      </div>
      <p class="gd-p">Mise en place</p>
      ${etape(1, "Ouvrir son profil", `<p>Dans ${ui("Réglages")}, ouvre ${ui("Mon profil")}, puis clique sur ${ui("Relier")} à côté de ton outil.</p>${IMG("relier", "La section Mon Asana, mon Trello avec ses boutons Relier")}`)}
      ${etape(2, `${A("Créer une clé Asana")}${T("Créer une clé et un jeton Trello")}`, `
        <ol class="gd-l">
          ${A(`<li>Clique sur ${ui(ic("external") + "Créer une clé Asana")} : la page des clés d'Asana s'ouvre dans un nouvel onglet.</li><li>Clique sur ${ui("+ Create new token")}, donne un nom à la clé (par exemple « Plan de com »), puis valide avec ${ui("Create token")}.</li><li>Copie la clé affichée, colle-la dans la fenêtre de l'appli et clique sur ${ui("Suivant")}.</li>`)}
          ${T(`<li>Clique sur ${ui(ic("external") + "Ma clé Trello")}. Sur la page qui s'ouvre, clique sur ${ui("New")}, donne un nom (par exemple « Plan de com »), choisis ton espace de travail, puis clique sur ${ui("Create")}.</li><li>Clique sur ${ui("Generate a new API key")}, puis copie la clé dans le champ <b>Clé</b>.</li><li>Le lien ${ui(ic("external") + "Mon jeton")} apparaît alors. Clique dessus, accepte avec ${ui("Autoriser")}, copie le jeton dans le champ <b>Jeton</b>, puis clique sur ${ui("Suivant")}.</li>`)}
        </ol>${A(IMG("asana-cle", "La fenêtre Asana avec le champ Clé personnelle", "petit"))}${T(IMG("trello-cle", "La fenêtre Trello avec les champs Clé et Jeton", "petit"))}`)}
      ${etape(3, `${A("Choisir le projet")}${T("Choisir la liste")}`, `<p>${A("Les actions envoyées depuis le plan seront créées dans ce projet. L'étiquette « Plan de com » n'est prise en compte que pour les tâches de ce projet.")}${T("Les actions envoyées depuis le plan seront créées dans cette liste. L'étiquette « Plan de com » est prise en compte sur toutes les cartes du tableau qui contient cette liste.")}</p>${A(IMG("asana-projet", "Le choix du projet", "petit"))}${T(IMG("trello-liste", "Le choix de la liste", "petit"))}`)}
      ${etape(4, "Vérifier la connexion", `<p>Une fois l'outil relié, une coche verte et la pastille <span class="gd-etiq">${ic("tag")}Plan de com</span> apparaissent à côté de son nom.</p>${A(IMG("asana-relie", "Asana relié, avec la coche verte et la pastille Plan de com"))}${T(IMG("trello-relie", "Trello relié, avec la coche verte et la pastille Plan de com"))}`)}
      <p class="gd-p">Utilisation</p>
      ${etape(ic("calendar"), `Envoyer une action vers ${A("Asana")}${T("Trello")}`, `<p>Sur la fiche d'une action, clique sur le bouton aux deux flèches ${ui(ic("sync"))}. ${A("La tâche est créée dans ton projet")}${T("La carte est créée dans ta liste")} et le bouton devient vert.</p>${IMG("envoyer", "Le bouton aux deux flèches, en vert, sur une fiche", "petit")}`)}
      ${etape(ic("tag"), `Ajouter ${A("une tâche Asana")}${T("une carte Trello")} au plan`, `
        <ol class="gd-l">
          ${A(`<li>Dans le projet relié, ajoute le tag <span class="gd-etiq">Plan de com</span> à la tâche (menu ${ui("⋯")}, puis ${ui("Ajouter des tags")}).</li>`)}
          ${T(`<li>Dans le tableau relié, ouvre la carte, puis ${ui("Étiquettes")}. La première fois, crée une étiquette nommée <span class="gd-etiq">Plan de com</span> ; ensuite, il suffit de la cocher.</li>`)}
          <li>L'action est ajoutée au plan avec l'état <span class="gd-st conf">À confirmer</span>, dans ton service et à la date d'échéance. Le logo de l'outil indique son origine.</li>
        </ol>${A(IMG("asana-plan", "Dans le plan, le logo Asana à côté du titre"))}${T(IMG("trello-plan", "Dans le plan, le logo Trello à côté du titre"))}
        ${A(IMG("asana-fiche", "Sur la fiche : Vient de l'Asana de…", "petit"))}${T(IMG("trello-fiche", "Sur la fiche : Vient du Trello de…", "petit"))}`)}
      <p class="gd-p">Ce qui est synchronisé</p>
      <table class="gd-tab">
        <tr><td>${A("Tâche cochée")}${T("Échéance cochée")}</td><td>${ic("sync")}</td><td><span class="gd-st diff">Diffusé</span></td></tr>
        <tr><td>${A("Tâche décochée")}${T("Échéance décochée")}</td><td>${ic("sync")}</td><td><span class="gd-st prev">Prévu</span></td></tr>
        <tr><td>Échéance</td><td>${ic("sync")}</td><td>Date</td></tr>
        <tr><td>Nom</td><td>${ic("sync")}</td><td>Titre</td></tr>
        <tr><td>${A("Tâche supprimée")}${T("Carte archivée ou supprimée")}</td><td>${ic("arrow")}</td><td><span class="gd-st annu">Annulé</span> <small class="muted">pour une action ajoutée depuis l'outil</small></td></tr>
        <tr class="muted"><td>Description</td><td></td><td>Non modifiée par l'appli</td></tr>
      </table>
      <details class="gd-q"><summary>L'étiquette n'a aucun effet</summary><p>Vérifie que ${A("la tâche se trouve dans le projet")}${T("la carte se trouve dans le tableau")} choisi à l'étape 3, et que la pastille « Plan de com » apparaît dans ton profil.</p></details>
      <details class="gd-q"><summary>Qui peut voir ma clé ?</summary><p>Personne. Elle est enregistrée dans la base et n'est plus affichée une fois collée, y compris pour toi.</p></details>
      <details class="gd-q"><summary>Changer de ${A("projet")}${T("liste")} ou arrêter la synchronisation</summary><p>Dans Mon profil, le crayon permet de changer de ${A("projet")}${T("liste")} et la corbeille de délier l'outil. Les ${A("tâches")}${T("cartes")} déjà créées restent dans ton outil.</p></details>`,
  };
  KP.guide = (k) => {
    const g = GUIDES[k]; if (!g) return;
    document.querySelectorAll("dialog.gd").forEach((x) => x.close());
    const d = KP.dialog(`<button type="button" class="ib gd-x" data-close aria-label="Fermer">${ic("close")}</button>
      <div class="gd-in" data-o="asana">${g()}<div class="foot"><button type="button" class="btn primary" data-close>Fermer</button></div></div>`, { cls: "gd" });
    const box = d.querySelector(".gd-in");
    d.addEventListener("change", (e) => { if (e.target.name === "gd-o") box.dataset.o = e.target.value; });
    if (KP.store && KP.store.tele) KP.store.tele("ecran", "guide " + k);
    return d;
  };
  KP.acts = KP.acts || {};
  KP.acts.guide = (a) => KP.guide(a.dataset.k);
  KP.acts["qn-go"] = (a) => { let go = null; try { go = JSON.parse(a.dataset.go); } catch (e) {} N.aller({ go }); };
})();
