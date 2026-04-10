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
    }

    // ─── Validation ────────────────────────────────────────────────────────────

    /**
     * Returns { valid: boolean, reason: string }.
     * All buildings use a 2×2 footprint anchored at (col, row).
     */
    canPlace(configId, col, row, tileMap) {
        const config = BUILDING_CONFIGS[configId];
        if (!config) return { valid: false, reason: 'Unknown building type.' };

        // Collect all 4 footprint tiles
        const footprint = FOOTPRINT.map(([dc, dr]) => tileMap.getTile(col + dc, row + dr));

        if (footprint.some(t => !t))
            return { valid: false, reason: 'Out of bounds.' };

        if (footprint.some(t => !config.buildableOn.includes(t.type)))
            return { valid: false, reason: `Must be built on ${config.buildableOn.join(' or ')}.` };

        if (footprint.some(t => t.buildingId || t.isField || t.ownedBy))
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
            assignedVillagers: 0,
            fieldTiles: [],    // block anchors {col, row} for Farm 2×2 field blocks
            forestTiles: [],   // individual FOREST tile positions for Lumbermill
            rocksTiles: [],    // footprint ROCKS tile positions for Quarry
        };

        // Mark all 4 footprint tiles as occupied
        for (const [dc, dr] of FOOTPRINT) {
            tileMap.getTile(col + dc, row + dr).buildingId = uid;
        }

        // Handle onPlace side-effects
        switch (config.onPlace) {
            case 'spawnVillager':
                villagerManager.addVillagers(config.villagerCapacity);
                break;

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

            case 'increaseStorageCap':
                this.resourceSystem.setCap(this.resourceSystem.getCap() + CAP_PER_WAREHOUSE);
                break;
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

        if (extra > 0) villagerManager.addVillagers(extra);

        GameEvents.emit(EventNames.BUILDING_UPGRADED, { building });
    }

    // ─── Removal ───────────────────────────────────────────────────────────────

    remove(uid, tileMap) {
        const building = this.placedBuildings.get(uid);
        if (!building) return;

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
        GameEvents.emit(EventNames.BUILDING_REMOVED, { uid, col: building.col, row: building.row });
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
            if (t.buildingId || t.isField || t.ownedBy) return false;
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
