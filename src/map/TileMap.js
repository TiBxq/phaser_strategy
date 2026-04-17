import { TILE_TYPES } from '../data/TileTypes.js';

export const MAP_SIZE        = 24;
export const MAX_TILE_HEIGHT = 3;   // maximum elevation level (0 = flat, 3 = peak)

// Starting visible region — mirrors FogOfWarSystem; exported so fog system can import them
// VIS_MIN=12 on a 24×24 map gives the same 12×12 visible start as VIS_MIN=8 on a 20×20 map.
// The bandit camp claims [0..11]×[0..11] (radius 8 from corner (3,3)) which is exactly the
// 12×12 top-left corner — max reach 11 < VIS_MIN=12, so it never touches the visible start.
// Non-bandit playable area: 576 - 144 = 432 tiles ≈ same as the old 20×20 total (400 tiles).
export const VIS_MIN = 12;
export const VIS_MAX = MAP_SIZE - 1;  // 23

// Heightmap generation tuning
const HILL_RADIUS    = 4;   // Manhattan radius of each dome hill
const HILL_COUNT_MIN = 3;   // minimum number of hills per map
const HILL_COUNT_MAX = 6;   // maximum number of hills per map

// Forest grove sizes (per BALANCE.md)
const GROVE_COASTAL_SIZE = 8;   // two coastal groves, 8 tiles each
const GROVE_INLAND_SIZE  = 12;  // one large inland grove, 12 tiles

