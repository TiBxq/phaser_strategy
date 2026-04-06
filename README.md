# Isometric Economic Strategy Game

A browser-based isometric economic strategy game built with Phaser 3 and Vite.

## Tech Stack

- **Phaser 3.80.1** — game framework
- **Vite 5.2.0** — dev server and bundler

## Getting Started

```bash
npm install      # install dependencies
npm run dev      # start dev server with hot reload
npm run build    # production build to dist/
npm run preview  # preview production build locally
```

## Gameplay

Manage resources (food, wood, stone, money) and grow your settlement on a 20×20 isometric tile map.

- **Left-click** a tile to inspect it
- **Right-click drag** to pan the camera
- **Escape** to cancel build mode or deselect
- Select a building from the bottom menu, then click a valid tile to place it
- Assign villagers to production buildings to generate resources

## Buildings

| Building | Produces | Notes |
|---|---|---|
| Farm | Food | Output capped by adjacent field tiles |
| Lumbermill | Wood | Output capped by adjacent forest tiles |
| Quarry | Stone | — |
| Market | Money | — |
| Warehouse | — | Increases resource storage cap by 100 |

## Architecture

```
src/
├── data/           # Static config: tile types, building definitions, resource caps
├── events/         # Singleton EventEmitter + event name constants
├── map/            # TileMap (grid), MapRenderer, BuildingRenderer
├── systems/        # ResourceSystem, BuildSystem, VillagerManager, ProductionSystem
├── ui/             # ResourceBar, BuildingMenu, TileInfoPanel, VillagerPanel
└── scenes/
    ├── Preloader.js  # Generates all textures programmatically; no external assets
    ├── Game.js       # Main scene: map, systems, input
    └── UI.js         # HUD scene (runs in parallel with Game)
```

All textures are generated programmatically via Phaser's Graphics API — no external image files required.

Cross-scene communication uses a module-level `GameEvents` singleton emitter; systems never call scene methods directly.

Production runs on a 5-second timer: each assigned villager yields resources and consumes 1 food per tick. Food reaching 0 triggers a starvation warning.
