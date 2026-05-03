import { VillagerEntity } from './VillagerEntity.js';
import { randomWalkableTile, randomWalkableTileNear } from './walkable.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class VillagerRenderer {
    constructor(scene, tileMap, fogSystem, buildSystem, villagerManager) {
        this._scene          = scene;
        this._tileMap        = tileMap;
        this._fogSystem      = fogSystem;
        this._buildSystem    = buildSystem;
        this._villagerManager = villagerManager;

        this._free       = [];   // VillagerEntity[] — wandering
        this._marchingTo = new Map(); // buildingUid → VillagerEntity[]
        this._stationed  = new Map(); // buildingUid → VillagerEntity[]

        GameEvents.on(EventNames.VILLAGERS_CHANGED, ({ total }) => {
            this._syncCount(total);
        });

        GameEvents.on(EventNames.WORKER_DISPATCH_REQUEST, ({ buildingUid }) => {
            this._dispatchWorker(buildingUid);
        });

        GameEvents.on(EventNames.WORKER_RECALL_REQUEST, ({ buildingUid }) => {
            this._recallWorker(buildingUid);
        });

        GameEvents.on(EventNames.WORKER_FORCE_RECALLED, ({ buildingUid }) => {
            this._forceRecallWorker(buildingUid);
        });

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            this._onBuildingRemoved(uid);
        });
    }

    // ── Entity count sync ─────────────────────────────────────────────────────

    _countAll() {
        let n = this._free.length;
        for (const arr of this._marchingTo.values()) n += arr.length;
        for (const arr of this._stationed.values())  n += arr.length;
        return n;
    }

    _syncCount(total) {
        while (this._countAll() < total) {
            this._spawnFree();
        }
        while (this._countAll() > total) {
            if (this._free.length > 0) {
                this._free.pop().destroy();
            } else {
                // Fallback: destroy a stationed entity (rare — starvation with no free workers)
                let removed = false;
                for (const arr of this._stationed.values()) {
                    if (arr.length > 0) { arr.pop().destroy(); removed = true; break; }
                }
                if (!removed) break;
            }
        }
    }

    _spawnFree() {
        const tile = randomWalkableTile(this._tileMap, null, this._fogSystem);
        if (!tile) return;
        this._free.push(new VillagerEntity(this._scene, this._tileMap, tile.col, tile.row, this._fogSystem));
    }

    // ── Dispatch: send a free entity to a building ────────────────────────────

    _dispatchWorker(buildingUid) {
        if (this._free.length === 0) return;

        const building = this._buildSystem.getBuilding(buildingUid);
        if (!building) return;

        const entity = this._free.pop();

        const marching = this._marchingTo.get(buildingUid) ?? [];
        marching.push(entity);
        this._marchingTo.set(buildingUid, marching);

        entity.marchTo(building.col, building.row, () => {
            // Remove from marching list
            const m   = this._marchingTo.get(buildingUid) ?? [];
            const idx = m.indexOf(entity);
            if (idx >= 0) m.splice(idx, 1);

            // Station at building (invisible)
            const stationed = this._stationed.get(buildingUid) ?? [];
            stationed.push(entity);
            this._stationed.set(buildingUid, stationed);
            entity.setVisible(false);

            // Production starts now
            this._villagerManager.confirmWorker(buildingUid, this._buildSystem);
        });
    }

    // ── Recall: return a stationed worker to the free pool ────────────────────

    _recallWorker(buildingUid) {
        const building = this._buildSystem.getBuilding(buildingUid);

        // Prefer recalling a stationed entity (already arrived)
        const stationed = this._stationed.get(buildingUid);
        if (stationed && stationed.length > 0) {
            const entity = stationed.pop();
            this._makeEntityFree(entity, building);
            this._villagerManager.unassign(buildingUid, 1, this._buildSystem);
            return;
        }

        // Fall back to cancelling an in-transit entity
        const marching = this._marchingTo.get(buildingUid);
        if (marching && marching.length > 0) {
            const entity = marching.pop();
            entity.cancelMarch();
            this._free.push(entity);
            this._villagerManager.cancelReserve(buildingUid, this._buildSystem);
        }
    }

    // Called when starvation force-removes a worker (total already decremented)
    _forceRecallWorker(buildingUid) {
        const stationed = this._stationed.get(buildingUid);
        if (stationed && stationed.length > 0) {
            stationed.pop().destroy();
            return;
        }
        // Worker may still be marching — cancel and destroy it
        const marching = this._marchingTo.get(buildingUid);
        if (marching && marching.length > 0) {
            const entity = marching.pop();
            entity.cancelMarch();
            entity.destroy();
            this._villagerManager.cancelReserve(buildingUid, this._buildSystem);
        }
    }

    // ── Building removed ──────────────────────────────────────────────────────

    _onBuildingRemoved(buildingUid) {
        // Cancel all in-transit workers and return them to free
        const marching = this._marchingTo.get(buildingUid) ?? [];
        for (const entity of marching) {
            entity.cancelMarch();
            entity.setVisible(true);
            this._free.push(entity);
            this._villagerManager.cancelReserve(buildingUid, this._buildSystem);
        }
        this._marchingTo.delete(buildingUid);

        // Recall all stationed workers to free (BuildSystem.demolish already updated manager counts)
        const stationed = this._stationed.get(buildingUid) ?? [];
        for (const entity of stationed) {
            entity.setVisible(true);
            entity.resumeWander();
            this._free.push(entity);
        }
        this._stationed.delete(buildingUid);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _makeEntityFree(entity, building) {
        const col = building ? building.col : 12;
        const row = building ? building.row : 12;
        const tile = randomWalkableTileNear(this._tileMap, col, row, 3)
                  ?? randomWalkableTile(this._tileMap, null, this._fogSystem);
        if (tile) entity.teleportTo(tile.col, tile.row);
        entity.setVisible(true);
        entity.resumeWander();
        this._free.push(entity);
    }
}
