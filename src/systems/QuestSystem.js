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

        // Begin the first quest
        this._startQuest(0);
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
        return null;
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    _startQuest(index) {
        this._questIndex = index;
        const quest = QUESTS[index];

        this._taskStates.clear();
        for (const task of quest.tasks) {
            this._taskStates.set(task.id, false);
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
                if (placed.some(b => b.isConnected && b.configId !== 'TOWN_HALL')) this._completeTask(task.id);
            } else if (task.type === 'workerAssigned') {
                if (placed.some(b => b.assignedVillagers >= 1)) this._completeTask(task.id);
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

    // ─── Event handlers ────────────────────────────────────────────────────────

    _onBuildingPlaced(building) {
        for (const task of this.currentQuest.tasks) {
            if (task.type === 'buildingPlaced' && task.configId === building.configId) {
                this._completeTask(task.id);
            }
        }
    }

    _onConnectivityChanged(changed) {
        for (const { building } of changed) {
            if (building.isConnected && building.configId !== 'TOWN_HALL') {
                this._completeTask('connect_road');
                return;
            }
        }
    }

    _onVillagersChanged() {
        for (const building of this._buildSystem.placedBuildings.values()) {
            if (building.assignedVillagers >= 1) {
                this._completeTask('assign_worker');
                break;
            }
        }

        const popTask = this.currentQuest.tasks.find(t => t.type === 'populationReached');
        if (popTask && this._villagerManager.total >= popTask.count) {
            this._completeTask(popTask.id);
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
