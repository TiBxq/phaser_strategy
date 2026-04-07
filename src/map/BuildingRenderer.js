import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { tileToWorld, TILE_DEPTH } from './MapRenderer.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class BuildingRenderer {
    constructor(scene, tileMap, buildSystem) {
        this.scene        = scene;
        this.tileMap      = tileMap;
        this._buildSystem = buildSystem;

        // Map<uid, Phaser.GameObjects.Image>
        this._buildingSprites = new Map();
        // Map<'col_row', Phaser.GameObjects.Image> for farm fields
        this._fieldSprites = new Map();
        // Map<'col_row', Phaser.GameObjects.Image> for worker overlays
        this._workerSprites = new Map();
        // Ghost sprites
        this._ghost = null;
        this._currentGhostConfigId = null;
        this._ghostTileSprites = [];

        this._bindEvents();
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    _bindEvents() {
        GameEvents.on(EventNames.BUILDING_PLACED, ({ building }) => {
            this._addBuilding(building);
        });

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            this._removeBuilding(uid);
        });

        GameEvents.on(EventNames.VILLAGERS_CHANGED, () => {
            this._updateWorkerTiles();
        });
    }

    _addBuilding(building) {
        const config    = BUILDING_CONFIGS[building.configId];
        const { x, y }  = tileToWorld(building.col, building.row);
        const depth     = building.col + building.row + 0.5;

        const img = this.scene.add.image(x, y - TILE_DEPTH, config.textureKey)
            .setOrigin(0.5, 1)
            .setDepth(depth);

        this._buildingSprites.set(building.uid, img);

        // Farm fields
        for (const ft of building.fieldTiles) {
            this._addFieldSprite(ft.col, ft.row);
        }
    }

    _addFieldSprite(col, row) {
        const key       = `${col}_${row}`;
        if (this._fieldSprites.has(key)) return;
        const { x, y }  = tileToWorld(col, row);
        const depth     = col + row + 0.2;
        const img = this.scene.add.image(x, y, 'tile-field')
            .setOrigin(0.5, 1)
            .setDepth(depth);
        this._fieldSprites.set(key, img);
    }

    _removeBuilding(uid) {
        const img = this._buildingSprites.get(uid);
        if (img) {
            img.destroy();
            this._buildingSprites.delete(uid);
        }
    }

    // ─── Worker tiles ──────────────────────────────────────────────────────────

    _updateWorkerTiles() {
        // Destroy previous overlays
        for (const sprite of this._workerSprites.values()) sprite.destroy();
        this._workerSprites.clear();

        if (!this._buildSystem) return;

        for (const building of this._buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            if (!config.claimsTileType) continue;

            // Unified view of claimed tiles (Farm: fieldTiles, Lumbermill: forestTiles)
            const claimedTiles = building.fieldTiles.length
                ? building.fieldTiles
                : building.forestTiles;

            const workerCount = building.assignedVillagers;
            for (let i = 0; i < workerCount && i < claimedTiles.length; i++) {
                const { col, row } = claimedTiles[i];
                const key          = `${col}_${row}`;
                if (this._workerSprites.has(key)) continue;

                const { x, y } = tileToWorld(col, row);
                const sprite   = this.scene.add.image(x, y, 'tile-worker-overlay')
                    .setOrigin(0.5, 1)
                    .setDepth(col + row + 0.25);
                this._workerSprites.set(key, sprite);
            }
        }
    }

    // ─── Ghost preview ─────────────────────────────────────────────────────────

    showGhost(configId) {
        this._currentGhostConfigId = configId;
        if (!this._ghost) {
            this._ghost = this.scene.add.image(0, 0, 'building-house')
                .setOrigin(0.5, 1)
                .setAlpha(0.55)
                .setDepth(99999)
                .setVisible(false);
        }
        const config = BUILDING_CONFIGS[configId];
        this._ghost.setTexture(config.textureKey).setVisible(true);
    }

    updateGhost(col, row, isValid) {
        if (!this._ghost) return;
        const { x, y } = tileToWorld(col, row);
        this._ghost.setPosition(x, y - TILE_DEPTH).setVisible(true);
        this._ghost.setTint(isValid ? 0x88ff88 : 0xff6666);

        // Show ghost tiles for buildings that claim adjacent tiles
        this._clearGhostTiles();
        const config = BUILDING_CONFIGS[this._currentGhostConfigId];
        if (config?.claimsTileType) {
            const neighbours = this.tileMap.getNeighbors(col, row);
            for (const n of neighbours) {
                if (n.type === config.claimsTileType && !n.ownedBy) {
                    const { x: nx, y: ny } = tileToWorld(n.col, n.row);
                    const ghost = this.scene.add.image(nx, ny, 'tile-ghost-claim')
                        .setOrigin(0.5, 1)
                        .setDepth(n.col + n.row + 0.15);
                    this._ghostTileSprites.push(ghost);
                }
            }
        }
    }

    hideGhost() {
        if (this._ghost) this._ghost.setVisible(false);
        this._clearGhostTiles();
    }

    _clearGhostTiles() {
        for (const s of this._ghostTileSprites) s.destroy();
        this._ghostTileSprites = [];
    }
}
