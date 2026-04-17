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

All event name strings are constants in `src/events/EventNames.js`. Systems emit events; UI subscribes to them. No direct scene-to-scene method calls. Key events include `FOG_UPDATED { changes: Array<{ col, row, state }> }` emitted by `FogOfWarSystem` after each reveal.

### Data Layer (`src/data/`)

- **`TileTypes.js`** — `TILE_TYPES` (GRASS/FOREST/ROCKS/IRON) with weights, `initialResources` (GRASS=0, FOREST=50, ROCKS=100, IRON=100), and a pre-built `TILE_TYPE_POOL` for fast weighted-random picks. `IRON` has weight 0 so it never appears in random generation — placed only by the map generator's `_placeIronDeposit()`.
- **`BuildingConfig.js`** — `BUILDING_CONFIGS` object keyed by building ID. Each entry includes `footprint` (always 2), `claimsTileType` (null | 'GRASS' | 'FOREST'), `onPlace` token, and production fields. Adding a new building is a single entry here. Upgradeable buildings also carry `upgradesTo` (target config ID) and `upgradeCost` (resource object). Upgrade-only configs set `isUpgrade: true` to hide them from the build menu. Also exports `ROAD_CONFIG` — a pseudo-config (not in `BUILDING_CONFIGS`) used only by `BuildingMenu` for the Road button display. `BuildingMenu` renders buttons in the explicit `MENU_ORDER` array: `['TOWN_HALL','HOUSE','FARM','LUMBERMILL','QUARRY','IRON_MINE','SMITHY','BARRACKS','MARKET','WAREHOUSE','ROAD']`.
- **`ResourceConfig.js`** — `RESOURCE_NAMES = ['food','wood','stone','money','iron','weapons']`. Starting amounts include `iron: 0` and `weapons: 0`. Default cap 200; cap per Warehouse +100; food cost per villager per tick.
- **`QuestConfig.js`** — `QUESTS` array defining all quests in order. Each quest has `id`, `label`, and `tasks[]`. Each task has `id`, `label`, and `type` (`buildingPlaced` | `buildingConnected` | `workerAssigned` | `warriorsHired`). `buildingPlaced` tasks also carry `configId`; `warriorsHired` carries `count`. The final quest (`ENJOY`) has an empty `tasks[]` and acts as the terminal state.

### Config (`src/config/`)

- **`DepthLayers.js`** — Named depth constants for all game-scene objects. Use these instead of raw numbers.
  - Per-tile layer offsets: `LAYER_GHOST_TILE` (0.15), `LAYER_FIELD` (0.20), `LAYER_WORKER` (0.25), `LAYER_VILLAGER` (0.30), `LAYER_TILE_SELECT` (0.60), `LAYER_BUILDING` (2.90).
  - Fixed depths (always above any tile): `DEPTH_TILE_HOVER`, `DEPTH_FLOATING_LABEL`, `DEPTH_GHOST_BUILDING`, `DEPTH_SELECTION_OVERLAY`. All based on `ABOVE_MAP = 1_000_000`, safe for very large maps.
  - `HEIGHT_DEPTH_BIAS` (0.01) — fractional depth added per height level (`col + row + tile.height * HEIGHT_DEPTH_BIAS`) so elevated tiles sort above same-col+row ground tiles at cliff edges.

### Map (`src/map/`)

