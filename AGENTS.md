# AGENTS.md — PlayDragon

Consignes pour tout agent (Codex, Claude Code…) qui travaille sur ce dépôt.

## Projet

Jeu 3D en 3 niveaux : un dragon survole une vallée, affronte gargouilles, chauves-souris, wyvernes et le
Gardien de pierre, puis détruit le château au bout du chemin. Le jeu est livré en installeur Windows et en
`.exe` portable.

## Stack technique

- **Langage :** TypeScript partout
- **Rendu :** Three.js (WebGL), post-traitement avec bloom, étalonnage chaud et vignettage
- **Build :** Vite. **Tests :** Vitest. **Bureau / exe :** Electron + electron-builder (cible `portable`)
- Pas de serveur ni de base de données : rien n'est persisté. Voir `ANALYSE_PROMPT.md` pour la raison.

## Commandes

| Commande | Effet |
|---|---|
| `npm install` | Installe les dépendances |
| `npm run dev` | Lance le jeu sur **http://localhost:5173** |
| `npm test` | Lance les tests unitaires (Vitest) |
| `npm run build` | Vérifie les types et construit `dist/` |
| `npm run start:desktop` | Build, puis ouvre le jeu dans une fenêtre Electron |
| `npm run dist` | Build, puis produit **`release/PlayDragon-Setup.exe`** (installeur) et **`release/PlayDragon.exe`** (portable), non signés |

### Pièges connus de l'environnement

- npm 11 bloque les scripts d'installation. Les autorisations d'`electron` et d'`esbuild` sont déjà dans
  `package.json` (`allowScripts`).
- Avec Node 26, le script d'installation d'Electron peut s'arrêter sans erreur et laisser
  `node_modules/electron/dist` presque vide. Solution : télécharger
  `electron-v33.3.1-win32-x64.zip` depuis les releases GitHub d'Electron, vérifier son SHA-256 dans
  `node_modules/electron/checksums.json`, l'extraire dans `node_modules/electron/dist`, puis écrire
  `electron.exe` dans `node_modules/electron/path.txt`.
- **Smart App Control** (Windows 11), une fois activé, bloque tout exe non signé. electron-builder échoue
  alors avec `spawn UNKNOWN` en lançant l'installeur qu'il vient de créer, et les joueurs ne peuvent pas
  lancer l'installeur. Il n'y a pas de contournement : la seule vraie solution est de signer le code
  (certificat payant). Vérifier l'état dans `HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy`, valeur
  `VerifiedAndReputablePolicyState` (1 = activé).
- Un terminal VS Code peut définir `ELECTRON_RUN_AS_NODE=1`. Retire cette variable avant de lancer
  `electron`.

## Règles de développement

À appliquer systématiquement :

- **Méthode KISS :** la solution la plus simple qui répond au besoin, sans sur-ingénierie.
- **Séparation des responsabilités :** un module, une classe ou une fonction n'a qu'un seul rôle.
- **Clean code :** noms explicites, fonctions courtes, pas de duplication, pas de code mort, commentaires
  uniquement quand ils apportent du sens.
- **Architecture MVC,** adaptée à un jeu :
  - **Model :** règles et données pures, sans rendu.
    - `src/logic/gameState.ts` : phases, vie, score, dégâts du château, dôme du mage.
    - `src/logic/abilities.ts` : pouvoirs.
    - `src/logic/difficulty.ts` : multiplicateurs Facile / Normal / Difficile.
    - `src/logic/records.ts` : meilleurs scores et niveaux débloqués, dans `localStorage`.
    - `src/world/landscape.ts` : rivière, relief, trajectoire de chaque niveau.
    - `src/world/levels.ts` : les 3 niveaux en données (palette, relief, château, script d'ennemis).
  - **View :** tout ce qui s'affiche.
    - `src/world/` : ciel, terrain, nuages, château. `world.ts` assemble un niveau.
    - `src/entities/` : dragon, ailes, projectiles, et ennemis dans `foes/`.
    - `src/fx/` : textures procédurales, particules, contre-jour.
    - `src/render/` : renderer, post-traitement, libération mémoire.
    - `src/ui/` : `hud.ts` en jeu, `menu.ts` pour le titre et la fin de partie.
    - `src/audio/` : sons et musique synthétisés.
  - **Ennemis :** chaque ennemi hérite de `Foe` (`foes/foe.ts`) et ne connaît le monde que par
    `FoeContext`. Ses tirs passent par `game/hostileFire.ts`. `game/director.ts` déclenche les événements
    du niveau, place arbalétriers et mage, et fait tirer les tours.
  - **Modélisation du dragon :** entièrement procédurale. `loft.ts` balaie des sections ovales le long
    d'une courbe (corps, tête, cornes, pattes). `spike.ts` génère les lames courbes (épines, griffes,
    collerette). `dragonHead.ts` et `dragonLimbs.ts` assemblent la tête et les pattes. `wing.ts` gère
    les os articulés et la membrane, dont la texture est peinte d'après ses os.
  - **Controller :** `src/game/` et `src/core/input.ts` + `gamepad.ts` (clavier, souris, manette Xbox).
    - `game.ts` orchestre.
    - `session.ts` regroupe tout ce qui appartient au niveau en cours.
    - `flight.ts` pilote le vol et la caméra.
    - `combat.ts` gère le feu du dragon et ses impacts.
  - La logique métier reste dans le Model, testée sans WebGL. Les controllers ne font que relier les
    morceaux.
