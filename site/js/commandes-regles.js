/* Road to 7th — la barre de commandes : CE QUE L'APPLI COMPREND.
   C'est le seul fichier à toucher quand l'équipe dit une chose que la barre ne comprend pas encore.
   Un mot nouveau  → l'ajouter dans sa liste (MOTS).
   Une tournure    → ajouter une ligne dans « dire » de la bonne intention.
   Puis ajouter la phrase dans test/commandes/phrases.mjs.

   Syntaxe (inspirée de Hassil, Home Assistant) :
     (a|b)     l'un ou l'autre          [x]   facultatif
     {liste}   un mot de la liste MOTS  {quoi} une action du plan (titre approximatif)
     {date} {date2}  une date ou une période, lue par le moteur de dates de la 2.5 (« mardi prochain », « courant décembre »)
     {service} « aux RS », « pour la vidéo »   {qui} une personne de l'équipe   {nombre} « 12 400 vues »   {montant} « 1 650 € »
     {decalage} « d'une semaine », « de 3 jours »   {texte} du texte libre   {sujet} ce qu'on cherche (mots, service…)
   Les accents, majuscules et tirets ne comptent pas. L'heure (« à 9 h ») et le motif (« car… », « parce que… ») sont lus partout.
   Quand plusieurs tournures marchent, la plus précise gagne (celle qui reconnaît le plus de mots). */
