import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { FOG_VISIBLE } from './FogOfWarSystem.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const POP_THRESHOLD    = 10;
const GRACE_CYCLES     = 5;
const PILLAGE_INTERVAL = 10;

export class BanditThreatSystem {
    constructor(banditCampSystem, fogSystem, villagerManager, resourceSystem, buildSystem, tileMap) {
        this._banditCampSystem = banditCampSystem;
        this._fogSystem        = fogSystem;
        this._villagerManager  = villagerManager;
        this._resourceSystem   = resourceSystem;
        this._buildSystem      = buildSystem;
        this._tileMap          = tileMap;

        this._state             = 'inactive';   // 'inactive' | 'raiding' | 'pillaging'
        this._triggered         = false;
        this._zeroMoneyCycles   = 0;
        this._pillageCounter    = 0;
        this._pillageTargetUid  = null;
        this._lastStealAmount   = 0;

        GameEvents.on(EventNames.PRODUCTION_TICK, () => this._onTick());

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            if (this._pillageTargetUid === uid) {
                this._pillageTargetUid = null;
                if (this._state === 'pillaging') this._selectNewTarget();
            }
        });

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED, () => {
            this._triggered        = false;
            this._zeroMoneyCycles  = 0;
            this._pillageCounter   = 0;
            this._pillageTargetUid = null;
            this._lastStealAmount  = 0;
            this._setState('inactive');
        });
    }

    getState() { return this._state; }

    // ── Private ──────────────────────────────────────────────────────────────────

    _onTick() {
        if (!this._banditCampSystem.isActive()) return;

        if (!this._triggered) {
            const spotted = this._banditCampSystem.claimedTiles.some(
                ({ col, row }) => this._fogSystem.getState(col, row) === FOG_VISIBLE
            );
            if (spotted && this._villagerManager.total >= POP_THRESHOLD) {
                this._triggered = true;
                this._lastStealAmount = this._getStealAmount();
                this._setState('raiding');
                GameEvents.emit(EventNames.SHOW_NOTIFICATION,
                    { message: 'Bandits are eyeing your growing village!' });
            }
            return;
        }

        // Check if steal tier changed (population crossed a bracket)
        const stealAmount = this._getStealAmount();
        if (stealAmount !== this._lastStealAmount) {
            this._lastStealAmount = stealAmount;
            // Re-emit state with updated amount so BanditAlert refreshes
            GameEvents.emit(EventNames.BANDIT_THREAT_STATE_CHANGED,
                { state: this._state, stealAmount });
        }

        // Steal gold
        const currentMoney = this._resourceSystem.get('money');
        const actualSteal  = Math.min(stealAmount, currentMoney);
        if (actualSteal > 0) this._resourceSystem.spend({ money: actualSteal });

        const fullPaid = currentMoney >= stealAmount;

        if (fullPaid) {
            this._zeroMoneyCycles = 0;
            if (this._state === 'pillaging') {
                this._pillageCounter   = 0;
                this._pillageTargetUid = null;
                GameEvents.emit(EventNames.BANDIT_PILLAGE_TARGET, { buildingUid: null });
                this._setState('raiding');
            }
        } else {
            this._zeroMoneyCycles++;
            if (this._zeroMoneyCycles > GRACE_CYCLES) {
                if (this._state !== 'pillaging') {
                    this._setState('pillaging');
                    GameEvents.emit(EventNames.SHOW_NOTIFICATION,
                        { message: 'Bandits are pillaging your town!' });
                    this._selectNewTarget();
                }
                this._pillageCounter++;
                if (this._pillageCounter >= PILLAGE_INTERVAL) {
                    this._pillageCounter = 0;
                    this._destroyTarget();
                }
            }
        }
    }

    _getStealAmount() {
        const pop = this._villagerManager.total;
        if (pop >= 20) return 10;
        if (pop >= 15) return 5;
        return 1;
    }

    _setState(state) {
        if (this._state === state) return;
        this._state = state;
        GameEvents.emit(EventNames.BANDIT_THREAT_STATE_CHANGED,
            { state, stealAmount: this._getStealAmount() });
    }

    _selectNewTarget() {
        const candidates = [];
        for (const b of this._buildSystem.placedBuildings.values()) {
            if (b.configId !== 'TOWN_HALL') candidates.push(b);
        }
        if (candidates.length === 0) {
            this._pillageTargetUid = null;
            GameEvents.emit(EventNames.BANDIT_PILLAGE_TARGET, { buildingUid: null });
            return;
        }
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this._pillageTargetUid = target.uid;
        GameEvents.emit(EventNames.BANDIT_PILLAGE_TARGET, { buildingUid: target.uid });
    }

    _destroyTarget() {
        const uid = this._pillageTargetUid;
        const building = uid ? this._buildSystem.placedBuildings.get(uid) : null;
        if (!building) {
            this._selectNewTarget();
            return;
        }
        const label = BUILDING_CONFIGS[building.configId]?.label ?? building.configId;
        // Null out target before demolish so BUILDING_REMOVED handler doesn't double-select
        this._pillageTargetUid = null;
        GameEvents.emit(EventNames.SHOW_NOTIFICATION,
            { message: `Bandits destroyed your ${label}!` });
        this._buildSystem.demolishHard(uid, this._tileMap, this._villagerManager);
        // Pick next target for the next pillage cycle
        this._selectNewTarget();
    }
}