- **Tests :** toute règle de jeu ajoutée dans `GameState` ou dans le parcours doit avoir un test Vitest.
- **Constantes de gameplay :** dans `src/config.ts`, pas en dur dans le code.

## Direction artistique (à respecter)

Le jeu suit un dessin de référence : un dragon sombre au-dessus d'une mer de nuages, au coucher du soleil.

- Palette : orange brûlé, or, brun profond. Ombres légèrement pourpres. Aucun bleu, sauf les projectiles
  ennemis, pour qu'ils restent lisibles. La nuit du niveau 3 reste chaude : ciel pourpre, lune rouge.
- Grand soleil bas sur l'horizon, devant le dragon. Le dragon est vu de trois quarts arrière, en
  contre-jour.
- Nuages volumineux, sombres au cœur et bordés d'or. Brume atmosphérique sur les montagnes.
- Toute modification visuelle doit être vérifiée par une capture d'écran du jeu, pas seulement par le code.

## Contrôles

Ils sont lus par caractère (`event.key`), donc l'**AZERTY** fonctionne directement :

- **Z Q S D** ou les **flèches** : diriger. Pendant le siège, Q/D font tourner le dragon autour du château
  (face à lui) et Z/S changent son altitude.
- **E** (ou Maj) : accélérer. **A** : freiner. `a` n'est donc pas un repli QWERTY pour aller à gauche.
- **1 à 4** ou les boutons en bas à gauche : pouvoirs spéciaux, payés avec les points
  (`src/logic/abilities.ts`). Ces chiffres sont lus par `event.code`, car en AZERTY la rangée du haut
  donne `& é " '` sans Maj.
- **Clic** ou **Espace** : cracher le feu
- **Échap** : pause. **M** : couper le son. **Entrée** : valider dans les menus.
- **Manette Xbox** (`core/gamepad.ts`) : stick gauche = diriger, stick droit = viser, RT = feu, RB / LT =
  accélérer / freiner, X Y B LB = pouvoirs 1 à 4, A = valider, Start = pause.
- **F11** : plein écran (dans l'exe)

## Git

- Ne jamais versionner `node_modules/`, `dist/` ni `release/` (l'exe fait environ 75 Mo).
- Avant chaque push : `npm test` et `npm run build` doivent passer, et aucun secret ne doit être présent.

## Skills installés

Aucun. Les 7 skills Codex demandés par le prompt d'origine (UI UX Pro Max, Design Taste Frontend, GPT
Taste, Humanizer, Impeccable, Stop Design Slop, Graphify) n'ont pas été installés. Ce projet a été développé
avec Claude Code, et leurs sources officielles n'ont pas été vérifiées. Voir `ANALYSE_PROMPT.md`.

## Publier une version

Le bouton de téléchargement du README pointe vers
`releases/latest/download/PlayDragon-Setup.exe`. Il sert donc toujours la dernière Release GitHub. Pour
publier une nouvelle version :

1. Augmenter `version` dans `package.json`.
2. `npm test`, puis `npm run dist`.
3. Créer une Release GitHub `vX.Y.Z` et y joindre `release/PlayDragon-Setup.exe` et
   `release/PlayDragon.exe`, sans changer ces noms de fichiers.
