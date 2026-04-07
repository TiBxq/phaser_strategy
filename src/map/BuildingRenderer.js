import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { tileToWorld, TILE_DEPTH } from './MapRenderer.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

// 2×2 footprint offsets
const FOOTPRINT = [[0, 0], [1, 0], [0, 1], [1, 1]];

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
        const config   = BUILDING_CONFIGS[building.configId];
        const { x, y } = tileToWorld(building.col, building.row);
        // Depth must exceed the frontmost footprint tile (col+1, row+1) at col+row+2
        const depth    = building.col + building.row + 2.5;

        const img = this.scene.add.image(x, y, config.textureKey)
            .setOrigin(0.5, 1)
            .setDepth(depth);

        this._buildingSprites.set(building.uid, img);

        // Farm fields: 4 individual tile sprites per 2×2 block
        for (const block of building.fieldTiles) {
            for (const [dc, dr] of FOOTPRINT) {
                this._addFieldSprite(block.col + dc, block.row + dr);
            }
        }
    }

    _addFieldSprite(col, row) {
        const key      = `${col}_${row}`;
        if (this._fieldSprites.has(key)) return;
        const { x, y } = tileToWorld(col, row);
        const img = this.scene.add.image(x, y, 'tile-field')
            .setOrigin(0.5, 1)
            .setDepth(col + row + 0.2);
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
        for (const sprite of this._workerSprites.values()) sprite.destroy();
        this._workerSprites.clear();

        if (!this._buildSystem) return;

        for (const building of this._buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            if (!config.claimsTileType) continue;

            // Farm: worker on the anchor tile of each claimed field block
            // Lumbermill: worker on the first N forest tiles (sorted closest-first)
            const workerTiles = config.claimsTileType === 'FOREST'
                ? building.forestTiles
                : building.fieldTiles.map(b => b);  // block anchors serve as worker tile

            const workerCount = building.assignedVillagers;
            for (let i = 0; i < workerCount && i < workerTiles.length; i++) {
                const { col, row } = workerTiles[i];
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
        // Same anchor formula as _addBuilding (2×2 center = anchor y, no TILE_DEPTH)
        this._ghost.setPosition(x, y).setVisible(true);
        this._ghost.setTint(isValid ? 0x88ff88 : 0xff6666);

        this._clearGhostTiles();

        // Show footprint overlay (4 tiles)
        for (const [dc, dr] of FOOTPRINT) {
            const tc = col + dc;
            const tr = row + dr;
            const { x: tx, y: ty } = tileToWorld(tc, tr);
            const ghost = this.scene.add.image(tx, ty, 'tile-ghost-claim')
                .setOrigin(0.5, 1)
                .setDepth(tc + tr + 0.15)
                .setTint(isValid ? 0x88ff88 : 0xff4444);
            this._ghostTileSprites.push(ghost);
        }

        // Show claimable tiles for tile-based buildings
        const config = BUILDING_CONFIGS[this._currentGhostConfigId];
        if (!config?.claimsTileType) return;

        if (config.claimsTileType === 'GRASS') {
            // Farm: preview the 4 cardinal 2×2 field block positions
            const candidates = [
                { col: col + 2, row: row     },
                { col: col,     row: row + 2 },
                { col: col - 2, row: row     },
                { col: col,     row: row - 2 },
            ];
            for (const { col: fc, row: fr } of candidates) {
                if (!this._isValidGhostFieldBlock(fc, fr)) continue;
                for (const [dc, dr] of FOOTPRINT) {
                    const { x: gx, y: gy } = tileToWorld(fc + dc, fr + dr);
                    const g = this.scene.add.image(gx, gy, 'tile-ghost-claim')
                        .setOrigin(0.5, 1)
                        .setDepth(fc + dc + fr + dr + 0.15);
                    this._ghostTileSprites.push(g);
                }
            }
        } else if (config.claimsTileType === 'FOREST') {
            // Lumbermill: preview FOREST tiles within radius 2
            for (let tc = col - 2; tc <= col + 3; tc++) {
                for (let tr = row - 2; tr <= row + 3; tr++) {
                    const t = this.tileMap.getTile(tc, tr);
                    if (!t || t.type !== 'FOREST' || t.ownedBy) continue;
                    const dx = Math.max(0, col - tc, tc - (col + 1));
                    const dy = Math.max(0, row - tr, tr - (row + 1));
                    if (dx + dy < 1 || dx + dy > 2) continue;

                    const { x: gx, y: gy } = tileToWorld(tc, tr);
                    const g = this.scene.add.image(gx, gy, 'tile-ghost-claim')
                        .setOrigin(0.5, 1)
                        .setDepth(tc + tr + 0.15);
                    this._ghostTileSprites.push(g);
                }
            }
        }
    }

    _isValidGhostFieldBlock(fc, fr) {
        for (const [dc, dr] of FOOTPRINT) {
            const t = this.tileMap.getTile(fc + dc, fr + dr);
            if (!t) return false;
            if (t.type !== 'GRASS') return false;
            if (t.buildingId || t.isField || t.ownedBy) return false;
        }
        return true;
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
