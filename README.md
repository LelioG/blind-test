# Blind Test Musical

Application web de blind test musical jouable entre amis, avec gestion de plusieurs joueurs, playlists Spotify ou Deezer, extraits audio, score et playlists pré-enregistrées.

Application en ligne :
https://blind-test-n2cc.onrender.com/

## Fonctionnalités

* Création d’une partie de blind test
* Choix du nombre de joueurs
* Attribution d’un nom à chaque joueur
* Choix du nombre de titres : 10, 20 ou 30
* Import d’une playlist Spotify
* Import d’une playlist Deezer
* Playlists Deezer pré-enregistrées
* Sélection aléatoire des titres
* Récupération des extraits audio via Deezer
* Lecture d’un extrait de 10 secondes
* Possibilité de passer l’extrait
* Attribution manuelle des points :

  * 2 points pour le titre trouvé
  * 1 point pour l’artiste trouvé
* Bouton “personne n’a trouvé”
* Classement final des joueurs
* Comparaison textuelle préparée avec distance de Levenshtein

## Technologies utilisées

* React
* Vite
* Node.js
* Express
* API Spotify
* API Deezer
* Render pour le déploiement

## Principe de fonctionnement

L’application permet de lancer un blind test à partir d’une playlist Spotify ou Deezer.

Pour Spotify :

1. L’utilisateur se connecte avec Spotify.
2. L’application récupère la liste des titres de la playlist.
3. Les titres sont sélectionnés aléatoirement.
4. L’application cherche les extraits audio correspondants via Deezer.

Pour Deezer :

1. L’utilisateur colle un lien de playlist Deezer ou choisit une playlist pré-enregistrée.
2. L’application récupère directement les titres et les extraits audio disponibles.
3. Les titres sont sélectionnés aléatoirement.
4. Le blind test est lancé.

## Installation locale

Cloner le projet :

```bash
git clone https://github.com/TON-PSEUDO/NOM-DU-REPO.git
cd NOM-DU-REPO
```

Installer les dépendances :

```bash
npm install
```

Créer un fichier `.env` à la racine du projet :

```env
SPOTIFY_CLIENT_ID=ton_client_id
SPOTIFY_CLIENT_SECRET=ton_client_secret
REDIRECT_URI=http://127.0.0.1:8080/callback
```

Lancer le projet en mode production local :

```bash
npm run build
npm start
```

Puis ouvrir :

```txt
http://127.0.0.1:8080
```

## Scripts disponibles

```bash
npm run dev
```

Lance le frontend React avec Vite en développement.

```bash
npm run build
```

Compile l’application React dans `client/dist`.

```bash
npm start
```

Lance le serveur Express avec `node index.js`.

```bash
npm run check
```

Vérifie le build et la syntaxe des fichiers principaux.

## Variables d’environnement

Le projet utilise les variables suivantes :

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
REDIRECT_URI=
```

En local, elles doivent être placées dans un fichier `.env`.

En production sur Render, elles doivent être ajoutées dans l’onglet **Environment** du service Render.

Exemple en production :

```env
SPOTIFY_CLIENT_ID=ton_client_id
SPOTIFY_CLIENT_SECRET=ton_client_secret
REDIRECT_URI=https://blind-test-n2cc.onrender.com/callback
```

## Configuration Spotify

Pour utiliser les playlists Spotify, il faut créer une application dans le Spotify Developer Dashboard.

Dans les Redirect URIs, ajouter :

```txt
http://127.0.0.1:8080/callback
```

Pour la version en ligne, ajouter aussi :

```txt
https://blind-test-n2cc.onrender.com/callback
```

Les playlists Spotify accessibles sont principalement :

* les playlists créées par l’utilisateur connecté
* les playlists collaboratives auxquelles l’utilisateur a accès

## Déploiement sur Render

Le projet est prévu pour être déployé comme un **Web Service** Render.

Configuration Render :

```txt
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
```

Variables d’environnement à ajouter sur Render :

```env
SPOTIFY_CLIENT_ID=ton_client_id
SPOTIFY_CLIENT_SECRET=ton_client_secret
REDIRECT_URI=https://blind-test-n2cc.onrender.com/callback
```

Render génère ensuite une URL publique du type :

```txt
https://blind-test-n2cc.onrender.com/
```

## Structure du projet

```txt
.
├── client/
│   ├── src/
│   └── dist/
├── src/
│   ├── config.js
│   ├── deezer.js
│   ├── http.js
│   ├── routes.js
│   ├── spotify.js
│   ├── state.js
│   └── utils.js
├── index.js
├── package.json
├── .env
└── README.md
```

## Notes importantes

Le fichier `.env` ne doit jamais être envoyé sur GitHub.

Ajouter dans `.gitignore` :

```txt
.env
node_modules
client/dist
dist
```

Les extraits audio ne sont pas téléchargés ni stockés. L’application utilise uniquement les URLs de preview fournies par Deezer.

## Statut du projet

Projet personnel / prototype de blind test musical.

Fonctionnalités déjà présentes :

* import Spotify
* import Deezer
* playlists pré-enregistrées
* moteur de partie
* gestion des scores
* déploiement en ligne

Améliorations possibles :

* meilleure interface mobile
* mode multijoueur en temps réel
* sauvegarde des scores
* historique des parties
* saisie textuelle des réponses
* authentification utilisateur

