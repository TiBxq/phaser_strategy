import Phaser from 'phaser';
import { TileMap } from '../map/TileMap.js';
import { MapRenderer, worldToTile, ORIGIN_X, ORIGIN_Y, TILE_W, TILE_H } from '../map/MapRenderer.js';
import { BuildingRenderer } from '../map/BuildingRenderer.js';
import { ResourceSystem } from '../systems/ResourceSystem.js';
import { BuildSystem } from '../systems/BuildSystem.js';
import { VillagerManager } from '../systems/VillagerManager.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { VillagerRenderer } from '../villagers/VillagerRenderer.js';
import { FloatingLabels } from '../ui/FloatingLabels.js';
import { RoadSystem } from '../systems/RoadSystem.js';
import { HungerSystem } from '../systems/HungerSystem.js';
import { WarriorRenderer } from '../warriors/WarriorRenderer.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { FogOfWarSystem, VIS_MIN, VIS_MAX } from '../systems/FogOfWarSystem.js';
import { BanditCampSystem } from '../systems/BanditCampSystem.js';
import { BanditThreatSystem } from '../systems/BanditThreatSystem.js';
import { BanditRenderer } from '../bandits/BanditRenderer.js';
import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { MAP_SIZE } from '../map/TileMap.js';

export class Game extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    create() {
        // ── Systems ────────────────────────────────────────────────────────────
        this.resourceSystem  = new ResourceSystem();
        this.buildSystem     = new BuildSystem(this.resourceSystem);
        this.roadSystem      = new RoadSystem();
        this.buildSystem.roadSystem = this.roadSystem;
        this.fogOfWarSystem          = new FogOfWarSystem();
        this.buildSystem.fogSystem   = this.fogOfWarSystem;
        this.roadSystem.fogSystem    = this.fogOfWarSystem;
        this.villagerManager = new VillagerManager();

        // ── Map ────────────────────────────────────────────────────────────────
        this.tileMap         = new TileMap().generate();

        this.productionSystem = new ProductionSystem(
            this.time,
            this.resourceSystem,
            this.buildSystem,
            this.villagerManager,
            this.tileMap,
        );
        this.hungerSystem = new HungerSystem(
            this.resourceSystem, this.buildSystem, this.villagerManager);
        this.productionSystem.hungerSystem = this.hungerSystem;

        this.questSystem = new QuestSystem(this.buildSystem, this.villagerManager, this.resourceSystem);

        this.banditCampSystem = new BanditCampSystem();
        this.banditCampSystem.initFromMap(this.tileMap);

        this.banditThreatSystem = new BanditThreatSystem(
            this.banditCampSystem,
            this.fogOfWarSystem,
            this.villagerManager,
            this.resourceSystem,
            this.buildSystem,
            this.tileMap,
        );

        this.mapRenderer      = new MapRenderer(this, this.tileMap);
        this.mapRenderer.setFogSystem(this.fogOfWarSystem);
        this.buildingRenderer = new BuildingRenderer(this, this.tileMap, this.buildSystem);
        this.villagerRenderer = new VillagerRenderer(this, this.tileMap, this.fogOfWarSystem);
        this.warriorRenderer  = new WarriorRenderer(this, this.tileMap, this.fogOfWarSystem);
        this.banditRenderer   = new BanditRenderer(this, this.tileMap, this.banditCampSystem, this.fogOfWarSystem);
        this.floatingLabels   = new FloatingLabels(this);

        // ── Camera ─────────────────────────────────────────────────────────────
        this._setupCamera();

        // ── Input ──────────────────────────────────────────────────────────────
        this.inputMode           = 'idle';   // 'idle' | 'build' | 'road'
        this.pendingBuildConfigId = null;
        this._selectedTile       = null;

        this._setupInput();

