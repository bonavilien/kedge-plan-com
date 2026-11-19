/* Plan de com KEDGE · V2 — Asana et Trello : chacun envoie des fiches dans SON outil, qui les garde à jour ensuite.
   Le bouton de la fiche (deux flèches) crée la tâche ou la carte chez la personne qui clique ; la base prévient la
   fonction « export » à chaque changement de la fiche, sans rien demander à l'appli.
   Chacun relie son Asana ou son Trello dans Réglages, Mon profil (sauf lecture seule).
   Sans base (démonstration), tout est simulé dans ce navigateur. */
(() => {
  const KP = window.KP, { h, ic, store } = KP;
  const NOMS = { asana: "Asana", trello: "Trello" };
  const AIDE = { asana: "https://app.asana.com/0/my-apps", trello: "https://trello.com/power-ups/admin" };
  const S = { base: true, absente: false, actifs: [], lignes: [] };

  /* démonstration : rien ne sort du navigateur */
  const DEMO = "kplan-outils-demo";
  const demo = {
    lire: async () => { let o = {}; try { o = JSON.parse(localStorage.getItem(DEMO) || "{}"); } catch (e) {} return { base: true, actifs: o.actifs || [], lignes: o.lignes || [] }; },
    garder: () => { try { localStorage.setItem(DEMO, JSON.stringify({ actifs: S.actifs, lignes: S.lignes })); } catch (e) {} },
    fn: async (c) => {
      await new Promise((ok) => setTimeout(ok, 350));
      if (c.action === "lister") return { choix: c.outil === "asana" ? [{ id: "p1", nom: "KEDGE · Plan de com" }, { id: "p2", nom: "KEDGE · Événements" }] : [{ id: "l1", nom: "Com PGE · À faire" }, { id: "l2", nom: "Com PGE · En cours" }] };
      if (c.action === "relier") { const nom = (await demo.fn({ action: "lister", outil: c.outil })).choix.find((x) => x.id === c.cible).nom; S.actifs = [...S.actifs.filter((x) => x.outil !== c.outil), { outil: c.outil, cible_nom: nom }]; demo.garder(); return { outil: c.outil, cible_nom: nom }; }
      if (c.action === "delier") { S.actifs = S.actifs.filter((x) => x.outil !== c.outil); S.lignes = S.lignes.filter((x) => !(x.outil === c.outil && x.user_id === KP.me().k)); demo.garder(); return { ok: true }; }
      if (c.action === "envoyer") { const l = { item: c.item, user_id: KP.me().k, outil: c.outil, url: c.outil === "asana" ? "https://app.asana.com/" : "https://trello.com/", erreur: "" }; S.lignes = [...S.lignes.filter((x) => !(x.item === c.item && x.outil === c.outil)), l]; demo.garder(); return l; }
      if (c.action === "arreter") { S.lignes = S.lignes.filter((x) => !(x.item === c.item && x.outil === c.outil && x.user_id === KP.me().k)); demo.garder(); return { ok: true }; }
      return {};
    },
  };
  const api = () => (store.remote() && KP.remote && KP.remote.exporter) || demo;

  const O = KP.outils = {
    get actifs() { return S.actifs; },
    async charge() {
      try { const r = await api().lire(); S.base = r.base; S.actifs = r.actifs; S.lignes = r.lignes; } catch (e) { return; }
      if (KP.render && KP.route) KP.render();
    },
    /* mes envois de cette fiche (les autres personnes ont les leurs, dans leurs outils) */
    de: (id) => S.lignes.filter((l) => l.item === id && (!l.user_id || l.user_id === KP.me().k)),
    fn: async (corps) => { try { const r = await api().fn(corps); S.absente = false; return r; } catch (e) { if (e.code === "absente") S.absente = true; throw e; } },
  };

  /* ---------- sur la fiche : le bouton de la barre du haut ---------- */
  O.bouton = (it) => {
    const u = KP.me(); if (u.role === "lecteur" || !S.actifs.length) return "";
    const lignes = O.de(it.id);
    const err = lignes.some((l) => l.erreur);
    const noms = (lignes.length ? lignes.map((l) => l.outil) : S.actifs.map((x) => x.outil)).map((k) => NOMS[k]).join(" et ");
    const tip = err ? `${noms} : pas à jour` : lignes.length ? `Synchronisé avec ${noms}` : `Envoyer dans ${noms}`;
    return `<button type="button" class="ib sync${lignes.length ? " lie" : ""}${err ? " err" : ""}" data-act="f-export" data-x="1" data-tip="${h(tip)}" aria-label="${h(tip)}"${lignes.length || S.actifs.length > 1 ? ' aria-haspopup="menu"' : ""}>${ic("sync")}</button>`;
  };
  async function envoyer(it, outil) {
    const b = document.querySelector('#fiche [data-act="f-export"]'); if (b) b.classList.add("tourne");
    try { const l = await O.fn({ action: "envoyer", item: it.id, outil }); S.lignes = [...S.lignes.filter((x) => !(x.item === it.id && x.outil === outil && (!x.user_id || x.user_id === KP.me().k))), { item: it.id, user_id: KP.me().k, outil, url: l.url, erreur: "" }]; KP.render(); KP.toast(`Dans ${NOMS[outil]}, et tenu à jour`); }
    catch (e) { if (b) b.classList.remove("tourne"); KP.toast(e.message); }
  }
  KP.acts["f-export"] = (a) => {
    const it = store.get(KP.route.fiche); if (!it) return;
    const lignes = O.de(it.id);
    if (!lignes.length && S.actifs.length === 1) return envoyer(it, S.actifs[0].outil);
    const items = S.actifs.map(({ outil }) => { const l = lignes.find((x) => x.outil === outil);
      return l ? { v: "ouvrir:" + outil, nom: `Ouvrir dans ${NOMS[outil]}`, icon: outil, info: l.erreur ? "Pas à jour : " + l.erreur : "" }
        : { v: "envoyer:" + outil, nom: `Envoyer dans ${NOMS[outil]}`, icon: outil }; });
    const stop = lignes.map((l) => ({ v: "arreter:" + l.outil, nom: `Ne plus synchroniser avec ${NOMS[l.outil]}`, icon: "close" }));
    KP.menu(a, [...items, ...(stop.length ? ["-", ...stop] : [])], async (v) => {
      const [quoi, outil] = v.split(":");
      if (quoi === "ouvrir") { const l = lignes.find((x) => x.outil === outil); if (l && l.url) window.open(l.url, "_blank", "noopener"); }
      if (quoi === "envoyer") envoyer(it, outil);
      if (quoi === "arreter") { try { await O.fn({ action: "arreter", item: it.id, outil }); S.lignes = S.lignes.filter((x) => !(x.item === it.id && x.outil === outil && (!x.user_id || x.user_id === KP.me().k))); KP.render(); KP.toast(`Plus synchronisé. La ${outil === "asana" ? "tâche" : "carte"} reste dans ${NOMS[outil]}.`); } catch (e) { KP.toast(e.message); } }
    }, { right: true });
  };

  /* ---------- Réglages, Mon profil : relier MON Asana ou MON Trello ---------- */
  O.reglages = () => {
    const ligne = (outil) => { const a = S.actifs.find((x) => x.outil === outil);
      return `<div class="tr"><span class="outil">${ic(outil)}<b>${NOMS[outil]}</b></span>
        ${a ? `<span class="o-cible"><span class="ok-dot sm">${ic("check")}</span>${h(a.cible_nom)}</span>` : `<span class="muted">—</span>`}
        <span class="o-do">${a ? `${KP.ib("edit", "Changer", "outil-relier", `data-k="${outil}"`)}${KP.ib("trash", "Délier", "outil-delier", `data-k="${outil}"`)}` : `<button type="button" class="btn quiet small" data-act="outil-relier" data-k="${outil}">Relier</button>`}</span></div>`; };
    if (KP.me().role === "lecteur") return "";
    return `<section class="set"><h2>Mon Asana, mon Trello</h2>
      ${S.base ? "" : `<p class="muted">${ic("info")} Le script de base 0029 n'est pas encore passé.</p>`}
      <div class="tbl t-outils">${ligne("asana")}${ligne("trello")}</div>
      ${S.absente ? `<p class="muted">${ic("info")} La fonction <b>export</b> n'est pas encore installée dans Supabase.</p>` : ""}</section>`;
  };
  KP.acts["outil-delier"] = (a) => {
    const outil = a.dataset.k;
    const d = KP.dialog(`<form method="dialog"><h2>Délier ${NOMS[outil]} ?</h2><p class="muted">Tes ${outil === "asana" ? "tâches" : "cartes"} déjà envoyées restent dans ${NOMS[outil]}, sans plus suivre l'appli.</p><div class="foot"><button type="button" class="btn quiet" data-close>Garder</button><button class="btn primary danger-bg">Délier</button></div></form>`);
    d.querySelector("form").addEventListener("submit", async () => { try { await O.fn({ action: "delier", outil }); S.actifs = S.actifs.filter((x) => x.outil !== outil); S.lignes = S.lignes.filter((x) => !(x.outil === outil && (!x.user_id || x.user_id === KP.me().k))); KP.render(); KP.toast(`${NOMS[outil]} délié`); } catch (e) { KP.toast(e.message); } });
  };
  KP.acts["outil-relier"] = (a) => {
    const outil = a.dataset.k, deja = S.actifs.some((x) => x.outil === outil), trello = outil === "trello";
    const cle = (n, lab, ph) => `<label class="field"><span>${lab}</span><input class="input" name="${n}" type="password" placeholder="${h(ph)}" autocomplete="off" spellcheck="false"></label>`;
    const d = KP.dialog(`<form method="dialog" class="f-outil"><h2 class="outil-t">${ic(outil)}${NOMS[outil]}</h2>
      <div data-etape="1">
        ${trello ? `<div class="two">${cle("key", "Clé", deja ? "Inchangée" : "32 caractères")}${cle("token", "Jeton", deja ? "Inchangé" : "ATTA…")}</div>` : cle("pat", "Clé personnelle", deja ? "Inchangée" : "2/1234…")}
        <p class="o-aide"><a href="${AIDE[outil]}" target="_blank" rel="noopener">${ic("external")}${trello ? "Ma clé Trello" : "Créer une clé Asana"}</a>${trello ? `<a href="#" data-jeton hidden target="_blank" rel="noopener">${ic("external")}Mon jeton</a>` : ""}</p>
      </div>
      <label class="field" data-etape="2" hidden><span>Mes fiches arrivent dans</span><select class="input" name="cible"></select></label>
      <p class="hint o-err" data-err hidden></p>
      <div class="foot"><button type="button" class="btn quiet" data-close>Annuler</button><button class="btn primary" data-go>Suivant</button></div></form>`);
    const f = d.querySelector("form"), go = d.querySelector("[data-go]"), err = d.querySelector("[data-err]"), sel = f.cible;
    const jeton = () => trello ? (f.key.value.trim() && f.token.value.trim() ? f.key.value.trim() + ":" + f.token.value.trim() : "") : f.pat.value.trim();
    (f.key || f.pat).focus();
    /* Trello : le jeton s'obtient avec la clé, sur une page de Trello où l'on clique « Autoriser » */
    if (trello) f.key.addEventListener("input", () => { const l = d.querySelector("[data-jeton]"), k = f.key.value.trim(); l.hidden = !/^[0-9a-f]{32}$/i.test(k); l.href = `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=${encodeURIComponent(KP.marque ? KP.marque.titre : "Plan de com")}&key=${encodeURIComponent(k)}`; });
    let etape = 1;
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); err.hidden = true; go.disabled = true; go.classList.add("attente");
      try {
        if (etape === 1) {
          const j = jeton();
          if (!j && !deja) throw new Error(trello ? "La clé et le jeton, d'abord." : "La clé, d'abord.");
          const { choix } = await O.fn({ action: "lister", outil, jeton: j });
          if (!choix.length) throw new Error(trello ? "Aucune liste dans tes tableaux Trello." : "Aucun projet dans ton Asana.");
          const cur = (S.actifs.find((x) => x.outil === outil) || {}).cible_nom;
          sel.innerHTML = choix.map((c) => `<option value="${h(c.id)}" ${c.nom === cur ? "selected" : ""}>${h(c.nom)}</option>`).join("");
          d.querySelector('[data-etape="1"]').hidden = true; d.querySelector('[data-etape="2"]').hidden = false; sel.focus();
          etape = 2; go.textContent = "Relier"; f.dataset.jeton = j;
        } else {
          const r = await O.fn({ action: "relier", outil, jeton: f.dataset.jeton, cible: sel.value, site: location.origin + location.pathname, app: KP.marque ? KP.marque.titre : "" });
          S.actifs = [...S.actifs.filter((x) => x.outil !== outil), { outil, cible_nom: r.cible_nom }].sort((x, y) => x.outil.localeCompare(y.outil));
          d.close(); KP.render(); KP.toast(`${NOMS[outil]} relié`);
        }
      } catch (x) { err.textContent = x.message; err.hidden = false; }
      go.disabled = false; go.classList.remove("attente");
    });
  };

  document.addEventListener("DOMContentLoaded", () => { if (!store.remote()) O.charge(); });
})();
