import * as Phaser from 'phaser';
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
        // Map<uid, Phaser.GameObjects.Image> for "no workers assigned" warning icons
        this._noWorkerSprites = new Map();
        // Map<uid, Phaser.GameObjects.Image> for "resource depleted" warning icons
        this._depletedSprites = new Map();
        // Single sprite for the next pillage target (moved between buildings)
        this._pillageTargetSprite = null;
        this._pillageTargetTween  = null;
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
            this._refreshNoWorkerIcons();
            this._refreshDepletedIcons();
        });

        GameEvents.on(EventNames.BUILDING_CONNECTIVITY_CHANGED, () => {
            this._refreshNoRoadIcons();
            this._refreshNoWorkerIcons();
        });

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid, fieldTiles }) => {
            this._removeBuilding(uid, fieldTiles ?? []);
        });

        GameEvents.on(EventNames.VILLAGERS_CHANGED, () => {
            this._updateWorkerTiles();
            this._refreshNoWorkerIcons();
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

        GameEvents.on(EventNames.VILLAGER_DEPARTED, ({ buildingUid, reason }) => {
            // Disconnection departures are already signalled by the no-road icon;
            // only show the orange starvation icon for hunger-caused departures.
            if (reason !== 'disconnected') {
                const b = this._buildSystem?.getBuilding(buildingUid);
                if (b) this._addStarvationIcon(b);
            }
        });

        GameEvents.on(EventNames.TILE_DEPLETED, ({ buildingUid }) => {
            this._refreshDepletedIcons();
            this._refreshNoWorkerIcons();
        });

        GameEvents.on(EventNames.BANDIT_PILLAGE_TARGET, ({ buildingUid }) => {
            this._setPillageTargetIcon(buildingUid);
        });

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED, () => {
            this._setPillageTargetIcon(null);
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
            .setDepth(depth)
            .setAlpha(0);

        this._buildingSprites.set(building.uid, img);
        if (this._ghost) this._ghost.setVisible(false);
        this._clearGhostTiles();
        this._spawnPlacementEffect(x, y, depth);

        // Building emerges from the dust cloud
        this.scene.time.delayedCall(180, () => {
            this.scene.tweens.add({ targets: img, alpha: 1, duration: 180, ease: 'quad.out' });
        });
        this.scene.sound.play('sfx-build', { volume: 0.7 });

        // Farm fields: 4 individual tile sprites per 2×2 block
        for (const block of building.fieldTiles) {
            for (const [dc, dr] of FOOTPRINT) {
                this._addFieldSprite(block.col + dc, block.row + dr);
            }
        }
    }

    _spawnPlacementEffect(x, y, buildingDepth) {
        const depth = buildingDepth + 10;

        // Dust cloud — four emitters at distinct positions, small enough to stay separate
        // Small end scale keeps individual puffs readable rather than merging into one blob
        const dustShared = {
            speed:    { min: 16, max: 42 },
            gravityY: -8,
            alpha:    { start: 0.82, end: 0, ease: 'quad.in' },
            tint:     [0xbcac94, 0xac9c84, 0xccbca4, 0xd0c0a8],
        };

        // Two low base puffs spreading outward from the sides
        const dustL = this.scene.add.particles(x - 30, y - 10, 'particle-dust', {
            ...dustShared,
            angle:    { min: 225, max: 265 },
            scale:    { start: 0.9, end: 2.0, ease: 'sine.out' },
            lifespan: { min: 500, max: 780 },
            quantity: 4, stopAfter: 4,
        });
        dustL.setDepth(depth);

        const dustR = this.scene.add.particles(x + 26, y - 10, 'particle-dust', {
            ...dustShared,
            angle:    { min: 275, max: 315 },
            scale:    { start: 0.9, end: 2.0, ease: 'sine.out' },
            lifespan: { min: 500, max: 780 },
            delay:    { min: 40, max: 90 },
            quantity: 4, stopAfter: 4,
        });
        dustR.setDepth(depth);

        // Two taller central puffs rising above the building
        const dustC1 = this.scene.add.particles(x - 8, y - 22, 'particle-dust', {
            ...dustShared,
            angle:    { min: 255, max: 280 },
            scale:    { start: 1.0, end: 2.4, ease: 'sine.out' },
            lifespan: { min: 620, max: 950 },
            delay:    { min: 30, max: 80 },
            quantity: 5, stopAfter: 5,
        });
        dustC1.setDepth(depth);

        const dustC2 = this.scene.add.particles(x + 10, y - 26, 'particle-dust', {
            ...dustShared,
            angle:    { min: 260, max: 285 },
            scale:    { start: 1.0, end: 2.2, ease: 'sine.out' },
            lifespan: { min: 580, max: 900 },
            delay:    { min: 70, max: 140 },
            quantity: 4, stopAfter: 4,
        });
        dustC2.setDepth(depth);

        this.scene.time.delayedCall(1200, () => {
            dustL.destroy(); dustR.destroy(); dustC1.destroy(); dustC2.destroy();
        });

        // Debris chips — upward arc, tumble, fall fast
        // NOTE: avoid random:true on scale — it picks start between 0..max, making most chips invisible
        const chips = this.scene.add.particles(x, y - 18, 'particle-chip', {
            emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 18) },
            angle:    { min: 220, max: 320 },
            speed:    { min: 90, max: 190 },
            gravityY: 430,
            scaleX:   { start: 1.4, end: 0.2 },
            scaleY:   { start: 0.7, end: 0.2 },
            alpha:    { start: 1.0, end: 0 },
            rotate:   { min: 0, max: 360 },
            lifespan: { min: 300, max: 520 },
            tint:     [0x5a4532, 0x6b5540, 0x4a3828, 0x7a6248, 0x3e2e1e],
            quantity: 24,
            stopAfter: 24,
        });
        chips.setDepth(depth);
        this.scene.time.delayedCall(700, () => chips.destroy());
    }

    _spawnDemolitionEffect(x, y, buildingDepth) {
        const depth = buildingDepth + 10;

        // Collapse dust — grayer than construction, wider spread, lingers longer
        const demoShared = {
            speed:    { min: 18, max: 50 },
            gravityY: -6,
            alpha:    { start: 0.88, end: 0, ease: 'quad.in' },
            tint:     [0xb0a898, 0xa09888, 0xc0b8a8, 0xd0c8b8],
        };

        const demoL = this.scene.add.particles(x - 36, y - 10, 'particle-dust', {
            ...demoShared,
            angle:    { min: 220, max: 265 },
            scale:    { start: 1.0, end: 2.4, ease: 'sine.out' },
            lifespan: { min: 650, max: 1000 },
            quantity: 5, stopAfter: 5,
        });
        demoL.setDepth(depth);

        const demoR = this.scene.add.particles(x + 30, y - 10, 'particle-dust', {
            ...demoShared,
            angle:    { min: 275, max: 320 },
            scale:    { start: 1.0, end: 2.4, ease: 'sine.out' },
            lifespan: { min: 650, max: 1000 },
            delay:    { min: 30, max: 70 },
            quantity: 5, stopAfter: 5,
        });
        demoR.setDepth(depth);

        const demoC1 = this.scene.add.particles(x - 10, y - 26, 'particle-dust', {
            ...demoShared,
            angle:    { min: 253, max: 278 },
            scale:    { start: 1.1, end: 2.8, ease: 'sine.out' },
            lifespan: { min: 800, max: 1300 },
            delay:    { min: 20, max: 60 },
            quantity: 6, stopAfter: 6,
        });
        demoC1.setDepth(depth);

        const demoC2 = this.scene.add.particles(x + 12, y - 30, 'particle-dust', {
            ...demoShared,
            angle:    { min: 258, max: 282 },
            scale:    { start: 1.1, end: 2.6, ease: 'sine.out' },
            lifespan: { min: 750, max: 1200 },
            delay:    { min: 60, max: 130 },
            quantity: 5, stopAfter: 5,
        });
        demoC2.setDepth(depth);

        this.scene.time.delayedCall(1600, () => {
            demoL.destroy(); demoR.destroy(); demoC1.destroy(); demoC2.destroy();
        });

        // Debris chips — collapse flies in all directions, not just upward
        const demoChips = this.scene.add.particles(x, y - 20, 'particle-chip', {
            emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 22) },
            angle:    { min: 160, max: 380 },
            speed:    { min: 110, max: 240 },
            gravityY: 460,
            scaleX:   { start: 1.6, end: 0.2 },
            scaleY:   { start: 0.8, end: 0.2 },
            alpha:    { start: 1.0, end: 0 },
            rotate:   { min: 0, max: 360 },
            lifespan: { min: 320, max: 580 },
            tint:     [0x6a5a48, 0x7a6a55, 0x58483a, 0x888070, 0x4a3c2e],
            quantity: 36,
            stopAfter: 36,
        });
        demoChips.setDepth(depth);
        this.scene.time.delayedCall(750, () => demoChips.destroy());
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

    _removeBuilding(uid, fieldTiles = []) {
        const img = this._buildingSprites.get(uid);
        if (img) {
            this._spawnDemolitionEffect(img.x, img.y, img.depth);
            this.scene.sound.play('sfx-destroy', { volume: 0.7 });
            img.destroy();
            this._buildingSprites.delete(uid);
        }

        // Destroy farm field sprites for all tiles in each released 2×2 field block
        for (const block of fieldTiles) {
            for (const [dc, dr] of FOOTPRINT) {
                const key = `${block.col + dc}_${block.row + dr}`;
                const sprite = this._fieldSprites.get(key);
                if (sprite) { sprite.destroy(); this._fieldSprites.delete(key); }
            }
        }

        // Destroy no-road connection icon
        const noRoad = this._noRoadSprites.get(uid);
        if (noRoad) { noRoad.destroy(); this._noRoadSprites.delete(uid); }

        // Destroy starvation departure icon
        const starving = this._starvationSprites.get(uid);
        if (starving) { starving.destroy(); this._starvationSprites.delete(uid); }

        // Destroy no-workers icon
        const noWorker = this._noWorkerSprites.get(uid);
        if (noWorker) { noWorker.destroy(); this._noWorkerSprites.delete(uid); }

        // Destroy depleted icon
        const depleted = this._depletedSprites.get(uid);
        if (depleted) { depleted.destroy(); this._depletedSprites.delete(uid); }
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

    // ─── No-workers icons ─────────────────────────────────────────────────────

    _isNoWorkersBuilding(building) {
        if (!building.isConnected) return false;
        if (building.assignedVillagers > 0) return false;
        const config = BUILDING_CONFIGS[building.configId];
        if (config.maxVillagers > 0) return !this._isBuildingDepleted(building);
        if (config.claimsTileType === 'GRASS')   return building.fieldTiles.length > 0;
        if (config.claimsTileType === 'FOREST')  return building.forestTiles.length > 0 && !this._isBuildingDepleted(building);
        return false;
    }

    _isBuildingDepleted(building) {
        let tiles;
        if (building.configId === 'LUMBERMILL') tiles = building.forestTiles;
        else if (building.configId === 'QUARRY')     tiles = building.rocksTiles;
        else if (building.configId === 'IRON_MINE')  tiles = building.ironTiles;
        else return false;
        if (!tiles || tiles.length === 0) return false;
        return tiles.every(ft => (this.tileMap.getTile(ft.col, ft.row)?.resources ?? 0) === 0);
    }

    _refreshNoWorkerIcons() {
        for (const s of this._noWorkerSprites.values()) s.destroy();
        this._noWorkerSprites.clear();
        if (!this._buildSystem) return;
        for (const building of this._buildSystem.placedBuildings.values()) {
            if (this._isNoWorkersBuilding(building)) this._addNoWorkerIcon(building);
        }
    }

    _addNoWorkerIcon(building) {
        const anchorTile = this.tileMap.getTile(building.col, building.row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }  = tileToWorld(building.col, building.row, anchorH);
        // +22px right of center (same slot as starvation — they never coexist)
        const sprite = this.scene.add.image(x + 22, y - 72, 'icon-no-workers')
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH_FLOATING_LABEL);
        this._noWorkerSprites.set(building.uid, sprite);
    }

    _refreshDepletedIcons() {
        for (const s of this._depletedSprites.values()) s.destroy();
        this._depletedSprites.clear();
        if (!this._buildSystem) return;
        for (const building of this._buildSystem.placedBuildings.values()) {
            if (this._isBuildingDepleted(building)) this._addDepletedIcon(building);
        }
    }

    _addDepletedIcon(building) {
        const anchorTile = this.tileMap.getTile(building.col, building.row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }  = tileToWorld(building.col, building.row, anchorH);
        // +44px right of center
        const sprite = this.scene.add.image(x + 44, y - 72, 'icon-depleted')
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH_FLOATING_LABEL);
        this._depletedSprites.set(building.uid, sprite);
    }

    // ─── Pillage target icon ───────────────────────────────────────────────────

    _setPillageTargetIcon(buildingUid) {
        if (this._pillageTargetTween) {
            this._pillageTargetTween.stop();
            this._pillageTargetTween = null;
        }

        if (!buildingUid) {
            if (this._pillageTargetSprite) this._pillageTargetSprite.setVisible(false);
            return;
        }

        const building = this._buildSystem?.getBuilding(buildingUid);
        if (!building) {
            if (this._pillageTargetSprite) this._pillageTargetSprite.setVisible(false);
            return;
        }

        const anchorTile = this.tileMap.getTile(building.col, building.row);
        const anchorH    = anchorTile ? anchorTile.height : 0;
        const { x, y }  = tileToWorld(building.col, building.row, anchorH);
        // Position left of icon-no-road (centred at x, y-72) to avoid overlap
        const ix = x - 22;
        const iy = y - 72;

        if (!this._pillageTargetSprite) {
            this._pillageTargetSprite = this.scene.add.image(ix, iy, 'icon-pillage')
                .setOrigin(0.5, 0.5)
                .setDepth(DEPTH_FLOATING_LABEL);
        } else {
            this._pillageTargetSprite.setPosition(ix, iy).setAlpha(1).setVisible(true);
        }

        this._pillageTargetTween = this.scene.tweens.add({
            targets:  this._pillageTargetSprite,
            alpha:    { from: 1, to: 0.3 },
            duration: 600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
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
