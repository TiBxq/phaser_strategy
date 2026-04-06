import { RESOURCE_NAMES, DEFAULT_CAP, STARTING_RESOURCES } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class ResourceSystem {
    constructor() {
        this._amounts = { ...STARTING_RESOURCES };
        this._cap     = DEFAULT_CAP;
    }

    // ─── Queries ───────────────────────────────────────────────────────────────

    get(name) {
        return this._amounts[name] ?? 0;
    }

    getCap() {
        return this._cap;
    }

    getAll() {
        return { ...this._amounts };
    }

    canAfford(costObj) {
        for (const [name, amount] of Object.entries(costObj)) {
            if ((this._amounts[name] ?? 0) < amount) return false;
        }
        return true;
    }

    // ─── Mutations ─────────────────────────────────────────────────────────────

    /**
     * Add `amount` of a resource, clamped to the cap.
     * Silently clamps — no error on overflow (excess is lost).
     */
    add(name, amount) {
        if (!RESOURCE_NAMES.includes(name)) return;
        this._amounts[name] = Math.min(this._cap, (this._amounts[name] ?? 0) + amount);
        this._emit();
    }

    /**
     * Deduct a cost object {name: amount, ...}.
     * Returns true on success, false if insufficient funds (no mutation on failure).
     */
    spend(costObj) {
        if (!this.canAfford(costObj)) return false;
        for (const [name, amount] of Object.entries(costObj)) {
            this._amounts[name] -= amount;
        }
        this._emit();
        return true;
    }

    /**
     * Increase the cap for all resources.
     * Does NOT reduce existing amounts if they exceed the old cap.
     */
    setCap(newCap) {
        this._cap = newCap;
        this._emit();
    }

    _emit() {
        GameEvents.emit(EventNames.RESOURCES_CHANGED, {
            ...this._amounts,
            cap: this._cap,
        });
    }
}
