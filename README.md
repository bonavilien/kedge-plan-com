# Plan de com KEDGE

> **Branche `v2` : la V2 en préparation.** Elle n'est pas en ligne. Le site publié vient de `main` (la V1) tant que la bascule n'est pas faite.

## Les branches

| Branche | Contenu |
|---|---|
| `main` | Ce qui est en ligne sur GitHub Pages. La V1 jusqu'à la bascule. |
| `v1` | Archive de la V1, figée à sa dernière version (1.5, 2 novembre 2026). On n'y touche plus. |
| `v2` | La V2 : nouvelle interface, pensée pour l'ordinateur et repliée pour le téléphone. |

## État de la V2

Par défaut l'appli tourne sur des **données de démonstration**, gardées dans le navigateur (`localStorage`).
Le branchement sur la base est écrit (`site/js/remote.js`) mais **éteint** : il s'allume en passant `brancher` à `true` dans `site/config.js`, le jour de la bascule, une fois les migrations de la V2 appliquées. Branchée, l'appli demande l'adresse et le mot de passe, charge toute la base dans le magasin (`KP.store`, `site/js/data.js`), puis n'envoie à chaque geste que ce qui a changé. `?demo` dans l'adresse force la démonstration.

**Ne pas fusionner `v2` dans `main` avant que la base soit branchée et migrée** : le site en ligne perdrait ses données réelles.

| Dossier | Contenu |
|---|---|
| `site/` | La V2 : `index.html`, `css/v2.css`, `js/` (un fichier par écran), `sw.js` et `manifest.webmanifest` (installation sur téléphone). Aucun outil de construction. |
| `supabase/migrations/` | Le schéma de la base (0001 à 0018 : la V1). Les migrations de la V2 s'y ajoutent. |
| `supabase/functions/push/` | La fonction qui envoie les notifications sur les téléphones. |
| `scripts/setup.mjs` | Installe ou met à jour la base Supabase. |
| `scripts/version.mjs` | Sort une version (voir plus bas). |
| `test/db`, `test/push` | Tests de la base et de l'envoi des notifications. Les tests d'interface de la V1 sont dans la branche `v1`. |

## Base : sauvegarde et migrations de la V2

