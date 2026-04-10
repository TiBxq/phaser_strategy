import { TILE_TYPES } from '../data/TileTypes.js';

export const MAP_SIZE        = 20;
export const MAX_TILE_HEIGHT = 3;   // maximum elevation level (0 = flat, 3 = peak)

// Heightmap generation tuning
const HILL_RADIUS    = 4;   // Manhattan radius of each dome hill
const HILL_COUNT_MIN = 3;   // minimum number of hills per map
const HILL_COUNT_MAX = 5;   // maximum number of hills per map

// Forest grove sizes (per BALANCE.md)
const GROVE_COASTAL_SIZE = 8;   // two coastal groves, 8 tiles each
const GROVE_INLAND_SIZE  = 12;  // one large inland grove, 12 tiles

// Scatter pass — extra tiles for visual variety (not part of balance-critical layout)
const SCATTER_GROVE_COUNT     = 3;  // number of small random forest patches
const SCATTER_GROVE_SIZE      = 4;  // tiles per scattered patch
const SCATTER_ROCKS_COUNT     = 8;  // extra individual rock tiles scattered across map

export class TileMap {
    constructor() {
        // grid[row][col] = tile record
        this.grid = [];
    }

    generate() {
        // Phase 1: fill all tiles with GRASS
        for (let row = 0; row < MAP_SIZE; row++) {
            this.grid[row] = [];
            for (let col = 0; col < MAP_SIZE; col++) {
                this.grid[row][col] = this._makeTile(col, row, 'GRASS');
            }
        }

        // Phase 2: heightmap
        this._generateHeightmap();

        // Phase 3: forest groves
        // Two coastal groves — accessible from the starting area (low col+row)
        this._placeGrove(2 + this._rng(0, 2), 2 + this._rng(0, 2), GROVE_COASTAL_SIZE);
        this._placeGrove(8 + this._rng(0, 2), 1 + this._rng(0, 2), GROVE_COASTAL_SIZE);
        // One large inland grove — requires expansion to reach
        this._placeGrove(11 + this._rng(0, 2), 10 + this._rng(0, 2), GROVE_INLAND_SIZE);

        // Phase 4: rock outcrops (guaranteed 2×2 ROCKS at uniform height)
        // First outcrop: near the starting area (col+row ≈ 12)
        this._placeOutcrop(4 + this._rng(0, 2), 6 + this._rng(0, 2));
        // Second outcrop: inland, requires exploration (col+row ≈ 27)
        this._placeOutcrop(13 + this._rng(0, 2), 12 + this._rng(0, 2));

        // Phase 5: scatter pass — small random forest patches + stray rock tiles
        this._scatter();

        // Phase 6: ramp placement
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
            resources: TILE_TYPES[typeId].initialResources,  // remaining harvestable units
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
                tile.isRamp = false;
                for (const n of this.getNeighbors(col, row)) {
                    if (n.type === 'GRASS' && n.height === tile.height - 1) {
                        tile.isRamp = true;
                        break;
                    }
                }
            }
        }
    }

    // ── Feature placement ──────────────────────────────────────────────────────

    /**
     * Grow a forest grove by BFS-expansion from a seed tile.
     * Only claims GRASS tiles; expands randomly through adjacent neighbors.
     */
    _placeGrove(seedCol, seedRow, targetSize) {
        const placed     = new Set();
        const candidates = new Set();

        const key = (c, r) => `${c},${r}`;

        if (this.isInBounds(seedCol, seedRow)) {
            candidates.add(key(seedCol, seedRow));
        }

        while (placed.size < targetSize && candidates.size > 0) {
            // Pick a random candidate
            const arr  = Array.from(candidates);
            const pick = arr[Math.floor(Math.random() * arr.length)];
            candidates.delete(pick);

            const [col, row] = pick.split(',').map(Number);
            const tile = this.getTile(col, row);
            if (!tile || tile.type !== 'GRASS') continue;

            tile.type      = 'FOREST';
            tile.resources = TILE_TYPES.FOREST.initialResources;
            placed.add(pick);

            // Add GRASS neighbors as expansion candidates
            for (const n of this.getNeighbors(col, row)) {
                const nk = key(n.col, n.row);
                if (!placed.has(nk) && n.type === 'GRASS') {
                    candidates.add(nk);
                }
            }
        }
    }

    /**
     * Place a guaranteed 2×2 ROCKS outcrop at (topCol, topRow).
     * All four tiles are set to the same height (minimum of the 2×2 block)
     * so a Quarry can always be placed on them without a mixed-height rejection.
     */
    _placeOutcrop(topCol, topRow) {
        // Clamp so the full 2×2 stays within map bounds
        const c0 = Math.min(topCol,     MAP_SIZE - 2);
        const r0 = Math.min(topRow,     MAP_SIZE - 2);

        // Determine the uniform height (minimum of existing heights)
        let minH = MAX_TILE_HEIGHT;
        for (let r = r0; r <= r0 + 1; r++) {
            for (let c = c0; c <= c0 + 1; c++) {
                const tile = this.getTile(c, r);
                if (tile) minH = Math.min(minH, tile.height);
            }
        }

        // Stamp the 2×2 block as ROCKS at uniform height
        for (let r = r0; r <= r0 + 1; r++) {
            for (let c = c0; c <= c0 + 1; c++) {
                const tile = this.getTile(c, r);
                if (!tile) continue;
                tile.type      = 'ROCKS';
                tile.resources = TILE_TYPES.ROCKS.initialResources;
                tile.height    = minH;
                tile.isRamp    = false;
            }
        }
    }

    /**
     * Scatter pass: adds small random forest patches and stray rock tiles
     * across the map for visual variety. These are not balance-critical.
     */
    _scatter() {
        // Small random forest patches
        for (let i = 0; i < SCATTER_GROVE_COUNT; i++) {
            const col = this._rng(1, MAP_SIZE - 2);
            const row = this._rng(1, MAP_SIZE - 2);
            this._placeGrove(col, row, SCATTER_GROVE_SIZE);
        }

        // Stray rock tiles — individual tiles scattered for visual noise
        let placed = 0;
        let attempts = 0;
        while (placed < SCATTER_ROCKS_COUNT && attempts < 200) {
            attempts++;
            const col  = this._rng(0, MAP_SIZE - 1);
            const row  = this._rng(0, MAP_SIZE - 1);
            const tile = this.getTile(col, row);
            if (tile && tile.type === 'GRASS') {
                tile.type      = 'ROCKS';
                tile.resources = TILE_TYPES.ROCKS.initialResources;
                placed++;
            }
        }
    }

    // ── Utilities ──────────────────────────────────────────────────────────────

    /** Inclusive integer random in [min, max]. */
    _rng(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }
}
