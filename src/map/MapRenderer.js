import * as Phaser from 'phaser';
import { TILE_TYPES } from '../data/TileTypes.js';
import { MAP_SIZE } from './TileMap.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { DEPTH_TILE_HOVER, LAYER_TILE_SELECT, LAYER_FIELD, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { FOG_HIDDEN, FOG_BORDER, FOG_VISIBLE } from '../systems/FogOfWarSystem.js';

export const TILE_W = 64;
export const TILE_H = 32;
// Extra height for the depth faces drawn below the diamond.
// Spritesheet source: 16px diamond + 8px sides, scaled 2× → 32px diamond + 16px sides.
export const TILE_DEPTH = 16;
// Vertical pixel offset per height level for objects on the surface.
export const HEIGHT_STEP = 16;

// World origin — top corner of the map diamond
// originX centres the diamond horizontally: map spans from -MAP_SIZE*HALF_W to +MAP_SIZE*HALF_W
export const ORIGIN_X = 480;
export const ORIGIN_Y = 60;

/**
 * Convert tile [col, row] to world (screen) position.
 * The returned point is the BOTTOM-CENTER of the tile's top-diamond face,
 * matching sprite origin (0.5, 1.0).
 *
 * height > 0 raises the returned Y by height * HEIGHT_STEP, so objects placed
 * on elevated surfaces (buildings, villagers, highlights) sit at the correct
 * screen position.  Tile sprites themselves use height=0 — their taller canvas
 * texture visually lifts the diamond without moving the anchor.
 */
export function tileToWorld(col, row, height = 0) {
    return {
        x: (col - row) * (TILE_W / 2) + ORIGIN_X,
        y: (col + row) * (TILE_H / 2) + ORIGIN_Y + TILE_H - height * HEIGHT_STEP,
    };
}

/** Returns the texture key for a tile, incorporating height. */
function tileTextureKey(tile) {
    if (tile.isField) return 'tile-field';
    if (tile.isRoad)  return `tile-road-h${tile.height}`;
    const base = TILE_TYPES[tile.type].textureKey; // e.g. 'tile-grass'
    return `${base}-h${tile.height}`;
}

/**
 * Convert world (pointer) position to the nearest tile [col, row].
 * Returns null if out of map bounds.
 */