// Scatter pass — extra tiles for visual variety (not part of balance-critical layout)
const SCATTER_GROVE_COUNT     = 7;  // number of small random forest patches
const SCATTER_GROVE_SIZE      = 5;  // tiles per scattered patch
const SCATTER_ROCKS_COUNT     = 10; // extra individual rock tiles scattered across map

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
        // Grove 1: inside the visible starting area — gives the player forest from turn 1.
        this._placeGrove(VIS_MIN + 1 + this._rng(0, 3), VIS_MIN + 1 + this._rng(0, 3), GROVE_INLAND_SIZE);
        // Grove 2: right fog edge (col ≥ VIS_MIN, row < VIS_MIN) — outside bandit zone, requires exploration.
        this._placeGrove(VIS_MIN + this._rng(0, 3), VIS_MIN - 4 + this._rng(0, 2), GROVE_COASTAL_SIZE);
        // Grove 3: left fog edge (col < VIS_MIN, row ≥ VIS_MIN) — mirror side, also outside bandit zone.
        this._placeGrove(VIS_MIN - 4 + this._rng(0, 2), VIS_MIN + this._rng(0, 3), GROVE_COASTAL_SIZE);
        // Groves 4–6: inside bandit territory — the bandits hide in a dense forest.
        this._placeGrove(2 + this._rng(0, 2), 2 + this._rng(0, 2), GROVE_INLAND_SIZE);
        this._placeGrove(5 + this._rng(0, 2), 2 + this._rng(0, 2), GROVE_COASTAL_SIZE);
        this._placeGrove(2 + this._rng(0, 2), 5 + this._rng(0, 2), GROVE_COASTAL_SIZE);

        // Phase 4: rock outcrops and iron deposit
        // All are placed on flat (height-0) ground, never overlap each other, and
        // always have at least one adjacent GRASS tile at height 0 for road access.
        // Resource features are placed OUTSIDE the bandit zone ([0..VIS_MIN-1]×[0..VIS_MIN-1])
        // so they are always accessible before the camp is cleared.
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

        // Second outcrop: left fog edge (col < VIS_MIN, row ≥ VIS_MIN) — in the fog but
        // outside the bandit zone, reachable by expanding up/left from the starting area.
        let loc2 = this._findFlatArea(2, VIS_MIN - 2, VIS_MIN, MAP_SIZE - 3, forbidden);
        if (!loc2) loc2 = this._findFlatArea(1, VIS_MIN - 1, VIS_MIN, MAP_SIZE - 2, forbidden);
        if (!loc2) loc2 = this._findFlatArea(1, MAP_SIZE - 3, 1, MAP_SIZE - 3, forbidden);
        if (loc2) {
            this._placeOutcrop(loc2.col, loc2.row);
            this._markForbidden(forbidden, loc2.col, loc2.row);
            this._featureAnchors.push(loc2);
        }

        // Iron deposit: right fog edge, close to the visible boundary (row ∈ [VIS_MIN-4..VIS_MIN-2])
        // so the corridor from the visible start is short and less likely to be cliff-blocked.
        let loc3 = this._findFlatArea(VIS_MIN, MAP_SIZE - 3, VIS_MIN - 4, VIS_MIN - 2, forbidden);
        if (!loc3) loc3 = this._findFlatArea(VIS_MIN, MAP_SIZE - 3, 2, VIS_MIN - 1, forbidden);
        if (!loc3) loc3 = this._findFlatArea(VIS_MIN, MAP_SIZE - 2, 1, VIS_MIN - 1, forbidden);
        if (!loc3) loc3 = this._findFlatArea(1, MAP_SIZE - 3, 1, MAP_SIZE - 3, forbidden);
        if (loc3) {
            this._placeIronDeposit(loc3.col, loc3.row);
            this._markForbidden(forbidden, loc3.col, loc3.row);
            this._featureAnchors.push(loc3);
        }

        // Bandit camp: top-left corner of the map — claims the entire [0..VIS_MIN-1]×[0..VIS_MIN-1]
        // zone (radius 8 from (3,3) reaches exactly col/row=11 < VIS_MIN=12). This gives the
        // bandit territory its own distinct 12×12 area without touching the player's domain.
        let campLoc = this._findFlatArea(1, 4, 1, 4, forbidden);
        if (!campLoc) campLoc = this._findFlatArea(1, VIS_MIN - 2, 1, VIS_MIN - 2, forbidden);
        if (!campLoc) campLoc = this._findFlatArea(1, VIS_MIN - 1, 1, VIS_MIN - 1, forbidden);
        if (campLoc) {
            this._placeBanditCamp(campLoc.col, campLoc.row);
            this._markForbidden(forbidden, campLoc.col, campLoc.row);
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
            ownedBy: null,         // uid of building that claimed this tile for production
            height: 0,             // elevation 0–3
            isRamp: false,         // true when GRASS tile transitions height down to a neighbor
            isRoad: false,         // true when a road has been placed on this tile
            resources: TILE_TYPES[typeId].initialResources,  // remaining harvestable units
            banditClaimed: false,  // true when inside the bandit camp's territory radius
            banditCampTile: false, // true for the 4 footprint tiles of the bandit camp itself
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
     * Place the non-player Bandit Camp at (col, row).
     * Levels the 2×2 footprint to min height, marks those tiles as banditCampTile,
     * and claims all tiles within Chebyshev radius 5 as banditClaimed.
     */
    _placeBanditCamp(topCol, topRow) {
        const c0 = Math.min(topCol, MAP_SIZE - 2);
        const r0 = Math.min(topRow, MAP_SIZE - 2);

        // Level footprint to minimum height (same pattern as iron/rocks features)
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
                t.height       = minH;
                t.isRamp       = false;
                t.banditCampTile = true;
                t.banditClaimed  = true;
            }

        // Claim all tiles within Chebyshev radius 8 of the camp anchor (c0, r0).
        // With camp at (3,3) on a 24×24 map (VIS_MIN=12), this claims the entire
        // [0..11]×[0..11] corner — max reach = 11 < VIS_MIN, so it never touches the
        // visible starting area.
        const CLAIM_RADIUS = 8;
        const claimedTiles = [];

        for (let r = Math.max(0, r0 - CLAIM_RADIUS); r <= Math.min(MAP_SIZE - 1, r0 + CLAIM_RADIUS); r++) {
            for (let c = Math.max(0, c0 - CLAIM_RADIUS); c <= Math.min(MAP_SIZE - 1, c0 + CLAIM_RADIUS); c++) {
                const dist = Math.max(Math.abs(c - c0), Math.abs(r - r0));
                if (dist <= CLAIM_RADIUS) {
                    const t = this.getTile(c, r);
                    if (t) {
                        t.banditClaimed = true;
                        claimedTiles.push({ col: c, row: r });
                    }
                }
            }
        }

        // Store camp position and claimed tile list for BanditCampSystem
        this.banditCampCol        = c0;
        this.banditCampRow        = r0;
        this.banditClaimedTiles   = claimedTiles;
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
        const roadReachable = this._roadReachableFromStart();
        if (!this._featureAnchors.every(a => this._featureIsReachable(a, roadReachable))) return false;

        // Bandit camp must also be walkable-reachable for the warrior march.
        // Warriors use A* over all GRASS tiles (including bandit-claimed and ramps),
        // so this BFS is more permissive than the road BFS.
        if (this.banditCampCol != null) {
            const walkReachable = this._walkableReachableFromStart();
            if (!this._featureIsReachable(
                { col: this.banditCampCol, row: this.banditCampRow }, walkReachable,
            )) return false;
        }
        return true;
    }

    /**
     * BFS flood-fill through walkable GRASS tiles, seeded from the starting
     * visible area [VIS_MIN..VIS_MAX]. Returns a Set of "col,row" keys for
     * tiles where a road CAN be placed (GRASS && !isRamp).
     *
     * Ramp tiles are used as stepping-stones during traversal (they are GRASS
     * and walkable) but are not added to `reachable` since roads can't be built
     * on them. Height continuity is enforced: crossing to a neighbour is only
     * allowed when Math.abs(height diff) <= 1 AND (diff==0 OR a ramp is present
     * on one of the two tiles) — mirroring `heightMoveCost` from walkable.js.
     */
    _roadReachableFromStart() {
        const reachable = new Set();
        const visited  = new Set();
        const queue    = [];

        for (let r = VIS_MIN; r <= VIS_MAX; r++) {
            for (let c = VIS_MIN; c <= VIS_MAX; c++) {
                const t = this.getTile(c, r);
                if (t && t.type === 'GRASS' && !t.banditClaimed) {
                    const key = `${c},${r}`;
                    visited.add(key);
                    if (!t.isRamp) reachable.add(key);
                    queue.push([c, r]);
                }
            }
        }

        let head = 0;
        while (head < queue.length) {
            const [c, r] = queue[head++];
            const src = this.getTile(c, r);
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nc = c + dc, nr = r + dr;
                const key = `${nc},${nr}`;
                if (visited.has(key)) continue;
                const t = this.getTile(nc, nr);
                if (!t || t.type !== 'GRASS' || t.banditClaimed) continue;

                // Enforce height continuity: can't cross a cliff.
                const hDiff = Math.abs(t.height - src.height);
                if (hDiff > 1) continue;
                if (hDiff === 1 && !t.isRamp && !src.isRamp) continue;

                visited.add(key);
                if (!t.isRamp) reachable.add(key);
                queue.push([nc, nr]);
            }
        }
        return reachable;
    }

    /**
     * BFS flood-fill through ALL walkable GRASS tiles (including ramps and
     * bandit-claimed tiles), mirroring warrior A* movement. Used to verify the
     * bandit camp is reachable for the warrior march.
     */
    _walkableReachableFromStart() {
        const reachable = new Set();
        const queue     = [];

        for (let r = VIS_MIN; r <= VIS_MAX; r++) {
            for (let c = VIS_MIN; c <= VIS_MAX; c++) {
                const t = this.getTile(c, r);
                if (t && t.type === 'GRASS') {
                    const key = `${c},${r}`;
                    reachable.add(key);
                    queue.push([c, r]);
                }
            }
        }

        let head = 0;
        while (head < queue.length) {
            const [c, r] = queue[head++];
            const src = this.getTile(c, r);
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nc = c + dc, nr = r + dr;
                const key = `${nc},${nr}`;
                if (reachable.has(key)) continue;
                const t = this.getTile(nc, nr);
                if (!t || t.type !== 'GRASS') continue;

                const hDiff = Math.abs(t.height - src.height);
                if (hDiff > 1) continue;
                if (hDiff === 1 && !t.isRamp && !src.isRamp) continue;

                reachable.add(key);
                queue.push([nc, nr]);
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
