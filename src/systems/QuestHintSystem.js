import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

/**
 * Derives a single guided-onboarding hint from the first incomplete task of the
 * active quest and broadcasts it as QUEST_HINT_CHANGED { hint }.
 *
 * Hints are derived purely from the task type — no extra config in QuestConfig:
 *   buildingPlaced    → { type: 'buildButton',  configId }
 *   buildingConnected → { type: 'roadPath',     targetConfigId }
 *   workerAssigned    → { type: 'assignWorker', configId }
 *   resourceProduced  → { type: 'resource',     resource }
 *   other / none      → null
 */
export class QuestHintSystem {
    /**
     * @param {import('./QuestSystem.js').QuestSystem} questSystem
     */
    constructor(questSystem) {
        this._questSystem = questSystem;
        this._currentHint = null;

        GameEvents.on(EventNames.QUEST_STARTED,        () => this._refresh());
        GameEvents.on(EventNames.QUEST_TASK_COMPLETED, () => this._refresh());
        GameEvents.on(EventNames.QUEST_COMPLETED,      () => this._refresh());

        this._refresh();
    }

    /** The active hint, for consumers constructed after the last emit. */
    get currentHint() {
        return this._currentHint;
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    _refresh() {
        const hint = this._deriveHint(this._questSystem.activeTask);
        if (this._hintsEqual(hint, this._currentHint)) return;
        this._currentHint = hint;
        GameEvents.emit(EventNames.QUEST_HINT_CHANGED, { hint });
    }

    _deriveHint(task) {
        if (!task) return null;
        switch (task.type) {
            case 'buildingPlaced':    return { type: 'buildButton',  configId: task.configId };
            case 'buildingConnected': return { type: 'roadPath',     targetConfigId: task.configId ?? null };
            case 'workerAssigned':    return { type: 'assignWorker', configId: task.configId ?? null };
            case 'resourceProduced':  return { type: 'resource',     resource: task.resource };
            default:                  return null;
        }
    }

    _hintsEqual(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        return a.type === b.type
            && a.configId === b.configId
            && a.targetConfigId === b.targetConfigId
            && a.resource === b.resource;
    }
}
