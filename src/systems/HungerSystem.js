import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const HUNGRY_THRESHOLD   = 3;   // zero-food cycles before becoming hungry
const STARVING_THRESHOLD = 10;  // zero-food cycles before starving
const RECOVERY_CYCLES    = 2;   // positive-food cycles needed to clear alert
const DEPARTURE_INTERVAL = 5;   // starvation cycles between each departure
const RETURN_INTERVAL    = 5;   // recovery cycles between each villager return

export class HungerSystem {
    constructor(resourceSystem, buildSystem, villagerManager) {
        this._resourceSystem  = resourceSystem;
        this._buildSystem     = buildSystem;
        this._villagerManager = villagerManager;

        this._state                 = 'fed';  // 'fed' | 'hungry' | 'starving'
        this._zeroFoodCycles        = 0;
        this._recoveryCycles        = 0;
        this._departureCycleCounter = 0;
        this._returnCycleCounter    = 0;

        GameEvents.on(EventNames.PRODUCTION_TICK, () => this._onProductionTick());
    }

    /** Returns the production efficiency multiplier for the current hunger state. */
    getEfficiencyMultiplier() {
        if (this._state === 'starving') return 0.25;
        if (this._state === 'hungry')   return 0.50;
        return 1.0;
    }

    getState() {
        return this._state;
    }

    _onProductionTick() {
        const food = this._resourceSystem.get('food');

        if (food === 0) {
            // ── Hunger escalation ─────────────────────────────────────────────
            this._recoveryCycles      = 0;
            this._returnCycleCounter  = 0;
            this._zeroFoodCycles++;

            let newState = this._state;
            if (this._zeroFoodCycles >= STARVING_THRESHOLD) newState = 'starving';
            else if (this._zeroFoodCycles >= HUNGRY_THRESHOLD) newState = 'hungry';

            if (newState !== this._state) {
                if (newState === 'starving') {
                    // Reset departure counter on entry to starving
                    this._departureCycleCounter = 0;
                }
                this._state = newState;
                GameEvents.emit(EventNames.HUNGER_STATE_CHANGED, { state: this._state });
            }

            // Trigger villager departures while starving
            if (this._state === 'starving') {
                this._departureCycleCounter++;
                if (this._departureCycleCounter >= DEPARTURE_INTERVAL) {
                    this._departVillager();
                    this._departureCycleCounter = 0;
                }
            }

        } else {
            // ── Recovery ──────────────────────────────────────────────────────
            this._zeroFoodCycles        = 0;
            this._departureCycleCounter = 0;

            if (this._state !== 'fed') {
                this._recoveryCycles++;
                if (this._recoveryCycles >= RECOVERY_CYCLES) {
                    this._state          = 'fed';
                    this._recoveryCycles = 0;
                    GameEvents.emit(EventNames.HUNGER_STATE_CHANGED, { state: 'fed' });
                }
            }

            // Return departed villagers (continues until all are back, even after fed)
            if (this._hasReturnableVillagers()) {
                this._returnCycleCounter++;
                if (this._returnCycleCounter >= RETURN_INTERVAL) {
                    this._returnVillager();
                    this._returnCycleCounter = 0;
                }
            }
        }
    }

    _hasReturnableVillagers() {
        for (const building of this._buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            // Only return to connected buildings — disconnected ones are handled
            // by ProductionSystem's reconnect-return loop
            if (config?.onPlace === 'spawnVillager' &&
                building.isConnected &&
                building.maxResidents > 0 &&
                building.residents < building.maxResidents &&
                building._disconnectDeparted === 0) {
                return true;
            }
        }
        return false;
    }

    _departVillager() {
        for (const building of this._buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            if (config?.onPlace === 'spawnVillager' && building.residents > 0) {
                building.residents--;
                this._villagerManager.removeVillager(this._buildSystem);
                GameEvents.emit(EventNames.VILLAGER_DEPARTED, {
                    buildingUid: building.uid, reason: 'starvation',
                });
                return;
            }
        }
    }

    _returnVillager() {
        for (const building of this._buildSystem.placedBuildings.values()) {
            const config = BUILDING_CONFIGS[building.configId];
            // Only return to connected buildings where there are no pending
            // disconnection-return slots (those are handled by ProductionSystem)
            if (config?.onPlace === 'spawnVillager' &&
                building.isConnected &&
                building.maxResidents > 0 &&
                building.residents < building.maxResidents &&
                building._disconnectDeparted === 0) {
                building.residents++;
                this._villagerManager.addVillagers(1);
                GameEvents.emit(EventNames.VILLAGER_RETURNED, { buildingUid: building.uid });
                return;
            }
        }
    }
}