(() => {
  const KP = (typeof window !== "undefined" ? (window.KP = window.KP || {}) : {});

  const MOTS = {
    ajouter: "ajoute|ajouter|ajoutes|rajoute|rajouter|crée|créer|crées|créé|prévois|prévoir|programme|programmer|planifie|planifier|cale|caler|mets|mettre|ajoutons|créons|prévoyons|calons|on ajoute|on crée|on prévoit|on programme|on cale|on met|on fait|on lance|lance|lancer|nouvelle|nouveau|il faut|faut|il faudrait|on doit faire|je veux|on veut|rajoutes|ajout de|ajout d'|on a besoin de|on a besoin d'|faudrait|il nous faut|il faudra|on poste|on publie|on sort|on tourne",
    decaler: "décale|décaler|décal|décalle|décalles|repouse|décales|décalez|décalons|reporte|reporter|reportons|repousse|repousser|repoussons|déplace|déplacer|déplaçons|bouge|bouger|glisse|glisser|passe|passer|bascule|basculer|avance|avancer|avançons|recule|reculer|remets|remettre|on décale|on reporte|on repousse|on déplace|on bouge|on avance|on recule|on passe|on bascule|on glisse|on remet",
    annuler: "annule|annuler|anule|anuler|on n'a plus besoin de|on n'a plus besoin du|on n'a plus besoin des|on n'a plus besoin d'|annulez|annulons|on annule|laisse tomber|on laisse tomber|laissons tomber|on oublie|oublie|oublions|on abandonne|abandonne|abandonner|on zappe|zappe|on sucre|sucre|on arrête|arrête|stoppe|on stoppe|on ne fait plus|on ne fait pas|on fait plus|on fait pas|on lâche|lâche|on renonce à|renonce à|tant pis pour|on enterre|enterre|on drop|retire|retirer|enlève|enlever|vire|virer|on retire|on enlève|on vire",
    annule_fin: "est annulé|est annulée|sont annulés|est annulés|tombe à l'eau|tombent à l'eau|saute|sautent|ne se fera pas|ne se fait plus|n'aura pas lieu|c'est mort|est mort|est morte|on oublie|on laisse tomber|c'est annulé|n'a plus lieu",
    supprimer: "supprime|supprimer|suprime|suprimer|supprimez|efface|effacer|on supprime|on efface|détruis",
    retablir: "rétablis|rétablir|rétablit|réactive|réactiver|ressors|ressortir|on refait|refais|finalement on fait|finalement on garde|on garde|on fait quand même|on reprend|reprends|remets en place|restaure|on rétablit",
    diffuse: "diffusé|diffusée|diffusés|diffusées|publié|publiée|publiés|posté|postée|postés|en ligne|sorti|sortie|sortis|parti|partie|envoyé|envoyée|envoyés|fait|faite|live|passé|passée|bouclé|bouclée|terminé|terminée",
    diffuser: "diffusé|publié|posté|envoyé|sorti|mis en ligne|bouclé|terminé|fait",
    confirmer: "confirme|confirmer|valide|valider|on confirme|on valide|go pour|feu vert pour|ok pour|c'est validé pour|c'est confirmé pour|c'est calé pour|c'est ok pour|c'est bon pour",
    confirme_fin: "est confirmé|est confirmée|est validé|est validée|est calé|est calée|c'est confirmé|c'est validé|c'est calé|est ok|c'est ok|est sûr|est sûre|est acté|est actée",
    passer: "passe|passer|confie|confier|donne|donner|attribue|attribuer|transfère|transférer|bascule|refile|file|on passe|on confie|on donne",
    lier: "rattache|rattacher|relie|relier|lie|lier|associe|associer|accroche|raccroche|range|ranger|classe|on rattache|on relie|on associe",
    renommer: "renomme|renommer|rebaptise|rebaptiser|appelle|appeler|on renomme|on appelle",
    dupliquer: "fais une copie de|fais une copie du|fais une copie d'|fais un doublon de|fais un doublon du|duplique|dupliquer|copie|copier|clone|cloner|refais|refaire|recycle|recycler|reprends|on duplique|on refait|on recycle",
    demander: "demande|demander|demandes|réclame|réclamer|on demande",
    envoyer: "m'envoyer|envoyer|m'envoies|me faire|faire|me donner|donner|préparer|me préparer|me passer|passer|fournir|me fournir",
    rappeler: "rappelle-moi|rappelle moi|rappelle-nous|me rappeler|rappel|pense-bête|pense à|n'oublie pas|fais-moi penser à|fais moi penser à|note pour moi",
    epingler: "épingle|épingler|épinglons|garde sous la main|mets en favori|mets en favoris|ajoute aux épinglés|pin",
    desepingler: "désépingle|désépingler|retire des épinglés|enlève des épinglés|dépingle",
    ouvrir: "ouvre|ouvrir|affiche|afficher|montre|montrer|voir|vois|va sur|aller sur|emmène-moi sur|emmène moi sur",
    montrer: "montre|montrer|affiche|afficher|liste|lister|donne|donner|sors|sortir|trouve|trouver|cherche|chercher|retrouve|retrouver|fais voir|va|aller|emmène|emmène-moi|emmène moi",
    question: "qu'est-ce qui|qu'est ce qui|qu'est-ce qu'on a|qu'est ce qu'on a|qu'est-ce qu'il y a|qu'est ce qu'il y a|qu'avons-nous|qu'est-ce que|qu'est ce que|il y a quoi|y a quoi|on a quoi|quoi|quelles actions|quelles sont les actions|quels sont les|quelles sont les|ce qui est|tout ce qui est|y a-t-il|est-ce qu'il y a|est-ce qu'on a|on a",
    prevu: "prévu|prévus|prévue|prévues|calé|calés|calée|calées|programmé|programmés|programmée|planifié|planifiés|planifiée|au programme|à venir|en cours|au planning|dans le plan|de prévu|de prévus|de calé",
    quand: "c'est quand|quand est|quand a lieu|quand sort|quand passe|quand tombe|quand est prévu|quand est prévue|quand sortent|quand sont|à quelle date est|à quelle date|quelle date pour|quelle est la date de|quelle est la date du|quand",
    ou_en: "où en est|où en sont|où on en est de|où on en est du|où on en est avec|ça en est où|où ça en est",
    qui_fait: "qui fait|qui s'occupe de|qui s'occupe du|qui s'occupe des|qui gère|qui est sur|qui a",
    ecran: "le plan|le calendrier|calendrier|le planning|planning|la liste|les résultats|le budget|la réunion|l'ordre du jour|le bilan|les réglages|l'accueil|mon profil|la grille",
    a: "à|au|aux|en|pour|vers|jusqu'à|jusqu'au|sur",
    de: "de|du|d'|des|depuis|prévu|prévue|prévu le|prévue le",
    note: "une note|la note|en note|dans la note|dans les notes|un commentaire|un mot",
    defaire: "annule|oups annule|non annule|annule ça|annule ca|annule cela|annule la dernière|annule ma dernière|annule le dernier changement|annule ce que je viens de faire|annule la dernière commande|retour en arrière|reviens en arrière|oups|ctrl z|défais|défaire|défais ça",
  };

  /* chaque intention : son nom, son icône, ses tournures. L'ordre départage deux tournures aussi précises. */
  const INTENTIONS = [
    { k: "defaire", icone: "undo", dire: ["{defaire}"] },
    { k: "chercher", icone: "search", dire: [
      "{question} [est|sont] {prevu} [pour|sur|côté|dans|avec|concernant|du côté de|niveau] [{sujet}] [{date}]",
      "{question} [est|sont] {prevu} [{date}] [pour|sur|côté|concernant] [{sujet}]",
      "{question} [pour|sur|côté|concernant] [{sujet}] {date}",
      "{question} [est|sont] {prevu}",
      "[et] [pour|côté|du côté de] {sujet} {date} [alors]",
      "{montrer} [moi] [tout|toutes|tous] [les actions|les fiches|ce qui est prévu|ce qu'on a|le programme|le planning|les lignes] [de|du|des|pour|sur|côté|concernant] {sujet} [{date}]",
      "{montrer} [moi] [tout|toutes|tous] [les actions|les fiches|ce qui est prévu|ce qu'on a|le programme|le planning|les lignes] [de|du|pour|sur] {date}",
      "{quand} {sujet}",
      "{sujet} c'est quand",
      "{sujet} (est|sont) prévu (quand|à quelle date)",
      "{ou_en} {sujet}",
      "{qui_fait} {sujet}",
      "(quelles|quels) {sujet} [{date}]",
      "{date} (on fait quoi|on a quoi|qu'est-ce qu'on a|qu'est-ce qu'on fait|il y a quoi|y a quoi|c'est quoi le programme)",
      "[et] [pour|côté] {sujet} {date} (on fait quoi|on a quoi|qu'est-ce qu'on a|il y a quoi|y a quoi)",
    ] },
    { k: "aller", icone: "arrow", dire: [
      "[{montrer}|{ouvrir}] [moi] [sur|dans|à|au] {ecran} [de|du|pour|en] [{date}]",
      "[{montrer}|{ouvrir}] [moi] [sur|dans|à|au] la période {texte}",
      "[{montrer}|{ouvrir}] [moi] [sur|dans|à|au] {ecran} (de|d'|du mois de|pour) {texte}",
    ] },
    { k: "creer", icone: "plus", dire: [
      "{ajouter} [un|une] [nouveau|nouvelle] temps fort [:] {quoi} [{date}]",
      "{ajouter} [un|une] [nouveau|nouvelle] temps fort [:] {quoi} [{date}] {service}",
      "{ajouter} [un|une] (partenariat|partenariat payant|encart payant|encart|achat média) (avec|dans|chez|sur|pour) {quoi} [{date}]",
      "{ajouter} [une|un|la|le|les|des] [nouvelle action|action] [:] {quoi} [{date}] [{service}]",
      "{ajouter} [une|un|la|le|les|des] [nouvelle action|action] [:] {quoi} [{service}] [{date}]",
      "{ajouter} [une|un|la|le|les|des] [nouvelle action|action] [:] {quoi} {date} {service} {date2}",
      "{ajouter} [pour] {date} [une|un|des] {quoi} [{service}]",
      "{service} (fait|font|prépare|préparent|sort|sortent|publie|publient|tourne|tournent) {quoi} [{date}]",
      "{date} (on fait|on a|on sort|il y a|on publie|on poste|on lance) [une|un|des] {quoi}",
    ] },
    { k: "decaler", icone: "move", dire: [
      "{decaler} {quoi} {de} {date} {a} {date2}",
      "{decaler} {quoi} {de} {date} [on passe] {a} {date2}",
      "{decaler} {quoi} {a} {date}",
      "{decaler} {quoi} {date}",
      "{decaler} {quoi} {date} {date2}",
      "{decaler} {quoi} {date} {a} {date2}",
      "{decaler} [à|a|au] {date} {quoi}",
      "{date} {decaler} {quoi}",
      "{quoi} on (le|la|les|l') (passe|décale|reporte|met|bouge|avance|repousse|recule|déplace) {a} {date}",
      "{decaler} {quoi} {decalage}",
      "{decaler} {decalage} [plus tôt|plus tard] {quoi}",
      "{decaler} {quoi} {decalage} (plus tôt|plus tard|avant|après)",
      "{decaler} {quoi} {a} [la semaine] [d'] (après|suivante|d'après)",
      "{decaler} {quoi} [s'il te plait]",
      "{quoi} (passe|est décalé|est décalée|est reporté|est reportée|glisse|bascule|est déplacé|est déplacée|est repoussé|est repoussée|est avancé|est avancée|se fera|aura lieu|sera) [{a}] {date}",
      "{quoi} (passe|est décalé|est décalée|est reporté|est reportée|glisse|bascule|est déplacé|est déplacée) {de} {date} {a} {date2}",
      "{quoi} (passe|est décalé|est décalée|est reporté|est reportée|glisse|bascule|est avancé|est avancée|est repoussé|est repoussée|est reculé|est reculée|recule|avance) {decalage} [plus tôt|plus tard]",
      "[finalement] {quoi} (c'est plutôt|ce sera plutôt|c'est|ce sera|sera|plutôt) {date}",
      "on fait {quoi} {date} (finalement|plutôt|au lieu de) [{date2}]",
    ] },
    { k: "annuler", icone: "cancel", dire: [
      "{annuler} [complètement|définitivement|finalement] {quoi} [finalement|du plan|de la liste]",
      "{annuler} [complètement|définitivement|finalement] {quoi} {de} {date} [finalement]",
      "[finalement] {quoi} {annule_fin} [finalement]",
      "(plus besoin|pas besoin) [de|du|des|d'] {quoi} [finalement]",
      "pas de {quoi} finalement",
      "finalement pas de {quoi}",
      "{quoi} on oublie",
      "{quoi} on laisse tomber",
      "(c'est mort|c'est fini|c'est annulé|c'est terminé) pour {quoi}",
      "{annuler} [complètement|définitivement|finalement] {quoi} (du|de|d'|prévu|prévue|prévu le|prévue le) {date} [finalement]",
    ] },
    { k: "supprimer", icone: "trash", dire: ["{supprimer} [définitivement|complètement] {quoi} [définitivement|du plan]"] },
    { k: "retablir", icone: "restore", dire: [
      "{retablir} {quoi} [finalement]",
      "finalement {quoi} (est maintenu|est maintenue|se fait|se fera|on le fait|on la fait|on le garde|on la garde)",
      "{quoi} (est maintenu|est maintenue|n'est plus annulé|n'est plus annulée)",
    ] },
    { k: "diffuser", icone: "check", dire: [
      "{quoi} (est|a été|vient d'être|c'est|sont|ont été|est bien) {diffuse} [depuis] [{date}]",
      "(c'est|c est) {diffuse} pour {quoi}",
      "(on a|j'ai|ils ont|elle a|il a|nous avons|vous avez) {diffuser} {quoi}",
      "(marque|passe|mets|note) {quoi} (en|comme|à|a) {diffuse}",
      "{quoi} {diffuse}",
      "{quoi} {de} {date} (est|a été|c'est|est bien) {diffuse}",
    ] },
    { k: "confirmer", icone: "check", dire: [
      "{confirmer} {quoi}",
      "{confirmer} {quoi} {de} {date}",
      "{quoi} (du|de|d') {date} {confirme_fin}",
      "{quoi} {confirme_fin}",
      "(marque|passe|mets) {quoi} (en|comme) (prévu|confirmé)",
    ] },
    { k: "aconfirmer", icone: "help", dire: [
      "(remets|repasse|mets|passe|marque) {quoi} (à|en|comme) confirmer",
      "{quoi} (est|redevient|repasse) (à confirmer|incertain|incertaine|en suspens|en attente)",
      "{quoi} (n'est plus|n'est pas) (sûr|sûre|confirmé|confirmée|calé|calée)",
      "pas sûr pour {quoi}",
      "(on n'est pas|on est pas|je ne suis pas|je suis pas) (sûr|sûrs|sûre|sûres) (pour|de) {quoi}",
    ] },
    { k: "resultats", icone: "chart", dire: [
      "{quoi} (a fait|a eu|a généré|a récolté|totalise|cumule|fait|a|c'est|ça fait|donne) {nombre}",
      "{quoi} [:] {nombre}",
      "{quoi} {de} {date} (a fait|a eu|a généré|totalise|fait|a) {nombre}",
      "{nombre} (pour|sur) {quoi}",
      "(on a eu|on a fait|on a récolté|il y a eu|on a) {nombre} (pour|sur|à|au|à la|dans|avec) {quoi}",
      "(note|mets|ajoute|indique|enregistre) {nombre} (pour|sur|à|au|dans) {quoi}",
      "(résultats|chiffres|bilan) [de|du|des|pour] {quoi} [:] {nombre}",
    ] },
    { k: "budget", icone: "euro", dire: [
      "{quoi} (coûte|a coûté|coûtera|vaut|revient à|nous coûte|nous a coûté|c'est|fait|est à) {montant}",
      "(budget|coût|prix|montant) [de|du|des|pour] {quoi} [:|à|de] {montant}",
      "{montant} (pour|sur) {quoi}",
      "(note|mets|ajoute|indique|enregistre) {montant} (pour|sur|à|au|dans) {quoi}",
    ] },
    { k: "service", icone: "users", dire: [
      "{passer} {quoi} {a} [l'équipe|l'équipe des|le service|service|équipe|l'] {service}",
      "{quoi} (c'est pour|est pour|revient à|revient aux|passe à|passe aux|sera fait par|est fait par|c'est) {service}",
      "{service} (prend|prennent|s'occupe de|s'occupe du|s'occupent de|s'occupent du|gère|gèrent|récupère|récupèrent) {quoi}",
    ] },
    { k: "lier", icone: "link", dire: [
      "{lier} {quoi} (à|au|a la|avec|sous|dans) {texte}",
      "{quoi} (est un relais de|est un relais du|relaie|accompagne|fait partie de|fait partie du|est lié à|est lié au|va avec) {texte}",
    ] },
    { k: "renommer", icone: "edit", dire: [
      "{renommer} {quoi} (en|:|par) {texte}",
      "(change|modifie|corrige) le (titre|nom) (de|du|d'|des) {quoi} (en|par|:) {texte}",
      "{quoi} s'appelle (maintenant|désormais) {texte}",
    ] },
    { k: "dupliquer", icone: "copy", dire: [
      "{dupliquer} {quoi} [{a}] [{date}]",
      "{dupliquer} {quoi} {a} {date}",
      "(refais|refait|on refait) (le même|la même|pareil|la même chose) [que] {quoi} [{a}] [{date}]",
    ] },
    { k: "demander", icone: "send", dire: [
      "{demander} [à|a|aux] {qui} [de|d'] [{envoyer}] {texte}",
      "{qui} [,] [tu peux|peux-tu|pourrais-tu|est-ce que tu peux|tu pourrais] {envoyer} {texte}",
      "(il me faut|j'ai besoin de|j'ai besoin d'|j'ai besoin des|il faudrait|il faut) {texte} (de|par|de la part de|côté) {qui} [{texte2}]",
    ] },
    { k: "rappel", icone: "clock", dire: ["{rappeler} [de|d'|que] {texte}"] },
    { k: "note", icone: "note", dire: [
      "(ajoute|mets|écris|note|laisse) {note} (à|a|sur|pour|dans|au|du|de la|de l'|des) {quoi} : {texte}",
      "note (sur|pour|à|au) {quoi} : {texte}",
      "{quoi} : note : {texte}",
    ] },
    { k: "lieu", icone: "pin", dire: [
      "{quoi} (se passe|se passera|se tiendra|se tient|aura lieu|a lieu|se fera|se fait|sera tourné|sera tournée|se tourne) (à|au|a l'|à l'|en|sur le campus de|au campus de|chez) {texte}",
      "(change|mets|modifie|note) le lieu (de|du|d'|des) {quoi} (à|en|:|au) {texte}",
    ] },
    { k: "epingler", icone: "bookmark", dire: ["{epingler} {quoi}", "(mets|garde|ajoute) {quoi} (en favori|en favoris|sous la main|dans les épinglés|aux épinglés)"] },
    { k: "desepingler", icone: "bookmark", dire: ["{desepingler} {quoi}", "(retire|enlève|sors|vire) {quoi} (des épinglés|des épingles|des favoris|de mes favoris|de mes épinglés)"] },
    { k: "ouvrir", icone: "doc", dire: [
      "{ouvrir} [moi] (la fiche|la fiche de|la fiche du|la fiche des|la fiche d') {quoi}",
      "(ouvre|ouvrir|fiche) {quoi}",
    ] },
  ];

  /* ce que le titre d'une action laisse deviner : le service et le message proposés à la création (on peut changer avant de valider) */
  const DEVINER = {
    service: [
      ["video", "tournage|tourner|film|filmer|vidéo|video|teaser|reportage|captation|motion|rushs|clip|aftermovie|interview filmée"],
      ["rs", "post|posts|carrousel|carousel|stories|story|reel|reels|linkedin|instagram|insta|tiktok|tweet|réseaux|live insta|publication"],
      ["rp", "communiqué|cp|presse|journaliste|journalistes|tribune|point presse|dossier de presse|brève|interview|encart|conférence de presse|médias"],
      ["content", "article|newsletter|page web|site|webinaire|webinar|relance|mail|mailing|emailing|e-mailing|guide|brochure|blog|faq|landing"],
    ],
    message: [
      ["recrutement", "jpo|portes ouvertes|admissibles|admis|salon|oraux|candidats|candidature|inscriptions|concours"],
      ["reputation", "classement|classements|ranking|sigem|financial times|ft|palmarès|accréditation"],
      ["alumni", "alumni|diplômé|diplômés|diplômée|ancien|anciens|réseau"],
      ["international", "international|internationale|échange|erasmus|double diplôme|étranger|shanghai|séoul|berkeley|monde"],
      ["continuum", "prépa|prépas|major prépa|major-prépa|géopolitique|continuum|cpge"],
      ["filieres", "finance|supply|sales|filière|filières|employabilité|marketing|data|entreprise|entreprises"],
    ],
  };

  /* mots qui veulent dire la même chose dans un titre */
  const SYNONYMES = { jpo: "portes ouvertes", rs: "reseaux sociaux", pge: "programme grande ecole", ft: "financial times", insta: "instagram", carousel: "carrousel", cp: "communique", interview: "itw", video: "film", major: "major-prepa" };

  KP.REGLES = { MOTS, INTENTIONS, DEVINER, SYNONYMES };
  if (typeof module !== "undefined") module.exports = KP.REGLES;
})();
