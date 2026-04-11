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
- **`BuildingConfig.js`** — `BUILDING_CONFIGS` object keyed by building ID. Each entry includes `footprint` (always 2), `claimsTileType` (null | 'GRASS' | 'FOREST'), `onPlace` token, and production fields. Adding a new building is a single entry here. Upgradeable buildings also carry `upgradesTo` (target config ID) and `upgradeCost` (resource object). Upgrade-only configs set `isUpgrade: true` to hide them from the build menu. Also exports `ROAD_CONFIG` — a pseudo-config (not in `BUILDING_CONFIGS`) used only by `BuildingMenu` for the Road button display.
- **`ResourceConfig.js`** — starting amounts, default cap (200), cap per Warehouse (+100), food cost per villager per tick.

### Config (`src/config/`)

- **`DepthLayers.js`** — Named depth constants for all game-scene objects. Use these instead of raw numbers.
  - Per-tile layer offsets: `LAYER_GHOST_TILE` (0.15), `LAYER_FIELD` (0.20), `LAYER_WORKER` (0.25), `LAYER_VILLAGER` (0.30), `LAYER_TILE_SELECT` (0.60), `LAYER_BUILDING` (2.90).
  - Fixed depths (always above any tile): `DEPTH_TILE_HOVER`, `DEPTH_FLOATING_LABEL`, `DEPTH_GHOST_BUILDING`, `DEPTH_SELECTION_OVERLAY`. All based on `ABOVE_MAP = 1_000_000`, safe for very large maps.
  - `HEIGHT_DEPTH_BIAS` (0.01) — fractional depth added per height level (`col + row + tile.height * HEIGHT_DEPTH_BIAS`) so elevated tiles sort above same-col+row ground tiles at cliff edges.

### Map (`src/map/`)

- **`TileMap.js`**: 20×20 grid (current test size — real maps may be much larger). Tile records: `{ col, row, type, buildingId, isField, ownedBy, height, isRamp, isRoad, resources }`. `height` is 0–3; `isRamp` is true for GRASS tiles at a height transition; `isRoad` is true when a road tile has been placed (tile type stays GRASS so villagers remain walkable). `generate()` runs: weighted random fill → smoothing pass → heightmap (dome hills with slope-limiting) → ramp placement. Exports `MAP_SIZE` and `MAX_TILE_HEIGHT`. Exposes `getTile`, `getNeighbors` (4-dir), `getNeighbors8` (8-dir), `isInBounds`.
- **`MapRenderer.js`**: Creates one `Phaser.Image` per tile in depth-sorted order. Depth: `col + row + tile.height * HEIGHT_DEPTH_BIAS`. Origin `(0.5, 1.0)`. Diamond polygon hit area per tile. Exports `tileToWorld(col, row, height)` and `worldToTile(worldX, worldY)`. Also exports `TILE_W`, `TILE_H`, `TILE_DEPTH`, `HEIGHT_STEP`. `ORIGIN_X=480, ORIGIN_Y=60`. Suppresses hover/selection highlights while in build or road mode. `selectArea(positions[])` highlights an arbitrary set of tiles. Has `showRoadGhost(col, row, valid)` / `hideRoadGhost()` for the 1×1 road placement preview.
- **`BuildingRenderer.js`**: Manages building sprites at depth `col + row + LAYER_BUILDING`. All buildings are **2×2** — sprites are anchored at `tileToWorld(col, row)` with origin `(0.5, 1)`. Manages farm field sprites, worker overlay sprites, ghost preview, the selection overlay, **disconnected warning icons** (`icon-no-road` sprite above each building where `isConnected === false`, rebuilt on `BUILDING_PLACED` and `BUILDING_CONNECTIVITY_CHANGED`), and **starvation departure icons** (`icon-starving` orange ! sprite, `x+22, y-72` relative to building anchor, added on `VILLAGER_DEPARTED`, removed when `building.residents >= building.maxResidents` on `VILLAGER_RETURNED`).

