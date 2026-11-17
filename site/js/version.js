/* Plan de com KEDGE · V2 — la version, à un seul endroit.
   Numéro = MAJEUR.MINEUR.CORRECTIF. MAJEUR : refonte (V1, V2). MINEUR : une nouveauté visible.
   CORRECTIF : une réparation, rien de nouveau à apprendre. Tant que la V2 est à l'essai : « bêta N ».
   Pour sortir une version : ajouter une entrée EN TÊTE de cette liste, puis `node scripts/version.mjs`
   (il met à jour version.json, sw.js et CHANGELOG.md, et vérifie que tout concorde). */
window.KP = window.KP || {};
window.KP.VERSIONS = [
  { n: "2.0.3", date: "2026-11-17", notes: ["Sur ordinateur, la fiche s'ouvre à côté du plan au lieu de le cacher", "Un trait jaune « Aujourd'hui » dans la liste de la semaine", "Sur téléphone : titres sur deux lignes, bouton Créer toujours visible, les icônes de la fiche dans « Plus » avec leur nom", "Textes plus lisibles, contour visible au clavier, prénoms entiers dans la grille"] },
  { n: "2.0.2", date: "2026-11-17", notes: ["Rappel pour moi : le crayon pour changer le texte ou la date, la corbeille pour l'effacer", "Notifications : un nouveau temps fort prévient tous les services ; une action seulement le sien, et le mégaphone sur sa fiche prévient un autre service", "Une action se rattache aussi à un temps fort déjà passé", "Une demande se retire, se redate et se relance pour de vrai", "Plus de modification perdue, « Annuler » ne touche que ton geste, « Dupliquer » réparé"] },
  { n: "2.0.1", date: "2026-11-17", notes: ["Rappel pour moi : l'horloge en haut de la fiche. Une phrase et une date, toi seul le vois, tu le coches quand c'est fait. Ouvert à tous les comptes"] },
  { n: "2.0.0", date: "2026-11-17", notes: ["La V2 remplace la V1 : nouvel écran d'accueil, le plan en liste ou en grille, la fiche à côté, trois états, l'étiquette Recrutement", "Elle a sa propre base, copie de celle de la V1. La V1 reste archivée avec son ancienne base", "Notifications sur téléphone : à réactiver par chacun dans Réglages, Mon profil"] },
  { n: "2.0.0-beta.14", date: "2026-11-17", notes: ["Un partenariat payant n'a pas de service : le média partenaire prend sa place, dans la fiche, la liste, la grille (sa propre colonne) et la fenêtre Nouveau"] },
  { n: "2.0.0-beta.13", date: "2026-11-16", notes: ["La V2 a sa propre base, copie de celle de la V1 : l'appli y est branchée, la V1 et sa base ne changent pas"] },
  { n: "2.0.0-beta.12", date: "2026-11-16", notes: ["Les liens des notifications ouvrent la bonne fiche", "Côté base, prêt pour la bascule : trois choix de notifications et ménage", "Notifications sur téléphone : s'activent dans Réglages, Mon profil, une fois l'appli branchée"] },
  { n: "2.0.0-beta.11", date: "2026-11-16", notes: ["L'appli sait se brancher sur la base : connexion par adresse et mot de passe, lecture et enregistrement. Le branchement reste éteint jusqu'à la bascule", "Un sujet peut couvrir plusieurs périodes"] },
  { n: "2.0.0-beta.10", date: "2026-11-16", notes: ["La V2 rejoint le dépôt d'origine, sur la branche v2 ; la V1 est archivée sur la branche v1", "L'historique des versions de la V1 est repris dans cette liste"] },
  { n: "2.0.0-beta.9", date: "2026-11-16", notes: ["Sur téléphone, les cinq périodes tiennent sur la largeur de l'écran, filtres et affichage sur la ligne du dessous"] },
  { n: "2.0.0-beta.8", date: "2026-11-16", notes: ["Étiquette « Recrutement » pour les rendez-vous avec les candidats (JPO, admissibles), à part des 5 messages", "Sur téléphone : la fenêtre Nouveau ne déborde plus, la grille est plus lisible"] },
  { n: "2.0.0-beta.7", date: "2026-11-16", notes: ["Plus de bouton « Vérifier les mises à jour » : l'appli le fait seule et prévient quand une version plus récente est en ligne"] },
  { n: "2.0.0-beta.6", date: "2026-11-16", notes: ["Numéro de version affiché dans le menu, liste des nouveautés dans Réglages, message quand une version plus récente est en ligne", "L'appli s'installe sur le téléphone et s'ouvre même sans réseau"] },
  { n: "2.0.0-beta.5", date: "2026-11-16", notes: ["Reporter ou annuler avec un motif, visible sur les relais", "Carnet de lieux et de contacts", "Notifications effaçables", "Service Content", "Réglages : mon profil, équipe, services, médias, lieux, contacts"] },
  { n: "2.0.0-beta.4", date: "2026-11-16", notes: ["À la création d'une action, les temps forts proches sont proposés en un clic", "Les infos du temps fort s'affichent sur ses actions, et les documents des relais sur le temps fort"] },
  { n: "2.0.0-beta.3", date: "2026-11-16", notes: ["Un temps fort sur plusieurs jours se règle dès la création"] },
  { n: "2.0.0-beta.2", date: "2026-11-16", notes: ["Date à préciser : « courant novembre » en attendant le jour", "Choix du média pour un partenariat payant", "Grille sans défilement latéral : semaines en lignes, services en colonnes"] },
  { n: "2.0.0-beta.1", date: "2026-11-16", notes: ["Première V2 : Accueil personnalisé, Le plan en liste ou en grille, fiche à droite, Réunion, recherche et clavier"] },
  /* La V1, reconstituée depuis l'historique du dépôt (archive : branche v1) */
  { n: "1.5.0", date: "2026-11-02", notes: ["Rechercher dans toutes les fiches pendant la frappe", "Copil PGE ouvert à tous les comptes, une fiche s'ouvre par-dessus sans le quitter"] },
  { n: "1.4.0", date: "2026-10-28", notes: ["Demandes à la Direction marketing et recrutement", "Notes jusqu'à 5 000 caractères", "Ajouter une action depuis l'écran réunion"] },
  { n: "1.3.0", date: "2026-10-27", notes: ["Demander des éléments à soi-même ou à un chef de projet par son nom", "Sujet à trancher en réunion, avec sa raison", "Page Notifications : relire et effacer", "Notes sur la fiche"] },
  { n: "1.2.0", date: "2026-10-26", notes: ["Supprimer une fiche retirée", "Temps forts sur plusieurs jours", "Classements avec le rang de KEDGE et l'objectif", "Calendrier : grille par semaine et par service"] },
  { n: "1.1.0", date: "2026-10-25", notes: ["Historique des fiches", "Écran copil PGE", "Mode visiteur", "Répondre à une demande d'éléments ou la retirer"] },
  { n: "1.0.0", date: "2026-10-24", notes: ["Première mise en ligne : plan par période, temps forts, demandes d'éléments, rappels J-30, J-15, J-7, notifications sur téléphone"] },
];
window.KP.VERSION = window.KP.VERSIONS[0];
/* « 2.0.0-beta.6 » se lit « 2.0 bêta 6 », « 2.1.3 » se lit « 2.1.3 » */
window.KP.versionLabel = (n) => { const [core, pre] = n.split("-"); const [a, b, c] = core.split("."); return (c === "0" ? `${a}.${b}` : core) + (pre ? " bêta " + pre.split(".")[1] : ""); };
