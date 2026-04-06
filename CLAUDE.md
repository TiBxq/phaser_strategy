# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # Install dependencies
npm run dev      # Start Vite dev server (hot reload)
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

There are no tests or linting configured in this project.

## Architecture

This is a browser-based **isometric economic strategy game** built with Phaser 3.80.1 and Vite 5.2.0. Canvas: 960×640px, `pixelArt: true`, FIT scale mode. All game assets are generated programmatically in `Preloader.js` via Phaser's Graphics API — no external image files are needed.

### Scene Flow

```
Preloader  →  Game  +  UI  (parallel, launched via scene.launch)
```

- **`Preloader.js`**: Generates all textures programmatically (`generateTexture()`), then starts `Game`.
- **`scenes/Game.js`**: Instantiates all systems, generates the map, sets up MapRenderer / BuildingRenderer, wires input, and launches `UI` in parallel.
- **`scenes/UI.js`**: Reads system references from `this.scene.get('Game')` and creates all HUD components.

### Event System

All cross-system/cross-scene communication goes through a **module-level singleton emitter**:

```js
// src/events/GameEvents.js
export const GameEvents = new Phaser.Events.EventEmitter();
```

All event name strings are constants in `src/events/EventNames.js`. Systems emit events; UI subscribes to them. No direct scene-to-scene method calls.

### Data Layer (`src/data/`)

- **`TileTypes.js`** — `TILE_TYPES` (GRASS/FOREST/ROCKS) with weights and a pre-built `TILE_TYPE_POOL` for fast weighted-random picks.
- **`BuildingConfig.js`** — `BUILDING_CONFIGS` object keyed by building ID. Adding a new building is a single entry here — no new classes needed.
- **`ResourceConfig.js`** — starting amounts, default cap (200), cap per Warehouse (+100), food cost per villager per tick.

### Map (`src/map/`)

- **`TileMap.js`**: 20×20 grid of plain tile records `{ col, row, type, buildingId, isField }`. `generate()` uses weighted random + a smoothing pass. Exposes `getTile`, `getNeighbors` (4-dir), `getNeighbors8` (8-dir), `isInBounds`.
- **`MapRenderer.js`**: Creates one `Phaser.Image` per tile in depth-sorted order. Depth formula: `col + row`. Origin `(0.5, 1.0)` (bottom-center). Uses a diamond `Phaser.Geom.Polygon` hit area per tile. Exports `tileToWorld(col, row)` and `worldToTile(worldX, worldY)` coordinate utilities. `ORIGIN_X=480, ORIGIN_Y=60` define the map's top corner in world space.
- **`BuildingRenderer.js`**: Manages building sprites at `depth = col + row + 0.5`, farm field overlays at `+0.2`. Owns the ghost preview sprite for build mode (green/red tint).

### Systems (`src/systems/`)

All systems are plain classes with no Phaser scene dependencies (except `ProductionSystem` which needs `scene.time`).

- **`ResourceSystem`**: Ledger for food/wood/stone/money with a shared cap. `canAfford(costObj)`, `spend(costObj)` → bool, `add(name, amount)`, `setCap(n)`. Emits `RESOURCES_CHANGED` on every mutation.
- **`BuildSystem`**: `placedBuildings: Map<uid, BuildingInstance>`. `canPlace(configId, col, row, tileMap)` returns `{ valid, reason }`. `place()` deducts cost, mutates tiles, handles `onPlace` side-effects (spawnVillager, spawnFields, increaseStorageCap), emits `BUILDING_PLACED`.
- **`VillagerManager`**: Villager pool (`total`, `unassigned`). `assign(uid, count, buildSystem)` / `unassign()` validate against `config.maxVillagers`. Emits `VILLAGERS_CHANGED`.
- **`ProductionSystem`**: Runs every 5 seconds via Phaser timer. For each building: yield = `productionPerVillager × effectiveWorkers` (Farm capped by field count, Lumbermill capped by adjacent forest count). Deducts 1 food per villager per tick. Emits `STARVATION_WARNING` when food hits 0.

### UI (`src/ui/`)

All UI components are plain classes instantiated by `UI.js`. They use `setScrollFactor(0)` + fixed `setDepth(1000+)` to stay fixed on screen while the game camera pans.

- **`ResourceBar`**: Top strip (y: 0–40). Shows `food/wood/stone/money: amount/cap`. Flashes food label red on `STARVATION_WARNING`.
- **`BuildingMenu`**: Bottom strip (y: 600–640). 5 building buttons. Emits `BUILD_MODE_ENTER { configId }` / `BUILD_MODE_EXIT`.
- **`TileInfoPanel`**: Right panel (x: 762, y: 50). Shows tile type or building info. Updates on `TILE_SELECTED` / `BUILDING_PLACED`.
- **`VillagerPanel`**: Right panel (x: 762, y: 260). Shown only for production buildings. `[–]` / `[+]` buttons emit `VILLAGER_ASSIGN_REQUEST` / `VILLAGER_UNASSIGN_REQUEST`.

### Input Modes

`Game.js` tracks `this.inputMode = 'idle' | 'build'` and `this.pendingBuildConfigId`.

- **Idle**: Tile clicks go through `MapRenderer` sprite handlers → `TILE_SELECTED`.
- **Build**: Left-click → `BUILD_PLACEMENT_REQUEST { configId, col, row }`. Right-click → `BUILD_MODE_EXIT`. `pointermove` updates ghost position/tint via `BuildingRenderer.updateGhost()`.
- **Camera pan**: Right-drag scrolls `this.cameras.main` within map bounds.
- **Escape**: Cancels build mode or deselects tile.

### Adding a New Building

1. Add an entry to `BUILDING_CONFIGS` in `src/data/BuildingConfig.js`.
2. Add a texture key to `Preloader._generateBuildingTextures()`.
3. If the building needs a new `onPlace` behavior, add a `case` in `BuildSystem.place()`.