### Systems (`src/systems/`)

All systems are plain classes with no Phaser scene dependencies (except `ProductionSystem` which needs `scene.time`).

- **`ResourceSystem`**: Ledger for food/wood/stone/money with a shared cap. `canAfford(costObj)`, `spend(costObj)` → bool, `add(name, amount)`, `setCap(n)`. Emits `RESOURCES_CHANGED` on every mutation.
- **`BuildSystem`**: `placedBuildings: Map<uid, BuildingInstance>`. All buildings use a **2×2 tile footprint**. `canPlace()` checks all 4 footprint tiles — rejects mixed heights, ramp tiles, road tiles, and a second Town Hall. `place()` marks all 4 tiles, runs `onPlace` side-effects (which populate `fieldTiles` etc.), **then** determines `building.isConnected` via `RoadSystem` so farm fields are already populated for the connectivity check. `onPlace` side-effects:
  - `spawnVillager`: adds villagers only if `building.isConnected`; deferred otherwise (Game.js handles on `BUILDING_CONNECTIVITY_CHANGED`). Also initialises `building.maxResidents = config.villagerCapacity` and `building.residents` (0 if disconnected, else capacity). `upgrade()` updates `maxResidents` and increments `residents` by the extra capacity gained.
  - `spawnFields`: claims up to 4 cardinal **2×2 GRASS blocks** as farm fields; each block anchor stored in `building.fieldTiles[]`
  - `claimForest`: claims **all** unclaimed FOREST tiles within Manhattan radius 2 of the footprint; stored sorted closest-first in `building.forestTiles[]`
  - `initRocksTiles`: records the 4 footprint ROCKS tile positions in `building.rocksTiles[]` (Quarry; no external claiming)
  - `increaseStorageCap`: raises resource cap (Warehouse)
  - `getBuildingAt(col, row)` checks the full 2×2 footprint range.
  - `canUpgrade(uid)` / `upgrade(uid, villagerManager)` — swap `building.configId` to `config.upgradesTo`, deduct `upgradeCost`, spawn extra villagers, emit `BUILDING_UPGRADED`.
  - `roadSystem` property (set from Game.js): reference to `RoadSystem` used in `canPlace` and `place`.
- **`RoadSystem`**: Manages road tile placement and the road-connectivity graph.
  - `canPlace(col, row, tileMap, resourceSystem)` — validates a 1×1 road placement (GRASS, unoccupied, not ramp/road, affordable).
  - `place(col, row, tileMap, resourceSystem, buildSystem)` — spends 1 stone + 2 money, sets `tile.isRoad = true`, emits `ROAD_PLACED`, then calls `updateConnectivity`.
  - `updateConnectivity(tileMap, buildSystem)` — BFS from Town Hall's adjacent roads through the road graph; updates `building.isConnected` for every placed building and emits `BUILDING_CONNECTIVITY_CHANGED { changed: [{building, wasConnected}] }` if anything changed.
  - `isBuildingConnected(building, tileMap, townHall)` — BFS check. Adjacency is computed from the building's 2×2 footprint **plus all field block tiles** (so a farm connected via its fields counts as connected).
