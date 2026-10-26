# Plan de com KEDGE

Appli web (installable sur téléphone) pour planifier la production et la diffusion autour des 5 messages clés et des temps forts de l'année 2026-2027 : Ma période, Temps forts, Partenariats média, Ajouter, Grille de diffusion, À faire, l'écran réunion sur ordinateur et l'écran copil PGE (une carte par période : diffusé, pas encore diffusé, à venir).

La base démarre **vierge** : seules les 5 périodes, les 5 messages et les 3 services (RP, RS, Vidéo) sont pré-remplis, et restent modifiables.

## Comment c'est fait

| Dossier | Contenu |
|---|---|
| `site/` | Le site publié sur GitHub Pages : kit KEDGE, `app.js` (l'appli), `boot.js` (accueil et connexion), `store.js` (accès à la base), `sw.js` (hors ligne et notifications), `config.js` (réglages publics). |
| `supabase/migrations/` | Le schéma de la base, les droits par rôle, les notifications et les rappels programmés. |
| `supabase/functions/push/` | La fonction qui envoie les notifications sur les téléphones. |
| `scripts/setup.mjs` | Installe ou met à jour la base Supabase en une commande. |
| `test/` | Tests de la base (Postgres local), de l'interface (faux Supabase) et de l'envoi des notifications (Deno). |

Les données sont dans Supabase (hébergé en Europe). Le dépôt ne contient aucune donnée ni aucun secret : la clé de `config.js` est la clé publique, qui ne donne que les droits écrits dans la base.

## Qui peut faire quoi

- Tout le monde voit tout, demande des éléments, signale un blocage, ajoute des liens SharePoint.
- Une demande d'éléments se retire (par la personne qui l'a faite ou un chef) et reçoit une réponse : un message, et au besoin un lien rangé sur le temps fort de l'action (sinon sur la fiche). Une demande reçue ne se rouvre pas ; une action retirée retire ses demandes en cours (sauf un relais d'un temps fort encore actif).
- Une personne d'un service publie et modifie les actions de son service. Une fiche retirée peut ensuite être supprimée pour de bon par ceux qui la modifient (avec ses documents, demandes et historique ; les relais d'un temps fort supprimé restent).
- Un **chef de projet** modifie tout, anime la réunion et règle l'équipe (Profil, puis Équipe). Il peut aussi noter pour lui-même une demande à la Direction du Programme (personne n'est notifié, il la marque reçue).
- Un compte **Partenariats média** saisit les partenariats payants.
- Un compte **Prévenu de chaque ajout** reçoit une notification à chaque nouveauté.
- Un compte sans service lit tout mais ne publie rien.
- Un **visiteur** lit tout et ne change rien (ni ajout, ni demande, ni blocage, ni document). Le compte partagé est `visiteur@kedgebs.com` (l'adresse de `site/config.js`), créé dans Supabase avec le mot de passe à donner aux visiteurs ; un chef passe un compte en visiteur dans Équipe. Sur l'écran de connexion, « Entrer en visiteur » ne demande que le mot de passe.

## Mise en route

1. Créer un projet Supabase dans une région européenne, puis un jeton personnel (Account, Access Tokens).
2. Lancer, avec le jeton dans l'environnement (jamais dans le dépôt) :
   `SUPABASE_ACCESS_TOKEN=… node scripts/setup.mjs <référence du projet> https://<compte>.github.io/kedge-plan-com/`
   Le script applique les migrations, crée les clés des notifications, ferme l'inscription libre, déploie la fonction push et remplit `site/config.js`.
3. Activer GitHub Pages (Settings, Pages, Source : GitHub Actions). Chaque modification de `site/` sur `main` republie le site.
4. Créer les comptes : Supabase, Authentication, Add user, avec un mot de passe provisoire et « Auto Confirm User » coché. Puis, dans l'appli, Profil, Équipe : régler le service et les droits de chacun. Chacun peut ensuite changer son mot de passe dans son profil.

## Modifier les référentiels

Dans Supabase, Table editor :
- `periods` : nom, dates de début et de fin, libellé de chaque période ;
- `messages` : nom et sous-thèmes des 5 messages ;
- `services` : services de diffusion (le code `k` ne doit pas changer une fois des actions saisies) ;
- `partners` : les partenaires média (aussi créés depuis le formulaire « Partenariat »).

Le classement SIGEM de l'écran d'accueil se règle dans `site/config.js`.

## Notifications

Rappels J-30, J-15 et J-7 avant chaque action datée au jour près (chaque matin vers 8 h), demandes d'éléments, éléments reçus, blocages, nouveaux documents, et nouveautés pour les services cités. Chacun les active dans son profil. Sur iPhone (iOS 16.4 ou plus), il faut d'abord ajouter l'appli à l'écran d'accueil.

## Tests

- Base : `PSQL="psql -h localhost -U postgres" sh test/db/run.sh` (une base Postgres locale suffit). Puis, sur la base `kplan_test` qu'il laisse : `droits.sql` et `contenu.sql` (`$PSQL -d kplan_test -f test/db/droits.sql`) ; `sh test/db/besoins.sh` crée sa propre base (rappels, demandes, deadlines).
- Interface : `node test/ui/serve.mjs` puis `node test/ui/flows.mjs <dossier des captures>` (et `historique.mjs`, `copil.mjs`, `demandes.mjs`, `corrections.mjs`, `contenu.mjs`, `droits.mjs`, `sansprofil.mjs`, `besoins.mjs`, `periodes.mjs`, `notifs.mjs`, `visiteur.mjs`, `profil.mjs`, `reponses.mjs`, `services.mjs`, `suppression.mjs`, `programme.mjs`).
- Notifications : `node test/push/run.mjs <dossier avec deno, web-push et http_ece installés>`.
