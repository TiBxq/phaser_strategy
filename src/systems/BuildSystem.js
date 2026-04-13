import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { CAP_PER_WAREHOUSE } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

// 2×2 footprint offsets from anchor (col, row)
const FOOTPRINT = [[0, 0], [1, 0], [0, 1], [1, 1]];

export class BuildSystem {
    constructor(resourceSystem) {
        this.resourceSystem = resourceSystem;
        // Map<uid, BuildingInstance>
        this.placedBuildings = new Map();
        this._nextUid = 0;
        // Set from Game.js after both systems are created
        this.roadSystem = null;
        this.fogSystem  = null;
    }

    // ─── Validation ────────────────────────────────────────────────────────────

    /**
     * Returns { valid: boolean, reason: string }.
     * All buildings use a 2×2 footprint anchored at (col, row).
     */
    canPlace(configId, col, row, tileMap) {
        const config = BUILDING_CONFIGS[configId];
        if (!config) return { valid: false, reason: 'Unknown building type.' };

        // Fog of war: all 4 footprint tiles must be fully visible
        if (this.fogSystem) {
            for (const [dc, dr] of FOOTPRINT) {
                if (!this.fogSystem.isVisible(col + dc, row + dr)) {
                    return { valid: false, reason: 'Cannot build in the fog of war.' };
                }
            }
        }

        // Town Hall may only be placed once
        if (configId === 'TOWN_HALL') {
            for (const b of this.placedBuildings.values()) {
                if (b.configId === 'TOWN_HALL')
                    return { valid: false, reason: 'Town Hall already placed.' };
            }
        }

        // Collect all 4 footprint tiles
        const footprint = FOOTPRINT.map(([dc, dr]) => tileMap.getTile(col + dc, row + dr));

        if (footprint.some(t => !t))
            return { valid: false, reason: 'Out of bounds.' };

        if (footprint.some(t => !config.buildableOn.includes(t.type)))
            return { valid: false, reason: `Must be built on ${config.buildableOn.join(' or ')}.` };

        if (footprint.some(t => t.buildingId || t.isField || t.ownedBy || t.isRoad))
            return { valid: false, reason: 'Tile already occupied.' };

        // Reject uneven terrain and ramps
        const heights = footprint.map(t => t.height);
        if (!heights.every(h => h === heights[0]))
            return { valid: false, reason: 'Terrain is not flat here.' };
        if (footprint.some(t => t.isRamp))
            return { valid: false, reason: 'Cannot build on a ramp.' };

        // Adjacency requirement — any 4-dir neighbour of any footprint tile must qualify
        if (config.requiresAdjacentTo) {
            const allNeighbours = footprint.flatMap(t => tileMap.getNeighbors(t.col, t.row));
            const hasRequired = config.claimsTileType
                ? allNeighbours.some(n => n.type === config.requiresAdjacentTo && !n.ownedBy)
                : allNeighbours.some(n => n.type === config.requiresAdjacentTo);
            if (!hasRequired)
                return { valid: false, reason: `Must be adjacent to an unclaimed ${config.requiresAdjacentTo}.` };
        }

        if (!this.resourceSystem.canAfford(config.cost))
            return { valid: false, reason: 'Insufficient resources.' };

        return { valid: true, reason: '' };
    }

    // ─── Placement ─────────────────────────────────────────────────────────────

