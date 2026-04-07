import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { FOOD_COST_PER_VILLAGER } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const TICK_DELAY_MS = 5000;

export class ProductionSystem {
    constructor(time, resourceSystem, buildSystem, villagerManager) {
        this.resourceSystem  = resourceSystem;
        this.buildSystem     = buildSystem;
        this.villagerManager = villagerManager;

        time.addEvent({
            delay:         TICK_DELAY_MS,
            loop:          true,
            callback:      this._tick,
            callbackScope: this,
        });
    }

    _tick() {
        const produced = { food: 0, wood: 0, stone: 0, money: 0 };
        const yields   = [];

        for (const building of this.buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            if (!config.producesResource) continue;

            const assigned = building.assignedVillagers;
            if (assigned === 0) continue;

            let effectiveWorkers = assigned;

            // Farm: one worker per claimed field tile
            if (building.configId === 'FARM') {
                effectiveWorkers = Math.min(assigned, building.fieldTiles.length);
            }

            // Lumbermill: one worker per claimed forest tile
            if (building.configId === 'LUMBERMILL') {
                effectiveWorkers = Math.min(assigned, building.forestTiles.length);
            }

            const yield_ = config.productionPerVillager * effectiveWorkers;
            this.resourceSystem.add(config.producesResource, yield_);
            produced[config.producesResource] = (produced[config.producesResource] ?? 0) + yield_;
            yields.push({ uid: building.uid, col: building.col, row: building.row,
                          resource: config.producesResource, amount: yield_ });
        }

        // Food consumption
        const totalVillagers = this.villagerManager.total;
        const consumed = { food: 0 };
        if (totalVillagers > 0) {
            const cost     = totalVillagers * FOOD_COST_PER_VILLAGER;
            const food     = this.resourceSystem.get('food');
            const toConsume = Math.min(cost, food);
            if (toConsume > 0) {
                this.resourceSystem.spend({ food: toConsume });
                consumed.food = toConsume;
            }
            if (food === 0) {
                GameEvents.emit(EventNames.STARVATION_WARNING);
            }
        }

        GameEvents.emit(EventNames.PRODUCTION_TICK, { produced, consumed, yields });
    }
}
