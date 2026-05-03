import { BUILDING_CONFIGS, FOREST_TILES_PER_WORKER } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class VillagerManager {
    constructor() {
        this.total      = 0;
        this.unassigned = 0;
        // Map<buildingUid, number>
        this.assignments = new Map();
    }

    addVillagers(count) {
        this.total      += count;
        this.unassigned += count;
        this._emit();
    }

    /**
     * Remove one villager from the pool (used by HungerSystem for starvation departures).
     * Prefers removing from unassigned; otherwise unassigns from a non-food-producer first,
     * falling back to food producers as a last resort.
     */
    removeVillager(buildSystem) {
        if (this.total <= 0) return;
        this.total--;
        if (this.unassigned > 0) {
            this.unassigned--;
        } else {
            // First pass: non-food buildings. Second pass: food producers (last resort).
            if (!this._tryUnassignOne(buildSystem, uid => !this._isFoodProducer(buildSystem, uid))) {
                this._tryUnassignOne(buildSystem, () => true);
            }
        }
        this._emit();
    }

    /** Unassign one villager from the first building matching predicate. Returns true on success. */
    _tryUnassignOne(buildSystem, predicate) {
        for (const [uid, count] of this.assignments) {
            if (count > 0 && predicate(uid)) {
                const n = count - 1;
                this.assignments.set(uid, n);
                const b = buildSystem?.getBuilding(uid);
                if (b) b.assignedVillagers = n;
                GameEvents.emit(EventNames.WORKER_FORCE_RECALLED, { buildingUid: uid });
                return true;
            }
        }
        return false;
    }

    /** Returns true if the building assigned to uid produces food. */
    _isFoodProducer(buildSystem, uid) {
        const b = buildSystem?.getBuilding(uid);
        return b ? BUILDING_CONFIGS[b.configId]?.producesResource === 'food' : false;
    }

    /**
     * Assign `count` unassigned villagers to a building.
     * Respects the building's maxVillagers config.
     * Returns how many were actually assigned.
     */
    assign(buildingUid, count, buildSystem) {
        const building = buildSystem.getBuilding(buildingUid);
        if (!building) return 0;

        const config      = BUILDING_CONFIGS[building.configId];
        const current     = this.assignments.get(buildingUid) ?? 0;
        const maxAllowed  = this._getMaxAllowed(building, config);
        const canAssign   = Math.min(count, this.unassigned, maxAllowed - current);

        if (canAssign <= 0) return 0;

        this.assignments.set(buildingUid, current + canAssign);
        this.unassigned -= canAssign;
        building.assignedVillagers = current + canAssign;
        this._emit();
        return canAssign;
    }

    /**
     * Unassign `count` villagers from a building, returning them to the pool.
     */
    unassign(buildingUid, count, buildSystem) {
        const current = this.assignments.get(buildingUid) ?? 0;
        const toFree  = Math.min(count, current);
        if (toFree <= 0) return 0;

        const newCount = current - toFree;
        this.assignments.set(buildingUid, newCount);
        this.unassigned += toFree;

        const building = buildSystem?.getBuilding(buildingUid);
        if (building) building.assignedVillagers = newCount;

        this._emit();
        return toFree;
    }

    /**
     * Reserve one worker slot for a building (in-transit state).
     * Decrements unassigned immediately but does NOT start production — call confirmWorker on arrival.
     */
    reserveWorker(buildingUid, buildSystem) {
        const building = buildSystem.getBuilding(buildingUid);
        if (!building || this.unassigned <= 0) return false;

        const config     = BUILDING_CONFIGS[building.configId];
        const assigned   = this.assignments.get(buildingUid) ?? 0;
        const pending    = building.pendingWorkers ?? 0;
        const maxAllowed = this._getMaxAllowed(building, config);
        if (assigned + pending >= maxAllowed) return false;

        this.unassigned--;
        building.pendingWorkers = pending + 1;
        this._emit();
        return true;
    }

    /** Worker arrived at building — increment assignedVillagers and start production. */
    confirmWorker(buildingUid, buildSystem) {
        const building = buildSystem.getBuilding(buildingUid);
        if (!building) return;

        building.pendingWorkers = Math.max(0, (building.pendingWorkers ?? 0) - 1);
        const current = this.assignments.get(buildingUid) ?? 0;
        this.assignments.set(buildingUid, current + 1);
        building.assignedVillagers = current + 1;
        this._emit();
    }

    /** Cancel a reserved (in-transit) worker slot — return it to unassigned. */
    cancelReserve(buildingUid, buildSystem) {
        const building = buildSystem.getBuilding(buildingUid);
        if (building) building.pendingWorkers = Math.max(0, (building.pendingWorkers ?? 0) - 1);
        this.unassigned++;
        this._emit();
    }

    /** Compute the effective max workers for a building (mirrors assign() logic). */
    _getMaxAllowed(building, config) {
        if (config.claimsTileType === 'FOREST') return Math.ceil(building.forestTiles.length / FOREST_TILES_PER_WORKER);
        if (config.claimsTileType)               return building.fieldTiles.length;
        return config.maxVillagers;
    }

    getAssigned(buildingUid) {
        return this.assignments.get(buildingUid) ?? 0;
    }

    getUnassigned() {
        return this.unassigned;
    }

    /** Called by ProductionSystem when resource tiles deplete and caps may change. */
    notifyChanged() {
        this._emit();
    }

    _emit() {
        GameEvents.emit(EventNames.VILLAGERS_CHANGED, {
            total:       this.total,
            unassigned:  this.unassigned,
            assignments: new Map(this.assignments),
        });
    }
}
