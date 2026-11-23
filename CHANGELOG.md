# Nouveautés

Généré depuis `site/js/version.js` par `node scripts/version.mjs`. Ne pas modifier à la main.

## 2.9 · 2026-11-23

- Budget, réservé aux chefs de projet : on compte à l'année scolaire, devis par devis, et plus par période. En haut, le total de l'année face à son enveloppe, et une barre par état
- Un devis : son média, son programme, son numéro, ses lignes (une ligne offerte garde sa valeur, hors total) et sa remise, répartie sur les lignes
- Quatre états : Reçu, Signé, DA faite, Facturé
- Le PDF du devis se dépose dans sa fiche et reste rangé dans l'appli, visible seulement par les chefs de projet
- Chaque ligne se relie aux actions qu'elle paie : la fiche de l'action montre sa part (« 1 sur 4 de « Série vidéo » ») et ouvre le devis d'un clic
- Les montants notés avant, action par action, restent dans « Sans devis »
- Script 2.9_0038 à coller une fois dans Supabase ; sans lui, l'ancien Budget par période reste en place

## 2.8.2 · 2026-11-22

- Écrire dans une fiche pendant qu'un collègue modifie le plan : le curseur ne saute plus
- Les périodes se suivent toujours : changer la fin de l'une fait suivre le début de la suivante, aucune action ne tombe entre deux
- Les dates des périodes se choisissent avec le même calendrier que partout
- Réglages > Équipe : des droits « Service » demandent un service ; noms et lieux limités à leur longueur
- La barre propose des exemples qui marchent, prévient d'une date passée, dit quand des résultats passent l'action en Diffusé, et ne propose au visiteur que de chercher
- Le Suivi regroupe les phrases identiques avec leur nombre
- Au téléphone : le point de la cloche, le nombre à traiter sur Accueil, l'onglet des Réglages toujours visible, le toast au-dessus des onglets
- « Voir les N » se replie, une réponse vide devient « C'est ok », « C'est fait » sur un rappel s'annule
- Tes droits d'admin sont protégés (script 0037)

## 2.8.1 · 2026-11-22

- Le calendrier pour changer la date d'un rappel (et celui de « Nouveau ») s'affiche entier sur ordinateur
- Sans réseau, plus aucune modification ne se perd : elles partent toutes au retour, un refus de la base n'emporte plus la suivante, et fermer l'onglet demande confirmation
- Annuler ne défait plus ce qu'un collègue a changé entre-temps
- La barre ne supprime plus sur Entrée : il faut cliquer sur le bouton rouge
- Un « Rappel pour moi » annulé reste privé : il n'apparaît plus dans le Suivi
- « @Aurélie » tout seul n'envoie plus de message vide ; la date d'un rappel dit son mois
- Supprimer une fiche garde son « Annuler »
- Budget, Réunion et Résultats bien alignés à 1024 px et fiche ouverte, au téléphone et à l'impression
- Les tuiles du Suivi comptent juste

## 2.8 · 2026-11-22

