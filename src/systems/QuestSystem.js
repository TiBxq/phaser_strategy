import { QUESTS } from '../data/QuestConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class QuestSystem {
    /**
     * @param {import('./BuildSystem.js').BuildSystem} buildSystem
     * @param {import('./VillagerManager.js').VillagerManager} villagerManager
     */
    constructor(buildSystem, villagerManager, resourceSystem) {
        this._buildSystem     = buildSystem;
        this._villagerManager = villagerManager;
        this._resourceSystem  = resourceSystem;

        /** Index into QUESTS for the active quest. */
        this._questIndex = 0;

        /** taskId → boolean completion flag; only contains tasks for the active quest. */
        this._taskStates = new Map();

        /** taskId → cumulative produced amount for resourceProduced tasks. */
        this._producedCounters = new Map();

        // Wire game events to task-completion checks
        GameEvents.on(EventNames.BUILDING_PLACED,
            ({ building }) => this._onBuildingPlaced(building));

        GameEvents.on(EventNames.BUILDING_CONNECTIVITY_CHANGED,
            ({ changed }) => this._onConnectivityChanged(changed));

        GameEvents.on(EventNames.VILLAGERS_CHANGED,
            () => this._onVillagersChanged());

        GameEvents.on(EventNames.WARRIORS_CHANGED,
            () => this._onWarriorsChanged());

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED,
            () => this._onCampCleared());

        GameEvents.on(EventNames.RESOURCES_CHANGED,
            () => this._onResourcesChanged());

        GameEvents.on(EventNames.PRODUCTION_TICK,
            ({ produced }) => this._onProductionTick(produced));

        // Begin the first quest
        this._startQuest(0);
    }

    // ─── Save / load ───────────────────────────────────────────────────────────

    toJSON() {
        return {
            questIndex:       this._questIndex,
            taskStates:       [...this._taskStates],
            producedCounters: [...this._producedCounters],
        };
    }

    /**
     * Restores quest progress. Must NOT go through _startQuest(): it would wipe
     * the restored task states and _checkExistingState() would cascade quest
     * completions (with notification spam) against the hydrated build state.
     * Emits QUEST_STARTED so QuestHintSystem refreshes before the UI exists.
     */
    fromJSON(data) {
        this._questIndex       = data.questIndex;
        this._taskStates       = new Map(data.taskStates);
        this._producedCounters = new Map(data.producedCounters);
        GameEvents.emit(EventNames.QUEST_STARTED, { quest: this.currentQuest });
    }

    // ─── Public API (used by QuestPanel) ──────────────────────────────────────

    /** The currently active quest object from QuestConfig. */
    get currentQuest() {
        return QUESTS[this._questIndex];
    }

    /** Whether the given task (by id) has been completed. */
    isTaskDone(taskId) {
        return this._taskStates.get(taskId) ?? false;
    }

    /** True when the player has reached the terminal "Enjoy the Game!" quest. */
    isComplete() {
        return this.currentQuest.id === 'ENJOY';
    }

    /** The first incomplete task of the active quest, or null (used for hints). */
    get activeTask() {
        return this.currentQuest.tasks.find(t => !this.isTaskDone(t.id)) ?? null;
    }

    /**
     * Returns { current, target } for tasks that have a numeric progress indicator,
     * or null for tasks that are simply done/not-done.
     */
    getTaskProgress(taskId) {
        const task = this.currentQuest.tasks.find(t => t.id === taskId);
        if (!task) return null;
        if (task.type === 'populationReached')
            return { current: this._villagerManager.total, target: task.count };
        if (task.type === 'goldCollected')
            return { current: this._resourceSystem.get('money'), target: task.amount };
        if (task.type === 'resourceProduced')
            return { current: this._producedCounters.get(taskId) ?? 0, target: task.amount };
        return null;
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    _startQuest(index) {
        this._questIndex = index;
        const quest = QUESTS[index];

        this._taskStates.clear();
        this._producedCounters.clear();
        for (const task of quest.tasks) {
            this._taskStates.set(task.id, false);
            if (task.type === 'resourceProduced') this._producedCounters.set(task.id, 0);
        }

        GameEvents.emit(EventNames.QUEST_STARTED, { quest });

        // Auto-complete any tasks already satisfied at quest start.
        this._checkExistingState();

        // Terminal quest has no tasks — emit completed immediately so the panel
        // can switch to its congratulation state.
        if (quest.tasks.length === 0) {
            GameEvents.emit(EventNames.QUEST_COMPLETED, { quest });
        }
    }

    _checkExistingState() {
        const placed = [...this._buildSystem.placedBuildings.values()];
        for (const task of this.currentQuest.tasks) {
            if (task.type === 'buildingPlaced') {
                if (placed.some(b => b.configId === task.configId)) this._completeTask(task.id);
            } else if (task.type === 'buildingConnected') {
                if (placed.some(b => this._matchesConnectedTask(b, task))) this._completeTask(task.id);
            } else if (task.type === 'workerAssigned') {
                if (placed.some(b => this._matchesWorkerTask(b, task))) this._completeTask(task.id);
            } else if (task.type === 'warriorsHired') {
                const total = placed.filter(b => b.configId === 'BARRACKS')
                    .reduce((s, b) => s + b.assignedVillagers, 0);
                if (total >= task.count) this._completeTask(task.id);
            } else if (task.type === 'populationReached') {
                if (this._villagerManager.total >= task.count) this._completeTask(task.id);
            } else if (task.type === 'goldCollected') {
                if (this._resourceSystem.get('money') >= task.amount) this._completeTask(task.id);
            }
        }
    }

    _completeTask(taskId) {
        if (!this._taskStates.has(taskId)) return; // not a task in the active quest
        if (this._taskStates.get(taskId))   return; // already done

        this._taskStates.set(taskId, true);

        const quest = this.currentQuest;
        const task  = quest.tasks.find(t => t.id === taskId);
        GameEvents.emit(EventNames.QUEST_TASK_COMPLETED, { quest, task });

        // Check if every task in the quest is now done
        if (quest.tasks.every(t => this._taskStates.get(t.id))) {
            GameEvents.emit(EventNames.SHOW_NOTIFICATION,
                { message: `Quest complete: ${quest.label}!` });
            GameEvents.emit(EventNames.QUEST_COMPLETED, { quest });

            const nextIndex = this._questIndex + 1;
            if (nextIndex < QUESTS.length) {
                this._startQuest(nextIndex);
            }
        }
    }

    // ─── Task matchers ─────────────────────────────────────────────────────────

    /** buildingConnected: optional task.configId restricts which building counts. */
    _matchesConnectedTask(building, task) {
        if (!building.isConnected) return false;
        if (task.configId) return building.configId === task.configId;
        return building.configId !== 'TOWN_HALL';
    }

    /** workerAssigned: optional task.configId restricts which building counts. */
    _matchesWorkerTask(building, task) {
        if ((building.assignedVillagers ?? 0) < 1) return false;
        return !task.configId || building.configId === task.configId;
    }

    // ─── Event handlers ────────────────────────────────────────────────────────

    _onBuildingPlaced(building) {
        for (const task of this.currentQuest.tasks) {
            if (task.type === 'buildingPlaced' && task.configId === building.configId) {
                this._completeTask(task.id);
            }
        }
        // A building placed adjacent to an existing road is connected immediately,
        // without a BUILDING_CONNECTIVITY_CHANGED event — re-check connect tasks.
        for (const task of this.currentQuest.tasks) {
            if (task.type === 'buildingConnected' && this._matchesConnectedTask(building, task)) {
                this._completeTask(task.id);
            }
        }
    }

    _onConnectivityChanged(changed) {
        for (const task of this.currentQuest.tasks) {
            if (task.type !== 'buildingConnected') continue;
            if (changed.some(({ building }) => this._matchesConnectedTask(building, task))) {
                this._completeTask(task.id);
            }
        }
    }

    _onVillagersChanged() {
        for (const task of this.currentQuest.tasks) {
            if (task.type !== 'workerAssigned') continue;
            for (const building of this._buildSystem.placedBuildings.values()) {
                if (this._matchesWorkerTask(building, task)) {
                    this._completeTask(task.id);
                    break;
                }
            }
        }

        const popTask = this.currentQuest.tasks.find(t => t.type === 'populationReached');
        if (popTask && this._villagerManager.total >= popTask.count) {
            this._completeTask(popTask.id);
        }
    }

    _onProductionTick(produced) {
        for (const task of this.currentQuest.tasks) {
            if (task.type !== 'resourceProduced' || this.isTaskDone(task.id)) continue;
            const gain = produced?.[task.resource] ?? 0;
            if (gain <= 0) continue;
            const total = (this._producedCounters.get(task.id) ?? 0) + gain;
            this._producedCounters.set(task.id, total);
            // Progress display refreshes via RESOURCES_CHANGED (fires on every tick)
            if (total >= task.amount) {
                this._completeTask(task.id);
            }
        }
    }

    _onCampCleared() {
        const task = this.currentQuest.tasks.find(t => t.type === 'campCleared');
        if (task) this._completeTask(task.id);
    }

    _onResourcesChanged() {
        const task = this.currentQuest.tasks.find(t => t.type === 'goldCollected');
        if (task && this._resourceSystem.get('money') >= task.amount) {
            this._completeTask(task.id);
        }
    }

    _onWarriorsChanged() {
        // Find the warriorsHired task in the current quest (if any)
        const task = this.currentQuest.tasks.find(t => t.type === 'warriorsHired');
        if (!task) return;

        let total = 0;
        for (const building of this._buildSystem.placedBuildings.values()) {
            if (building.configId === 'BARRACKS') {
                total += building.assignedVillagers;
            }
        }
        if (total >= task.count) {
            this._completeTask(task.id);
        }
    }
}