        // ── Wire build events back from BuildSystem ────────────────────────────
        GameEvents.on(EventNames.BUILD_MODE_ENTER, ({ configId }) => {
            this.inputMode            = 'build';
            this.pendingBuildConfigId = configId;
            this.buildingRenderer.showGhost(configId);
        });

        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => {
            this.inputMode            = 'idle';
            this.pendingBuildConfigId = null;
            this.buildingRenderer.hideGhost();
        });

        GameEvents.on(EventNames.ROAD_MODE_ENTER, () => {
            this.inputMode = 'road';
            this.buildingRenderer.hideGhost();
        });

        GameEvents.on(EventNames.ROAD_MODE_EXIT, () => {
            if (this.inputMode === 'road') this.inputMode = 'idle';
            this.mapRenderer.hideRoadGhost();
        });

        GameEvents.on(EventNames.ROAD_PLACEMENT_REQUEST, ({ col, row }) => {
            const result = this.roadSystem.canPlace(col, row, this.tileMap, this.resourceSystem);
            if (!result.valid) {
                GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: result.reason });
                return;
            }
            this.roadSystem.place(col, row, this.tileMap, this.resourceSystem, this.buildSystem);
            this.mapRenderer.refreshTile(col, row);
        });

        // When buildings gain road connectivity, trigger any deferred onPlace effects.
        // Guard with _initialSpawnDone so reconnecting after road demolition
        // never double-spawns villagers that are already in the pool.
        GameEvents.on(EventNames.BUILDING_CONNECTIVITY_CHANGED, ({ changed }) => {
            for (const { building, wasConnected } of changed) {
                if (!wasConnected && building.isConnected && !building._initialSpawnDone) {
                    const config = BUILDING_CONFIGS[building.configId];
                    if (config?.onPlace === 'spawnVillager') {
                        building.residents         = building.maxResidents;
                        building._initialSpawnDone = true;
                        this.villagerManager.addVillagers(building.maxResidents);
                    }
                }
            }
        });

        GameEvents.on(EventNames.TILE_DEPLETED, ({ col, row, isBuildingFootprint }) => {
            if (!isBuildingFootprint) this.mapRenderer.refreshTile(col, row);
        });

        // Refresh freed field tiles so they revert to their natural appearance
        GameEvents.on(EventNames.BUILDING_REMOVED, ({ fieldTiles }) => {
            for (const ft of fieldTiles ?? []) {
                for (const [dc, dr] of [[0,0],[1,0],[0,1],[1,1]]) {
                    this.mapRenderer.refreshTile(ft.col + dc, ft.row + dr);
                }
            }
        });

        GameEvents.on(EventNames.BUILD_PLACEMENT_REQUEST, ({ configId, col, row }) => {
            const result = this.buildSystem.canPlace(configId, col, row, this.tileMap);
            if (!result.valid) {
                GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: result.reason });
                return;
            }
            const building = this.buildSystem.place(configId, col, row, this.tileMap, this.villagerManager);
            // Refresh all tiles in each 2×2 field block
            for (const ft of building.fieldTiles) {
                for (const [dc, dr] of [[0,0],[1,0],[0,1],[1,1]]) {
                    this.mapRenderer.refreshTile(ft.col + dc, ft.row + dr);
                }
            }
        });

        // Reveal fog around every building placed
        GameEvents.on(EventNames.BUILDING_PLACED, ({ building }) => {
            this.fogOfWarSystem.revealAroundFootprint(building.col, building.row);
        });

        // ── Launch UI in parallel ──────────────────────────────────────────────
        this.scene.launch('UI');
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    /** Returns claimed tile positions to highlight when a building is selected.
     *  Footprint tiles are NOT included — the building sprite + its overlay cover them. */
    _buildingHighlightPositions(building) {
        const positions = [];
        // Farm: all tiles in each 2×2 field block
        for (const block of building.fieldTiles) {
            for (const [dc, dr] of [[0,0],[1,0],[0,1],[1,1]]) {
                positions.push({ col: block.col + dc, row: block.row + dr });
            }
        }
        // Lumbermill: individual forest tiles
        for (const ft of building.forestTiles) {
            positions.push({ col: ft.col, row: ft.row });
        }
        return positions;
    }

    // ─── Camera ────────────────────────────────────────────────────────────────

    _setupCamera() {
        // World bounds: the full isometric diamond extents + generous padding
        const mapSpanX = (MAP_SIZE + MAP_SIZE) * (TILE_W / 2);
        const mapSpanY = (MAP_SIZE + MAP_SIZE) * (TILE_H / 2);
        const padding  = 160;

        this.cameras.main.setBounds(
            ORIGIN_X - mapSpanX / 2 - padding,
            ORIGIN_Y - padding,
            mapSpanX + padding * 2,
            mapSpanY + padding * 2,
        );

        // Start camera centred on the initial visible area (bottom-right 12×12, col/row VIS_MIN..VIS_MAX)
        const centerTileCol = Math.round((VIS_MIN + VIS_MAX) / 2);
        const centerTileRow = Math.round((VIS_MIN + VIS_MAX) / 2);
        const cx = (centerTileCol - centerTileRow) * (TILE_W / 2) + ORIGIN_X;
        const cy = (centerTileCol + centerTileRow) * (TILE_H / 2) + ORIGIN_Y + TILE_H;
        this.cameras.main.centerOn(cx, cy);

        // Pan state
        this._isPanning    = false;
        this._panStartX    = 0;
        this._panStartY    = 0;
        this._camStartX    = 0;
        this._camStartY    = 0;
    }

    // ─── Input ─────────────────────────────────────────────────────────────────

    _setupInput() {
        // Combined pointer-down: right = pan/cancel, left = build/road placement
        this.input.on('pointerdown', (pointer) => {
            if (pointer.rightButtonDown()) {
                if (this.inputMode === 'road') {
                    GameEvents.emit(EventNames.ROAD_MODE_EXIT);
                    return;
                }
                if (this.inputMode === 'build') {
                    GameEvents.emit(EventNames.BUILD_MODE_EXIT);
                    return;
                }
                this._isPanning = true;
                this._panStartX = pointer.x;
                this._panStartY = pointer.y;
                this._camStartX = this.cameras.main.scrollX;
                this._camStartY = this.cameras.main.scrollY;
            } else if (pointer.leftButtonDown() && this.inputMode === 'build') {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const tile = worldToTile(worldPoint.x, worldPoint.y);
                if (tile) {
                    GameEvents.emit(EventNames.BUILD_PLACEMENT_REQUEST, {
                        configId: this.pendingBuildConfigId,
                        col: tile.col,
                        row: tile.row,
                    });
                }
            } else if (pointer.leftButtonDown() && this.inputMode === 'road') {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const tile = worldToTile(worldPoint.x, worldPoint.y);
                if (tile) {
                    GameEvents.emit(EventNames.ROAD_PLACEMENT_REQUEST, { col: tile.col, row: tile.row });
                }
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this._isPanning) {
                const dx = pointer.x - this._panStartX;
                const dy = pointer.y - this._panStartY;
                this.cameras.main.setScroll(
                    this._camStartX - dx,
                    this._camStartY - dy,
                );
            }

            if (this.inputMode === 'build') {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const tile = worldToTile(worldPoint.x, worldPoint.y);
                if (tile) {
                    const result = this.buildSystem.canPlace(
                        this.pendingBuildConfigId, tile.col, tile.row, this.tileMap,
                    );
                    this.buildingRenderer.updateGhost(tile.col, tile.row, result.valid);
                } else {
                    this.buildingRenderer.hideGhost();
                }
            }

            if (this.inputMode === 'road') {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const tile = worldToTile(worldPoint.x, worldPoint.y);
                if (tile) {
                    const result = this.roadSystem.canPlace(
                        tile.col, tile.row, this.tileMap, this.resourceSystem,
                    );
                    this.mapRenderer.showRoadGhost(tile.col, tile.row, result.valid);
                } else {
                    this.mapRenderer.hideRoadGhost();
                }
            }
        });

        this.input.on('pointerup', () => {
            this._isPanning = false;
        });

        // Tile selection wired through tile sprites in MapRenderer.
        // Handle deselect on clicking empty space or pressing Escape.
        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row, tile }) => {
            if (this.inputMode === 'build' || this.inputMode === 'road') return;
            this._selectedTile = { col, row, tile };
            // Highlight building footprint + claimed tiles, or just the single tile
            const building = this.buildSystem.getBuildingAt(col, row);
            this.mapRenderer.selectArea(
                building ? this._buildingHighlightPositions(building) : [{ col, row }]
            );
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._selectedTile = null;
        });

        // Escape key
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.inputMode === 'road') {
                GameEvents.emit(EventNames.ROAD_MODE_EXIT);
            } else if (this.inputMode === 'build') {
                GameEvents.emit(EventNames.BUILD_MODE_EXIT);
            } else if (this._selectedTile) {
                GameEvents.emit(EventNames.TILE_DESELECTED);
            }
        });
    }
}
