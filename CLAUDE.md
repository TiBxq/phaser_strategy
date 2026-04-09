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
- **`scenes/Game.js`**: Instantiates all systems, generates the map, sets up renderers, wires input, and launches `UI` in parallel.
- **`scenes/UI.js`**: Reads system references from `this.scene.get('Game')` and creates all HUD components.

### Event System

All cross-system/cross-scene communication goes through a **module-level singleton emitter**:

```js
// src/events/GameEvents.js
export const GameEvents = new Phaser.Events.EventEmitter();
```

All event name strings are constants in `src/events/EventNames.js`. Systems emit events; UI subscribes to them. No direct scene-to-scene method calls.

### Data Layer (`src/data/`)

- **`TileTypes.js`** — `TILE_TYPES` (GRASS/FOREST/ROCKS) with weights, `initialResources` (GRASS=0, FOREST=50, ROCKS=100), and a pre-built `TILE_TYPE_POOL` for fast weighted-random picks.
- **`BuildingConfig.js`** — `BUILDING_CONFIGS` object keyed by building ID. Each entry includes `footprint` (always 2), `claimsTileType` (null | 'GRASS' | 'FOREST'), `onPlace` token, and production fields. Adding a new building is a single entry here.
- **`ResourceConfig.js`** — starting amounts, default cap (200), cap per Warehouse (+100), food cost per villager per tick.

### Config (`src/config/`)

- **`DepthLayers.js`** — Named depth constants for all game-scene objects. Use these instead of raw numbers.
  - Per-tile layer offsets: `LAYER_GHOST_TILE` (0.15), `LAYER_FIELD` (0.20), `LAYER_WORKER` (0.25), `LAYER_VILLAGER` (0.30), `LAYER_TILE_SELECT` (0.60), `LAYER_BUILDING` (2.90).
  - Fixed depths (always above any tile): `DEPTH_TILE_HOVER`, `DEPTH_FLOATING_LABEL`, `DEPTH_GHOST_BUILDING`, `DEPTH_SELECTION_OVERLAY`. All based on `ABOVE_MAP = 1_000_000`, safe for very large maps.
  - `HEIGHT_DEPTH_BIAS` (0.01) — fractional depth added per height level (`col + row + tile.height * HEIGHT_DEPTH_BIAS`) so elevated tiles sort above same-col+row ground tiles at cliff edges.

### Map (`src/map/`)

- **`TileMap.js`**: 20×20 grid (current test size — real maps may be much larger). Tile records: `{ col, row, type, buildingId, isField, ownedBy, height, isRamp, resources }`. `height` is 0–3; `isRamp` is true for GRASS tiles at a height transition (adjacent to a one-level-lower GRASS neighbor). `resources` is the remaining harvestable units on the tile (set from `TILE_TYPES[type].initialResources`; updated by the smoothing pass when type changes). `generate()` runs: weighted random fill → smoothing pass → heightmap (dome hills with slope-limiting) → ramp placement. Exports `MAP_SIZE` and `MAX_TILE_HEIGHT`. Exposes `getTile`, `getNeighbors` (4-dir), `getNeighbors8` (8-dir), `isInBounds`.
- **`MapRenderer.js`**: Creates one `Phaser.Image` per tile in depth-sorted order. Depth: `col + row + tile.height * HEIGHT_DEPTH_BIAS`. Origin `(0.5, 1.0)`. Diamond polygon hit area per tile. Exports `tileToWorld(col, row, height)` (height shifts the world Y up by `height × HEIGHT_STEP`) and `worldToTile(worldX, worldY)`. Also exports `TILE_W`, `TILE_H`, `TILE_DEPTH`, `HEIGHT_STEP`. `ORIGIN_X=480, ORIGIN_Y=60`. Suppresses hover/selection highlights while in build mode. `selectArea(positions[])` highlights an arbitrary set of tiles.
- **`BuildingRenderer.js`**: Manages building sprites at depth `col + row + LAYER_BUILDING`. All buildings are **2×2** — sprites are anchored at `tileToWorld(col, row)` with origin `(0.5, 1)` (no `-TILE_DEPTH` offset). Manages farm field sprites (one per tile in each 2×2 block), worker overlay sprites, ghost preview (building + footprint tiles + claimable tiles), and the selection overlay (tinted duplicate sprite at `DEPTH_SELECTION_OVERLAY`).

### Systems (`src/systems/`)

All systems are plain classes with no Phaser scene dependencies (except `ProductionSystem` which needs `scene.time`).

- **`ResourceSystem`**: Ledger for food/wood/stone/money with a shared cap. `canAfford(costObj)`, `spend(costObj)` → bool, `add(name, amount)`, `setCap(n)`. Emits `RESOURCES_CHANGED` on every mutation.
- **`BuildSystem`**: `placedBuildings: Map<uid, BuildingInstance>`. All buildings use a **2×2 tile footprint**. `canPlace()` checks all 4 footprint tiles — rejects mixed heights and ramp tiles. `place()` marks all 4 tiles, handles `onPlace` side-effects:
  - `spawnVillager`: adds villagers (House)
  - `spawnFields`: claims up to 4 cardinal **2×2 GRASS blocks** as farm fields; each block anchor stored in `building.fieldTiles[]`
  - `claimForest`: claims **all** unclaimed FOREST tiles within Manhattan radius 2 of the footprint; stored sorted closest-first in `building.forestTiles[]`
  - `initRocksTiles`: records the 4 footprint ROCKS tile positions in `building.rocksTiles[]` (Quarry; no external claiming)
  - `increaseStorageCap`: raises resource cap (Warehouse)
  - `getBuildingAt(col, row)` checks the full 2×2 footprint range.