- **`VillagerManager`**: Villager pool (`total`, `unassigned`). Dynamic worker caps: Farm = `fieldTiles.length` (field block count), Lumbermill = `Math.floor(forestTiles.length / 4)`, others use static `config.maxVillagers`. Emits `VILLAGERS_CHANGED`. `notifyChanged()` re-emits VILLAGERS_CHANGED (called by ProductionSystem after tile depletion). `removeVillager(buildSystem)` removes one villager: prefers unassigned pool, then unassigns from a non-food-producer building, and only falls back to food-producer buildings (Farm) as a last resort.
- **`ProductionSystem`**: Runs every 5 s. Skips buildings where `building.isConnected === false`. Farm: `productionPerVillager × min(assigned, fieldTiles.length)`. Lumbermill: `productionPerVillager × min(assigned, floor(forestTiles.length / 4))`. Quarry: skips entirely when `rocksTiles` is empty. After each extraction tick, calls `_depleteTiles()` which reduces `tile.resources`, converts exhausted non-footprint tiles to GRASS, and emits `TILE_DEPLETED { col, row, buildingUid, isBuildingFootprint }`. Deducts food per villager per tick. Emits `STARVATION_WARNING` when food hits 0. Emits `PRODUCTION_TICK { produced, consumed, yields[] }`. Applies `hungerSystem.getEfficiencyMultiplier()` to all non-food-producer buildings (food producers are exempt). Module-level `isFoodProducer(building)` checks `config.producesResource === 'food'`.
- **`HungerSystem`**: Plain class. Listens to `PRODUCTION_TICK` and tracks consecutive zero-food cycles. State machine: **fed** (full efficiency) → **hungry** after 3 cycles (×0.5) → **starving** after 10 cycles (×0.25). While starving, one villager departs every 5 cycles via `_departVillager()` (picks the first residential building with `residents > 0`). Recovery: 2 consecutive cycles with food > 0 → back to fed, emits `HUNGER_STATE_CHANGED { state: 'fed' }`; villagers return 1-per-5-cycles via `_returnVillager()` until all buildings are repopulated. Exposes `getEfficiencyMultiplier()` and `getState()`.

### Villagers (`src/villagers/`)

- **`walkable.js`**: `isWalkable(tile)` — GRASS tile with no building. Road tiles keep `type === 'GRASS'` and no `buildingId`, so they are walkable. `heightMoveCost(fromTile, toTile)` — returns `FLAT_MOVE_COST` (1) for same height, `RAMP_MOVE_COST` (2) for a one-level transition via a ramp, `Infinity` for cliffs or height diff > 1. `randomWalkableTile(tileMap, exclude?)` — random walkable tile from the full grid.
- **`VillagerEntity.js`**: Single wandering villager. Uses A* with `heightMoveCost` so villagers climb ramps but cannot cross cliffs. Walks full computed path step-by-step; all world positions and depths are height-aware. Depth uses `Math.max(src, dst)` during movement to prevent occlusion.
- **`VillagerRenderer.js`**: Manages the entity pool, synced to `VillagerManager.total` via `VILLAGERS_CHANGED`.

### Pathfinding (`src/pathfinding/`)

- **`AStar.js`**: Pure A* function `aStar(tileMap, start, goal, isWalkable, getMoveCost?) → path[]`. 4-directional, Manhattan heuristic. Optional `getMoveCost(fromTile, toTile)` callback — return `Infinity` to treat an edge as impassable; defaults to uniform cost 1. No Phaser dependencies.

### UI (`src/ui/`)

All UI components are plain classes instantiated by `UI.js`. They use `setScrollFactor(0)` + fixed `setDepth(1000+)` to stay fixed on screen.

