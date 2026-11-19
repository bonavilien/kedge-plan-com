/* Couleur du projet : une seule, choisie dans le brand book KEDGE 2025 (pages 28 et 29).
   La gamme vive (programmes, expertises, campus) s'associe au blanc et au gris anthracite ;
   une couleur de la gamme corporate vit avec son foncé, qui prend alors le menu.
   La couleur remplace le jaune partout : bouton Nouveau, temps forts, semaine en cours, ligne ouverte. */
(() => {
  const KP = (window.KP = window.KP || {});
  const COULEURS = [
    /* gamme corporate : la couleur et son foncé */
    { k: "jaune-or", nom: "Jaune Or", hex: "#FFD453", fonce: "#333539", gamme: "corporate", pour: "Grande École, JPO et SPO" },
    { k: "bleu-caraibes", nom: "Bleu Caraïbes", hex: "#66B2E4", fonce: "#1D2557", gamme: "corporate", pour: "Corporate" },
    { k: "rose-pivoine", nom: "Rose Pivoine", hex: "#F39DAA", fonce: "#CF0D61", gamme: "corporate", pour: "Corporate" },
    { k: "vert-pin", nom: "Vert Pin", hex: "#3FB498", fonce: "#003D45", gamme: "corporate", pour: "Corporate, campus de Mont-de-Marsan" },
    /* gamme programmes, expertises et campus */
    { k: "citron", nom: "Citron", hex: "#FFE400", gamme: "vive", pour: "Arts & Design, Creative industries & culture, KEDGE Arts School, Toulon" },
    { k: "clementine", nom: "Clémentine", hex: "#FF6E00", gamme: "vive", pour: "Summer School, Sustainability, Suzhou" },
    { k: "corail-orange", nom: "Corail orangé", hex: "#EB5D40", gamme: "vive", pour: "Entrepreneurship & family business, KEDGE Entrepreneurship, Bayonne" },
    { k: "corail-rose", nom: "Corail rosé", hex: "#FF5968", gamme: "vive", pour: "KEDGE Bachelor, EBP et IBBA, KEDGE Alumni" },
    { k: "framboise", nom: "Framboise", hex: "#E83C6A", gamme: "vive", pour: "International business, BE-U service aux étudiants, Dakar" },
    { k: "rubis", nom: "Rubis", hex: "#BF1B44", gamme: "vive", pour: "Wine School, Food, wine & hospitality, Bordeaux" },
    { k: "scarlet", nom: "Scarlet", hex: "#DB052C", gamme: "vive", pour: "Chine, Shanghai" },
    { k: "lavande", nom: "Lavande", hex: "#A89CCA", gamme: "vive", pour: "Supply chain, Avignon" },
    { k: "azur", nom: "Azur", hex: "#008BD2", gamme: "vive", pour: "SEEFAR Finance reconsidered, Marseille" },
    { k: "celeste", nom: "Céleste", hex: "#00B4E3", gamme: "vive", pour: "Winter School, Health care & innovation, KEDGE Fondation, Corsica" },
    { k: "lagon", nom: "Lagon", hex: "#0CB6CD", gamme: "vive", pour: "Programmes MSc" },
    { k: "opaline", nom: "Opaline", hex: "#86CEDD", gamme: "vive", pour: "Programmes MS" },
    { k: "turquoise", nom: "Turquoise", hex: "#45BABD", gamme: "vive", pour: "Executive Education, Formation continue, Marketing & new consumption, Paris" },
    { k: "malachite", nom: "Malachite", hex: "#00A298", gamme: "vive", pour: "Impakt, Abidjan" },
  ];
  const DEFAUT = "jaune-or", ANTHRACITE = "#333539", INK = "#26282B";

  /* contraste WCAG entre deux couleurs */
  const lum = (hex) => { const v = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, "0")).join("");
  /* le texte posé sur la couleur : anthracite ou blanc, le plus lisible des deux */
  const encre = (hex) => (contraste(hex, INK) >= contraste(hex, "#FFFFFF") ? INK : "#FFFFFF");
  /* la couleur posée sur le menu foncé : éclaircie jusqu'à se voir (contraste 3:1 au moins) */
  const surMenu = (hex, menu) => { let c = hex, t = 0; while (contraste(c, menu) < 3 && t < 1) { t += 0.1; c = mix(hex, "#FFFFFF", t); } return c; };

  const get = (k) => COULEURS.find((c) => c.k === k) || COULEURS.find((c) => c.k === DEFAUT);
  function appliquer(k) {
    const c = get(k), r = document.documentElement.style, menu = c.fonce || ANTHRACITE;
    r.setProperty("--yellow", c.hex);
    r.setProperty("--yellow-ink", encre(c.hex));
    r.setProperty("--yellow-side", surMenu(c.hex, menu));
    if (c.fonce && c.fonce !== ANTHRACITE) { r.setProperty("--duo", c.fonce); r.setProperty("--duo-ink2", mix(c.fonce, "#FFFFFF", 0.86)); }
    else { r.removeProperty("--duo"); r.removeProperty("--duo-ink2"); }
    document.documentElement.dataset.couleur = c.k;
    return c;
  }
  /* l'écran de connexion s'affiche avant de lire la base : on garde le dernier projet vu sur cet appareil */
  const CLE = "kplan-projet";
  const memo = () => { try { return JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch (e) { return {}; } };
  const retenir = (p) => { try { localStorage.setItem(CLE, JSON.stringify({ couleur: p.couleur || "", sousTitre: p.sousTitre || "" })); } catch (e) {} };

  KP.COULEURS = COULEURS;
  KP.couleur = { DEFAUT, get, appliquer, encre, contraste, memo, retenir };
  appliquer(memo().couleur || DEFAUT);
})();
