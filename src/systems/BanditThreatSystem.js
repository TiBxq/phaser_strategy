import { FOG_VISIBLE } from './FogOfWarSystem.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const POP_THRESHOLD = 10;
const GRACE_CYCLES  = 5;

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
            this._pillageTargetUid = null;
            this._lastStealAmount  = 0;
            this._setState('inactive');
        });
    }

    getState() { return this._state; }

    /** Current pillage target uid, or null (used by save system and UI restore). */
    getPillageTargetUid() { return this._pillageTargetUid; }

    /** Public steal-tier accessor for UI re-emission after load. */
    getStealAmount() { return this._getStealAmount(); }

    toJSON() {
        return {
            state:            this._state,
            triggered:        this._triggered,
            zeroMoneyCycles:  this._zeroMoneyCycles,
            pillageTargetUid: this._pillageTargetUid,
            lastStealAmount:  this._lastStealAmount,
        };
    }

    /** Silent restore — UI.create() re-emits BANDIT_THREAT_STATE_CHANGED at its end. */
    fromJSON(data) {
        this._state            = data.state;
        this._triggered        = data.triggered;
        this._zeroMoneyCycles  = data.zeroMoneyCycles;
        this._pillageTargetUid = data.pillageTargetUid;
        this._lastStealAmount  = data.lastStealAmount;
    }

    /** Pick a new pillage target, excluding a building the raiders cannot reach.
     *  Falls back to the excluded one when it is the only candidate left. */
    reselectTarget(excludeUid) {
        this._selectNewTarget(excludeUid);
    }

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
                this._pillageTargetUid = null;
                GameEvents.emit(EventNames.BANDIT_PILLAGE_TARGET, { buildingUid: null });
                this._setState('raiding');
            }
        } else {
            this._zeroMoneyCycles++;
            if (this._zeroMoneyCycles > GRACE_CYCLES && this._state !== 'pillaging') {
                this._setState('pillaging');
                GameEvents.emit(EventNames.SHOW_NOTIFICATION,
                    { message: 'Bandits are pillaging your town!' });
                this._selectNewTarget();
            }
            // Physical destruction is RaidSystem's job — it reacts to the
            // 'pillaging' state change and marches the bandits out.
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

    _selectNewTarget(excludeUid = null) {
        let candidates = [];
        for (const b of this._buildSystem.placedBuildings.values()) {
            if (b.configId !== 'TOWN_HALL') candidates.push(b);
        }
        if (excludeUid && candidates.length >= 2) {
            candidates = candidates.filter(b => b.uid !== excludeUid);
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
}
