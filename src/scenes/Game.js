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
        this.villagerManager = new VillagerManager();
        this.productionSystem = new ProductionSystem(
            this.time,
            this.resourceSystem,
            this.buildSystem,
            this.villagerManager,
        );

        // ── Map ────────────────────────────────────────────────────────────────
        this.tileMap         = new TileMap().generate();
        this.mapRenderer      = new MapRenderer(this, this.tileMap);
        this.buildingRenderer = new BuildingRenderer(this, this.tileMap);
        this.villagerRenderer = new VillagerRenderer(this, this.tileMap);
        this.floatingLabels   = new FloatingLabels(this);

        // ── Camera ─────────────────────────────────────────────────────────────
        this._setupCamera();

        // ── Input ──────────────────────────────────────────────────────────────
        this.inputMode           = 'idle';   // 'idle' | 'build'
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

        GameEvents.on(EventNames.BUILD_PLACEMENT_REQUEST, ({ configId, col, row }) => {
            const result = this.buildSystem.canPlace(configId, col, row, this.tileMap);
            if (!result.valid) {
                GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: result.reason });
                return;
            }
            const building = this.buildSystem.place(configId, col, row, this.tileMap, this.villagerManager);
            // Refresh any tiles that became fields
            if (building.fieldTiles) {
                for (const ft of building.fieldTiles) {
                    this.mapRenderer.refreshTile(ft.col, ft.row);
                }
            }
        });

        // ── Launch UI in parallel ──────────────────────────────────────────────
        this.scene.launch('UI');
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

        // Start camera centred on map
        const centerTileCol = MAP_SIZE / 2;
        const centerTileRow = MAP_SIZE / 2;
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
        // Combined pointer-down: right = pan/cancel, left = build placement
        this.input.on('pointerdown', (pointer) => {
            if (pointer.rightButtonDown()) {
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
        });

        this.input.on('pointerup', () => {
            this._isPanning = false;
        });

        // Tile selection wired through tile sprites in MapRenderer.
        // Handle deselect on clicking empty space or pressing Escape.
        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row, tile }) => {
            this._selectedTile = { col, row, tile };
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._selectedTile = null;
        });

        // Escape key
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.inputMode === 'build') {
                GameEvents.emit(EventNames.BUILD_MODE_EXIT);
            } else if (this._selectedTile) {
                GameEvents.emit(EventNames.TILE_DESELECTED);
            }
        });
    }
}
