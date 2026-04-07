import { TILE_TYPE_POOL, TILE_TYPES } from '../data/TileTypes.js';

export const MAP_SIZE = 20;

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
        };
    }
}