export function worldToTile(worldX, worldY) {
    const dx = worldX - ORIGIN_X;
    const dy = worldY - ORIGIN_Y;

    const col = Math.round((dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2);
    const row = Math.round((dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2);

    if (col < 0 || col >= MAP_SIZE || row < 0 || row >= MAP_SIZE) return null;
    return { col, row };
}

export class MapRenderer {
    constructor(scene, tileMap) {
        this.scene = scene;
        this.tileMap = tileMap;

        // tileSprites[row][col] = Phaser Image
        this.tileSprites   = [];
        // flowerSprites[row][col] = Phaser Image | undefined (only for tiles with flowerVariant)
        this.flowerSprites = [];

        this._highlightSprite  = null;
        this._selectedSprites  = [];   // array — selection can span multiple tiles

        this._fogSystem = null;

        this._render();
        this._createOverlays();
        this._bindEvents();
    }

    _render() {
        // Render in row+col order so depth is correct from the start
        const order = [];
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                order.push({ col, row, depth: col + row });
            }
        }
        order.sort((a, b) => a.depth - b.depth);

        for (let row = 0; row < MAP_SIZE; row++) {
            this.tileSprites[row]   = [];
            this.flowerSprites[row] = [];
        }

        for (const { col, row } of order) {
            const tile    = this.tileMap.getTile(col, row);
            const texKey  = tileTextureKey(tile);
            // Tile sprites anchor at ground level (height=0); the taller canvas
            // for elevated tiles makes the diamond appear higher on screen.
            const { x, y } = tileToWorld(col, row, 0);
            // Slight depth boost per height level so elevated tiles sort above
            // same col+row ground tiles at cliff edges.
            const depth = col + row + tile.height * HEIGHT_DEPTH_BIAS;

            const img = this.scene.add.image(x, y, texKey)
                .setOrigin(0.5, 1)
                .setDepth(depth);
            if (tile.isRamp) img.setTint(0xffcc44); // golden tint distinguishes ramps

            // Store col/row on the sprite for fast event handler reads
            img.setData({ col, row });

            // Diamond-shaped hit polygon in the image's local coordinate space.
            // Tile textures are 64×64: top 16px is decoration, diamond occupies y=16–47.
            const hw   = TILE_W / 2;
            const hh   = TILE_H / 2;
            const deco = TILE_DEPTH; // 16px decoration above the diamond (8px source × 2)
            const poly = new Phaser.Geom.Polygon([
                hw,     deco,
                TILE_W, hh + deco,
                hw,     TILE_H + deco,
                0,      hh + deco,
            ]);
            img.setInteractive(poly, Phaser.Geom.Polygon.Contains);

            img.on('pointerover', () => {
                GameEvents.emit(EventNames.TILE_HOVERED, { col, row });
            });

            img.on('pointerdown', (pointer) => {
                if (pointer.rightButtonDown()) return; // right-click handled at scene level
                GameEvents.emit(EventNames.TILE_SELECTED, { col, row, tile });
            });

            this.tileSprites[row][col] = img;

            if (tile.flowerVariant !== null) {
                // Use h0 texture always; shift up by height levels + wall band height
                // so the flower diamond aligns with the grass diamond face.
                const fy = y - tile.height * HEIGHT_STEP - TILE_DEPTH - 8;
                const flower = this.scene.add.image(x, fy, `tile-flower-v${tile.flowerVariant}-h0`)
                    .setOrigin(0.5, 1)
                    .setDepth(depth + LAYER_FIELD)
                    .setVisible(false); // fog controls visibility; shown in refreshFogTile
                this.flowerSprites[row][col] = flower;
            }
        }
    }

    _createOverlays() {
        this._highlightSprite = this.scene.add.image(0, 0, 'tile-highlight')
            .setOrigin(0.5, 1)
            .setDepth(DEPTH_TILE_HOVER)
            .setVisible(false);

        this._roadGhostSprite = this.scene.add.image(0, 0, 'tile-road-h0')
            .setOrigin(0.5, 1)
            .setDepth(DEPTH_TILE_HOVER)
            .setVisible(false)
            .setAlpha(0.75);
    }

    _bindEvents() {
        this._buildMode = false;
        this._roadMode  = false;

        GameEvents.on(EventNames.BUILD_MODE_ENTER, () => {
            this._buildMode = true;
            this._highlightSprite.setVisible(false);
        });
        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => {
            this._buildMode = false;
        });

        GameEvents.on(EventNames.ROAD_MODE_ENTER, () => {
            this._roadMode = true;
            this._highlightSprite.setVisible(false);
        });
        GameEvents.on(EventNames.ROAD_MODE_EXIT, () => {
            this._roadMode = false;
            this.hideRoadGhost();
        });

        GameEvents.on(EventNames.TILE_HOVERED, ({ col, row }) => {
            if (this._buildMode || this._roadMode) return;
            this.highlightTile(col, row);
        });

        // TILE_SELECTED is handled by Game.js which calls selectArea() with the
        // correct tile list (building footprint + claimed tiles, or single tile).
        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this.clearSelection();
        });

        GameEvents.on(EventNames.FOG_UPDATED, ({ changes }) => {
            for (const { col, row } of changes) {
                this.refreshFogTile(col, row);
            }
        });

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED, ({ clearedTiles }) => {
            for (const { col, row } of clearedTiles) {
                this.refreshFogTile(col, row);
            }
        });
    }

    // ─── Fog of War ────────────────────────────────────────────────────────────

    /**
     * Connects the fog system and performs the initial full-map fog paint.
     * Must be called after MapRenderer is constructed and before the first frame.
     */
    setFogSystem(fogSystem) {
        this._fogSystem = fogSystem;
        this.updateAllFog();
    }

    /** Refreshes fog overlays for every tile — called once on init. */
    updateAllFog() {
        if (!this._fogSystem) return;
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                this.refreshFogTile(col, row);
            }
        }
    }

    /**
     * Updates a single tile's visibility and tint based on its fog state.
     * - hidden : tile sprite hidden (dark background shows through)
     * - border : grass texture + grey tint (shape hint, terrain type concealed)
     * - visible: real texture restored, tint cleared, interactivity re-enabled
     */
    refreshFogTile(col, row) {
        if (!this._fogSystem) return;

        const state  = this._fogSystem.getState(col, row);
        const tile   = this.tileMap.getTile(col, row);
        const sprite = this.tileSprites[row]?.[col];
        if (!tile || !sprite) return;

        const flower = this.flowerSprites[row]?.[col];
        const flowerVisible = flower && !tile.isRoad && !tile.buildingId && !tile.isField;

        if (state === FOG_VISIBLE) {
            sprite.setVisible(true);
            sprite.setInteractive(
                new Phaser.Geom.Polygon([
                    TILE_W / 2, TILE_DEPTH,
                    TILE_W,     TILE_H / 2 + TILE_DEPTH,
                    TILE_W / 2, TILE_H + TILE_DEPTH,
                    0,          TILE_H / 2 + TILE_DEPTH,
                ]),
                Phaser.Geom.Polygon.Contains
            );
            this.refreshTile(col, row);
            if (flower) { flower.setVisible(flowerVisible).clearTint(); }

        } else if (state === FOG_BORDER) {
            sprite.setVisible(true);
            sprite.setTexture(`tile-grass-h${tile.height}`);
            sprite.setTint(0x888888);
            sprite.disableInteractive();
            if (flower) { flower.setVisible(flowerVisible).setTint(0x888888); }

        } else { // FOG_HIDDEN
            sprite.setVisible(false);
            sprite.disableInteractive();
            if (flower) { flower.setVisible(false); }
        }
    }

    highlightTile(col, row) {
        const tile = this.tileMap.getTile(col, row);
        const h    = tile ? tile.height : 0;
        const { x, y } = tileToWorld(col, row, h);
        this._highlightSprite.setPosition(x, y).setVisible(true);
    }

    /**
     * Highlight an arbitrary set of tiles as the current selection.
     * Replaces any previous selection.
     */
    selectArea(positions) {
        this.clearSelection();
        for (const { col, row } of positions) {
            const tile = this.tileMap.getTile(col, row);
            const h    = tile ? tile.height : 0;
            const { x, y } = tileToWorld(col, row, h);
            // Depth just above each tile but below buildings (col+row+2.5).
            // Building footprint highlights will be mostly hidden under the building sprite;
            // field/forest tile highlights are fully visible. The building gets its own
            // highlight overlay at 99999 from BuildingRenderer.
            const sprite = this.scene.add.image(x, y, 'tile-selected')
                .setOrigin(0.5, 1)
                .setDepth(col + row + LAYER_TILE_SELECT);
            this._selectedSprites.push(sprite);
        }
    }

    clearSelection() {
        for (const s of this._selectedSprites) s.destroy();
        this._selectedSprites = [];
    }

    /** Show a ghost road tile at (col, row) tinted green/red for valid/invalid. */
    showRoadGhost(col, row, valid) {
        const tile = this.tileMap.getTile(col, row);
        if (!tile) { this.hideRoadGhost(); return; }
        const { x, y } = tileToWorld(col, row, tile.height);
        this._roadGhostSprite
            .setTexture(`tile-road-h${tile.height}`)
            .setPosition(x, y)
            .setTint(valid ? 0x00ff88 : 0xff4444)
            .setVisible(true);
    }

    hideRoadGhost() {
        this._roadGhostSprite.setVisible(false);
    }

    /** Refresh the texture of a single tile (e.g. after it becomes a field or road). */
    refreshTile(col, row) {
        // Fog-covered tiles must not have their real texture restored — fog controls appearance
        if (this._fogSystem && this._fogSystem.getState(col, row) !== FOG_VISIBLE) return;

        const tile   = this.tileMap.getTile(col, row);
        const sprite = this.tileSprites[row][col];
        sprite.setTexture(tileTextureKey(tile));
        if (tile.banditClaimed && !tile.banditCampTile) {
            // Red-orange tint marks visible bandit territory
            sprite.setTint(0xaa4422);
        } else if (tile.isRamp && !tile.isField) {
            sprite.setTint(0xffcc44);
        } else {
            sprite.clearTint();
        }

        const flower = this.flowerSprites[row]?.[col];
        if (flower) {
            flower.setVisible(!tile.isRoad && !tile.buildingId && !tile.isField);
        }
    }

    destroy() {
        GameEvents.off(EventNames.TILE_HOVERED);
        GameEvents.off(EventNames.TILE_SELECTED);
        GameEvents.off(EventNames.TILE_DESELECTED);
    }
}
