import { BUILDING_CONFIGS, FOREST_TILES_PER_WORKER } from '../data/BuildingConfig.js';
import { FOOD_COST_PER_VILLAGER } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const TICK_DELAY_MS = 5000;

// Disconnection mechanic constants
const DISCONNECT_GRACE_CYCLES  = 3;   // free ticks before departures start
const DISCONNECT_DEPART_CYCLES = 3;   // ticks between each departure while disconnected
const RECONNECT_RETURN_CYCLES  = 3;   // ticks between each return after reconnect

/** Returns true if the building produces food. Exempt from hunger efficiency penalties. */
function isFoodProducer(building) {
    return BUILDING_CONFIGS[building.configId]?.producesResource === 'food';
}

export class ProductionSystem {
    constructor(time, resourceSystem, buildSystem, villagerManager, tileMap) {
        this.resourceSystem  = resourceSystem;
        this.buildSystem     = buildSystem;
        this.villagerManager = villagerManager;
        this.tileMap         = tileMap;
        /** Set by Game.js after construction. Provides production efficiency multiplier. */
        this.hungerSystem    = null;

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
            if (!building.isConnected) continue;
            const config = BUILDING_CONFIGS[building.configId];
            if (!config.producesResource) continue;

            const assigned = building.assignedVillagers;
            if (assigned === 0) continue;

            let effectiveWorkers = assigned;

            // Farm: one worker per claimed field block
            if (building.configId === 'FARM') {
                effectiveWorkers = Math.min(assigned, building.fieldTiles.length);
            }

            // Lumbermill: ceil(forestTiles / 4) — 1 worker per 1–4 tiles, 2 per 5–8, etc.
            if (building.configId === 'LUMBERMILL') {
                effectiveWorkers = Math.min(assigned, Math.ceil(building.forestTiles.length / FOREST_TILES_PER_WORKER));
            }

            // Quarry: stop entirely when all footprint rocks are depleted
            if (building.configId === 'QUARRY') {
                if (building.rocksTiles.length === 0) continue;
            }

            // Iron Mine: stop entirely when all footprint iron is depleted
            if (building.configId === 'IRON_MINE') {
                if (building.ironTiles.length === 0) continue;
            }

            // Food producers are exempt from hunger efficiency penalties
            const mult   = (this.hungerSystem && !isFoodProducer(building))
                ? this.hungerSystem.getEfficiencyMultiplier()
                : 1.0;
            const yield_ = Math.floor(config.productionPerVillager * effectiveWorkers * mult);
            this.resourceSystem.add(config.producesResource, yield_);
            produced[config.producesResource] = (produced[config.producesResource] ?? 0) + yield_;
            yields.push({ uid: building.uid, col: building.col, row: building.row,
                          resource: config.producesResource, amount: yield_ });

            // Deplete resource tiles for extraction buildings
            if (building.configId === 'LUMBERMILL' || building.configId === 'QUARRY' || building.configId === 'IRON_MINE') {
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

        // ── Disconnection departures / reconnect returns ────────────────────────
        // Tracks per-building disconnected-cycles and causes residents to depart when
        // a spawnVillager building has been disconnected too long.  Returns them
        // (one-per-tick, up to the count that left for this reason) on reconnect.
        // Starvation returns are handled separately by HungerSystem.
        for (const building of this.buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            if (config?.onPlace !== 'spawnVillager' || building.maxResidents <= 0) continue;

            if (!building.isConnected) {
                building._reconnectReturnTimer = 0;

                if (building.residents > 0) {
                    building._disconnectCycles++;

                    if (building._disconnectCycles > DISCONNECT_GRACE_CYCLES) {
                        building._disconnectDepartTimer++;
                        if (building._disconnectDepartTimer >= DISCONNECT_DEPART_CYCLES) {
                            building.residents--;
                            building._disconnectDeparted++;
                            this.villagerManager.removeVillager(this.buildSystem);
                            GameEvents.emit(EventNames.VILLAGER_DEPARTED, {
                                buildingUid: building.uid, reason: 'disconnected',
                            });
                            building._disconnectDepartTimer = 0;
                        }
                    }
                }
            } else {
                // Connected — reset disconnection counters
                building._disconnectCycles      = 0;
                building._disconnectDepartTimer = 0;

                // Return only disconnection-departed residents (starvation returns
                // are handled by HungerSystem separately)
                if (building._disconnectDeparted > 0) {
                    building._reconnectReturnTimer++;
                    if (building._reconnectReturnTimer >= RECONNECT_RETURN_CYCLES) {
                        building._disconnectDeparted--;
                        building.residents++;
                        this.villagerManager.addVillagers(1);
                        GameEvents.emit(EventNames.VILLAGER_RETURNED, { buildingUid: building.uid });
                        building._reconnectReturnTimer = 0;
                    }
                } else {
                    building._reconnectReturnTimer = 0;
                }
            }
        }
    }

    /**
     * Deplete resource tiles for extraction buildings (Lumbermill / Quarry).
     * Removes resources from tiles front-to-back. Exhausted non-footprint tiles
     * convert to GRASS and emit TILE_DEPLETED for visual refresh.
     */
    _depleteTiles(building, amount) {
        const key   = building.configId === 'LUMBERMILL' ? 'forestTiles'
                    : building.configId === 'QUARRY'      ? 'rocksTiles'
                    : 'ironTiles';
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