- **`TileMap.js`**: 24×24 grid. `VIS_MIN=12`, `VIS_MAX=23`. Tile records: `{ col, row, type, buildingId, isField, ownedBy, height, isRamp, isRoad, resources, banditClaimed, banditCampTile }`. `height` is 0–3; `isRamp` is true for GRASS tiles at a height transition; `isRoad` is true when a road tile has been placed (tile type stays GRASS so villagers remain walkable). `generate()` runs: weighted random fill → smoothing pass → heightmap (dome hills with slope-limiting) → ramp placement → outcrops → iron → bandit camp. `_placeIronDeposit(topCol, topRow)` stamps a 2×2 IRON block at uniform height, then scatters ~3 individual IRON tiles in adjacent cells. Iron is placed on the **right fog edge** (`col ∈ [VIS_MIN..MAP_SIZE-3], row ∈ [2..VIS_MIN-2]`) so it is never inside bandit territory. The second stone outcrop is on the **left fog edge** (`col ∈ [2..VIS_MIN-2], row ∈ [VIS_MIN..MAP_SIZE-3]`). Exports `MAP_SIZE`, `MAX_TILE_HEIGHT`, `VIS_MIN`, `VIS_MAX`. Exposes `getTile`, `getNeighbors` (4-dir), `getNeighbors8` (8-dir), `isInBounds`.
- **`MapRenderer.js`**: Creates one `Phaser.Image` per tile in depth-sorted order. Depth: `col + row + tile.height * HEIGHT_DEPTH_BIAS`. Origin `(0.5, 1.0)`. Diamond polygon hit area per tile. Exports `tileToWorld(col, row, height)` and `worldToTile(worldX, worldY)`. Also exports `TILE_W`, `TILE_H`, `TILE_DEPTH`, `HEIGHT_STEP`. `ORIGIN_X=480, ORIGIN_Y=60`. Suppresses hover/selection highlights while in build or road mode. `selectArea(positions[])` highlights an arbitrary set of tiles. Has `showRoadGhost(col, row, valid)` / `hideRoadGhost()` for the 1×1 road placement preview. **Fog of War**: `setFogSystem(fogSystem)` connects the fog system and runs an initial full-map fog paint via `updateAllFog()`. `refreshFogTile(col, row)` updates a single tile's appearance based on fog state — hidden tiles use `setVisible(false)`; border tiles get the `tile-grass-h{N}` texture + `setTint(0x888888)`; visible tiles restore their real texture and re-enable interactivity. `refreshTile()` is guarded to skip fog-covered tiles so game events (road placement, tile depletion, field claims) cannot accidentally reveal hidden terrain. Fog state changes are received via the `FOG_UPDATED` event.
- **`BuildingRenderer.js`**: Manages building sprites at depth `col + row + LAYER_BUILDING`. All buildings are **2×2** — sprites are anchored at `tileToWorld(col, row)` with origin `(0.5, 1)`. Manages farm field sprites, worker overlay sprites, ghost preview, the selection overlay, **disconnected warning icons** (`icon-no-road` sprite above each building where `isConnected === false`, rebuilt on `BUILDING_PLACED` and `BUILDING_CONNECTIVITY_CHANGED`), and **starvation departure icons** (`icon-starving` orange ! sprite, `x+22, y-72` relative to building anchor, added on `VILLAGER_DEPARTED` only when `reason !== 'disconnected'`, removed when `building.residents >= building.maxResidents` on `VILLAGER_RETURNED`). On `BUILDING_REMOVED` also destroys field sprites for every tile in the emitted `fieldTiles[]`, the no-road icon, and the starvation icon for that building.

### Systems (`src/systems/`)

All systems are plain classes with no Phaser scene dependencies (except `ProductionSystem` which needs `scene.time`).

