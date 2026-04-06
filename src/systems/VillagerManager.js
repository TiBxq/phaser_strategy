import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
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
     * Assign `count` unassigned villagers to a building.
     * Respects the building's maxVillagers config.
     * Returns how many were actually assigned.
     */
    assign(buildingUid, count, buildSystem) {
        const building = buildSystem.getBuilding(buildingUid);
        if (!building) return 0;

        const config      = BUILDING_CONFIGS[building.configId];
        const current     = this.assignments.get(buildingUid) ?? 0;
        const maxAllowed  = config.maxVillagers;
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

    _emit() {
        GameEvents.emit(EventNames.VILLAGERS_CHANGED, {
            total:       this.total,
            unassigned:  this.unassigned,
            assignments: new Map(this.assignments),
        });
    }
}
