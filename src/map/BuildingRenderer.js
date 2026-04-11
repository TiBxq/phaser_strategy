import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { tileToWorld, TILE_DEPTH, TILE_H } from './MapRenderer.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import {
    LAYER_FIELD, LAYER_WORKER, LAYER_BUILDING, LAYER_GHOST_TILE,
    DEPTH_GHOST_BUILDING, DEPTH_SELECTION_OVERLAY, HEIGHT_DEPTH_BIAS,
    DEPTH_FLOATING_LABEL,
} from '../config/DepthLayers.js';

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
        // Map<uid, Phaser.GameObjects.Image> for "no road connection" warning icons
        this._noRoadSprites = new Map();
        // Map<uid, Phaser.GameObjects.Image> for starvation departure warning icons
        this._starvationSprites = new Map();
        // Ghost sprites
        this._ghost = null;
        this._currentGhostConfigId = null;
        this._ghostTileSprites = [];
        // Selection highlight overlay for the selected building (depth 99999)
        this._selectionOverlay = null;

        this._bindEvents();
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    _bindEvents() {
        GameEvents.on(EventNames.BUILDING_PLACED, ({ building }) => {
            this._addBuilding(building);
            this._refreshNoRoadIcons();
        });

        GameEvents.on(EventNames.BUILDING_CONNECTIVITY_CHANGED, () => {
            this._refreshNoRoadIcons();
        });

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            this._removeBuilding(uid);
        });

        GameEvents.on(EventNames.VILLAGERS_CHANGED, () => {
            this._updateWorkerTiles();
        });

        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row }) => {
            const building = this._buildSystem?.getBuildingAt(col, row);
            if (building) {
                this._showSelectionOverlay(building);
            } else {
                this._clearSelectionOverlay();
            }
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._clearSelectionOverlay();
        });

        GameEvents.on(EventNames.BUILDING_UPGRADED, ({ building }) => {
            const sprite = this._buildingSprites.get(building.uid);
            const newConfig = BUILDING_CONFIGS[building.configId];
            if (sprite) sprite.setTexture(newConfig.textureKey);
            if (this._selectionOverlay?.visible) this._showSelectionOverlay(building);
        });

        GameEvents.on(EventNames.VILLAGER_DEPARTED, ({ buildingUid }) => {
            const b = this._buildSystem?.getBuilding(buildingUid);
            if (b) this._addStarvationIcon(b);
        });

        GameEvents.on(EventNames.VILLAGER_RETURNED, ({ buildingUid }) => {
            const b = this._buildSystem?.getBuilding(buildingUid);
            if (b && b.residents >= b.maxResidents) {
                const sprite = this._starvationSprites.get(buildingUid);
                if (sprite) {
                    sprite.destroy();
                    this._starvationSprites.delete(buildingUid);
                }
            }
        });
    }

    _addBuilding(building) {
        const config      = BUILDING_CONFIGS[building.configId];
        const anchorTile  = this.tileMap.getTile(building.col, building.row);
        const anchorH     = anchorTile ? anchorTile.height : 0;
        const { x, y }   = tileToWorld(building.col, building.row, anchorH);
        const depth       = building.col + building.row + anchorH * HEIGHT_DEPTH_BIAS + LAYER_BUILDING;

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
        const tile     = this.tileMap.getTile(col, row);
        const h        = tile ? tile.height : 0;
        const { x, y } = tileToWorld(col, row, h);
        const img = this.scene.add.image(x, y, 'tile-field')
            .setOrigin(0.5, 1)
            .setDepth(col + row + h * HEIGHT_DEPTH_BIAS + LAYER_FIELD);
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

                const wTile    = this.tileMap.getTile(col, row);
                const wH       = wTile ? wTile.height : 0;
                const { x, y } = tileToWorld(col, row, wH);
                const sprite   = this.scene.add.image(x, y, 'tile-worker-overlay')
                    .setOrigin(0.5, 1)
                    .setDepth(col + row + wH * HEIGHT_DEPTH_BIAS + LAYER_WORKER);
                this._workerSprites.set(key, sprite);
            }
        }
    }

    // ─── No-road-connection icons ──────────────────────────────────────────────

    _refreshNoRoadIcons() {
        // Destroy all existing warning icons and rebuild from scratch
        for (const s of this._noRoadSprites.values()) s.destroy();
        this._noRoadSprites.clear();

        if (!this._buildSystem) return;
        for (const building of this._buildSystem.placedBuildings.values()) {
            if (!building.isConnected) this._addNoRoadIcon(building);
        }
    }

    _addNoRoadIcon(building) {
        const anchorTile = this.tileMap.getTile(building.col, building.row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }  = tileToWorld(building.col, building.row, anchorH);

        // Place the icon near the top-centre of the building sprite.
        // Buildings are ~96px tall; anchor is at bottom → y-72 is upper third.
        const sprite = this.scene.add.image(x, y - 72, 'icon-no-road')
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH_FLOATING_LABEL);
        this._noRoadSprites.set(building.uid, sprite);
    }

    _addStarvationIcon(building) {
        if (this._starvationSprites.has(building.uid)) return;
        const anchorTile = this.tileMap.getTile(building.col, building.row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }  = tileToWorld(building.col, building.row, anchorH);

        // Offset +22px right so it sits beside icon-no-road (centered at x, y-72)
        const sprite = this.scene.add.image(x + 22, y - 72, 'icon-starving')
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH_FLOATING_LABEL);
        this._starvationSprites.set(building.uid, sprite);
    }

    // ─── Ghost preview ─────────────────────────────────────────────────────────

    showGhost(configId) {
        this._currentGhostConfigId = configId;
        if (!this._ghost) {
            this._ghost = this.scene.add.image(0, 0, 'building-house')
                .setOrigin(0.5, 1)
                .setAlpha(0.55)
                .setDepth(DEPTH_GHOST_BUILDING)
                .setVisible(false);
        }
        const config = BUILDING_CONFIGS[configId];
        this._ghost.setTexture(config.textureKey).setVisible(true);
    }

    updateGhost(col, row, isValid) {
        if (!this._ghost) return;
        const anchorTile = this.tileMap.getTile(col, row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }   = tileToWorld(col, row, anchorH);
        this._ghost.setPosition(x, y).setVisible(true);
        this._ghost.setTint(isValid ? 0x88ff88 : 0xff6666);

        this._clearGhostTiles();

        // Show footprint overlay (4 tiles)
        for (const [deltaCol, deltaRow] of FOOTPRINT) {
            const footprintCol  = col + deltaCol;
            const footprintRow  = row + deltaRow;
            const footprintTile = this.tileMap.getTile(footprintCol, footprintRow);
            const tileHeight    = footprintTile ? footprintTile.height : 0;
            const { x: worldX, y: worldY } = tileToWorld(footprintCol, footprintRow, tileHeight);
            const ghostSprite = this.scene.add.image(worldX, worldY, 'tile-ghost-claim')
                .setOrigin(0.5, 1)
                .setDepth(footprintCol + footprintRow + tileHeight * HEIGHT_DEPTH_BIAS + LAYER_GHOST_TILE)
                .setTint(isValid ? 0x88ff88 : 0xff4444);
            this._ghostTileSprites.push(ghostSprite);
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
            for (const { col: fieldCol, row: fieldRow } of candidates) {
                if (!this._isValidGhostFieldBlock(fieldCol, fieldRow, anchorH)) continue;
                for (const [deltaCol, deltaRow] of FOOTPRINT) {
                    const tileCol    = fieldCol + deltaCol;
                    const tileRow    = fieldRow + deltaRow;
                    const tile       = this.tileMap.getTile(tileCol, tileRow);
                    const tileHeight = tile ? tile.height : 0;
                    const { x: worldX, y: worldY } = tileToWorld(tileCol, tileRow, tileHeight);
                    const ghostSprite = this.scene.add.image(worldX, worldY, 'tile-ghost-claim')
                        .setOrigin(0.5, 1)
                        .setDepth(tileCol + tileRow + tileHeight * HEIGHT_DEPTH_BIAS + LAYER_GHOST_TILE);
                    this._ghostTileSprites.push(ghostSprite);
                }
            }
        } else if (config.claimsTileType === 'FOREST') {
            // Lumbermill: preview FOREST tiles within radius 2
            for (let tileCol = col - 2; tileCol <= col + 3; tileCol++) {
                for (let tileRow = row - 2; tileRow <= row + 3; tileRow++) {
                    const tile = this.tileMap.getTile(tileCol, tileRow);
                    if (!tile || tile.type !== 'FOREST' || tile.ownedBy) continue;
                    const distCol = Math.max(0, col - tileCol, tileCol - (col + 1));
                    const distRow = Math.max(0, row - tileRow, tileRow - (row + 1));
                    if (distCol + distRow < 1 || distCol + distRow > 2) continue;

                    const tileHeight = tile.height;
                    const { x: worldX, y: worldY } = tileToWorld(tileCol, tileRow, tileHeight);
                    const ghostSprite = this.scene.add.image(worldX, worldY, 'tile-ghost-claim')
                        .setOrigin(0.5, 1)
                        .setDepth(tileCol + tileRow + tileHeight * HEIGHT_DEPTH_BIAS + LAYER_GHOST_TILE);
                    this._ghostTileSprites.push(ghostSprite);
                }
            }
        }
    }

    _isValidGhostFieldBlock(fieldCol, fieldRow, requiredHeight = 0) {
        for (const [deltaCol, deltaRow] of FOOTPRINT) {
            const tile = this.tileMap.getTile(fieldCol + deltaCol, fieldRow + deltaRow);
            if (!tile) return false;
            if (tile.type !== 'GRASS') return false;
            if (tile.buildingId || tile.isField || tile.ownedBy || tile.isRoad) return false;
            if (tile.isRamp) return false;
            if (tile.height !== requiredHeight) return false;
        }
        return true;
    }

    // ─── Building selection overlay ────────────────────────────────────────────

    _showSelectionOverlay(building) {
        const config      = BUILDING_CONFIGS[building.configId];
        const anchorTile  = this.tileMap.getTile(building.col, building.row);
        const anchorH     = anchorTile ? anchorTile.height : 0;
        const { x, y }   = tileToWorld(building.col, building.row, anchorH);
        if (!this._selectionOverlay) {
            this._selectionOverlay = this.scene.add.image(x, y, config.textureKey)
                .setOrigin(0.5, 1)
                .setAlpha(0.45)
                .setTint(0x44aaff)
                .setDepth(DEPTH_SELECTION_OVERLAY);
        } else {
            this._selectionOverlay
                .setTexture(config.textureKey)
                .setPosition(x, y)
                .setVisible(true);
        }
    }

    _clearSelectionOverlay() {
        if (this._selectionOverlay) this._selectionOverlay.setVisible(false);
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