- **`ResourceSystem`**: Ledger for food/wood/stone/money/iron/weapons with a shared cap. `canAfford(costObj)`, `spend(costObj)` → bool, `add(name, amount)`, `setCap(n)`. Emits `RESOURCES_CHANGED` on every mutation. Iron and weapons have no cap (stored as raw counters; the cap only applies to food/wood/stone/money).
- **`BuildSystem`**: `placedBuildings: Map<uid, BuildingInstance>`. All buildings use a **2×2 tile footprint**. `canPlace()` checks all 4 footprint tiles — rejects mixed heights, ramp tiles, road tiles, and a second Town Hall. `place()` marks all 4 tiles, runs `onPlace` side-effects (which populate `fieldTiles` etc.), **then** determines `building.isConnected` via `RoadSystem` so farm fields are already populated for the connectivity check. `onPlace` side-effects:
  - `spawnVillager`: adds villagers only if `building.isConnected`; deferred otherwise (Game.js handles on `BUILDING_CONNECTIVITY_CHANGED`). Also initialises `building.maxResidents = config.villagerCapacity` and `building.residents` (0 if disconnected, else capacity). `upgrade()` updates `maxResidents` and increments `residents` by the extra capacity gained.
  - `spawnFields`: claims up to 4 cardinal **2×2 GRASS blocks** as farm fields; each block anchor stored in `building.fieldTiles[]`
  - `claimForest`: claims **all** unclaimed FOREST tiles within Manhattan radius 2 of the footprint; stored sorted closest-first in `building.forestTiles[]`
  - `initRocksTiles`: records the 4 footprint ROCKS tile positions in `building.rocksTiles[]` (Quarry; no external claiming)
  - `initIronTiles`: records the 4 footprint IRON tile positions in `building.ironTiles[]` (Iron Mine; no external claiming)
  - `increaseStorageCap`: raises resource cap (Warehouse)
  - `getBuildingAt(col, row)` checks the full 2×2 footprint range.
  - `canUpgrade(uid)` / `upgrade(uid, villagerManager)` — swap `building.configId` to `config.upgradesTo`, deduct `upgradeCost`, spawn extra villagers, emit `BUILDING_UPGRADED`. Also accumulates `upgradeCost` into `building.totalCost` for demolish refund accounting.
  - `canDemolish(uid)` — rejects Town Hall; valid for all other buildings.
  - `demolish(uid, tileMap, villagerManager)` — unassigns workers (returns to pool), removes resident villagers via `removeVillager` for `spawnVillager` buildings, undoes Warehouse cap increase, refunds 50% of `building.totalCost` (base placement + accumulated upgrade costs, rounded down per resource), then calls `remove()`.
  - `roadSystem` property (set from Game.js): reference to `RoadSystem` used in `canPlace` and `place`.
  - `fogSystem` property (set from Game.js): reference to `FogOfWarSystem`; `canPlace()` rejects all 4 footprint tiles that are not `FOG_VISIBLE` with message "Cannot build in the fog of war.".
  - **BuildingInstance extra fields**: `totalCost` (cumulative resource investment for demolish refund), `_initialSpawnDone` (prevents double-spawning villagers when a road is demolished and rebuilt), `_disconnectCycles` / `_disconnectDepartTimer` / `_disconnectDeparted` / `_reconnectReturnTimer` (disconnection departure bookkeeping — managed by `ProductionSystem`), `_smithyProgress` (0–5 counter for Smithy multi-cycle weapon production).
- **`RoadSystem`**: Manages road tile placement, removal, and the road-connectivity graph.
  - `fogSystem` property (set from Game.js): `canPlace()` rejects tiles not in `FOG_VISIBLE` state with message "Cannot build roads in the fog of war."
  - `canPlace(col, row, tileMap, resourceSystem)` — validates a 1×1 road placement (GRASS, unoccupied, not ramp/road, affordable, visible).
  - `place(col, row, tileMap, resourceSystem, buildSystem)` — spends 1 stone + 2 money, sets `tile.isRoad = true`, emits `ROAD_PLACED`, then calls `updateConnectivity`.
  - `canDemolish(col, row, tileMap)` — validates that the tile has a road.
  - `demolish(col, row, tileMap, buildSystem, resourceSystem)` — sets `tile.isRoad = false`, removes from `roadTiles`, refunds 1 money, emits `ROAD_REMOVED`, then calls `updateConnectivity`. Buildings that relied solely on this tile become disconnected.
  - `updateConnectivity(tileMap, buildSystem)` — BFS from Town Hall's adjacent roads through the road graph; updates `building.isConnected` for every placed building and emits `BUILDING_CONNECTIVITY_CHANGED { changed: [{building, wasConnected}] }` if anything changed.
  - `isBuildingConnected(building, tileMap, townHall)` — BFS check. Adjacency is computed from the building's 2×2 footprint **plus all field block tiles** (so a farm connected via its fields counts as connected).
