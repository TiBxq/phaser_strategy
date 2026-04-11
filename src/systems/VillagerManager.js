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
        // Dynamic cap for tile-based buildings:
        //   Farm: 1 worker per 2×2 field block (fieldTiles = block anchors)
        //   Lumbermill: ceil(forestTiles / 4) — 1 worker per 1–4 tiles, 2 per 5–8, etc.
        //   Others: static config.maxVillagers
        const maxAllowed  = config.claimsTileType === 'FOREST'
            ? Math.ceil(building.forestTiles.length / FOREST_TILES_PER_WORKER)
            : config.claimsTileType
                ? building.fieldTiles.length
                : config.maxVillagers;
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
