import { MAP_SIZE, VIS_MIN, VIS_MAX } from '../map/TileMap.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export const FOG_HIDDEN  = 0;
export const FOG_BORDER  = 1;
export const FOG_VISIBLE = 2;

// VIS_MIN / VIS_MAX are defined in TileMap.js and re-exported here for other consumers
export { VIS_MIN, VIS_MAX };

// Border zone: Chebyshev radius around the visible area boundary
const BORDER_RADIUS = 2;

// Exploration reveal radius applied around each footprint tile when a building is placed
const REVEAL_RADIUS = 3;

export class FogOfWarSystem {
    constructor() {
        // Flat Uint8Array indexed by row * MAP_SIZE + col.
        // Values: FOG_HIDDEN(0), FOG_BORDER(1), FOG_VISIBLE(2)
        this._fog = new Uint8Array(MAP_SIZE * MAP_SIZE);
        this._initialize();
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Returns the fog state for a tile. Out-of-bounds positions return FOG_HIDDEN. */
    getState(col, row) {
        if (col < 0 || col >= MAP_SIZE || row < 0 || row >= MAP_SIZE) return FOG_HIDDEN;
        return this._fog[row * MAP_SIZE + col];
    }

    /** Returns true only when the tile is fully visible (not hidden and not border). */
    isVisible(col, row) {
        return this.getState(col, row) === FOG_VISIBLE;
    }

    /**
     * Reveals all tiles within Chebyshev `radius` of (col, row), then expands
     * the border zone around any newly-visible tiles.
     * Emits FOG_UPDATED with all changed tile states.
     */
    revealAround(col, row, radius = REVEAL_RADIUS) {
        const changes = [];

        // Mark tiles within the Chebyshev radius as visible
        for (let r = row - radius; r <= row + radius; r++) {
            for (let c = col - radius; c <= col + radius; c++) {
                if (c < 0 || c >= MAP_SIZE || r < 0 || r >= MAP_SIZE) continue;
                const idx = r * MAP_SIZE + c;
                if (this._fog[idx] !== FOG_VISIBLE) {
                    this._fog[idx] = FOG_VISIBLE;
                    changes.push({ col: c, row: r, state: 'visible' });
                }
            }
        }

        if (changes.length === 0) return;

        // Expand border zone: scan the region just outside the reveal area
        const scanMinC = Math.max(0, col - radius - BORDER_RADIUS);
        const scanMaxC = Math.min(MAP_SIZE - 1, col + radius + BORDER_RADIUS);
        const scanMinR = Math.max(0, row - radius - BORDER_RADIUS);
        const scanMaxR = Math.min(MAP_SIZE - 1, row + radius + BORDER_RADIUS);

        for (let r = scanMinR; r <= scanMaxR; r++) {
            for (let c = scanMinC; c <= scanMaxC; c++) {
                const idx = r * MAP_SIZE + c;
                if (this._fog[idx] !== FOG_HIDDEN) continue;
                if (this._isAdjacentToVisible(c, r)) {
                    this._fog[idx] = FOG_BORDER;
                    changes.push({ col: c, row: r, state: 'border' });
                }
            }
        }

        GameEvents.emit(EventNames.FOG_UPDATED, { changes });
    }

    /**
     * Reveals a radius-3 Chebyshev area around each tile of a 2×2 building footprint.
     * Called after a building is successfully placed.
     */
    revealAroundFootprint(anchorCol, anchorRow) {
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            this.revealAround(anchorCol + dc, anchorRow + dr, REVEAL_RADIUS);
        }
    }

    // ─── Initialization ────────────────────────────────────────────────────────

    _initialize() {
        // Reveal the starting 12×12 area
        for (let r = VIS_MIN; r <= VIS_MAX; r++) {
            for (let c = VIS_MIN; c <= VIS_MAX; c++) {
                this._fog[r * MAP_SIZE + c] = FOG_VISIBLE;
            }
        }

        // Compute the initial border zone for all hidden tiles adjacent to visible ones
        for (let r = 0; r < MAP_SIZE; r++) {
            for (let c = 0; c < MAP_SIZE; c++) {
                if (this._fog[r * MAP_SIZE + c] !== FOG_HIDDEN) continue;
                if (this._isAdjacentToVisible(c, r)) {
                    this._fog[r * MAP_SIZE + c] = FOG_BORDER;
                }
            }
        }
        // No FOG_UPDATED emitted here — MapRenderer reads state directly via updateAllFog()
    }

    /** Returns true if (col, row) is within Chebyshev BORDER_RADIUS of any FOG_VISIBLE tile. */
    _isAdjacentToVisible(col, row) {
        for (let dr = -BORDER_RADIUS; dr <= BORDER_RADIUS; dr++) {
            for (let dc = -BORDER_RADIUS; dc <= BORDER_RADIUS; dc++) {
                const nc = col + dc;
                const nr = row + dr;
                if (nc < 0 || nc >= MAP_SIZE || nr < 0 || nr >= MAP_SIZE) continue;
                if (this._fog[nr * MAP_SIZE + nc] === FOG_VISIBLE) return true;
            }
        }
        return false;
    }
}