- **`VillagerManager`**: Villager pool (`total`, `unassigned`). Dynamic worker caps: Farm = `fieldTiles.length` (field block count), Lumbermill = `Math.floor(forestTiles.length / 4)`, others use static `config.maxVillagers`. Emits `VILLAGERS_CHANGED`. `notifyChanged()` re-emits VILLAGERS_CHANGED (called by ProductionSystem after tile depletion).
- **`ProductionSystem`**: Runs every 5 s. Farm: `productionPerVillager × min(assigned, fieldTiles.length)`. Lumbermill: `productionPerVillager × min(assigned, floor(forestTiles.length / 4))`. Quarry: skips entirely when `rocksTiles` is empty. After each extraction tick, calls `_depleteTiles()` which reduces `tile.resources`, converts exhausted non-footprint tiles to GRASS, and emits `TILE_DEPLETED { col, row, buildingUid, isBuildingFootprint }`. Deducts food per villager per tick. Emits `STARVATION_WARNING` when food hits 0. Emits `PRODUCTION_TICK { produced, consumed, yields[] }`.

### Villagers (`src/villagers/`)

- **`walkable.js`**: `isWalkable(tile)` — GRASS tile with no building. `heightMoveCost(fromTile, toTile)` — returns `FLAT_MOVE_COST` (1) for same height, `RAMP_MOVE_COST` (2) for a one-level transition via a ramp, `Infinity` for cliffs or height diff > 1. `randomWalkableTile(tileMap, exclude?)` — random walkable tile from the full grid.
- **`VillagerEntity.js`**: Single wandering villager. Uses A* with `heightMoveCost` so villagers climb ramps but cannot cross cliffs. Walks full computed path step-by-step; all world positions and depths are height-aware. Depth uses `Math.max(src, dst)` during movement to prevent occlusion.
- **`VillagerRenderer.js`**: Manages the entity pool, synced to `VillagerManager.total` via `VILLAGERS_CHANGED`.

### Pathfinding (`src/pathfinding/`)

- **`AStar.js`**: Pure A* function `aStar(tileMap, start, goal, isWalkable, getMoveCost?) → path[]`. 4-directional, Manhattan heuristic. Optional `getMoveCost(fromTile, toTile)` callback — return `Infinity` to treat an edge as impassable; defaults to uniform cost 1. No Phaser dependencies.

### UI (`src/ui/`)

All UI components are plain classes instantiated by `UI.js`. They use `setScrollFactor(0)` + fixed `setDepth(1000+)` to stay fixed on screen.

- **`ResourceBar`**: Top strip. Shows `name: amount/cap` for each resource. Flashes yellow on increase, red on starvation warning.
- **`BuildingMenu`**: Bottom strip. 5 building buttons showing cost (red if unaffordable). Emits `BUILD_MODE_ENTER { configId }` / `BUILD_MODE_EXIT`.
- **`BuildModeIndicator`**: Shows current build mode label at top-center.
- **`TileInfoPanel`**: Right panel. Shows tile type or building info on `TILE_SELECTED` / `BUILDING_PLACED`. For Lumbermill/Quarry also shows live "Wood left" / "Stone left" totals, refreshed on `PRODUCTION_TICK` and `TILE_DEPLETED`.
- **`VillagerPanel`**: Right panel (below TileInfoPanel). `[–]` / `[+]` buttons for worker assignment. Shows dynamic worker cap (tile-based for Farm/Lumbermill). Visible for any building with `maxVillagers > 0` or `claimsTileType`.
- **`FloatingLabels`** (Game scene, not UI scene): Spawns floating `+N` / `-N` labels on production ticks and building placement. World-space coordinates, scrolls with camera.
- **`NotificationManager`**: Transient message display for placement errors etc.

### Input Modes

`Game.js` tracks `this.inputMode = 'idle' | 'build'` and `this.pendingBuildConfigId`.

- **Idle**: Tile clicks → `TILE_SELECTED`. Clicking a building highlights its footprint + all claimed tiles; clicking a plain tile highlights just that tile.
- **Build**: Left-click → `BUILD_PLACEMENT_REQUEST { configId, col, row }`. Right-click → `BUILD_MODE_EXIT`. `pointermove` updates ghost (building sprite + footprint overlays + claimable tile previews). Hover and selection highlights are suppressed.
- **Camera pan**: Right-drag scrolls `cameras.main` within map bounds.
- **Escape**: Cancels build mode or deselects tile.

### Adding a New Building

1. Add an entry to `BUILDING_CONFIGS` in `src/data/BuildingConfig.js` (include `footprint: 2`, `claimsTileType`, `onPlace`).
2. Add a texture key call in `Preloader._generateBuildingTextures()`.
3. If the building needs a new `onPlace` behavior, add a `case` in `BuildSystem.place()`.