- **`VillagerManager`**: Villager pool (`total`, `unassigned`). Dynamic worker caps: Farm = `fieldTiles.length` (field block count), Lumbermill = `Math.floor(forestTiles.length / 4)`, others use static `config.maxVillagers`. Emits `VILLAGERS_CHANGED`. `notifyChanged()` re-emits VILLAGERS_CHANGED (called by ProductionSystem after tile depletion). `removeVillager(buildSystem)` removes one villager: prefers unassigned pool, then unassigns from a non-food-producer building, and only falls back to food-producer buildings (Farm) as a last resort.
- **`ProductionSystem`**: Runs every 5 s. Skips buildings where `building.isConnected === false`. Farm: `productionPerVillager × min(assigned, fieldTiles.length)`. Lumbermill: `productionPerVillager × min(assigned, ceil(forestTiles.length / FOREST_TILES_PER_WORKER))`. Quarry: skips entirely when `rocksTiles` is empty. **Iron Mine**: skips entirely when `ironTiles` is empty. **Smithy** (special path, skips normal yield): increments `building._smithyProgress` each tick; when it reaches 5 and 10 iron are available, spends 10 iron, produces 1 weapon, resets counter to 0. After each extraction tick (Lumbermill / Quarry / Iron Mine), calls `_depleteTiles()` which reduces `tile.resources`, converts exhausted non-footprint tiles to GRASS, and emits `TILE_DEPLETED { col, row, buildingUid, isBuildingFootprint }`. The `_depleteTiles` key lookup: `LUMBERMILL→forestTiles`, `QUARRY→rocksTiles`, else `ironTiles`. Deducts food per villager per tick; Market merchants consume an extra 3 food each per tick. Emits `STARVATION_WARNING` when food hits 0. **Warrior upkeep**: after food consumption, deducts 2 money per assigned warrior across all Barracks. Emits `PRODUCTION_TICK { produced, consumed, yields[] }`. Applies `hungerSystem.getEfficiencyMultiplier()` to all non-food-producer buildings (food producers are exempt). Module-level `isFoodProducer(building)` checks `config.producesResource === 'food'`. After the main loop also runs the **disconnection departure/return** pass: `spawnVillager` buildings that have been disconnected for more than `DISCONNECT_GRACE_CYCLES` (3) ticks lose one resident every `DISCONNECT_DEPART_CYCLES` (3) ticks (tracked in `building._disconnectDeparted`); when reconnected, those residents return 1-per-`RECONNECT_RETURN_CYCLES` (3) ticks. Only disconnection-caused departures are returned here — starvation returns are handled by `HungerSystem`.
- **`QuestSystem`**: Plain class. Drives linear quest progression — one quest active at a time. Constructor takes `buildSystem` and `villagerManager`; calls `_startQuest(0)` immediately. State: `_questIndex` (index into `QUESTS`) and `_taskStates` (`Map<taskId, boolean>`, rebuilt on each quest start). Listens to `BUILDING_PLACED` (→ `buildingPlaced` tasks), `BUILDING_CONNECTIVITY_CHANGED` (→ `buildingConnected` tasks), `VILLAGERS_CHANGED` (→ `workerAssigned` tasks), `WARRIORS_CHANGED` (→ `warriorsHired` tasks). `_completeTask(taskId)` guards against non-active and already-done tasks; when all tasks in the quest are done it emits `SHOW_NOTIFICATION`, `QUEST_COMPLETED`, then calls `_startQuest(nextIndex)`. Terminal quest (`ENJOY`, empty tasks) emits `QUEST_COMPLETED` immediately on start. Public API: `get currentQuest()`, `isTaskDone(taskId)`, `isComplete()`. Instantiated in `Game.js` as `this.questSystem` after `hungerSystem`.
- **`FogOfWarSystem`** (`src/systems/FogOfWarSystem.js`): Manages per-tile exploration state. Internal storage: `Uint8Array` of size `MAP_SIZE²` with values `FOG_HIDDEN` (0), `FOG_BORDER` (1), `FOG_VISIBLE` (2) — exported constants. Also exports `VIS_MIN` (12) and `VIS_MAX` (MAP_SIZE−1 = 23). On construction, marks col/row ∈ [VIS_MIN..VIS_MAX] as visible and computes the initial border zone (tiles within Chebyshev distance 2 of any visible tile). Public API:
  - `getState(col, row)` → `FOG_HIDDEN | FOG_BORDER | FOG_VISIBLE`
  - `isVisible(col, row)` → bool (used by `BuildSystem`, `RoadSystem`, `randomWalkableTile`)
  - `revealAround(col, row, radius=3)` — marks a Chebyshev square as visible, expands the border zone into the newly adjacent region, emits `FOG_UPDATED { changes[] }`.
  - `revealAroundFootprint(anchorCol, anchorRow)` — calls `revealAround` once per tile of the 2×2 footprint. Called from `Game.js` on `BUILDING_PLACED`.
- **`HungerSystem`**: Plain class. Listens to `PRODUCTION_TICK` and tracks consecutive zero-food cycles. State machine: **fed** (full efficiency) → **hungry** after 3 cycles (×0.5) → **starving** after 10 cycles (×0.25). While starving, one villager departs every 5 cycles via `_departVillager()` (picks the first residential building with `residents > 0`, emits `VILLAGER_DEPARTED { reason: 'starvation' }`). Recovery: 2 consecutive cycles with food > 0 → back to fed, emits `HUNGER_STATE_CHANGED { state: 'fed' }`; villagers return 1-per-5-cycles via `_returnVillager()` until all **connected** buildings with no pending disconnection-return slots are repopulated. Exposes `getEfficiencyMultiplier()` and `getState()`.

