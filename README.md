# VHB — Pilotage du CA

Outil interne de pilotage du conseil d'administration du Vitrolles Handball Jeunes.
Appli web (React + Vite), pensée pour fonctionner sur ordinateur et s'installer sur téléphone.

## Lancer l'appli sur son ordinateur (test local)

Pré-requis : avoir installé **Node.js** (https://nodejs.org, version LTS).

Dans un terminal, depuis ce dossier `app` :

```bash
npm install      # à faire une seule fois (installe les briques nécessaires)
npm run dev      # démarre l'appli ; ouvre l'adresse affichée (ex. http://localhost:5173)
```

Pour fabriquer la version « en ligne » (utile pour Vercel à l'étape 4) :

```bash
npm run build    # génère le dossier dist/
```

## Structure

- `index.html` — page d'accueil
- `src/main.jsx` — point de démarrage
- `src/App.jsx` — l'appli (les 4 onglets : Accueil, Tâches, Préparation des CA, Vue réunion)

> Le socle de tâches officiel est géré dans `src/App.jsx` et reste protégé (non supprimable).
