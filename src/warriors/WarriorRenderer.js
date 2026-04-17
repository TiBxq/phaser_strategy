import { WarriorEntity } from './WarriorEntity.js';
import { randomWalkableTileNear, randomWalkableTile } from '../villagers/walkable.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const SPAWN_RADIUS = 3;

export class WarriorRenderer {
    constructor(scene, tileMap) {
        this._scene   = scene;
        this._tileMap = tileMap;
        // Map<buildingUid, WarriorEntity[]>
        this._pools   = new Map();

        // Sync warrior sprites whenever assignment to a Barracks changes
        GameEvents.on(EventNames.WARRIORS_CHANGED, ({ buildingUid, building }) => {
            this._syncPool(buildingUid, building);
        });

        // Clean up sprites when a Barracks is demolished
        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            this._removeBuilding(uid);
        });
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _syncPool(buildingUid, building) {
        if (!this._pools.has(buildingUid)) this._pools.set(buildingUid, []);
        const pool   = this._pools.get(buildingUid);
        const target = building.assignedVillagers;

        while (pool.length < target) {
            const tile = randomWalkableTileNear(this._tileMap, building.col, building.row, SPAWN_RADIUS)
                      ?? randomWalkableTile(this._tileMap);
            if (!tile) break;
            pool.push(new WarriorEntity(
                this._scene, this._tileMap,
                tile.col, tile.row,
                building.col, building.row,
            ));
        }
        while (pool.length > target) {
            pool.pop().destroy();
        }
    }

    _removeBuilding(uid) {
        const pool = this._pools.get(uid);
        if (!pool) return;
        for (const entity of pool) entity.destroy();
        this._pools.delete(uid);
    }

    // ── March API ──────────────────────────────────────────────────────────────

    /**
     * Command all warriors to march toward (targetCol, targetRow).
     * Calls onFirstArrived() the first time any warrior arrives.
     * If there are no warriors, calls onFirstArrived() immediately.
     */
    marchAllTo(targetCol, targetRow, onFirstArrived) {
        let fired = false;
        const cb = () => {
            if (!fired) { fired = true; onFirstArrived(); }
        };

        let count = 0;
        for (const pool of this._pools.values()) {
            for (const entity of pool) {
                entity.marchTo(targetCol, targetRow, cb);
                count++;
            }
        }
        if (count === 0) onFirstArrived();
    }

    /** Command all warriors to march back to their home barracks. */
    marchAllHome() {
        for (const pool of this._pools.values()) {
            for (const entity of pool) {
                entity.marchHome();
            }
        }
    }
}
