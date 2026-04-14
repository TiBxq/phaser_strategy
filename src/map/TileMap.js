import { TILE_TYPES } from '../data/TileTypes.js';

export const MAP_SIZE        = 20;
export const MAX_TILE_HEIGHT = 3;   // maximum elevation level (0 = flat, 3 = peak)

// Starting visible region — mirrors FogOfWarSystem; exported so fog system can import them
export const VIS_MIN = 8;
export const VIS_MAX = MAP_SIZE - 1;  // 19

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
        // Retry the full generation until all three resource features (2 stone outcrops +
        // iron deposit) are reachable from the starting area via road-placeable tiles.
        // In practice this succeeds on the first attempt the vast majority of the time.
        const MAX_ATTEMPTS = 20;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            this._generateOnce();
            if (this._allFeaturesConnected()) return this;
        }
        return this;  // fallback: use last attempt as-is
    }

    _generateOnce() {
        this._featureAnchors = [];

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

        // Phase 4: rock outcrops and iron deposit
        // All are placed on flat (height-0) ground, never overlap each other, and
        // always have at least one adjacent GRASS tile at height 0 for road access.
        const forbidden = new Set();

        // First outcrop: must land in the starting visible area (col/row ∈ [VIS_MIN..VIS_MAX])
        // so the player can find and build a Quarry early.
        let loc1 = this._findFlatArea(VIS_MIN, VIS_MAX - 1, VIS_MIN, VIS_MAX - 1, forbidden);
        if (!loc1) loc1 = this._findFlatArea(1, MAP_SIZE - 3, 1, MAP_SIZE - 3, forbidden);
        if (loc1) {
            this._placeOutcrop(loc1.col, loc1.row);
            this._markForbidden(forbidden, loc1.col, loc1.row);
            this._featureAnchors.push(loc1);
        }

        // Second outcrop: in the fog — col < VIS_MIN guarantees it starts hidden.
        // Row range is wide so the generator has plenty of flat candidates.
        let loc2 = this._findFlatArea(3, VIS_MIN - 1, 3, MAP_SIZE - 3, forbidden);
        if (!loc2) loc2 = this._findFlatArea(1, MAP_SIZE - 3, 1, MAP_SIZE - 3, forbidden);
        if (loc2) {
            this._placeOutcrop(loc2.col, loc2.row);
            this._markForbidden(forbidden, loc2.col, loc2.row);
            this._featureAnchors.push(loc2);
        }

        // Iron deposit: deep in the fog — both col and row < VIS_MIN puts it in the
        // unexplored top corner of the diamond, requiring real exploration to reach.
        let loc3 = this._findFlatArea(1, VIS_MIN - 2, 1, VIS_MIN - 2, forbidden);
        if (!loc3) loc3 = this._findFlatArea(1, VIS_MIN - 1, 1, VIS_MIN - 1, forbidden);
        if (!loc3) loc3 = this._findFlatArea(1, MAP_SIZE - 3, 1, MAP_SIZE - 3, forbidden);
        if (loc3) {
            this._placeIronDeposit(loc3.col, loc3.row);
            this._featureAnchors.push(loc3);
        }

        // Phase 5: scatter pass — small random forest patches + stray rock tiles
        this._scatter();

        // Phase 6: ramp placement
        this._placeRamps();
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
            isRoad: false,   // true when a road has been placed on this tile
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
     * Place a guaranteed 2×2 IRON deposit at (topCol, topRow) at uniform height,
     * then scatter ~3 individual IRON tiles in adjacent cells for visual variety.
     */
    _placeIronDeposit(topCol, topRow) {
        const c0 = Math.min(topCol, MAP_SIZE - 2);
        const r0 = Math.min(topRow, MAP_SIZE - 2);

        let minH = MAX_TILE_HEIGHT;
        for (let r = r0; r <= r0 + 1; r++)
            for (let c = c0; c <= c0 + 1; c++) {
                const t = this.getTile(c, r);
                if (t) minH = Math.min(minH, t.height);
            }

        for (let r = r0; r <= r0 + 1; r++)
            for (let c = c0; c <= c0 + 1; c++) {
                const t = this.getTile(c, r);
                if (!t) continue;
                t.type      = 'IRON';
                t.resources = TILE_TYPES.IRON.initialResources;
                t.height    = minH;
                t.isRamp    = false;
            }

        // Scatter ~3 individual IRON tiles in cells adjacent to the 2×2 block
        const offsets = [[-1, 0], [2, 0], [0, -1], [0, 2], [-1, 1], [2, 1], [1, -1], [-1, 2]];
        offsets.sort(() => Math.random() - 0.5);
        let placed = 0;
        for (const [dc, dr] of offsets) {
            if (placed >= 3) break;
            const t = this.getTile(c0 + dc, r0 + dr);
            if (!t || t.type !== 'GRASS') continue;
            t.type      = 'IRON';
            t.resources = TILE_TYPES.IRON.initialResources;
            placed++;
        }
    }

    /**
     * Search for a 2×2 top-left corner in [colMin..colMax] × [rowMin..rowMax] where:
     *   - All 4 tiles have height 0
     *   - No tile is already in forbiddenSet
     *   - At least one 4-dir-adjacent GRASS tile at height 0 exists (road access)
     * Candidates are shuffled so the result is random each run.
     * Returns { col, row } or null if none found.
     */
    _findFlatArea(colMin, colMax, rowMin, rowMax, forbiddenSet) {
        const candidates = [];
        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                candidates.push([c, r]);
            }
        }
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (const [c, r] of candidates) {
            if (this._isValidFeatureLocation(c, r, forbiddenSet)) return { col: c, row: r };
        }
        return null;
    }

    /**
     * Returns true when the 2×2 block at (c0, r0) satisfies:
     *   - In bounds, all 4 tiles at height 0, none forbidden
     *   - At least one tile in the 8-cell perimeter is GRASS at height 0 (road access)
     */
    _isValidFeatureLocation(c0, r0, forbiddenSet) {
        if (c0 < 0 || r0 < 0 || c0 + 1 >= MAP_SIZE || r0 + 1 >= MAP_SIZE) return false;
        for (let r = r0; r <= r0 + 1; r++) {
            for (let c = c0; c <= c0 + 1; c++) {
                const t = this.getTile(c, r);
                if (!t || t.height !== 0 || forbiddenSet.has(`${c},${r}`)) return false;
            }
        }
        // Perimeter: left, right, top, bottom edges of the 2×2 block
        const perimeter = [
            [c0 - 1, r0], [c0 - 1, r0 + 1],
            [c0 + 2, r0], [c0 + 2, r0 + 1],
            [c0,     r0 - 1], [c0 + 1, r0 - 1],
            [c0,     r0 + 2], [c0 + 1, r0 + 2],
        ];
        for (const [ac, ar] of perimeter) {
            const t = this.getTile(ac, ar);
            if (t && t.type === 'GRASS' && t.height === 0 && !forbiddenSet.has(`${ac},${ar}`)) {
                return true;
            }
        }
        return false;
    }

    /** Mark all 4 tiles of the 2×2 block at (c0, r0) as forbidden. */
    _markForbidden(forbiddenSet, c0, r0) {
        for (let r = r0; r <= r0 + 1; r++) {
            for (let c = c0; c <= c0 + 1; c++) {
                forbiddenSet.add(`${c},${r}`);
            }
        }
    }

    // ── Connectivity validation ────────────────────────────────────────────────

    /**
     * Returns true when every placed feature anchor can be reached from the
     * starting visible area via road-placeable tiles (GRASS and not a ramp).
     * Run after Phase 6 so ramp flags are final.
     */
    _allFeaturesConnected() {
        const reachable = this._roadReachableFromStart();
        return this._featureAnchors.every(anchor => this._featureIsReachable(anchor, reachable));
    }

    /**
     * BFS flood-fill through road-placeable tiles (GRASS && !isRamp), seeded
     * from every such tile in the starting visible area [VIS_MIN..VIS_MAX].
     * Returns a Set of "col,row" keys.
     */
    _roadReachableFromStart() {
        const reachable = new Set();
        const queue = [];
        for (let r = VIS_MIN; r <= VIS_MAX; r++) {
            for (let c = VIS_MIN; c <= VIS_MAX; c++) {
                const t = this.getTile(c, r);
                if (t && t.type === 'GRASS' && !t.isRamp) {
                    const key = `${c},${r}`;
                    reachable.add(key);
                    queue.push([c, r]);
                }
            }
        }
        let head = 0;
        while (head < queue.length) {
            const [c, r] = queue[head++];
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nc = c + dc, nr = r + dr;
                const key = `${nc},${nr}`;
                if (reachable.has(key)) continue;
                const t = this.getTile(nc, nr);
                if (t && t.type === 'GRASS' && !t.isRamp) {
                    reachable.add(key);
                    queue.push([nc, nr]);
                }
            }
        }
        return reachable;
    }

    /**
     * Returns true when at least one tile in the 8-cell perimeter of the 2×2
     * feature block at (anchor.col, anchor.row) is in the reachable set.
     */
    _featureIsReachable({ col: c0, row: r0 }, reachable) {
        const perimeter = [
            [c0 - 1, r0], [c0 - 1, r0 + 1],
            [c0 + 2, r0], [c0 + 2, r0 + 1],
            [c0,     r0 - 1], [c0 + 1, r0 - 1],
            [c0,     r0 + 2], [c0 + 1, r0 + 2],
        ];
        return perimeter.some(([ac, ar]) => reachable.has(`${ac},${ar}`));
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
