# Contexte projet (panel_Sparcky_god)

## Routine Copilot
- A chaque nouvelle action: lire report.md en premier pour le contexte.
- A chaque changement ou info externe: mettre a jour report.md avant de continuer.
- Ne jamais versionner report.md (deja dans .gitignore).

## Resume
Monorepo npm workspaces avec deux apps:
- api/ : serveur Express (port 3001 par defaut)
- panel/ : Vite + React (port 5173 en dev)

Le panel consomme l'API via /api (proxy Vite en dev).

## Structure
- /api
  - index.js (serveur)
  - routes/, middlewares/, lib/
- /panel
  - src/ (React)
  - vite.config.js
  - postcss.config.cjs
  - tailwind.config.cjs

## Scripts racine (npm workspaces)
- dev:all : lance API + Panel en parallele
- dev:api : lance l'API
- dev:panel : lance le panel
- build : build du panel
- lint : lint du panel

## Scripts panel
- dev, build, lint, preview
- tailwind:init (genere configs puis renomme en .cjs)

## Ports/URLs
- API: http://localhost:3001
- Panel: http://localhost:5173

## Dernieres modifs
- Monorepo configure via npm workspaces (root package.json).
- Ajout du script dev:all (concurrently).
- Proxy Vite /api -> http://localhost:3001.
- Configs PostCSS/Tailwind renommees en .cjs (compatibles avec type: module).
- Lint/build OK apres corrections diverses.

## Notes
- Si dev:all casse avec rxjs, faire un reinstall propre: rm -rf node_modules && npm ci.
- Les configs ignorees par eslint: eslint.config.js, vite.config.js, tailwind.config.cjs, postcss.config.cjs.