    /**
     * Places a 2×2 building at anchor (col, row). Assumes canPlace() already passed.
     * Returns the BuildingInstance.
     */
    place(configId, col, row, tileMap, villagerManager) {
        const config = BUILDING_CONFIGS[configId];

        // Deduct cost
        this.resourceSystem.spend(config.cost);

        const uid = `b_${this._nextUid++}`;
        const building = {
            uid,
            configId,
            col,
            row,
            isConnected: false,  // resolved after onPlace so fieldTiles are populated
            assignedVillagers: 0,
            fieldTiles: [],    // block anchors {col, row} for Farm 2×2 field blocks
            forestTiles: [],   // individual FOREST tile positions for Lumbermill
            rocksTiles: [],    // footprint ROCKS tile positions for Quarry
            ironTiles:  [],    // footprint IRON tile positions for Iron Mine
            _smithyProgress: 0, // production cycle counter for Smithy (0–5)
            residents:    0,   // current residents (spawnVillager buildings only)
            maxResidents: 0,   // max capacity (spawnVillager buildings only)
            totalCost: { ...config.cost },  // cumulative cost (base + upgrades) for demolish refund
            _initialSpawnDone:      false,  // true once villagers have been spawned for this building
            _disconnectCycles:      0,      // production ticks spent disconnected (spawnVillager only)
            _disconnectDepartTimer: 0,      // ticks toward next disconnection departure
            _disconnectDeparted:    0,      // residents currently away due to disconnection
            _reconnectReturnTimer:  0,      // ticks toward next return after reconnect
        };

        // Mark all 4 footprint tiles as occupied
        for (const [dc, dr] of FOOTPRINT) {
            tileMap.getTile(col + dc, row + dr).buildingId = uid;
        }

        // Handle onPlace side-effects that affect tile state.
        // spawnVillager is deferred until after connectivity is known.
        switch (config.onPlace) {
            case 'spawnFields':
                this._claimFieldBlocks(tileMap, col, row, uid, building);
                break;

            case 'claimForest':
                this._claimAllForestInRadius(tileMap, col, row, uid, building);
                break;

            case 'initRocksTiles':
                for (const [dc, dr] of FOOTPRINT) {
                    building.rocksTiles.push({ col: col + dc, row: row + dr });
                }
                break;

            case 'initIronTiles':
                for (const [dc, dr] of FOOTPRINT) {
                    building.ironTiles.push({ col: col + dc, row: row + dr });
                }
                break;

            case 'increaseStorageCap':
                this.resourceSystem.setCap(this.resourceSystem.getCap() + CAP_PER_WAREHOUSE);
                break;
        }

        // Determine road connectivity now that fieldTiles are populated.
        // Town Hall is always the network root → always connected.
        if (configId === 'TOWN_HALL') {
            building.isConnected = true;
        } else if (this.roadSystem) {
            const th = this._getTownHall();
            building.isConnected = th
                ? this.roadSystem.isBuildingConnected(building, tileMap, th)
                : false;
        }

        // Spawn villagers only if connected; otherwise deferred to connectivity gain.
        if (config.onPlace === 'spawnVillager') {
            building.maxResidents = config.villagerCapacity;
            if (building.isConnected) {
                building.residents         = config.villagerCapacity;
                building._initialSpawnDone = true;
                villagerManager.addVillagers(config.villagerCapacity);
            }
        }

        this.placedBuildings.set(uid, building);
        GameEvents.emit(EventNames.BUILDING_PLACED, { building });
        return building;
    }

    // ─── Upgrade ───────────────────────────────────────────────────────────────

    /**
     * Returns { valid: boolean, reason: string }.
     */
    canUpgrade(uid) {
        const building = this.placedBuildings.get(uid);
        if (!building) return { valid: false, reason: 'Building not found.' };

        const config = BUILDING_CONFIGS[building.configId];
        if (!config.upgradesTo) return { valid: false, reason: 'This building cannot be upgraded.' };

        if (!this.resourceSystem.canAfford(config.upgradeCost))
            return { valid: false, reason: 'Insufficient resources.' };

        return { valid: true, reason: '' };
    }

    /**
     * Upgrades a building to its next tier. Assumes canUpgrade() already passed.
     */
    upgrade(uid, villagerManager) {
        const building   = this.placedBuildings.get(uid);
        const oldConfig  = BUILDING_CONFIGS[building.configId];
        const newConfig  = BUILDING_CONFIGS[oldConfig.upgradesTo];

        this.resourceSystem.spend(oldConfig.upgradeCost);

        const extra = newConfig.villagerCapacity - oldConfig.villagerCapacity;
        building.configId = newConfig.id;

        // Accumulate upgrade cost into totalCost so demolish refunds the full investment
        for (const [r, v] of Object.entries(oldConfig.upgradeCost)) {
            building.totalCost[r] = (building.totalCost[r] ?? 0) + v;
        }

        if (extra > 0) {
            villagerManager.addVillagers(extra);
            building.maxResidents = newConfig.villagerCapacity;
            building.residents    = (building.residents ?? 0) + extra;
        }

        GameEvents.emit(EventNames.BUILDING_UPGRADED, { building });
    }

    // ─── Removal ───────────────────────────────────────────────────────────────

    remove(uid, tileMap) {
        const building = this.placedBuildings.get(uid);
        if (!building) return;

        const fieldTilesSnapshot = [...building.fieldTiles];

        // Release all 4 footprint tiles
        for (const [dc, dr] of FOOTPRINT) {
            const t = tileMap.getTile(building.col + dc, building.row + dr);
            if (t) t.buildingId = null;
        }

        // Release field blocks (4 tiles each)
        for (const ft of building.fieldTiles) {
            for (const [dc, dr] of FOOTPRINT) {
                const t = tileMap.getTile(ft.col + dc, ft.row + dr);
                if (t) { t.isField = false; t.ownedBy = null; }
            }
        }

        // Release individual forest tiles
        for (const ft of building.forestTiles) {
            const t = tileMap.getTile(ft.col, ft.row);
            if (t) t.ownedBy = null;
        }

        this.placedBuildings.delete(uid);
        GameEvents.emit(EventNames.BUILDING_REMOVED, {
            uid, col: building.col, row: building.row, fieldTiles: fieldTilesSnapshot,
        });
    }

    // ─── Demolish ──────────────────────────────────────────────────────────────

    canDemolish(uid) {
        const building = this.placedBuildings.get(uid);
        if (!building) return { valid: false, reason: 'Building not found.' };
        if (building.configId === 'TOWN_HALL') return { valid: false, reason: 'Cannot demolish the Town Hall.' };
        return { valid: true, reason: '' };
    }