### Villagers (`src/villagers/`)

- **`walkable.js`**: `isWalkable(tile)` — GRASS tile with no building. Road tiles keep `type === 'GRASS'` and no `buildingId`, so they are walkable. `heightMoveCost(fromTile, toTile)` — returns `FLAT_MOVE_COST` (1) for same height, `RAMP_MOVE_COST` (2) for a one-level transition via a ramp, `Infinity` for cliffs or height diff > 1. `randomWalkableTile(tileMap, exclude?, fogSystem?)` — random walkable tile from the full grid; when `fogSystem` is provided, restricts candidates to `FOG_VISIBLE` tiles only. `randomWalkableTileNear(tileMap, centerCol, centerRow, radius)` — random walkable tile within Manhattan radius; used by warriors for bounded wander.
- **`VillagerEntity.js`**: Single wandering villager. Constructor accepts optional `fogSystem` and passes it to `randomWalkableTile` when picking wander destinations — villagers stay within the visible area. Uses A* with `heightMoveCost` so villagers climb ramps but cannot cross cliffs. Walks full computed path step-by-step; all world positions and depths are height-aware. Depth uses `Math.max(src, dst)` during movement to prevent occlusion.
- **`VillagerRenderer.js`**: Manages the entity pool, synced to `VillagerManager.total` via `VILLAGERS_CHANGED`. Accepts optional `fogSystem` in constructor; passes it to both `randomWalkableTile` (spawn location) and each `VillagerEntity`.

### Warriors (`src/warriors/`)

- **`WarriorEntity.js`**: Single warrior sprite. Mirrors `VillagerEntity` but uses `'sprite-warrior'` texture (red-armored 10×14 sprite). Stores `_homeCol/_homeRow` (Barracks anchor); picks wander targets via `randomWalkableTileNear` with `WANDER_RADIUS=4`. `MOVE_DURATION=600`, idle pause `800–2000 ms`.
- **`WarriorRenderer.js`**: Maintains a `Map<buildingUid, WarriorEntity[]>` pool. Listens to `WARRIORS_CHANGED { buildingUid, building }` → `_syncPool()` adds/removes entities to match `building.assignedVillagers`. Spawn location: `randomWalkableTileNear` with radius 3, fallback to `randomWalkableTile`. Listens to `BUILDING_REMOVED` → destroys all entities for that uid.

### Pathfinding (`src/pathfinding/`)

- **`AStar.js`**: Pure A* function `aStar(tileMap, start, goal, isWalkable, getMoveCost?) → path[]`. 4-directional, Manhattan heuristic. Optional `getMoveCost(fromTile, toTile)` callback — return `Infinity` to treat an edge as impassable; defaults to uniform cost 1. No Phaser dependencies.

### UI (`src/ui/`)

All UI components are plain classes instantiated by `UI.js`. They use `setScrollFactor(0)` + fixed `setDepth(1000+)` to stay fixed on screen.

