/* Plan de com KEDGE · V2 — « Quoi de neuf » et les guides.
   Quoi de neuf : à la première ouverture d'une nouvelle version, une fenêtre montre ce qui a changé et où le trouver
   (les entrées « nouveau » de version.js, depuis la dernière version que la personne a ouverte, rangée dans son profil).
   Les guides : des pas à pas dans l'appli (Asana et Trello pour commencer), ouverts depuis l'écran concerné ou Quoi de neuf. */
(() => {
  const KP = window.KP, { h, ic } = KP;
  const N = (KP.nouveautes = {});
  const num = (v) => String(v || "").split(".").map((x) => parseInt(x, 10) || 0);
  const apres = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

  /* ce qui est nouveau depuis la version « avant » (les plus récentes d'abord) */
  N.depuis = (avant) => KP.VERSIONS.filter((v) => v.nouveau && apres(v.n, avant)).flatMap((v) => v.nouveau.map((x) => ({ ...x, n: v.n })));
  /* les dernières, pour Réglages, Nouveautés et version */
  N.dernieres = (k = 4) => KP.VERSIONS.filter((v) => v.nouveau).flatMap((v) => v.nouveau.map((x) => ({ ...x, n: v.n }))).slice(0, k);

  const carte = (x) => `<li class="qn-c">
      <span class="qn-ic">${ic(x.ic || "spark")}</span>
      <div class="qn-tx"><b>${h(x.t)}</b><span>${h(x.d)}</span></div>
      <div class="qn-go">${x.go ? `<button type="button" class="btn quiet small" data-act="qn-go" data-go="${h(JSON.stringify(x.go))}">Montre-moi</button>` : ""}${x.guide ? `<button type="button" class="btn quiet small" data-act="guide" data-k="${h(x.guide)}">Le guide</button>` : ""}</div>
    </li>`;
  N.cartes = (l) => `<ul class="qn-l">${l.map(carte).join("")}</ul>`;
  N.aller = (x) => { if (x && x.go) KP.go({ fiche: "", ...x.go }); };

  /* la fenêtre, une fois par nouvelle version (même famille : une refonte aura sa propre présentation) */
  N.verifier = (avant) => {
    if (!avant || num(avant)[0] !== num(KP.VERSION.n)[0] || !apres(KP.VERSION.n, avant)) return;
    const l = N.depuis(avant); if (!l.length) return;
    setTimeout(() => N.montrer(l), 400);
  };
  N.montrer = (l) => {
    if (document.querySelector("dialog.qn")) return;
    const d = KP.dialog(`<div class="qn-in">
        <p class="qn-eye">${ic("spark")}Quoi de neuf</p>
        <h2>${l.length > 1 ? "Ce qui a changé depuis ta dernière visite" : "Une nouveauté depuis ta dernière visite"}</h2>
        ${N.cartes(l)}
        <div class="foot"><a class="link soft" href="#/reglages/apropos" data-close>Toutes les nouveautés</a><button type="button" class="btn primary" data-close>C'est noté</button></div>
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
        <h2>Relier ton Asana ou ton Trello</h2>
        <p class="muted">Tu travailles dans ton outil, le plan suit. Et l'inverse. Gratuit, 5 minutes, une seule fois.</p>
        <div class="seg gd-seg" role="radiogroup" aria-label="Ton outil">
          <label><input type="radio" name="gd-o" value="asana" checked>${ic("asana")}Asana</label>
          <label><input type="radio" name="gd-o" value="trello">${ic("trello")}Trello</label>
        </div>
      </div>
      <p class="gd-p">Relier</p>
      ${etape(1, "Ouvre ton profil", `<p>${ui("Réglages")}${chev}${ui("Mon profil")}${chev}${ui("Relier")}</p>${IMG("relier", "La section Mon Asana, mon Trello avec ses boutons Relier")}`)}
      ${etape(2, `${A("Crée ta clé Asana")}${T("Crée ta clé et ton jeton Trello")}`, `
        <ol class="gd-l">
          ${A(`<li>${ui(ic("external") + "Créer une clé Asana")} ouvre la page des clés d'Asana.</li><li>${ui("+ Create new token")}, nomme-la <b>Plan de com</b>, puis ${ui("Create token")}.</li><li>Copie la clé, colle-la, puis ${ui("Suivant")}.</li>`)}
          ${T(`<li>${ui(ic("external") + "Ma clé Trello")} : ${ui("New")}, nomme-le <b>Plan de com</b>, choisis ton espace, puis ${ui("Create")}.</li><li>${ui("Generate a new API key")} : colle-la dans <b>Clé</b>.</li><li>${ui(ic("external") + "Mon jeton")} apparaît : ${ui("Autoriser")}, colle le jeton dans <b>Jeton</b>, puis ${ui("Suivant")}.</li>`)}
        </ol>${A(IMG("asana-cle", "La fenêtre Asana avec la case Clé personnelle", "petit"))}${T(IMG("trello-cle", "La fenêtre Trello avec les cases Clé et Jeton", "petit"))}`)}
      ${etape(3, `${A("Choisis ton projet")}${T("Choisis ta liste")}`, `<p>C'est là qu'arrivent tes envois. ${A("C'est aussi le projet")}${T("Son tableau est aussi celui")} où l'étiquette « Plan de com » fonctionne.</p>${A(IMG("asana-projet", "Le choix du projet", "petit"))}${T(IMG("trello-liste", "Le choix de la liste", "petit"))}`)}
      ${etape(4, "C'est relié", `<p>La coche verte et la pastille <span class="gd-etiq">${ic("tag")}Plan de com</span> le confirment.</p>${A(IMG("asana-relie", "Asana relié"))}${T(IMG("trello-relie", "Trello relié"))}`)}
      <p class="gd-p">Au quotidien</p>
      ${etape(ic("calendar"), `Du plan vers ${A("Asana")}${T("Trello")}`, `<p>Sur une fiche, les deux flèches ${ui(ic("sync"))}. ${A("La tâche")}${T("La carte")} est créée chez toi, les flèches passent au vert.</p>${IMG("envoyer", "Le bouton aux deux flèches en vert sur une fiche", "petit")}`)}
      ${etape(ic("tag"), `${A("D'Asana")}${T("De Trello")} vers le plan`, `
        <ol class="gd-l">
          ${A(`<li>Sur une tâche du projet relié : ${ui("⋯")}${chev}${ui("Ajouter des tags")}, tape <span class="gd-etiq">Plan de com</span>.</li>`)}
          ${T(`<li>Sur une carte du tableau relié : ${ui("Étiquettes")}${chev}${ui("Créer une nouvelle étiquette")} <span class="gd-etiq">Plan de com</span>, puis coche-la sur les autres cartes.</li>`)}
          <li>L'action arrive <span class="gd-st conf">À confirmer</span>, dans ton service, à l'échéance. Tout le monde voit d'où elle vient.</li>
        </ol>${A(IMG("asana-plan", "Dans le plan, le logo Asana à côté du titre"))}${T(IMG("trello-plan", "Dans le plan, le logo Trello à côté du titre"))}
        ${A(IMG("asana-fiche", "Sur la fiche : Vient de l'Asana de…", "petit"))}${T(IMG("trello-fiche", "Sur la fiche : Vient du Trello de…", "petit"))}`)}
      <p class="gd-p">Ensuite, tout suit</p>
      <table class="gd-tab">
        <tr><td>${A("Cocher la tâche")}${T("Cocher l'échéance")}</td><td>${ic("sync")}</td><td><span class="gd-st diff">Diffusé</span></td></tr>
        <tr><td>La décocher</td><td>${ic("sync")}</td><td><span class="gd-st prev">Prévu</span></td></tr>
        <tr><td>L'échéance</td><td>${ic("sync")}</td><td>La date</td></tr>
        <tr><td>Le nom</td><td>${ic("sync")}</td><td>Le titre</td></tr>
        <tr><td>${A("Supprimer la tâche")}${T("Archiver ou supprimer la carte")}</td><td>${ic("arrow")}</td><td><span class="gd-st annu">Annulé</span> <small class="muted">si elle venait de chez toi</small></td></tr>
        <tr class="muted"><td>La description</td><td></td><td>Jamais touchée</td></tr>
      </table>
      <details class="gd-q"><summary>L'étiquette ne fait rien ?</summary><p>${A("La tâche doit être dans le projet")}${T("La carte doit être dans le tableau")} choisi à l'étape 3, et la pastille « Plan de com » visible dans ton profil.</p></details>
      <details class="gd-q"><summary>Qui voit ma clé ?</summary><p>Personne, même pas toi une fois collée.</p></details>
      <details class="gd-q"><summary>Changer ou arrêter ?</summary><p>Dans ton profil : le crayon pour changer, la corbeille pour délier. Ce qui est déjà chez toi y reste.</p></details>`,
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
