import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { FOOD_COST_PER_VILLAGER } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const TICK_DELAY_MS = 5000;

export class ProductionSystem {
    constructor(time, resourceSystem, buildSystem, villagerManager, tileMap) {
        this.resourceSystem  = resourceSystem;
        this.buildSystem     = buildSystem;
        this.villagerManager = villagerManager;
        this.tileMap         = tileMap;

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

            // Farm: one worker per claimed field block
            if (building.configId === 'FARM') {
                effectiveWorkers = Math.min(assigned, building.fieldTiles.length);
            }

            // Lumbermill: one worker per 4 claimed forest tiles (floor division)
            if (building.configId === 'LUMBERMILL') {
                effectiveWorkers = Math.min(assigned, Math.floor(building.forestTiles.length / 4));
            }

            // Quarry: stop entirely when all footprint rocks are depleted
            if (building.configId === 'QUARRY') {
                if (building.rocksTiles.length === 0) continue;
            }

            const yield_ = config.productionPerVillager * effectiveWorkers;
            this.resourceSystem.add(config.producesResource, yield_);
            produced[config.producesResource] = (produced[config.producesResource] ?? 0) + yield_;
            yields.push({ uid: building.uid, col: building.col, row: building.row,
                          resource: config.producesResource, amount: yield_ });

            // Deplete resource tiles for extraction buildings
            if (building.configId === 'LUMBERMILL' || building.configId === 'QUARRY') {
                this._depleteTiles(building, yield_);
            }
        }

        // Food consumption — 1 per villager, plus 3 per assigned Market merchant
        const totalVillagers = this.villagerManager.total;
        const consumed = { food: 0 };
        if (totalVillagers > 0) {
            let cost = totalVillagers * FOOD_COST_PER_VILLAGER;

            // Market merchants consume an additional 3 food each
            for (const building of this.buildSystem.placedBuildings.values()) {
                if (building.configId === 'MARKET' && building.assignedVillagers > 0) {
                    cost += building.assignedVillagers * 3;
                }
            }

            const food      = this.resourceSystem.get('food');
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

    /**
     * Deplete resource tiles for extraction buildings (Lumbermill / Quarry).
     * Removes resources from tiles front-to-back. Exhausted non-footprint tiles
     * convert to GRASS and emit TILE_DEPLETED for visual refresh.
     */
    _depleteTiles(building, amount) {
        const key   = building.configId === 'LUMBERMILL' ? 'forestTiles' : 'rocksTiles';
        const tiles = building[key];
        if (!tiles || tiles.length === 0 || amount <= 0) return;

        let remaining = amount;
        const depletedIndices = [];

        for (let i = 0; i < tiles.length && remaining > 0; i++) {
            const tile = this.tileMap.getTile(tiles[i].col, tiles[i].row);
            if (!tile) continue;
            const take = Math.min(tile.resources, remaining);
            tile.resources -= take;
            remaining      -= take;

            if (tile.resources <= 0) {
                depletedIndices.push(i);
                const isBuildingFootprint = !!tile.buildingId;
                if (!isBuildingFootprint) {
                    tile.type    = 'GRASS';
                    tile.ownedBy = null;
                }
                GameEvents.emit(EventNames.TILE_DEPLETED, {
                    col: tiles[i].col, row: tiles[i].row,
                    buildingUid: building.uid, isBuildingFootprint,
                });
            }
        }

        // Remove depleted entries in reverse order to preserve earlier indices
        for (let i = depletedIndices.length - 1; i >= 0; i--) {
            tiles.splice(depletedIndices[i], 1);
        }

        if (depletedIndices.length > 0) {
            this.villagerManager.notifyChanged();
        }
    }
}