- Une barre tout en haut de l'accueil : écris comme tu parles (« décale le carrousel JPO de vendredi à mardi prochain », « @Louise t'as des photos du gala ? », « on laisse tomber la relance PGE »). Elle surligne ce qu'elle a compris, montre l'avant et l'après, et tout se défait avec Annuler
- Elle sait créer, décaler, barrer, confirmer, noter un résultat ou un budget, confier, demander des éléments, noter un rappel, un lieu, une note, épingler, ouvrir une fiche ou chercher ; la petite icône à droite liste ce qu'elle comprend
- Une demande sans date attend une réponse la veille de l'action ; « pour info » seulement si tu l'écris
- Réglages, Suivi (l'admin seul) : santé du plan, phrases que la barre n'a pas comprises, erreurs, recherches sans résultat, écrans utilisés, et un export à donner à Claude

## 2.7 · 2026-11-21

- Ta photo dans Réglages, Mon profil : clique ou glisse une image, elle remplace tes initiales sur tous tes visages
- Les visages des services dans les lignes, le calendrier et « À traiter »
- Passer une action en Diffusé se voit : la case se remplit de vert, la coche se dessine, et une semaine entièrement diffusée reçoit sa coche
- Résultats : les chiffres montent et les barres poussent, une fois par session
- Le petit mot de l'appli arrive comme un message, dans une bulle jaune, et les écrans vides ont leur illustration
- Mouvements doux : les écrans et les périodes glissent, les menus sortent de leur bouton, la sélection glisse d'un choix à l'autre, chaque icône du menu a son geste au survol, le thème clair ou sombre s'étend en cercle
- Finitions : typographie française, icônes au même trait, police des titres préchargée, plus de zoom sur iPhone dans les champs, le nombre à traiter dans le titre de l'onglet, le badge « Aujourd'hui » n'est plus coupé

## 2.6.3 · 2026-11-20

- Relier son Asana : tous les projets sont proposés, pas seulement les 100 plus anciens, rangés par nom, avec une case pour chercher

## 2.6.2 · 2026-11-20

- Le mégaphone « Prévenir un service » quitte la fiche : pour prévenir quelqu'un, écris @ et son nom dans les messages

## 2.6.1 · 2026-11-20

- Un message à plusieurs personnes part chez tout le monde, même si l'une d'elles ne peut pas le recevoir ; sans réseau, il attend et part au retour, sans jamais disparaître
- La phrase est mieux comprise : « 2/3 visuels », « version 2.6 », un numéro de téléphone ou « le S2 » ne sont plus pris pour des dates, « reporting » ou « ça avance ? » ne proposent plus de décaler, une date déjà passée est signalée
- « 1 650,50 € » est noté 1 651 €, un chiffre impossible est refusé avec un message clair, et deux personnes qui notent les chiffres d'une même action en même temps ne s'effacent plus
- Un montant noté au budget ne part plus dans le message : seuls les chefs de projet le voient
- Un message pour info arrive dans la cloche et n'efface plus le rappel J-7
- Le rappel pour moi d'un collègue ne s'affiche plus dans « Vient du temps fort », un long lien ne déborde plus dans « À traiter »
- Résultats et Budget plus lisibles au téléphone et sur les écrans moyens

## 2.6 · 2026-11-20

- Nouvel écran Résultats : ce que les diffusions ont donné, période par période (vues, retombées presse, inscrits, clics), et message par message
- « À compléter » liste les diffusions sans chiffre : on tape le nombre, on choisit l'unité, Entrée
- Onglet Budget, réservé aux chefs de projet : le coût des partenariats payants par période, avec une enveloppe facultative qui passe au rouge une fois dépassée
- Dans la fiche, « 12 400 vues » note le résultat de l'action, et « 1 500 € » le budget du partenariat

## 2.5 · 2026-11-19

- Sur la fiche, « Demander des éléments » devient une seule ligne : « @Estelle les visuels pour vendredi dans 2 semaines ». L'appli reconnaît la personne et la date, et les surligne pendant que tu écris
- Sans date, le message part pour info : une notification, sans rappel ni réponse attendue
- La veille de l'échéance, la personne reçoit un rappel
- « Rappelle-moi lundi… » note un rappel pour toi, « on décale au 4 décembre » propose de déplacer l'action, « c'est envoyé » répond à la demande, un lien SharePoint se range dans les documents, et #action mène à sa fiche
- Une réponse donnée depuis « À traiter » s'affiche sous la demande, dans les messages de la fiche
- La section Contacts disparaît de la fiche et des Réglages

## 2.4 · 2026-11-19

- Un bouton sur la fiche envoie l'action dans ton Asana ou ton Trello : titre, date, service, messages, état, note, documents et un lien pour revenir à la fiche
- Ensuite, chaque changement de la fiche suit tout seul : diffusée, la tâche est cochée ; annulée, elle est marquée « Annulé » ; supprimée, elle part à la corbeille d'Asana ou aux archives de Trello
- Chacun relie son propre Asana ou Trello dans Réglages, Mon profil ; une même action peut vivre chez plusieurs personnes, chacune tenue à jour

## 2.3 · 2026-11-19

- À l'ouverture, le 7 de l'icône s'ouvre comme une fenêtre sur l'appli (une fois par session, jamais si l'appareil demande moins d'animations)
- Nouvel écran de connexion sur fond foncé : « Bonjour Prénom » au retour avec ton adresse déjà remplie, un œil pour voir le mot de passe
- Une petite pique sous « Bonjour », sur la connexion et sur l'accueil, différente à chaque ouverture, et quelques phrases piquantes là où on ne les attend pas

## 2.2.2 · 2026-11-19

- Les copies pour d'autres équipes gardent toujours le logo Road to 7th

## 2.2.1 · 2026-11-19

- Écran de connexion : le 7, sa route et l'étoile redessinés en courbes propres, aux bords nets et aux pointes fines

## 2.2 · 2026-11-19

- Chaque projet a son sous-titre à côté du nom (« Programme Grande École », « Executive Education ») et sa couleur, prise dans le brand book : Réglages, Projet
- Écran de connexion animé, à la couleur du projet : l'étoile monte, son contour blanc jaillit d'elle et file dans la route jusqu'en haut du 7
- Le fond de l'icône prend la couleur du projet, dans le menu et dans l'onglet du navigateur
- Réglages rangés en 5 onglets : Mon profil, Projet, Équipe, Carnets, Version
- L'appli se copie pour une autre équipe, qui la met à jour d'un clic : Réglages, Version, « Mettre à jour »
- Périodes et messages (de 1 à 9, plus une étiquette à part) se règlent dans Réglages
- Nom et logo de chaque copie, réglés sans toucher au code
- L'appli s'appelle désormais Road to 7th, cap sur la 7e place au SIGEM, avec sa nouvelle icône

## 2.1 · 2026-11-17

- Corrections impeccable : Prévu en anthracite aussi dans le calendrier et plus calme en sombre, Bilan aux couleurs des états, en-têtes de colonnes en Réunion, clavier et lecteurs d'écran (fiche, menus, recherche)
- La fiche glisse à côté du contenu sur tous les écrans ; dans le calendrier, par-dessus quand la place manque
- Accueil en pleine largeur : tes épinglés dans une colonne à droite, les compteurs par message retirés
- Nouveau design : chaque semaine est un tableau avec ses colonnes, l'état est une case de couleur qu'on clique pour le changer
- Prévu en anthracite, Diffusé en vert, À confirmer en pointillés, partout dans l'appli
- Les messages en étiquettes, les temps forts repérés en jaune

## 2.0.3 · 2026-11-17

- Sur ordinateur, la fiche s'ouvre à côté du plan au lieu de le cacher
- Un trait jaune « Aujourd'hui » dans la liste de la semaine
- Sur téléphone : titres sur deux lignes, bouton Créer toujours visible, les icônes de la fiche dans « Plus » avec leur nom
- Textes plus lisibles, contour visible au clavier, prénoms entiers dans la grille

## 2.0.2 · 2026-11-17

- Rappel pour moi : le crayon pour changer le texte ou la date, la corbeille pour l'effacer
- Notifications : un nouveau temps fort prévient tous les services ; une action seulement le sien, et le mégaphone sur sa fiche prévient un autre service
- Une action se rattache aussi à un temps fort déjà passé
- Une demande se retire, se redate et se relance pour de vrai
- Plus de modification perdue, « Annuler » ne touche que ton geste, « Dupliquer » réparé

## 2.0.1 · 2026-11-17

- Rappel pour moi : l'horloge en haut de la fiche. Une phrase et une date, toi seul le vois, tu le coches quand c'est fait. Ouvert à tous les comptes

## 2.0 · 2026-11-17

- La V2 remplace la V1 : nouvel écran d'accueil, le plan en liste ou en grille, la fiche à côté, trois états, l'étiquette Recrutement
- Elle a sa propre base, copie de celle de la V1. La V1 reste archivée avec son ancienne base
- Notifications sur téléphone : à réactiver par chacun dans Réglages, Mon profil

## 2.0 bêta 14 · 2026-11-17

- Un partenariat payant n'a pas de service : le média partenaire prend sa place, dans la fiche, la liste, la grille (sa propre colonne) et la fenêtre Nouveau

## 2.0 bêta 13 · 2026-11-16

- La V2 a sa propre base, copie de celle de la V1 : l'appli y est branchée, la V1 et sa base ne changent pas

## 2.0 bêta 12 · 2026-11-16

- Les liens des notifications ouvrent la bonne fiche
- Côté base, prêt pour la bascule : trois choix de notifications et ménage
- Notifications sur téléphone : s'activent dans Réglages, Mon profil, une fois l'appli branchée

## 2.0 bêta 11 · 2026-11-16

- L'appli sait se brancher sur la base : connexion par adresse et mot de passe, lecture et enregistrement. Le branchement reste éteint jusqu'à la bascule
- Un sujet peut couvrir plusieurs périodes

## 2.0 bêta 10 · 2026-11-16

- La V2 rejoint le dépôt d'origine, sur la branche v2 ; la V1 est archivée sur la branche v1
- L'historique des versions de la V1 est repris dans cette liste

## 2.0 bêta 9 · 2026-11-16

- Sur téléphone, les cinq périodes tiennent sur la largeur de l'écran, filtres et affichage sur la ligne du dessous

## 2.0 bêta 8 · 2026-11-16

- Étiquette « Recrutement » pour les rendez-vous avec les candidats (JPO, admissibles), à part des 5 messages
- Sur téléphone : la fenêtre Nouveau ne déborde plus, la grille est plus lisible

## 2.0 bêta 7 · 2026-11-16

- Plus de bouton « Vérifier les mises à jour » : l'appli le fait seule et prévient quand une version plus récente est en ligne

## 2.0 bêta 6 · 2026-11-16

- Numéro de version affiché dans le menu, liste des nouveautés dans Réglages, message quand une version plus récente est en ligne
- L'appli s'installe sur le téléphone et s'ouvre même sans réseau

## 2.0 bêta 5 · 2026-11-16

- Reporter ou annuler avec un motif, visible sur les relais
- Carnet de lieux et de contacts
- Notifications effaçables
- Service Content
- Réglages : mon profil, équipe, services, médias, lieux, contacts

## 2.0 bêta 4 · 2026-11-16

- À la création d'une action, les temps forts proches sont proposés en un clic
- Les infos du temps fort s'affichent sur ses actions, et les documents des relais sur le temps fort

## 2.0 bêta 3 · 2026-11-16

- Un temps fort sur plusieurs jours se règle dès la création

## 2.0 bêta 2 · 2026-11-16

- Date à préciser : « courant novembre » en attendant le jour
- Choix du média pour un partenariat payant
- Grille sans défilement latéral : semaines en lignes, services en colonnes

## 2.0 bêta 1 · 2026-11-16

- Première V2 : Accueil personnalisé, Le plan en liste ou en grille, fiche à droite, Réunion, recherche et clavier

## 1.5 · 2026-11-02

- Rechercher dans toutes les fiches pendant la frappe
- Copil PGE ouvert à tous les comptes, une fiche s'ouvre par-dessus sans le quitter

## 1.4 · 2026-10-28

- Demandes à la Direction marketing et recrutement
- Notes jusqu'à 5 000 caractères
- Ajouter une action depuis l'écran réunion

## 1.3 · 2026-10-27

- Demander des éléments à soi-même ou à un chef de projet par son nom
- Sujet à trancher en réunion, avec sa raison
- Page Notifications : relire et effacer
- Notes sur la fiche

## 1.2 · 2026-10-26

- Supprimer une fiche retirée
- Temps forts sur plusieurs jours
- Classements avec le rang de KEDGE et l'objectif
- Calendrier : grille par semaine et par service

## 1.1 · 2026-10-25

- Historique des fiches
- Écran copil PGE
- Mode visiteur
- Répondre à une demande d'éléments ou la retirer

## 1.0 · 2026-10-24

- Première mise en ligne : plan par période, temps forts, demandes d'éléments, rappels J-30, J-15, J-7, notifications sur téléphone
