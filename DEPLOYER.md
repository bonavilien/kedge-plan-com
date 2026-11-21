# Installer l'appli pour ton équipe

> **Le plus simple : [l'installateur en un clic](https://bonavilien.github.io/kedge-plan-com/installer.html).** Deux clés (GitHub et Supabase), ton adresse, un bouton : la page copie l'appli, crée et installe la base, crée ton compte de pilote, installe les notifications et la mise à jour automatique, puis met le site en ligne. Environ 5 minutes. Pas encore de compte GitHub ou Supabase ? La page explique comment les créer, pas à pas (voir aussi l'étape 0 ci-dessous). Les étapes 1 à 7 restent le chemin à la main.
>
> **La version illustrée, étape par étape : [le tutoriel](https://bonavilien.github.io/kedge-plan-com/tutoriel.html).** Les valeurs à copier s'y remplissent avec le nom de ta copie.

Environ 20 minutes, sans rien coder. Il te faut un compte **GitHub** et un compte **Supabase** (gratuits tous les deux).
À la fin, ton équipe a sa propre appli, avec ses propres données, et elle se met à jour toute seule, chaque nuit, quand une nouvelle version sort.

| Où vit quoi | |
|---|---|
| **Le code** | Ta copie du dépôt, sur GitHub. Publiée gratuitement par GitHub Pages. |
| **Tes données** | Ta base Supabase. Personne d'autre n'y a accès. |
| **Tes réglages** (adresse de ta base, nom) | Les « variables » de ta copie sur GitHub, jamais dans le code. Le sous-titre et la couleur se règlent dans l'appli. |

---

## 0. Tes deux comptes (gratuits)

À faire une seule fois, avant l'installateur ou le chemin à la main. Déjà faits ? Passe à la suite.

**GitHub** garde le code de ton appli et la met en ligne. Environ 3 minutes.

1. Ouvre https://github.com/signup
2. Ton **e-mail** (celui du travail convient), puis un **mot de passe** : 15 caractères, ou 8 avec au moins un chiffre et une minuscule.
3. Un **nom d'utilisateur**. Il sera dans l'adresse de ton appli : `https://ton-nom.github.io/plan-de-com/`. Simple, en minuscules, avec des tirets si besoin (exemple : `com-executive`).
4. Pays : **France**. Puis le bouton **Continue** (ou **Create account**).
5. GitHub vérifie que tu n'es pas un robot : **Verify**, puis suis le petit jeu d'images.
6. Un code à 8 chiffres arrive par e-mail (regarde dans les indésirables si rien n'arrive) : tape-le.
7. Connecte-toi. Si GitHub pose des questions (équipe, centres d'intérêt), tout en bas : **Skip personalization**.

Note ton nom d'utilisateur et ton mot de passe. Plus tard, GitHub peut te demander un code sur ton téléphone à la connexion : suis ses écrans, l'appli n'est pas concernée.

**Supabase** garde les données de ton appli (actions, comptes, réglages). Environ 2 minutes, avec ton compte GitHub.

1. Ouvre https://supabase.com/dashboard/sign-up
2. **Continue with GitHub**, puis, sur la page de GitHub, le bouton vert **Authorize supabase**. Pas de nouveau mot de passe à inventer.
3. Supabase te demande une **organisation** : **Name** = ton équipe, **Plan** = **Free** (0 $). Puis **Create organization**.
4. Supabase propose ensuite **Create a new project** : avec l'installateur, **ne le fais pas**, il s'en charge. À la main, c'est l'étape 2.

Un compte Supabase gratuit a droit à 2 bases actives. Si tu en as déjà 2, mets-en une en pause avant d'installer.

## 1. Copier l'appli

1. Ouvre https://github.com/bonavilien/kedge-plan-com et clique sur **Fork** (en haut à droite).
2. Garde le nom proposé, ou choisis-en un (exemple : `plan-de-com`). Clique sur **Create fork**.

Ta copie s'appelle maintenant `ton-compte/plan-de-com`. **Ne modifie jamais ses fichiers sur GitHub** : c'est ce qui lui permet de suivre les mises à jour sans conflit.

## 2. Créer ta base

1. Sur https://supabase.com, **New project**.
2. Nom : ce que tu veux. Région : **Europe** (Paris ou Frankfurt). Choisis un mot de passe et garde-le de côté.
3. Attends une minute que le projet soit prêt.

## 3. Installer la base, en un collage

1. Ouvre le fichier [`supabase/installation.sql`](https://github.com/bonavilien/kedge-plan-com/blob/main/supabase/installation.sql), clique sur l'icône **Copy raw file** (deux carrés, en haut à droite du fichier).
2. Dans Supabase : **SQL Editor**, **New query**, colle, puis **Run**.
3. Si Supabase prévient d'opérations « destructives », confirme : c'est normal sur une base vide.
4. Tu dois lire *Success. No rows returned*.

## 4. Brancher le site sur ta base

1. Dans Supabase : **Project Settings**, **API Keys**. Note deux choses :
   - l'adresse du projet, du genre `https://abcdefgh.supabase.co` (dans **Data API** si elle n'est pas affichée ici) ;
   - la clé **publishable** (`sb_publishable_…`), ou à défaut la clé **anon**. **Jamais la clé secrète.**
2. Sur GitHub, dans ta copie : **Settings**, **Secrets and variables**, **Actions**, onglet **Variables**, **New repository variable**. Crée :

   | Nom | Valeur | |
   |---|---|---|
   | `KPLAN_SUPABASE_URL` | l'adresse du projet | obligatoire |
   | `KPLAN_SUPABASE_KEY` | la clé publishable | obligatoire |
   | `KPLAN_APP` | le nom de l'appli (« Plan de com » si vide) | facultatif |
   | `KPLAN_NOM` | le nom de ton équipe ou de ton organisation | facultatif |
   | `KPLAN_VISITEUR` | l'adresse d'un compte partagé en lecture seule | facultatif |

3. Onglet **Actions** de ta copie : clique sur **I understand my workflows, go ahead and enable them**.
4. **Settings**, **Pages** : dans **Source**, choisis **GitHub Actions**.
5. **Actions**, **Publier le site**, **Run workflow**. Au bout d'une à deux minutes, la coche est verte.

Ton site est en ligne à l'adresse `https://ton-compte.github.io/plan-de-com/`.

> Tu changes une variable plus tard (le nom) ? Relance **Actions**, **Publier le site**, **Run workflow**.

## 5. Créer les comptes

1. Dans Supabase : **Authentication**, **Sign In / Providers** : désactive **Allow new users to sign up**. Ainsi, personne ne s'inscrit sans toi.
2. **Authentication**, **URL Configuration** : dans **Site URL**, mets l'adresse de ton site.
3. **Authentication**, **Users**, **Add user**, **Create new user** : ton adresse, un mot de passe, coche **Auto Confirm User**.
   **Le tout premier compte devient pilote** : il peut tout régler.
4. Ouvre ton site et connecte-toi. Dans **Réglages** :
   - **Projet** : le sous-titre affiché à côté du nom (exemple : « Executive Education ») et la couleur du projet, prise dans le brand book ; puis les périodes de ton année (elles se suivent sans se chevaucher) et tes messages clés (de 1 à 9), avec une étiquette à part qui ne compte pas dans le bilan (« Recrutement » chez KEDGE) ;
   - **Équipe** : le rôle et le service de chacun, et la liste des services qui diffusent ;
   - **Carnets** : médias et lieux.
5. Pour chaque collègue : **Add user** dans Supabase comme à l'étape 3, puis règle son rôle dans **Réglages**, **Équipe**.

## 6. Le bouton Mettre à jour

À faire une seule fois. Ensuite, ta copie se met à jour **toute seule, chaque nuit**, et **Réglages**, **Version** a un bouton pour ne pas attendre.

**a. Une clé GitHub, limitée à ta copie**

1. Sur GitHub : ta photo en haut à droite, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
2. Nom : `Plan de com mise à jour`. Expiration : la plus longue proposée (note la date : il faudra la refaire à ce moment-là).
3. **Repository access** : **Only select repositories**, et choisis **ta copie seulement**.
4. **Permissions**, **Repository permissions** : mets en **Read and write** :
   - **Contents**
   - **Workflows**
   - **Actions**
5. **Generate token**, puis copie la clé (elle commence par `github_pat_`). Elle ne s'affiche qu'une fois.

**b. La ranger dans Supabase**

1. Dans Supabase : **Edge Functions**, **Secrets**. Ajoute :

   | Nom | Valeur |
   |---|---|
   | `GITHUB_TOKEN` | la clé GitHub |
   | `GITHUB_REPO` | ta copie, par exemple `ton-compte/plan-de-com` |

**c. Installer le bouton**

1. Ouvre [`supabase/functions/mise-a-jour/index.ts`](https://github.com/bonavilien/kedge-plan-com/blob/main/supabase/functions/mise-a-jour/index.ts) et copie-le (**Copy raw file**).
2. Dans Supabase : **Edge Functions**, **Deploy a new function**, **Via Editor**.
3. Nom de la fonction : `mise-a-jour` (exactement). Remplace tout le contenu de l'éditeur par ce que tu as copié. **Deploy function**.
4. Dans les réglages de la fonction (**Details**), désactive **Verify JWT** (« Enforce JWT verification ») et enregistre : la fonction vérifie elle-même que c'est un pilote qui clique.
5. Dans ton appli : **Réglages**, **Version**. Tu vois une coche verte **À jour** et la mention **Chaque nuit, toute seule** : en ouvrant cette page, la fonction s'est inscrite pour la mise à jour de nuit.

## 7. Asana et Trello (facultatif)

Pour que chacun envoie une action dans son Asana ou son Trello d'un clic, et l'y garde à jour toute seule.

1. Ouvre [`supabase/functions/export/index.ts`](https://github.com/bonavilien/kedge-plan-com/blob/main/supabase/functions/export/index.ts) et copie-le (**Copy raw file**).
2. Dans Supabase : **Edge Functions**, **Deploy a new function**, **Via Editor**. Nom : `export` (exactement). Colle, **Deploy function**.
3. Dans **Details**, désactive **Verify JWT** et enregistre.
4. Ensuite, chacun dans l'appli : **Réglages**, **Mon profil**, **Mon Asana, mon Trello**, **Relier**. Colle ta clé (le lien sous le champ mène à la page où la créer), choisis le projet ou la liste où arrivent tes fiches.

Aucun secret à ranger dans Supabase : la clé se colle dans l'appli, et seule la fonction peut la relire.

## Ensuite, au quotidien

**Rien à faire.** Chaque nuit, vers 3 h ou 4 h (heure de Paris), ta base appelle sa fonction `mise-a-jour` : s'il y a une nouvelle version, la base est mise à jour d'abord, puis le code, puis GitHub publie le site. Le matin, chacun a la nouvelle version au rechargement. Une copie déjà à jour ne bouge pas.

Pour ne pas attendre la nuit, un pilote va dans **Réglages**, **Version** : l'ancienne et la nouvelle version s'affichent avec leurs nouveautés. **Mettre à jour**, puis trois pastilles s'allument :

1. **Base** : les changements de la base sont faits (ta base garde toutes ses données) ;
2. **Code** : ta copie récupère le nouveau code ;
3. **En ligne** : GitHub publie, puis l'appli se recharge toute seule (une à trois minutes).

Seuls les pilotes voient le bouton. Les autres comptes reçoivent la nouvelle version au rechargement suivant.

## L'installateur en un clic, en détail

La page [`site/installer.html`](site/installer.html) ne parle qu'à GitHub, depuis ton navigateur : elle copie l'appli (fork), active ses robots et GitHub Pages, range tes clés **chiffrées** dans le secret `KPLAN_INSTALLATION` de ta copie, puis lance le robot **Installer** (`.github/workflows/installer.yml`, `scripts/installer.mjs`). Le robot tourne chez GitHub : il crée la base Supabase à Paris, installe les tables, ferme l'inscription libre, crée ton compte (le premier compte est pilote), installe les fonctions `push`, `mise-a-jour` et `export` avec leurs secrets, inscrit la mise à jour de nuit, branche le site (variables `KPLAN_SUPABASE_URL`, `KPLAN_SUPABASE_KEY`, `KPLAN_VAPID`), le met en ligne, puis **efface le secret**. Ta clé Supabase ne reste nulle part : tu peux la supprimer ensuite. Ta clé GitHub reste dans les secrets de ta base, pour les mises à jour (celle de la nuit et le bouton) : c'est pour ça qu'elle est **sans date d'expiration**.

Si une étape coince, la page affiche le message du robot et un bouton **Réessayer** : tout se relance sans rien faire en double.

| La page dit | Quoi faire |
|---|---|
| « Il manque les cases repo et workflow » | Recrée la clé avec le bouton « Créer ma clé GitHub » : les cases sont déjà cochées. |
| « Tu as déjà un dépôt … » | Change le nom de l'appli (il donne le nom de la copie), puis Installer. |
| « Ton compte Supabase a déjà ses 2 projets gratuits » | Mets un projet en pause sur supabase.com, puis Réessayer. |
| « Supabase refuse ta clé » | Recrée une clé Supabase, recopie-la, puis Installer. |

## Si quelque chose coince

| Le message dit | Quoi faire |
|---|---|
| « Le bouton n'est pas encore installé » | Étape 6, c. Vérifie que la fonction s'appelle bien `mise-a-jour`. |
| « GitHub refuse le jeton » | La clé GitHub a expiré : refais l'étape 6, a, puis remplace `GITHUB_TOKEN` (6, b). |
| « GitHub refuse l'accès » | `GITHUB_REPO` mal écrit, ou une permission manque à la clé (Contents, Workflows, Actions). |
| La copie ne se met plus à jour la nuit | Ouvre **Réglages**, **Version** et clique **Mettre à jour** : le message affiché dit ce qui coince (souvent la clé GitHub expirée, voir plus haut). |
| « Ta copie a été modifiée à la main » | Sur GitHub, dans ta copie : **Sync fork**, puis **Discard commits**. Tes réglages (les variables) ne bougent pas. |
| « Le script 00xx n'est pas passé » | Rien n'a été changé par ce script, et le code n'a pas été mis à jour. Envoie le message à l'auteur de l'appli. |
| La publication échoue dans **Actions** | Il manque `KPLAN_SUPABASE_URL` ou `KPLAN_SUPABASE_KEY` (étape 4, 2), ou c'est la clé secrète au lieu de la publishable. |

## Bon à savoir

- **Notifications sur téléphone** (facultatif) : elles demandent une étape technique en plus (`scripts/setup.mjs`, avec une clé Supabase personnelle). Sans elles, l'appli marche entièrement ; les rappels restent visibles dans l'appli.
- **Pas de retour arrière automatique** : une mise à jour de la base ne se défait pas d'un clic. Les changements sont prévus pour garder toutes les données.
- **La mise à jour de nuit** : la migration `0033_mise_a_jour_auto.sql` programme l'appel (pg_cron, 2 h 17 en temps universel) ; l'adresse de la fonction et un secret sont rangés dans le coffre de ta base (`kplan_maj_url`, `kplan_maj_secret`), par l'installateur, ou par la fonction elle-même la première fois qu'un pilote ouvre **Réglages**, **Version**. Sur l'appli d'origine, rien ne se passe.
- **La fonction elle-même** évolue rarement, et ne se remplace pas toute seule. Quand c'est le cas, **Réglages**, **Version** le signale : recolle-la (étape 6, c). Une copie installée avant la 2.7 doit la recoller une fois pour profiter de la mise à jour de nuit.
