import { TILE_TYPE_POOL, TILE_TYPES } from '../data/TileTypes.js';

export const MAP_SIZE       = 20;
export const MAX_TILE_HEIGHT = 3;   // maximum elevation level (0 = flat, 3 = peak)

// Heightmap generation tuning
const HILL_RADIUS    = 4;   // Manhattan radius of each dome hill
const HILL_COUNT_MIN = 3;   // minimum number of hills per map
const HILL_COUNT_MAX = 5;   // maximum number of hills per map

export class TileMap {
    constructor() {
        // grid[row][col] = tile record
        this.grid = [];
    }

    generate() {
        // Phase 1: weighted random fill
        for (let row = 0; row < MAP_SIZE; row++) {
            this.grid[row] = [];
            for (let col = 0; col < MAP_SIZE; col++) {
                const typeId = TILE_TYPE_POOL[Math.floor(Math.random() * TILE_TYPE_POOL.length)];
                this.grid[row][col] = this._makeTile(col, row, typeId);
            }
        }

        // Phase 2: smoothing pass — reduce isolated single-tile outliers
        // A tile that has 3+ neighbours of a different type gets replaced by the majority type
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                const tile = this.grid[row][col];
                const neighbours = this.getNeighbors(col, row);
                const counts = {};
                for (const n of neighbours) {
                    counts[n.type] = (counts[n.type] || 0) + 1;
                }
                // If 3 or more neighbours share the same non-GRASS type, absorb
                for (const [type, count] of Object.entries(counts)) {
                    if (type !== tile.type && count >= 3) {
                        tile.type = type;
                        break;
                    }
                }
            }
        }

        // Phase 3: heightmap
        this._generateHeightmap();

        // Phase 4: ramp placement
        this._placeRamps();

        return this;
    }

    getTile(col, row) {
        if (!this.isInBounds(col, row)) return null;
        return this.grid[row][col];
    }

    // 4-directional neighbours (up/down/left/right)
    getNeighbors(col, row) {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const result = [];
        for (const [dc, dr] of dirs) {
            const t = this.getTile(col + dc, row + dr);
            if (t) result.push(t);
        }
        return result;
    }

    // All 8 neighbours (includes diagonals) — used by BuildSystem for adjacency checks
    getNeighbors8(col, row) {
        const result = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const t = this.getTile(col + dc, row + dr);
                if (t) result.push(t);
            }
        }
        return result;
    }

    isInBounds(col, row) {
        return col >= 0 && col < MAP_SIZE && row >= 0 && row < MAP_SIZE;
    }

    _makeTile(col, row, typeId) {
        return {
            col,
            row,
            type: typeId,
            buildingId: null,
            isField: false,
            ownedBy: null,   // uid of building that claimed this tile for production
            height: 0,       // elevation 0–3
            isRamp: false,   // true when GRASS tile transitions height down to a neighbor
        };
    }

    // ── Heightmap ──────────────────────────────────────────────────────────────

    _generateHeightmap() {
        const hillCount = HILL_COUNT_MIN + Math.floor(Math.random() * (HILL_COUNT_MAX - HILL_COUNT_MIN + 1));

        for (let h = 0; h < hillCount; h++) {
            const hcol = 1 + Math.floor(Math.random() * (MAP_SIZE - 2));
            const hrow = 1 + Math.floor(Math.random() * (MAP_SIZE - 2));

            for (let row = 0; row < MAP_SIZE; row++) {
                for (let col = 0; col < MAP_SIZE; col++) {
                    const dist = Math.abs(col - hcol) + Math.abs(row - hrow);
                    if (dist >= HILL_RADIUS) continue;
                    const contribution = Math.round(MAX_TILE_HEIGHT * (1 - dist / HILL_RADIUS));
                    const tile = this.grid[row][col];
                    tile.height = Math.min(MAX_TILE_HEIGHT, Math.max(tile.height, contribution));
                }
            }
        }

        // Slope-limiting: no adjacent tile may differ in height by more than 1
        let changed = true;
        while (changed) {
            changed = false;
            for (let row = 0; row < MAP_SIZE; row++) {
                for (let col = 0; col < MAP_SIZE; col++) {
                    const tile = this.grid[row][col];
                    for (const n of this.getNeighbors(col, row)) {
                        if (tile.height - n.height > 1) {
                            tile.height = n.height + 1;
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    _placeRamps() {
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                const tile = this.grid[row][col];
                // Only GRASS tiles at height > 0 can be ramps
                if (tile.type !== 'GRASS' || tile.height === 0) continue;
                // Mark as ramp if any 4-dir GRASS neighbor is one level lower
                for (const n of this.getNeighbors(col, row)) {
                    if (n.type === 'GRASS' && n.height === tile.height - 1) {
                        tile.isRamp = true;
                        break;
                    }
                }
            }
        }
    }
}