    /**
     * Demolishes a building: unassigns workers, removes resident villagers,
     * undoes side-effects (cap increase), refunds 50% of total invested cost,
     * then calls remove() to free tiles and fire BUILDING_REMOVED.
     */
    demolish(uid, tileMap, villagerManager) {
        const building = this.placedBuildings.get(uid);
        if (!building) return;

        const config = BUILDING_CONFIGS[building.configId];

        // Return all assigned workers to the unassigned pool (total unchanged)
        if (building.assignedVillagers > 0) {
            villagerManager.unassign(uid, building.assignedVillagers, this);
        }

        // Remove resident villagers from the global pool (reduces total)
        if (config.onPlace === 'spawnVillager') {
            for (let i = 0; i < building.residents; i++) {
                villagerManager.removeVillager(this);
            }
        }

        // Undo warehouse storage cap increase
        if (config.onPlace === 'increaseStorageCap') {
            this.resourceSystem.setCap(this.resourceSystem.getCap() - CAP_PER_WAREHOUSE);
        }

        // Refund 50% of total invested cost (base placement + any upgrades), rounded down
        for (const [resource, amount] of Object.entries(building.totalCost ?? {})) {
            const refund = Math.floor(amount / 2);
            if (refund > 0) this.resourceSystem.add(resource, refund);
        }

        // Free tiles and emit BUILDING_REMOVED
        this.remove(uid, tileMap);
    }

    getBuilding(uid) {
        return this.placedBuildings.get(uid) ?? null;
    }

    getBuildingAt(col, row) {
        for (const b of this.placedBuildings.values()) {
            if (col >= b.col && col <= b.col + 1 && row >= b.row && row <= b.row + 1) return b;
        }
        return null;
    }

    _getTownHall() {
        for (const b of this.placedBuildings.values()) {
            if (b.configId === 'TOWN_HALL') return b;
        }
        return null;
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    /**
     * Claims up to 4 adjacent 2×2 GRASS blocks as farm fields.
     * Tries the 4 cardinal positions (right, bottom, left, top) in order.
     */
    _claimFieldBlocks(tileMap, bCol, bRow, uid, building) {
        // 4 cardinal 2×2 block anchors directly adjacent to the 2×2 building footprint
        const candidates = [
            { col: bCol + 2, row: bRow     },   // right
            { col: bCol,     row: bRow + 2 },   // bottom
            { col: bCol - 2, row: bRow     },   // left
            { col: bCol,     row: bRow - 2 },   // top
        ];

        // Fields must be at the same elevation as the building
        const buildingHeight = tileMap.getTile(bCol, bRow).height;

        for (const { col: fc, row: fr } of candidates) {
            if (!this._isValidFieldBlock(tileMap, fc, fr, buildingHeight)) continue;
            for (const [dc, dr] of FOOTPRINT) {
                const t = tileMap.getTile(fc + dc, fr + dr);
                t.isField = true;
                t.ownedBy = uid;
            }
            building.fieldTiles.push({ col: fc, row: fr });
        }
    }

    _isValidFieldBlock(tileMap, fc, fr, requiredHeight = 0) {
        for (const [dc, dr] of FOOTPRINT) {
            const t = tileMap.getTile(fc + dc, fr + dr);
            if (!t) return false;
            if (t.type !== 'GRASS') return false;
            if (t.buildingId || t.isField || t.ownedBy || t.isRoad) return false;
            if (t.isRamp) return false;
            if (t.height !== requiredHeight) return false;
        }
        return true;
    }

    /**
     * Claims ALL unclaimed FOREST tiles within Manhattan radius 2 from the 2×2 building boundary.
     * Stores them sorted by distance ascending (closest first).
     */
    _claimAllForestInRadius(tileMap, bCol, bRow, uid, building) {
        const candidates = [];

        for (let tc = bCol - 2; tc <= bCol + 3; tc++) {
            for (let tr = bRow - 2; tr <= bRow + 3; tr++) {
                const t = tileMap.getTile(tc, tr);
                if (!t || t.type !== 'FOREST' || t.ownedBy) continue;

                // Manhattan distance from tile to 2×2 footprint
                const dx = Math.max(0, bCol - tc, tc - (bCol + 1));
                const dy = Math.max(0, bRow - tr, tr - (bRow + 1));
                const dist = dx + dy;
                if (dist < 1 || dist > 2) continue;

                candidates.push({ col: tc, row: tr, dist });
            }
        }

        // Sort closest first so worker overlays appear on nearest tiles
        candidates.sort((a, b) => a.dist - b.dist || a.col - b.col || a.row - b.row);

        for (const c of candidates) {
            const t = tileMap.getTile(c.col, c.row);
            t.ownedBy = uid;
            building.forestTiles.push({ col: c.col, row: c.row });
        }
    }
}