- **`ResourceBar`**: Top strip. Shows `name: amount/cap` for all 6 resources (food, wood, stone, money, iron, weapons). `slotW=128` to fit 6 slots; villager label at `x=955`. Flashes yellow on increase, red on starvation warning. `ICON_KEYS` includes `iron: 'icon-iron'` and `weapons: 'icon-weapons'`.
- **`BuildingMenu`**: Bottom strip. Building buttons plus a **Road** button at the end. Buttons rendered in `MENU_ORDER` order (see BuildingConfig). Road button emits `ROAD_MODE_ENTER` / `ROAD_MODE_EXIT` instead of `BUILD_MODE_ENTER` / `BUILD_MODE_EXIT`. All buttons use the lock system (`requires` field) and show affordability colours. Road button uses `ROAD_CONFIG` (imported separately from `BuildingConfig.js`).
- **`BuildModeIndicator`**: Shows current placement mode label at top-center ("Placing: X"). Handles both `BUILD_MODE_ENTER/EXIT` and `ROAD_MODE_ENTER/EXIT`.
- **`TileInfoPanel`**: Right panel (230px tall). Shows tile type or building info on `TILE_SELECTED` / `BUILDING_PLACED`. For Lumbermill/Quarry/Iron Mine shows live "Wood left" / "Stone left" / "Iron left" totals (summed from tile resources). For Smithy shows `Progress: N/5` and `Iron needed: 10`. Shows an Upgrade button when applicable. Shows **"No road connection"** in red when the selected building has `isConnected === false`; refreshes on `BUILDING_CONNECTIVITY_CHANGED`. For `spawnVillager` buildings shows **"Residents: N/M"** and, if N < M, separate orange lines for disconnection losses (`"N left (no road)"`) and starvation losses (`"N left (starvation)"`); refreshes on `VILLAGER_DEPARTED` / `VILLAGER_RETURNED`. Shows a red **Demolish** button for all buildings except Town Hall (emits `BUILDING_DEMOLISH_REQUEST`). When a road tile is selected shows a red **Remove Road** button (emits `ROAD_DEMOLISH_REQUEST`). Panel background is 230px; VillagerPanel sits below at PY=290. `PRODUCTION_TICK` refresh triggers for Lumbermill, Quarry, Iron Mine, and Smithy.
- **`VillagerPanel`**: Right panel (below TileInfoPanel). `[–]` / `[+]` buttons for worker assignment. Shows "Warriors: N/M" for Barracks (label switches to "Warriors"), "Workers: N/M" for other buildings. Shows dynamic worker cap (tile-based for Farm/Lumbermill). Visible for any building with `maxVillagers > 0` or `claimsTileType`. Assigning to a Barracks is intercepted in `UI.js`: requires 1 weapon per warrior; spends it and emits `WARRIORS_CHANGED` after the villager assignment completes. Unassigning from a Barracks also emits `WARRIORS_CHANGED`.
- **`FloatingLabels`** (Game scene, not UI scene): Spawns floating `+N` / `-N` labels on production ticks and building placement. World-space coordinates, scrolls with camera. `RESOURCE_COLORS` includes `iron: '#cc6600'` and `weapons: '#dddddd'`.
- **`NotificationManager`**: Transient message display for placement errors etc.
- **`HungerAlert`**: Persistent badge to the right of the canvas (repositions left of TileInfoPanel when it is open). Hidden when fed; shows orange **⚠ HUNGRY** or red **☠ STARVING!** with a pulsing alpha tween. Listens to `HUNGER_STATE_CHANGED`, `TILE_SELECTED`, `TILE_DESELECTED`.
- **`QuestPanel`**: Fixed panel at `(10, 48)` — top-left, below the ResourceBar. Width 195px, height dynamic. Dark semi-transparent background (matching HungerAlert style). Shows the active quest label (bold white) and one line per task: `✓ label` (green) when done, `○ label` (grey) when pending. When `questSystem.isComplete()` (terminal ENJOY quest), switches to a gold "Enjoy the Game!" / "All quests complete!" display. Redraws on `QUEST_STARTED`, `QUEST_TASK_COMPLETED`, `QUEST_COMPLETED`. Instantiated in `UI.js` as `this.questPanel`; passes `gameScene.questSystem` reference.

### Input Modes

`Game.js` tracks `this.inputMode = 'idle' | 'build' | 'road'` and `this.pendingBuildConfigId`.

- **Idle**: Tile clicks → `TILE_SELECTED`. Clicking a building highlights its footprint + all claimed tiles; clicking a plain tile highlights just that tile.
- **Build**: Left-click → `BUILD_PLACEMENT_REQUEST { configId, col, row }`. Right-click → `BUILD_MODE_EXIT`. `pointermove` updates ghost (building sprite + footprint overlays + claimable tile previews). Hover and selection highlights are suppressed.
- **Road**: Left-click → `ROAD_PLACEMENT_REQUEST { col, row }`. Right-click → `ROAD_MODE_EXIT`. `pointermove` calls `mapRenderer.showRoadGhost(col, row, valid)` with green/red tint. Hover and selection highlights are suppressed.
- **Camera pan**: Right-drag scrolls `cameras.main` within map bounds (only in idle mode).
- **Escape**: Cancels road mode, then build mode, then deselects tile.

### Road System Rules

