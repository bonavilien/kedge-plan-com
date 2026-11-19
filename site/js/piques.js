/* Plan de com KEDGE · V2 — les petites piques : une phrase tirée au hasard sous « Bonjour Prénom »,
   sur l'écran de connexion (au retour) et sur l'accueil, une fois par ouverture, jamais la même deux fois de suite.
   Phrases validées par Julien le 2026-11-19. sept: true = seulement dans Road to 7th (le classement SIGEM, la 7e place). */
(function () {
  const KP = window.KP;
  const S = (t) => ({ t, sept: true });
  KP.PIQUES = {
    connexion: [
      "On t'a manqué ?",
      "Encore toi ? Ça tombe bien.",
      "On ne dira à personne que tu reviens déjà.",
      "Rien n'a bougé. Enfin, presque.",
      "Ah, te revoilà. Je commençais à apprécier le silence.",
      "Je t'attendais. Pas impatiemment, je suis une appli. Mais quand même.",
      "Ton absence a été notée. Et commentée.",
      "Bonne nouvelle : rien n'a brûlé. Mauvaise nouvelle : rien n'a avancé non plus.",
      "Promis, je n'ai rien supprimé. Cette fois.",
      "Je ne juge pas tes horaires. Je les note, c'est tout.",
      "Le planning ne s'est pas rempli tout seul. On a vérifié.",
      "Tu reviens pour la gloire ou pour les deadlines ?",
      "Rappel : un fichier « final_v3_DEF » n'est jamais final.",
      "Je pourrais remplir le planning moi-même. Mais où serait le plaisir ?",
      "J'ai calculé tes chances de tout boucler à temps. Parlons d'autre chose.",
      S("Le SIGEM ne va pas se remonter tout seul."),
      S("Sept, c'est le chiffre du jour. Comme tous les jours."),
      S("Le SIGEM ne prend pas de vacances. Toi, si, parfois."),
      S("Quelque part, une école classée 7e se croit tranquille."),
      S("La 7e place ne se gagnera pas en fixant le plafond."),
    ],
    accueil: [
      "Tes J-7 sont devenus des J-2. Je dis ça, je dis rien.",
      "J'ai mis les urgences en haut. Tu peux paniquer dans l'ordre.",
      "Encore une réunion qui aurait pu être un planning bien rempli.",
      "Statistiquement, quelqu'un attend une réponse de ta part.",
      "Rien ne presse. Sauf tout ce qui est en retard.",
      S("Les écoles devant nous ne dorment pas. Elles postent."),
      S("Trois places à grimper. Personne ne va nous les offrir."),
      "J'ai trié ta journée par ordre de gravité. De rien.",
      "Ce qui est en haut est urgent. Ce qui est en bas le sera bientôt.",
      "Tout est sous contrôle. Le mien, surtout.",
      "Je te présente ta to-do. Elle, par contre, te connaît très bien.",
      "Une demande ignorée ne disparaît pas. Elle mûrit.",
      "J'ai vu des plannings plus vides. Pas beaucoup, mais j'en ai vu.",
      "Je ne dis pas que tout repose sur toi. Je le pense très fort.",
      "Ta semaine en un mot : chargée. En deux mots : très chargée.",
      "Chaque action a une date. Même celles qu'on préfère oublier.",
      "Ce qui n'est pas dans le planning n'existe pas. C'est la règle, je viens de l'inventer.",
      "Épingle ce que tu veux. Je ne jugerai pas. Enfin, pas tout haut.",
      "Un brief sans date, c'est une rumeur.",
      "« On en parle en réunion » : traduction, personne ne s'en occupe.",
      "J'ai rangé tes priorités. Tu as le droit de soupirer.",
      S("La 7e place se joue aussi aujourd'hui. Pas de pression."),
    ],
  };
  /* les phrases sur le 7 et le SIGEM n'ont de sens que dans Road to 7th, pas dans les copies des autres équipes */
  const sept = () => /road to 7/i.test((KP.marque && KP.marque.app) || "");
  const lire = (st, k) => { try { return st.getItem(k); } catch (e) { return null; } };
  const ecrire = (st, k, v) => { try { st.setItem(k, v); } catch (e) {} };
  /* une phrase par ouverture (gardée pour la session), différente de la précédente sur cet appareil */
  KP.pique = (liste) => {
    const deja = lire(sessionStorage, "kplan-pique-" + liste);
    if (deja) return deja;
    const choix = (KP.PIQUES[liste] || []).filter((p) => typeof p === "string" || sept()).map((p) => (typeof p === "string" ? p : p.t));
    if (!choix.length) return "";
    const avant = lire(localStorage, "kplan-pique-" + liste), reste = choix.length > 1 ? choix.filter((p) => p !== avant) : choix;
    const t = reste[Math.floor(Math.random() * reste.length)];
    ecrire(localStorage, "kplan-pique-" + liste, t); ecrire(sessionStorage, "kplan-pique-" + liste, t);
    return t;
  };
})();