- **Sauvegarder** (lecture seule, rien n'est modifié) : `SUPABASE_ACCESS_TOKEN=… node scripts/sauvegarde.mjs <référence du projet>`. Le fichier va dans `~/kedge-plan-com-sauvegardes`, hors du dépôt (le dépôt est public). Vérifier un fichier : `node scripts/sauvegarde.mjs --verifier <fichier>`.
- **Migrations 0019 à 0024** : Content et « Recrutement », report et annulation avec motif, carnet de lieux et de contacts, profil modifiable par chacun. Elles s'appliquent **le jour de la bascule seulement**, après une sauvegarde : la V1 en ligne ne connaît pas « Recrutement ». Attention, `scripts/setup.mjs` applique toutes les migrations du dossier : ne pas le lancer depuis cette branche avant la bascule.
- **0023** : demander des éléments à n'importe quelle personne de l'équipe ; la Direction du Programme et la Dir. marketing ne sont plus des destinataires.
- **0024, le ménage** : trois statuts, plus de services prévenus ni de blocages (« à trancher en réunion » reste), plus de Direction du Programme, Dir. marketing ni Resp. offre comme destinataires, un pilote gère les partenariats, et chacun choisit ses notifications. Les colonnes devenues inutiles restent en place, vides.
- Les notifications sur téléphone passent par la même fonction `push` que la V1 ; chacun les active dans Réglages, Mon profil (les abonnements de la V1 restent valables tant que l'appli garde la même adresse).
- Vérifier la base : `sh test/v2/base.sh` répète la bascule sur un Postgres local (la V1, des données à la façon de la V1, puis les migrations de la V2 et `test/db/v2.sql`).
- Vérifier le branchement : `(cd site && python3 -m http.server 8812)` puis `node test/v2/branchement.mjs` (faux client Supabase, sans réseau : il vérifie la traduction entre l'appli et la base, pas les droits).

## Le jour de la bascule

La V2 part sur une **nouvelle base** ; l'ancienne reste telle quelle pour pouvoir revenir à la V1.

1. Créer un projet Supabase vide (même organisation, Frankfurt).
2. Prévenir l'équipe : personne ne saisit pendant la bascule.
3. `node scripts/copie.mjs <ancienne> <nouvelle>` : schéma, contenu, comptes, puis migrations de la V2. L'ancienne base n'est que lue. On peut le faire une première fois pour essayer, puis recommencer le jour J sur un projet neuf.
4. `node scripts/setup.mjs <nouvelle> <adresse du site>` : notifications, connexion, `site/config.js`.
5. Passer `brancher` à `true` dans `site/config.js`, sortir la version 2.0.0, fusionner `v2` dans `main` : GitHub Pages publie.
6. Se connecter, vérifier une fiche, une demande, une notification. Chacun réactive les notifications dans Réglages.

Revenir en arrière : remettre `main` sur la branche `v1`, qui pointe toujours vers l'ancienne base. Ce qui a été saisi dans la V2 entre-temps n'y est pas.

Répéter la copie en local : `sh test/v2/copie.sh`.

Lancer en local : `cd site && python3 -m http.server 8000`.

## Versions

Numéro `MAJEUR.MINEUR.CORRECTIF` : MAJEUR pour une refonte (V1, V2), MINEUR pour une nouveauté visible, CORRECTIF pour une réparation.
Tant que la V2 est à l'essai, les versions s'appellent `2.0.0-beta.N` (« 2.0 bêta N » à l'écran).
La liste complète, V1 comprise (1.0 à 1.5, reconstituées depuis l'historique), est dans `site/js/version.js` et `CHANGELOG.md`.

| Version de la V1 | Date | Commit |
|---|---|---|
| 1.0 | 24 octobre 2026 | `0095f9d` |
| 1.1 | 25 octobre 2026 | `93b4d7f` |
| 1.2 | 26 octobre 2026 | `c17ca59` |
| 1.3 | 27 octobre 2026 | `d79d5f3` |
| 1.4 | 28 octobre 2026 | `e2ca108` |
| 1.5 | 2 novembre 2026 | `0d35b40` |

Sortir une version :

1. ajouter une entrée en tête de `site/js/version.js` (numéro, date, nouveautés en une phrase chacune) ;
2. `node scripts/version.mjs` : met à jour `site/version.json`, le cache de `site/sw.js` et `CHANGELOG.md` ;
3. `git commit`.

Le numéro s'affiche en bas du menu et dans Réglages > Version. L'appli relit `version.json` et propose « Mettre à jour » quand une version plus récente est en ligne.

---

# Rappel : la V1 (base et règles, toujours valables pour la base actuelle)

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

La recherche (loupe en haut de l'écran sur téléphone, « Rechercher » en haut du menu ou Ctrl+K sur ordinateur) parcourt dans l'appli toutes les fiches déjà chargées : titre, note, lieu, partenaire, temps fort lié, documents, demandes, message, service, auteur ; sans accents ni majuscules.

Les données sont dans Supabase (hébergé en Europe). Le dépôt ne contient aucune donnée ni aucun secret : la clé de `config.js` est la clé publique, qui ne donne que les droits écrits dans la base.

## Qui peut faire quoi

- Tout le monde voit tout, demande des éléments, signale un blocage, ajoute des liens SharePoint.
- Une demande d'éléments se retire (par la personne qui l'a faite ou un chef) et reçoit une réponse : un message, et au besoin un lien rangé sur le temps fort de l'action (sinon sur la fiche). Une demande reçue ne se rouvre pas ; une action retirée retire ses demandes en cours (sauf un relais d'un temps fort encore actif).
- Une personne d'un service publie et modifie les actions de son service. Une fiche retirée peut ensuite être supprimée pour de bon par ceux qui la modifient (avec ses documents, demandes et historique ; les relais d'un temps fort supprimé restent, avec les documents reçus pour leurs demandes ; un relais supprimé laisse ses demandes au temps fort encore actif).
- Un **chef de projet** modifie tout, anime la réunion et règle l'équipe (Profil, puis Équipe). Il peut aussi noter une demande à la Direction du Programme (personne n'est notifié ; un chef, lui ou un autre, la marque reçue). Il peut enfin se noter à lui-même un élément à fournir (« Moi » dans « À qui ? », migration 0013) : la note n'apparaît que dans son À faire, personne n'est notifié, et il la marque faite.
- Chacun peut demander des éléments à un chef de projet en particulier, par son nom (migration 0014) : lui seul est notifié et y répond. Un chef qui est aussi Resp. offre se trouve sous « Resp. offre ».
- Tout le monde, visiteur compris, ouvre le mode réunion et l'écran copil PGE (dans le menu sur ordinateur, ou Profil) : le copil ne fait que montrer, chaque fiche ouverte depuis lui garde ses droits.
- Un compte **Resp. offre** (la responsable de l'offre, réglée dans Équipe) reçoit les demandes d'éléments qu'on lui adresse, comme un service, et y répond.
- Une demande garde son destinataire : pour demander à quelqu'un d'autre, on la retire et on en fait une nouvelle.
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
- Interface : `node test/ui/serve.mjs` puis `node test/ui/flows.mjs <dossier des captures>` (et `historique.mjs`, `copil.mjs`, `demandes.mjs`, `corrections.mjs`, `contenu.mjs`, `droits.mjs`, `sansprofil.mjs`, `besoins.mjs`, `periodes.mjs`, `notifs.mjs`, `visiteur.mjs`, `profil.mjs`, `reponses.mjs`, `services.mjs`, `suppression.mjs`, `programme.mjs`, `moi.mjs`, `chefs.mjs`, `brouillon.mjs`, `plusieurs.mjs`, `classements.mjs`, `corrections26.mjs`, `mobile.mjs`, `recherche.mjs`, `copil-tous.mjs`).
- Notifications : `node test/push/run.mjs <dossier avec deno, web-push et http_ece installés>`.
