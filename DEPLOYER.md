# Installer l'appli pour ton équipe

> **La version illustrée, étape par étape : [le tutoriel](https://bonavilien.github.io/kedge-plan-com/tutoriel.html).** Les valeurs à copier s'y remplissent avec le nom de ta copie.

Environ 20 minutes, sans rien coder. Il te faut un compte **GitHub** et un compte **Supabase** (gratuits tous les deux).
À la fin, ton équipe a sa propre appli, avec ses propres données, et tu la mets à jour d'un clic quand une nouvelle version sort.

| Où vit quoi | |
|---|---|
| **Le code** | Ta copie du dépôt, sur GitHub. Publiée gratuitement par GitHub Pages. |
| **Tes données** | Ta base Supabase. Personne d'autre n'y a accès. |
| **Tes réglages** (adresse de ta base, nom) | Les « variables » de ta copie sur GitHub, jamais dans le code. Le sous-titre et la couleur se règlent dans l'appli. |

---

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
   - **Carnets** : médias, lieux et contacts.
5. Pour chaque collègue : **Add user** dans Supabase comme à l'étape 3, puis règle son rôle dans **Réglages**, **Équipe**.

## 6. Le bouton Mettre à jour

À faire une seule fois. Ensuite, **Réglages**, **Version** affiche la nouvelle version dès qu'elle sort, et un seul bouton la récupère.

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
5. Dans ton appli : **Réglages**, **Version**. Tu vois une coche verte **À jour**.

## Ensuite, au quotidien

Quand une nouvelle version sort, un pilote va dans **Réglages**, **Version** : l'ancienne et la nouvelle version s'affichent avec leurs nouveautés. **Mettre à jour**, puis trois pastilles s'allument :

1. **Base** : les changements de la base sont faits (ta base garde toutes ses données) ;
2. **Code** : ta copie récupère le nouveau code ;
3. **En ligne** : GitHub publie, puis l'appli se recharge toute seule (une à trois minutes).

Seuls les pilotes voient le bouton. Les autres comptes reçoivent la nouvelle version au rechargement suivant.

## Si quelque chose coince

| Le message dit | Quoi faire |
|---|---|
| « Le bouton n'est pas encore installé » | Étape 6, c. Vérifie que la fonction s'appelle bien `mise-a-jour`. |
| « GitHub refuse le jeton » | La clé GitHub a expiré : refais l'étape 6, a, puis remplace `GITHUB_TOKEN` (6, b). |
| « GitHub refuse l'accès » | `GITHUB_REPO` mal écrit, ou une permission manque à la clé (Contents, Workflows, Actions). |
| « Ta copie a été modifiée à la main » | Sur GitHub, dans ta copie : **Sync fork**, puis **Discard commits**. Tes réglages (les variables) ne bougent pas. |
| « Le script 00xx n'est pas passé » | Rien n'a été changé par ce script, et le code n'a pas été mis à jour. Envoie le message à l'auteur de l'appli. |
| La publication échoue dans **Actions** | Il manque `KPLAN_SUPABASE_URL` ou `KPLAN_SUPABASE_KEY` (étape 4, 2), ou c'est la clé secrète au lieu de la publishable. |

## Bon à savoir

- **Notifications sur téléphone** (facultatif) : elles demandent une étape technique en plus (`scripts/setup.mjs`, avec une clé Supabase personnelle). Sans elles, l'appli marche entièrement ; les rappels restent visibles dans l'appli.
- **Pas de retour arrière automatique** : une mise à jour de la base ne se défait pas d'un clic. Les changements sont prévus pour garder toutes les données.
- **Le bouton lui-même** évolue rarement. Quand c'est le cas, **Réglages**, **Version** le signale : recolle la fonction (étape 6, c).