- Roads cost **1 stone + 2 money** per tile and can only be placed on unoccupied, flat GRASS tiles (not ramps).
- Roads can be **removed** by selecting the tile in idle mode and clicking Remove Road; refunds 1 money. Connectivity is re-evaluated immediately — buildings that lose their only road path become inactive.
- **Town Hall** can be placed without roads and can only be placed **once**. It cannot be demolished.
- All other buildings can be placed freely but are **inactive** until connected to the Town Hall via a continuous road network:
  - Production buildings produce no resources.
  - `spawnVillager` buildings defer villager spawning until connectivity is first gained (tracked by `building._initialSpawnDone` to prevent double-spawning on road demolish + rebuild).
- A building is considered connected if any tile in its **footprint or claimed field blocks** is 4-directionally adjacent to a road tile that is reachable from a road adjacent to the Town Hall.
- Connectivity is re-evaluated after every road placement or removal via `RoadSystem.updateConnectivity()`.

### Disconnection Departure Rules

- `spawnVillager` buildings (Houses) that become **disconnected** lose residents over time:
  - **Grace period**: 3 production ticks (15 s) before any departure.
  - **Departure rate**: 1 resident every 3 ticks while disconnected and `residents > 0`. Emits `VILLAGER_DEPARTED { reason: 'disconnected' }`.
- When the building **reconnects**, departed residents return 1-per-3-ticks. Only disconnection-departed residents are returned by this path (`building._disconnectDeparted` counter); starvation returns remain the responsibility of `HungerSystem`.
- `HungerSystem` starvation returns are restricted to **connected** buildings that have no pending disconnection-return slots, preventing the two systems from double-restoring the same slot.

### Demolition Rules

- Any building except Town Hall can be demolished via the red **Demolish** button in TileInfoPanel.
- Demolishing a building: returns all assigned workers to the unassigned pool; removes residents from the villager total (for `spawnVillager` buildings); reduces storage cap (for Warehouses); refunds 50% of `building.totalCost` (base placement cost + all upgrade costs paid), rounded down per resource; frees all owned tiles (footprint, field blocks, forest tiles).
- Road tiles can be removed via the **Remove Road** button when selected; refunds 1 money.

### Barracks & Warriors

