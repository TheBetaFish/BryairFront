# BryairFront Grand Strategy — Layer 1

A standalone, single-player grand-strategy prototype built with TypeScript, Vite, HTML, CSS, and an HTML5 Canvas pixel map. It lives in `grand-strategy/` so it does not replace or alter the original WarFront.io client build.

## Requirements

- Node.js 20.19 or newer (or 22.12 or newer), as required by the current Vite release
- npm

## Run locally

From the repository root:

```bash
cd grand-strategy
npm install
npm run dev
```

Vite prints the local development URL. To make a production build:

```bash
npm run build
npm run preview
```

The production output is written to `grand-strategy/dist/`. The Vite base path is configured for the GitHub Pages project URL, `/BryairFront/`.

## Current gameplay

- **World:** deterministic 280 × 180 raster map, 56 provinces, and 9 preset countries.
- **Country selection:** choose the country to control from the campaign panel. Changing the selected country pauses the simulation.
- **Economy:** money, manpower, industry, steel, and oil stockpiles with daily production, building output, and garrison upkeep. Shortages reduce industrial output.
- **Construction:** factories, farms, mines, barracks, and forts. Queue construction in owned provinces; each order consumes resources immediately and advances each day.
- **Military:** recruit infantry, armor, and artillery in owned provinces. Attack adjacent enemy provinces with stationed units. Terrain, forts, garrisons, and unit strengths affect combat.
- **Basic AI:** non-player countries periodically attempt attacks based on their personality.
- **Time:** pause/resume, advance a day manually, or run at 1×, 2×, or 4×.
- **Save/load:** store and restore a versioned campaign in the current browser's local storage.
- **Event log:** recent economy, construction, recruitment, and combat events.

The simulation is intentionally lightweight. Combat resolves when an adjacent attack is issued; there is not yet a full movement/pathfinding layer, production queues for units, diplomacy, multiplayer, research, naval or air forces, or supply simulation.

## Project structure

```text
grand-strategy/
  index.html
  vite.config.ts
  src/
    main.ts                 # Canvas rendering and UI wiring
    types.ts                # World map and province types
    data/world.ts           # Seeded pixel map and province adjacency
    sim/state.ts            # Serializable campaign state and save validation
    sim/economy.ts          # Resource production and building rules
    sim/construction.ts     # Construction queue and completion
    sim/military.ts         # Recruitment, combat, and basic AI
    sim/tick.ts             # Daily simulation step
    style.css
```

## Map and simulation notes

- The map is raster-based; it does not use polygon rendering.
- The seeded world generator makes the same initial map for the same seed.
- Province adjacency is derived from shared horizontal/vertical pixel boundaries and is validated for symmetry at startup.
- The campaign state is plain serializable data. Canvas pixel buffers are derived display data and are not stored in save files.
- Local saves are browser-specific. Clearing site data or changing browsers removes access to that local save.
- The initial player country defaults to Northreach; use the country selector to choose another country before advancing time.

## Deployment

The workflow `.github/workflows/grand-strategy-pages.yml` builds the Vite project and deploys `grand-strategy/dist/` to GitHub Pages when the configured deployment branch is updated or the workflow is manually dispatched. The first-party build validation workflow is `.github/workflows/grand-strategy-ci.yml`.

To publish this prototype from the existing draft pull request, merge the PR into `master` and ensure GitHub Pages is configured to use GitHub Actions as its deployment source. The prototype is separate from the original client and does not change its build commands.

## Validation

Run `npm run build` from `grand-strategy/`. This runs TypeScript's strict no-emit type check followed by the Vite production build. The GitHub Actions CI workflow runs the same command for pull requests and updates to the feature branch.

## Layer 2 candidates

1. Real unit movement with travel time and pathfinding.
2. Unit production queues and per-unit upkeep.
3. AI construction priorities and defensive posture.
4. More readable terrain, province labels, zoom, and pan.
5. Better combat reports, retreat behavior, and capture consequences.
6. Automated simulation tests for economy, construction, combat, and save compatibility.
7. Additional balancing and clearer tooltips for production and resource shortages.
