import { TILE_TYPES } from '../data/TileTypes.js';
import { MAP_SIZE } from './TileMap.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { DEPTH_TILE_HOVER, LAYER_TILE_SELECT } from '../config/DepthLayers.js';

export const TILE_W = 64;
export const TILE_H = 32;
// Extra height for the depth faces drawn below the diamond
export const TILE_DEPTH = 16;

// World origin — top corner of the map diamond
// originX centres the diamond horizontally: map spans from -MAP_SIZE*HALF_W to +MAP_SIZE*HALF_W
export const ORIGIN_X = 480;
export const ORIGIN_Y = 60;

/**
 * Convert tile [col, row] to world (screen) position.
 * The returned point is the BOTTOM-CENTER of the tile's top-diamond face,
 * matching sprite origin (0.5, 1.0).
 */
export function tileToWorld(col, row) {
    return {
        x: (col - row) * (TILE_W / 2) + ORIGIN_X,
        y: (col + row) * (TILE_H / 2) + ORIGIN_Y + TILE_H,
    };
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
        this.tileSprites = [];

        this._highlightSprite  = null;
        this._selectedSprites  = [];   // array — selection can span multiple tiles

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
            this.tileSprites[row] = [];
        }

        for (const { col, row, depth } of order) {
            const tile    = this.tileMap.getTile(col, row);
            const texKey  = TILE_TYPES[tile.type].textureKey;
            const { x, y } = tileToWorld(col, row);

            const img = this.scene.add.image(x, y, texKey)
                .setOrigin(0.5, 1)
                .setDepth(depth);

            // Store col/row on the sprite for fast event handler reads
            img.setData({ col, row });

            // Diamond-shaped hit polygon (relative to the image's origin top-left)
            // The diamond top face spans the full tile width × height
            const hw = TILE_W / 2;
            const hh = TILE_H / 2;
            const poly = new Phaser.Geom.Polygon([
                hw, 0,
                TILE_W, hh,
                hw, TILE_H,
                0, hh,
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
        }
    }

    _createOverlays() {
        this._highlightSprite = this.scene.add.image(0, 0, 'tile-highlight')
            .setOrigin(0.5, 1)
            .setDepth(DEPTH_TILE_HOVER)
            .setVisible(false);
    }

    _bindEvents() {
        GameEvents.on(EventNames.TILE_HOVERED, ({ col, row }) => {
            this.highlightTile(col, row);
        });

        // TILE_SELECTED is handled by Game.js which calls selectArea() with the
        // correct tile list (building footprint + claimed tiles, or single tile).
        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this.clearSelection();
        });
    }

    highlightTile(col, row) {
        const { x, y } = tileToWorld(col, row);
        this._highlightSprite.setPosition(x, y).setVisible(true);
    }

    /**
     * Highlight an arbitrary set of tiles as the current selection.
     * Replaces any previous selection.
     */
    selectArea(positions) {
        this.clearSelection();
        for (const { col, row } of positions) {
            const { x, y } = tileToWorld(col, row);
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

    /** Refresh the texture of a single tile (e.g. after it becomes a field). */
    refreshTile(col, row) {
        const tile   = this.tileMap.getTile(col, row);
        const texKey = tile.isField ? 'tile-field' : TILE_TYPES[tile.type].textureKey;
        this.tileSprites[row][col].setTexture(texKey);
    }

    destroy() {
        GameEvents.off(EventNames.TILE_HOVERED);
        GameEvents.off(EventNames.TILE_SELECTED);
        GameEvents.off(EventNames.TILE_DESELECTED);
    }
}
