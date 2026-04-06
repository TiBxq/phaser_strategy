import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { CAP_PER_WAREHOUSE } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

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
     */
    canPlace(configId, col, row, tileMap) {
        const config = BUILDING_CONFIGS[configId];
        if (!config) return { valid: false, reason: 'Unknown building type.' };

        const tile = tileMap.getTile(col, row);
        if (!tile) return { valid: false, reason: 'Out of bounds.' };

        // Tile type check
        if (!config.buildableOn.includes(tile.type)) {
            return { valid: false, reason: `Must be built on ${config.buildableOn.join(' or ')}.` };
        }

        // Tile must be empty (no building, not a farm field)
        if (tile.buildingId) return { valid: false, reason: 'Tile already occupied.' };
        if (tile.isField)    return { valid: false, reason: 'Tile is a farm field.' };

        // Adjacency requirement (Lumbermill needs an adjacent FOREST)
        if (config.requiresAdjacentTo) {
            const neighbours = tileMap.getNeighbors(col, row);
            const hasRequired = neighbours.some(n => n.type === config.requiresAdjacentTo);
            if (!hasRequired) {
                return { valid: false, reason: `Must be adjacent to ${config.requiresAdjacentTo}.` };
            }
        }

        // Resource check
        if (!this.resourceSystem.canAfford(config.cost)) {
            return { valid: false, reason: 'Insufficient resources.' };
        }

        return { valid: true, reason: '' };
    }

    // ─── Placement ─────────────────────────────────────────────────────────────

    /**
     * Places a building at (col, row). Assumes canPlace() already passed.
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
            fieldTiles: [],
            adjacentForestCount: 0,
        };

        // Mark tile as occupied
        tileMap.getTile(col, row).buildingId = uid;

        // Handle onPlace side-effects
        switch (config.onPlace) {
            case 'spawnVillager':
                villagerManager.addVillagers(config.villagerCapacity);
                break;

            case 'spawnFields': {
                // Mark up to 4 adjacent GRASS tiles as fields (4-directional)
                const neighbours = tileMap.getNeighbors(col, row);
                for (const n of neighbours) {
                    if (n.type === 'GRASS' && !n.buildingId && !n.isField && building.fieldTiles.length < 4) {
                        n.isField = true;
                        building.fieldTiles.push({ col: n.col, row: n.row });
                    }
                }
                break;
            }

            case 'increaseStorageCap':
                this.resourceSystem.setCap(this.resourceSystem.getCap() + CAP_PER_WAREHOUSE);
                break;
        }

        // For Lumbermill, count adjacent FOREST tiles
        if (configId === 'LUMBERMILL') {
            const neighbours = tileMap.getNeighbors(col, row);
            building.adjacentForestCount = neighbours.filter(n => n.type === 'FOREST').length;
        }

        this.placedBuildings.set(uid, building);

        GameEvents.emit(EventNames.BUILDING_PLACED, { building });

        return building;
    }

    // ─── Removal ───────────────────────────────────────────────────────────────

    remove(uid, tileMap) {
        const building = this.placedBuildings.get(uid);
        if (!building) return;

        const tile = tileMap.getTile(building.col, building.row);
        if (tile) tile.buildingId = null;

        // Remove farm fields
        for (const ft of building.fieldTiles) {
            const fieldTile = tileMap.getTile(ft.col, ft.row);
            if (fieldTile) fieldTile.isField = false;
        }

        this.placedBuildings.delete(uid);
        GameEvents.emit(EventNames.BUILDING_REMOVED, { uid, col: building.col, row: building.row });
    }

    getBuilding(uid) {
        return this.placedBuildings.get(uid) ?? null;
    }

    getBuildingAt(col, row) {
        for (const b of this.placedBuildings.values()) {
            if (b.col === col && b.row === row) return b;
        }
        return null;
    }
}
