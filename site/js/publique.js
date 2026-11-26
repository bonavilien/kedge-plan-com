/* Plan de com KEDGE · V2 — 2.11 : le lien d'une fiche, ouvert sans être connecté.
   La fiche seule, en lecture, avec « Se connecter » en haut. La base ne donne que l'essentiel (fonction fiche_publique, script 0040) :
   ni note, ni budget, ni messages, ni rappels, ni noms. Une fois connecté, la même adresse ouvre la vraie fiche. */
(() => {
  const KP = window.KP;
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ST = { idee: "confirmer", confirmer: "confirmer", planifie: "prevu", production: "prevu", diffuse: "diffuse", retire: "confirmer" };
  const flou = (f) => !!f && !/^\d/.test(f);

  /* l'identifiant de la fiche dans l'adresse : « #/plan?fiche=<id> », ou l'ancien « #item=<id> » des notifications */
  const idDe = (hash) => { const m = /(?:[?&]fiche=|^#item=)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(hash || ""); return m ? m[1].toLowerCase() : ""; };

  function html(f) {
    const ic = KP.ic, tf = f.kind !== "action", sujet = tf && f.periodes && f.periodes.length > 0;
    const it = { kind: tf ? "tf" : "action", st: ST[f.st] || "confirmer", annule: f.st === "retire" ? {} : null, date: f.date, fin: f.fin || "", flou: flou(f.flou),
      variant: f.kind === "classement" ? "classement" : sujet ? "sujet" : f.partenariat ? "partenariat" : "" };
    const date = (x) => (flou(x.flou) ? `courant ${KP.fmt.mois(x.date)}` : KP.fmt.plage(x.date, x.fin || ""));
    const court = (x) => (flou(x.flou) ? `courant ${KP.fmt.moisC(x.date)}` : KP.fmt.moyen(x.date));
    const rows = [];
    if (sujet) { const a = f.periodes[0], z = f.periodes[f.periodes.length - 1]; rows.push(["Période", f.periodes.map((p) => p.nom).join(", ") + ` <small class="muted">${h(KP.fmt.plage(a.du, z.au))}</small>`]); }
    else rows.push(["Date", it.flou ? `<span class="tbc">${h(date(f))}</span> <small class="muted">date à préciser</small>` : `${h(date(f))} <small class="muted">${h(KP.fmt.relatif(f.date))}</small>`]);
    if (f.partenariat) rows.push(["Média", h(f.media) || "—"]);
    else if (!tf && f.svc) rows.push(["Service", h(f.svc)]);
    if (f.messages && f.messages.length) rows.push(["Messages", h(f.messages.join(", "))]);
    if (f.lieu) rows.push(["Lieu", h(f.lieu)]);
    if (f.kind === "classement") { if (f.rang) rows.push(["Rang", h(f.rang === 1 ? "1er" : f.rang + "e")]); if (f.cible) rows.push(["Objectif", "Top " + h(f.cible)]); }
    rows.push(["État", KP.pill(it)]);
    const p = f.tf;
    return `<header class="pub-top">
        <a class="pub-marque" href="./" aria-label="${h(KP.marque.app)}">${KP.logo("pub-logo")}<b>${h(KP.marque.app)}</b></a>
        <button type="button" class="btn primary pub-co" data-pub-co>${ic("lock")}Se connecter</button>
      </header>
      <article class="pub-fiche" aria-labelledby="pub-t">
        <span class="kind"><i class="tag${tf ? " tf" : ""}">${h(KP.kindName(it))}</i></span>
        <h1 class="pub-t" id="pub-t">${h(f.t)}</h1>
        ${it.annule ? `<p class="flag late">${ic("close")}<span><b>Annulé</b></span></p>` : f.report_de ? `<p class="flag">${ic("shift")}<span><b>Reporté</b>, c'était ${h(f.report_de)}</span></p>` : ""}
        <dl class="f-meta">${rows.map(([k, x]) => `<dt>${k}</dt><dd><span class="val">${x}</span></dd>`).join("")}</dl>
        ${p ? `<section class="f-sec from"><h3><i class="tfdot"></i>Vient du temps fort<a class="link" href="#/accueil?fiche=${h(p.id)}">Ouvrir</a></h3>
          <p><b>${h(p.t)}</b> · ${h(date(p))}${p.lieu ? " · " + h(p.lieu) : ""}</p></section>` : ""}
        ${tf && f.relais.length ? `<section class="f-sec"><h3>Relais · ${f.relais.length}</h3>
          ${f.relais.map((r) => `<a class="mini" href="#/accueil?fiche=${h(r.id)}"><span class="d">${h(court(r))}</span><span class="tt">${h(r.t)}</span><small class="mini-s">${h(r.svc)}</small>${KP.pill({ kind: "action", st: ST[r.st] || "confirmer" })}</a>`).join("")}</section>` : ""}
        ${f.docs.length ? `<section class="f-sec"><h3>Documents</h3>
          ${f.docs.map((d) => `<p class="pub-doc">${ic("doc")}<a class="link" href="${h(d.url)}" target="_blank" rel="noopener">${h(d.t || d.url)}</a></p>`).join("")}</section>` : ""}
      </article>`;
  }

  /* affiche la fiche ; connecter() ouvre l'écran de connexion par-dessus */
  function montre(f, connecter) {
    let el = document.getElementById("publique");
    if (!el) { el = document.createElement("div"); el.id = "publique"; el.className = "pub"; document.body.appendChild(el); }
    el.innerHTML = html(f);
    el.scrollTop = 0;
    document.title = `${f.t} · ${KP.marque.app}`;
    el.querySelector("[data-pub-co]").addEventListener("click", connecter);
  }
  function retire() { const el = document.getElementById("publique"); if (el) el.remove(); document.title = KP.marque.app; }

  KP.publique = { idDe, html, montre, retire };
})();