- **Barracks** is a 2×2 building on GRASS. Up to 5 villagers can be assigned as warriors via the standard VillagerPanel `[–]`/`[+]` UI.
- **Assigning** a warrior: costs 1 weapon (checked and deducted in `UI.js`'s `VILLAGER_ASSIGN_REQUEST` handler before calling `villagerManager.assign()`). Emits `WARRIORS_CHANGED { buildingUid, building }` after the villager is assigned.
- **Unassigning** a warrior: returns the villager to the unassigned pool. Emits `WARRIORS_CHANGED`.
- **Warrior upkeep**: 2 money per assigned warrior per production tick, deducted in `ProductionSystem`.
- **Warrior sprites**: `WarriorRenderer` maintains one `WarriorEntity` per `building.assignedVillagers`, synced via `WARRIORS_CHANGED`. Warriors are red-armored sprites (`sprite-warrior`) that wander within radius 4 of the Barracks using A* + `randomWalkableTileNear`.

### Iron & Iron Mine

- **IRON tiles**: orange-tinted rocks tiles (rocks spritesheet frame + 50% `#cc5500` overlay via `source-atop` composite). Weight 0 — placed only by `_placeIronDeposit()`.
- **Iron Mine**: 2×2 building on IRON. `onPlace: 'initIronTiles'` records the 4 footprint tile positions in `building.ironTiles[]`. Up to 6 workers produce 1 iron/tick each. Stops when `ironTiles` is exhausted. Depletion converts footprint tiles to GRASS in-place (since footprint tiles have `buildingId`, they are not converted — they stay depleted at 0 resources).
- **Iron resource**: shown in ResourceBar as slot 5 with `icon-iron` (16×16 orange bar). Produced by Iron Mine, consumed by Smithy.

### Smithy & Weapons

- **Smithy**: 2×2 building on GRASS. Requires 1 worker assigned. **5-cycle production**: `building._smithyProgress` increments each tick; when it hits 5 and ≥10 iron is available, spends 10 iron, produces 1 weapon, resets counter. If iron is unavailable at cycle 5 the counter stays at 5 and retries next tick.
- **Weapons resource**: shown in ResourceBar as slot 6 with `icon-weapons` (16×16 sword shape). Produced by Smithy, spent to train warriors at Barracks.

### Quest System

- **Quests** are defined in `src/data/QuestConfig.js` as a frozen `QUESTS` array. Four quests ship: *First Steps*, *Establishing an Economy*, *Protect Your Village*, and the terminal *Enjoy the Game!*.
- **One quest is active at a time.** `QuestSystem` tracks `_questIndex` and auto-advances when all tasks are done.
- **Task types** (extensible — add a new handler in `QuestSystem` + a new `type` string in `QuestConfig`):
  | Type | Trigger event | Completion condition |
  |---|---|---|
  | `buildingPlaced` | `BUILDING_PLACED` | `building.configId === task.configId` |
  | `buildingConnected` | `BUILDING_CONNECTIVITY_CHANGED` | any non-TH building reaches `isConnected = true` |
  | `workerAssigned` | `VILLAGERS_CHANGED` | any building has `assignedVillagers >= 1` |
  | `warriorsHired` | `WARRIORS_CHANGED` | sum of all Barracks `assignedVillagers >= task.count` |
- **Quest events** (in `EventNames.js`): `QUEST_STARTED { quest }`, `QUEST_TASK_COMPLETED { quest, task }`, `QUEST_COMPLETED { quest }`.
- Quest completion fires a `SHOW_NOTIFICATION` toast (reuses `NotificationManager`) before advancing.
- The terminal `ENJOY` quest has `tasks: []`; `QuestSystem._startQuest` emits `QUEST_COMPLETED` immediately so `QuestPanel` switches to the gold congratulation state.

### Fog of War

- **Starting visibility**: col/row ∈ [`VIS_MIN`..`VIS_MAX`] = [12..23] — the 12×12 "bottom corner" of the isometric diamond. All other tiles start as `FOG_HIDDEN`.
- **Border zone**: any `FOG_HIDDEN` tile within Chebyshev distance 2 of a `FOG_VISIBLE` tile is promoted to `FOG_BORDER`. Border tiles render as gray-tinted grass (`tile-grass-h{N}` + `setTint(0x888888)`) — the height/shape is hinted but terrain type is concealed.
- **Exploration**: placing any building calls `fogOfWarSystem.revealAroundFootprint(col, row)`, which reveals a Chebyshev radius-3 square around each of the 4 footprint tiles and expands the border zone outward.
- **Restrictions**: `BuildSystem.canPlace()` and `RoadSystem.canPlace()` reject placements on any non-`FOG_VISIBLE` tile. Hovering and clicking fog tiles is suppressed via `disableInteractive()`.
- **Villager confinement**: `randomWalkableTile` filters to visible tiles when `fogSystem` is supplied, so villagers and their spawn points are always within the revealed area.
- **Camera start**: `Game.js` derives the initial camera center from `Math.round((VIS_MIN + VIS_MAX) / 2)` so it always starts centered on the visible region regardless of `VIS_MIN`/`VIS_MAX` values.
- **Event**: `FOG_UPDATED { changes: Array<{ col, row, state }> }` — emitted by `FogOfWarSystem.revealAround()` after each reveal; `MapRenderer` subscribes and calls `refreshFogTile` for each changed tile.
- **Depth note**: fog is implemented purely via `setVisible` / `setTint` on the base tile sprite — no overlay sprites. This avoids isometric depth-sorting issues where overlay sprites at depth `col+row+N` would incorrectly cover neighboring visible tiles that share screen space.

### Adding a New Building

1. Add an entry to `BUILDING_CONFIGS` in `src/data/BuildingConfig.js` (include `footprint: 2`, `claimsTileType`, `onPlace`).
2. Add the building ID to the `MENU_ORDER` array in `BuildingMenu.js` at the desired position.
3. Add a texture key call in `Preloader._generateBuildingTextures()`.
4. If the building needs a new `onPlace` behavior, add a `case` in `BuildSystem.place()`.
5. If the building needs a new production behavior (e.g. multi-cycle, depletion), add special-case logic in `ProductionSystem._tick()`.

### Adding a Building Upgrade Tier

1. Add `upgradesTo: 'TARGET_ID'` and `upgradeCost: { ... }` to the source config in `BuildingConfig.js`.
2. Add the target config entry with `isUpgrade: true` (hides it from the build menu) and the desired stats (e.g. higher `villagerCapacity`).
3. Load the tier texture in `Preloader.preload()`.
4. No further wiring needed — `BuildSystem.canUpgrade/upgrade`, `TileInfoPanel`, and `BuildingRenderer` all handle upgrades generically via the config fields.
