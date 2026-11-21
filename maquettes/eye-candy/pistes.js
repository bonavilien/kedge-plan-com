/* maquette seulement : le panneau « Les pistes » qui montre chaque proposition d'eye candy dans l'appli */
(function () {
  const P = ["Route vers la 7e", "Moment « Diffusé »", "Résultats animés", "Petit mot de l'appli", "Visages", "Transitions douces", "Écrans vides", "Icônes du menu", "Petits gestes"];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const main = () => document.getElementById("main");
  const haut = () => { main().scrollTop = 0; window.scrollTo(0, 0); };
  const base = { fiche: "", svc: "", msg: "", type: "" };
  const aller = async (patch) => { KP.go({ ...base, ...patch }); await attendre(60); };
  const demos = [
    async () => { try { sessionStorage.removeItem("kplan-r7"); } catch (e) {} await aller({ screen: "accueil" }); haut(); KP.rejouer(); const r = main().querySelector(".r7"); if (r && r.getBoundingClientRect().bottom > innerHeight) r.scrollIntoView({ block: "center" }); },
    async () => {
      const it = KP.store.items().find((i) => /Berkeley/.test(i.t));
      if (it && it.st !== "prevu") KP.store.update(it.id, { st: "prevu" });
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); KP.rejouer();
      const wk = main().querySelector(".wk.now"); if (wk) wk.scrollIntoView({ block: "center" });
      await attendre(900);
      if (it) KP.setStatus(it.id, "diffuse");
    },
    async () => { try { sessionStorage.removeItem("kplan-compte"); } catch (e) {} await aller({ screen: "resultats", tab: "diffusions", per: "considerer" }); haut(); KP.rejouer(); },
    async () => { try { sessionStorage.removeItem("kplan-pique-accueil"); } catch (e) {} KP.piqueVue = false; await aller({ screen: "accueil" }); haut(); KP.rejouer(); },
    async () => { await aller({ screen: "reglages", set: "profil" }); haut(); KP.rejouer(); const r = main().querySelector(".mp-rond"); if (r) { r.classList.add("survol"); setTimeout(() => r.classList.remove("survol"), 1600); } },
    async () => {
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); haut();
      await attendre(700); await aller({ screen: "plan", per: "preferer", vue: "liste" });
      await attendre(1300); await aller({ screen: "plan", per: "considerer", vue: "liste" });
    },
    async () => { await aller({ screen: "plan", per: "decider", vue: "liste", msg: "international" }); haut(); KP.rejouer(); },
    async () => {
      /* chaque icône fait son geste (comme au survol), puis on change d'écran : la surbrillance glisse */
      await aller({ screen: "accueil" }); haut(); await attendre(300);
      const tel = matchMedia("(max-width: 767px)").matches;
      const sel = tel ? ['.tabbar [data-k="accueil"]', '.tabbar [data-k="plan"]', '.tabbar [data-k="resultats"]', '.tabbar [data-k="reunion"]', '.topbar [data-act="search"]', '.topbar [data-act="notifs"]', '.topbar [data-act="profile"]']
        : [".side .brand", ".side .new", '.nav [data-k="accueil"]', '.nav [data-k="plan"]', '.nav [data-k="resultats"]', '.nav [data-k="reunion"]', '.side-foot [data-act="search"]', '.side-foot [data-act="notifs"]', '.side-foot [data-act="profile"]'];
      for (const s of sel) { const e = document.querySelector(s); if (e) { e.classList.add("joue"); setTimeout(() => e.classList.remove("joue"), 750); } await attendre(420); }
      await attendre(500);
      for (const k of ["plan", "resultats", "reunion", "accueil"]) { await aller({ screen: k, per: "considerer", vue: "liste" }); haut(); await attendre(1000); }
    },
    async () => {
      /* les onglets glissent, le menu se déroule, le marque-page tombe, le message montre le temps pour annuler, le thème s'étend en cercle */
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); haut(); await attendre(500);
      await aller({ screen: "plan", per: "preferer", vue: "liste" }); await attendre(900);
      await aller({ screen: "plan", per: "preferer", vue: "grille" }); await attendre(900);
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); await attendre(800);
      const pb = [...document.querySelectorAll('.side-foot [data-act="profile"], .topbar [data-act="profile"]')].find((b) => b.offsetWidth);
      if (pb) { pb.click(); await attendre(1300); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await attendre(300); }
      const it = KP.store.items().find((i) => i.kind !== "tf" && !KP.store.pinned(i.id));
      if (it) { await aller({ screen: "plan", per: "considerer", vue: "liste", fiche: it.id }); await attendre(700); KP.acts["f-pin"](); await attendre(1600); }
      KP.toast("Enregistré", () => {}); await attendre(2200);
      await aller({ screen: "reglages", set: "profil" });
      const seg = main().querySelector('.seg[aria-label="Apparence"]');
      if (seg) {
        seg.scrollIntoView({ block: "center" }); await attendre(400);
        const avant = KP.store.prefs().theme || "auto", sombre = document.documentElement.dataset.theme === "dark" || (avant === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
        const b = seg.querySelector(`[data-k="${sombre ? "light" : "dark"}"]`); KP.changerTheme(sombre ? "light" : "dark", b); await attendre(1600);
        const b2 = main().querySelector(`.seg[aria-label="Apparence"] [data-k="${avant}"]`); KP.changerTheme(avant, b2);
      }
    },
  ];
  const el = document.createElement("aside");
  el.className = "pz"; el.setAttribute("aria-label", "Les pistes de la maquette");
  const flottant = () => !matchMedia("(min-width: 1000px) and (min-height: 840px)").matches;
  const petit = matchMedia("(max-width: 760px)").matches;
  el.innerHTML = `<button type="button" class="pz-h" aria-expanded="${!petit}"><b>Les pistes</b><span>maquette</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
    <ol>${P.map((t, i) => `<li><button type="button" data-p="${i}"><i>${i + 1}</i><span>${t}</span></button></li>`).join("")}</ol>`;
  if (petit) el.classList.add("ferme");
  document.body.appendChild(el);
  const h = el.querySelector(".pz-h");
  h.addEventListener("click", () => { const f = el.classList.toggle("ferme"); h.setAttribute("aria-expanded", String(!f)); });
  el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", async () => {
    el.querySelectorAll("[data-p]").forEach((x) => x.classList.toggle("on", x === b));
    if (flottant()) { el.classList.add("ferme"); h.setAttribute("aria-expanded", "false"); }
    try { await demos[+b.dataset.p](); } catch (e) { console.error(e); }
  }));
})();
