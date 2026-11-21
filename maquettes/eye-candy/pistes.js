/* maquette seulement : le panneau « Les 7 pistes » qui montre chaque proposition d'eye candy dans l'appli */
(function () {
  const P = ["Route vers la 7e", "Moment « Diffusé »", "Résultats animés", "Petit mot de l'appli", "Visages", "Transitions douces", "Écrans vides"];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const main = () => document.getElementById("main");
  const haut = () => { main().scrollTop = 0; window.scrollTo(0, 0); };
  const base = { fiche: "", svc: "", msg: "", type: "" };
  const aller = async (patch) => { KP.go({ ...base, ...patch }); await attendre(60); };
  const demos = [
    async () => { await aller({ screen: "accueil" }); haut(); KP.rejouer(); const r = main().querySelector(".r7"); if (r && r.getBoundingClientRect().bottom > innerHeight) r.scrollIntoView({ block: "center" }); },
    async () => {
      const it = KP.store.items().find((i) => /Berkeley/.test(i.t));
      if (it && it.st !== "prevu") KP.store.update(it.id, { st: "prevu" });
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); KP.rejouer();
      const wk = main().querySelector(".wk.now"); if (wk) wk.scrollIntoView({ block: "center" });
      await attendre(900);
      if (it) KP.setStatus(it.id, "diffuse");
    },
    async () => { await aller({ screen: "resultats", tab: "diffusions", per: "considerer" }); haut(); KP.rejouer(); },
    async () => { try { sessionStorage.removeItem("kplan-pique-accueil"); } catch (e) {} KP.piqueVue = false; await aller({ screen: "accueil" }); haut(); KP.rejouer(); },
    async () => { await aller({ screen: "reglages", set: "profil" }); haut(); KP.rejouer(); const r = main().querySelector(".mp-rond"); if (r) { r.classList.add("survol"); setTimeout(() => r.classList.remove("survol"), 1600); } },
    async () => {
      await aller({ screen: "plan", per: "considerer", vue: "liste" }); haut();
      await attendre(700); await aller({ screen: "plan", per: "preferer", vue: "liste" });
      await attendre(1300); await aller({ screen: "plan", per: "considerer", vue: "liste" });
    },
    async () => { await aller({ screen: "plan", per: "decider", vue: "liste", msg: "international" }); haut(); KP.rejouer(); },
  ];
  const el = document.createElement("aside");
  el.className = "pz"; el.setAttribute("aria-label", "Les 7 pistes de la maquette");
  const flottant = () => !matchMedia("(min-width: 1000px) and (min-height: 760px)").matches;
  const petit = matchMedia("(max-width: 760px)").matches;
  el.innerHTML = `<button type="button" class="pz-h" aria-expanded="${!petit}"><b>Les 7 pistes</b><span>maquette</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
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