- **`ResourceBar`**: Top strip. Shows `name: amount/cap` for each resource. Flashes yellow on increase, red on starvation warning.
- **`BuildingMenu`**: Bottom strip. Building buttons plus a **Road** button at the end. Road button emits `ROAD_MODE_ENTER` / `ROAD_MODE_EXIT` instead of `BUILD_MODE_ENTER` / `BUILD_MODE_EXIT`. All buttons use the lock system (`requires` field) and show affordability colours. Road button uses `ROAD_CONFIG` (imported separately from `BuildingConfig.js`).
- **`BuildModeIndicator`**: Shows current placement mode label at top-center ("Placing: X"). Handles both `BUILD_MODE_ENTER/EXIT` and `ROAD_MODE_ENTER/EXIT`.
- **`TileInfoPanel`**: Right panel. Shows tile type or building info on `TILE_SELECTED` / `BUILDING_PLACED`. For Lumbermill/Quarry also shows live "Wood left" / "Stone left" totals. Shows an Upgrade button when applicable. Shows **"No road connection"** in red when the selected building has `isConnected === false`; refreshes on `BUILDING_CONNECTIVITY_CHANGED`. For `spawnVillager` buildings (House, Town Hall) shows **"Residents: N/M"** and, if N < M, an orange **"X villager(s) left due to starvation"** line; refreshes on `VILLAGER_DEPARTED` / `VILLAGER_RETURNED`.
- **`VillagerPanel`**: Right panel (below TileInfoPanel). `[–]` / `[+]` buttons for worker assignment. Shows dynamic worker cap (tile-based for Farm/Lumbermill). Visible for any building with `maxVillagers > 0` or `claimsTileType`.
- **`FloatingLabels`** (Game scene, not UI scene): Spawns floating `+N` / `-N` labels on production ticks and building placement. World-space coordinates, scrolls with camera.
- **`NotificationManager`**: Transient message display for placement errors etc.
- **`HungerAlert`**: Persistent badge to the right of the canvas (repositions left of TileInfoPanel when it is open). Hidden when fed; shows orange **⚠ HUNGRY** or red **☠ STARVING!** with a pulsing alpha tween. Listens to `HUNGER_STATE_CHANGED`, `TILE_SELECTED`, `TILE_DESELECTED`.

### Input Modes

`Game.js` tracks `this.inputMode = 'idle' | 'build' | 'road'` and `this.pendingBuildConfigId`.

- **Idle**: Tile clicks → `TILE_SELECTED`. Clicking a building highlights its footprint + all claimed tiles; clicking a plain tile highlights just that tile.
- **Build**: Left-click → `BUILD_PLACEMENT_REQUEST { configId, col, row }`. Right-click → `BUILD_MODE_EXIT`. `pointermove` updates ghost (building sprite + footprint overlays + claimable tile previews). Hover and selection highlights are suppressed.
- **Road**: Left-click → `ROAD_PLACEMENT_REQUEST { col, row }`. Right-click → `ROAD_MODE_EXIT`. `pointermove` calls `mapRenderer.showRoadGhost(col, row, valid)` with green/red tint. Hover and selection highlights are suppressed.
- **Camera pan**: Right-drag scrolls `cameras.main` within map bounds (only in idle mode).
- **Escape**: Cancels road mode, then build mode, then deselects tile.

### Road System Rules

- Roads cost **1 stone + 2 money** per tile and can only be placed on unoccupied, flat GRASS tiles (not ramps).
- **Town Hall** can be placed without roads and can only be placed **once**.
- All other buildings can be placed freely but are **inactive** until connected to the Town Hall via a continuous road network:
  - Production buildings produce no resources.
  - Houses defer villager spawning until connectivity is gained.
- A building is considered connected if any tile in its **footprint or claimed field blocks** is 4-directionally adjacent to a road tile that is reachable from a road adjacent to the Town Hall.
- Connectivity is re-evaluated after every road placement via `RoadSystem.updateConnectivity()`.

### Adding a New Building

1. Add an entry to `BUILDING_CONFIGS` in `src/data/BuildingConfig.js` (include `footprint: 2`, `claimsTileType`, `onPlace`).
2. Add a texture key call in `Preloader._generateBuildingTextures()`.
3. If the building needs a new `onPlace` behavior, add a `case` in `BuildSystem.place()`.

### Adding a Building Upgrade Tier

1. Add `upgradesTo: 'TARGET_ID'` and `upgradeCost: { ... }` to the source config in `BuildingConfig.js`.
2. Add the target config entry with `isUpgrade: true` (hides it from the build menu) and the desired stats (e.g. higher `villagerCapacity`).
3. Load the tier texture in `Preloader.preload()`.
4. No further wiring needed — `BuildSystem.canUpgrade/upgrade`, `TileInfoPanel`, and `BuildingRenderer` all handle upgrades generically via the config fields.
