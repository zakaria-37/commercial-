# MARIA BAG — Suivi des contacts (version en ligne)

Version en ligne de l'application de suivi des clients/fournisseurs de
Khalida. Même design, mêmes couleurs, même logo que la version locale :
seul le stockage change, les contacts sont maintenant dans une base
**Supabase** partagée (accessible depuis n'importe quel appareil),
au lieu du navigateur d'un seul ordinateur.

Fonctionnalités conservées : tableau de bord, liste/recherche/filtres,
fiche contact + journal des échanges, import Excel/CSV, export Excel/CSV.
La fonctionnalité qui liait l'app à un fichier Excel local (Chrome/Edge
uniquement) a été retirée, puisque les données vivent maintenant dans
Supabase.

---

## 1. Créer la base de données (Supabase)

1. Créez un compte sur [supabase.com](https://supabase.com) et un nouveau projet.
2. Dans le projet, ouvrez **SQL Editor** → **New query**, collez le contenu
   du fichier [`supabase/schema.sql`](supabase/schema.sql) et exécutez-le.
   Cela crée la table `contacts` avec les bonnes colonnes.
3. Allez dans **Project Settings → API** et notez :
   - **Project URL**
   - **anon public key**

## 2. Configurer l'application

Ouvrez [`js/config.js`](js/config.js) et remplissez :

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
const APP_PASSWORD = "choisissez-un-mot-de-passe";
```

`APP_PASSWORD` est le mot de passe que Khalida tapera pour entrer dans
l'application (écran de connexion simple, pas un vrai compte utilisateur).

## 3. Importer les contacts existants

Le fichier `data/MARIA-BAG_contacts.csv` (celui fourni) est déjà dans le
format reconnu par l'application. Deux façons de l'importer, au choix :

- **Le plus simple** : une fois le site en ligne (étape 5), connectez-vous
  et cliquez sur **« Importer »** en haut de l'écran, puis choisissez ce
  fichier CSV.
- **En ligne de commande**, avant même de déployer, avec le script fourni
  (ne nécessite rien d'autre que Python) :

  ```bash
  SUPABASE_URL="https://xxxxxxxx.supabase.co" \
  SUPABASE_KEY="votre-cle-anon-ou-service-role" \
  python3 scripts/import_csv.py data/MARIA-BAG_contacts.csv
  ```

## 4. Mettre le projet sur GitHub

```bash
cd maria-bag-platform
git init
git add .
git commit -m "Version en ligne (Supabase) de MARIA BAG"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git push -u origin main
```

## 5. Déployer sur Render

**Option A — avec le fichier `render.yaml` fourni (recommandé) :**
1. Sur [render.com](https://render.com), cliquez sur **New → Blueprint**.
2. Choisissez votre dépôt GitHub : Render lit `render.yaml` et crée
   automatiquement un site statique.
3. Cliquez sur **Déployer**.

**Option B — manuellement :**
1. Sur Render, cliquez sur **New → Static Site**.
2. Connectez votre dépôt GitHub.
3. Build command : laissez vide.
4. Publish directory : `.`
5. Déployez.

Une fois déployé, Render vous donne une URL du type
`https://maria-bag-platform.onrender.com`. C'est l'adresse à partager avec
Khalida.

---

## ⚠️ À savoir sur la sécurité

- L'écran de mot de passe est une protection **côté interface** seulement :
  il empêche d'entrer dans l'application sans le mot de passe, mais il
  n'empêche pas quelqu'un qui aurait l'URL Supabase et la clé publique
  (visibles dans le code source de la page) d'interroger directement la
  base de données. C'est le compromis habituel pour une petite application
  interne sans système de comptes.
- Pour une protection plus forte (comptes utilisateurs, permissions par
  personne), il faudrait ajouter l'authentification Supabase — possible à
  faire plus tard sans tout reconstruire.
- Ne publiez pas `js/config.js` avec de vraies clés dans un dépôt GitHub
  **public** si vous souhaitez limiter qui peut deviner l'URL de la base ;
  un dépôt privé est recommandé.

## Structure du projet

```
index.html              page unique (écran de connexion + application)
css/styles.css           mise en page, couleurs, logo (design original conservé)
js/config.js              à remplir : URL Supabase, clé, mot de passe
js/auth.js                 écran de connexion par mot de passe
js/app.js                   logique de l'application (contacts, dashboard, Excel/CSV)
supabase/schema.sql       script SQL à exécuter une fois dans Supabase
data/MARIA-BAG_contacts.csv  fichier de contacts fourni, prêt à importer
scripts/import_csv.py     import en ligne de commande (optionnel)
render.yaml               configuration de déploiement Render
```
