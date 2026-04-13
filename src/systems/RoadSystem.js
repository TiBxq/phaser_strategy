import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

// 2×2 building footprint offsets (same as BuildSystem)
const FOOTPRINT = [[0, 0], [1, 0], [0, 1], [1, 1]];

export class RoadSystem {
    constructor() {
        // Set of 'col,row' strings for O(1) membership tests
        this.roadTiles = new Set();
        this.fogSystem = null;
    }

    // ─── Placement ─────────────────────────────────────────────────────────────

    /**
     * Returns { valid: boolean, reason: string }.
     * Roads can only be placed on unoccupied, flat GRASS tiles.
     */
    canPlace(col, row, tileMap, resourceSystem) {
        if (this.fogSystem && !this.fogSystem.isVisible(col, row)) {
            return { valid: false, reason: 'Cannot build roads in the fog of war.' };
        }
        const tile = tileMap.getTile(col, row);
        if (!tile)
            return { valid: false, reason: 'Out of bounds.' };
        if (tile.type !== 'GRASS')
            return { valid: false, reason: 'Roads can only be built on grass.' };
        if (tile.buildingId)
            return { valid: false, reason: 'Tile already occupied.' };
        if (tile.isField)
            return { valid: false, reason: 'Tile already occupied.' };
        if (tile.ownedBy)
            return { valid: false, reason: 'Tile is claimed.' };
        if (tile.isRoad)
            return { valid: false, reason: 'Road already exists here.' };
        if (tile.isRamp)
            return { valid: false, reason: 'Cannot build on a ramp.' };
        if (!resourceSystem.canAfford({ stone: 1, money: 2 }))
            return { valid: false, reason: 'Insufficient resources.' };
        return { valid: true, reason: '' };
    }

    /**
     * Places a road on the tile. Assumes canPlace() already passed.
     * Immediately re-evaluates building connectivity and emits
     * BUILDING_CONNECTIVITY_CHANGED for any buildings whose state changed.
     */
    place(col, row, tileMap, resourceSystem, buildSystem) {
        resourceSystem.spend({ stone: 1, money: 2 });
        tileMap.getTile(col, row).isRoad = true;
        this.roadTiles.add(`${col},${row}`);
        GameEvents.emit(EventNames.ROAD_PLACED, { col, row });
        if (buildSystem) this.updateConnectivity(tileMap, buildSystem);
    }

    /**
     * Returns { valid: boolean, reason: string }.
     */
    canDemolish(col, row, tileMap) {
        const tile = tileMap.getTile(col, row);
        if (!tile)        return { valid: false, reason: 'Out of bounds.' };
        if (!tile.isRoad) return { valid: false, reason: 'No road here.' };
        return { valid: true, reason: '' };
    }

    /**
     * Removes a road tile, refunds half cost (money:1), and re-evaluates
     * building connectivity. Assumes canDemolish() already passed.
     */
    demolish(col, row, tileMap, buildSystem, resourceSystem) {
        const tile = tileMap.getTile(col, row);
        tile.isRoad = false;
        this.roadTiles.delete(`${col},${row}`);
        // Refund half of placement cost: floor(stone:1/2)=0, floor(money:2/2)=1
        resourceSystem.add('money', 1);
        GameEvents.emit(EventNames.ROAD_REMOVED, { col, row });
        if (buildSystem) this.updateConnectivity(tileMap, buildSystem);
    }

    /**
     * Re-evaluates road connectivity for every placed building.
     * Emits BUILDING_CONNECTIVITY_CHANGED if any building's isConnected state changed.
     */
    updateConnectivity(tileMap, buildSystem) {
        const th      = buildSystem._getTownHall();
        const changed = [];

        for (const building of buildSystem.placedBuildings.values()) {
            // Town Hall is always the network root — always connected.
            const nowConnected = building.configId === 'TOWN_HALL'
                ? true
                : (th ? this.isBuildingConnected(building, tileMap, th) : false);

            if (nowConnected !== building.isConnected) {
                const wasConnected   = building.isConnected;
                building.isConnected = nowConnected;
                changed.push({ building, wasConnected });
            }
        }

        if (changed.length > 0) {
            GameEvents.emit(EventNames.BUILDING_CONNECTIVITY_CHANGED, { changed });
        }
    }

    // ─── Connectivity ──────────────────────────────────────────────────────────

    /**
     * BFS check: is `building` adjacent (via its footprint OR any claimed field
     * tiles) to a road that connects back to townHall?
     *
     * Farms count as connected if any of their field tiles border a connected road,
     * not just the 2×2 building footprint.
     */
    isBuildingConnected(building, tileMap, townHall) {
        const buildingAdj = this._adjacentRoads(building, tileMap);
        if (buildingAdj.size === 0) return false;

        const thAdj = this._adjacentRoads(townHall, tileMap);
        if (thAdj.size === 0) return false;

        // BFS from Town Hall's adjacent roads through the road graph
        const visited = new Set(thAdj);
        const queue   = [...thAdj];

        while (queue.length > 0) {
            const key = queue.shift();
            if (buildingAdj.has(key)) return true;

            const [c, r] = key.split(',').map(Number);
            for (const n of tileMap.getNeighbors(c, r)) {
                const nk = `${n.col},${n.row}`;
                if (n.isRoad && !visited.has(nk)) {
                    visited.add(nk);
                    queue.push(nk);
                }
            }
        }

        return false;
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    /**
     * Returns a Set of 'col,row' keys for road tiles adjacent (4-dir) to any
     * tile owned by the building: its 2×2 footprint plus all field block tiles.
     */
    _adjacentRoads(building, tileMap) {
        // Collect every tile position owned by this building
        const owned = [];
        for (const [dc, dr] of FOOTPRINT) {
            owned.push({ col: building.col + dc, row: building.row + dr });
        }
        // Farms: include all 4 tiles of each claimed 2×2 field block
        for (const block of building.fieldTiles ?? []) {
            for (const [dc, dr] of FOOTPRINT) {
                owned.push({ col: block.col + dc, row: block.row + dr });
            }
        }

        const ownedSet = new Set(owned.map(t => `${t.col},${t.row}`));
        const out      = new Set();

        for (const { col, row } of owned) {
            for (const n of tileMap.getNeighbors(col, row)) {
                const nk = `${n.col},${n.row}`;
                if (n.isRoad && !ownedSet.has(nk)) out.add(nk);
            }
        }

        return out;
    }
}
