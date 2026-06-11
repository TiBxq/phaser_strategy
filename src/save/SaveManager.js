import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

/**
 * Single-slot save/load orchestrator backed by localStorage.
 *
 * Serialization lives on each system as toJSON()/fromJSON(data) so private
 * fields stay encapsulated — this module only composes the versioned envelope
 * and drives the hydration / renderer-sync order on load.
 */
const SAVE_KEY     = 'homestead-frontier.save';
const SAVE_VERSION = 1;

export const SaveManager = {
    /** True when a parseable save of the current version exists. */
    hasSave() {
        return this.load() !== null;
    },

    /** Returns the parsed snapshot, or null (missing / corrupt / wrong version). */
    load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const snapshot = JSON.parse(raw);
            if (snapshot?.version !== SAVE_VERSION) {
                this.clear();
                return null;
            }
            return snapshot;
        } catch {
            this.clear();
            return null;
        }
    },

    clear() {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {
            // localStorage unavailable (private mode) — nothing to clear
        }
    },

    /** Snapshots the live game scene. Returns true on success. */
    save(gameScene) {
        try {
            const snapshot = this._buildSnapshot(gameScene);
            localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
            return true;
        } catch {
            return false;
        }
    },

    _buildSnapshot(gameScene) {
        const vm = gameScene.villagerManager;

        // Fold in-transit workers back into the unassigned pool: their march is
        // cancelled by the save (entities are not serialized), so the reserved
        // slot must be released or the villager would leak permanently.
        let pendingWorkers = 0;
        for (const b of gameScene.buildSystem.placedBuildings.values()) {
            pendingWorkers += b.pendingWorkers ?? 0;
        }

        return {
            version:   SAVE_VERSION,
            timestamp: Date.now(),
            camera: {
                scrollX: gameScene.cameras.main.scrollX,
                scrollY: gameScene.cameras.main.scrollY,
            },
            map:       gameScene.tileMap.toJSON(),
            resources: gameScene.resourceSystem.toJSON(),
            buildings: gameScene.buildSystem.toJSON(),
            villagers: {
                total:       vm.total,
                unassigned:  vm.unassigned + pendingWorkers,
                assignments: [...vm.assignments],
            },
            roads:        gameScene.roadSystem.toJSON(),
            fog:          gameScene.fogOfWarSystem.toJSON(),
            quests:       gameScene.questSystem.toJSON(),
            hunger:       gameScene.hungerSystem.toJSON(),
            banditCamp:   gameScene.banditCampSystem.toJSON(),
            banditThreat: gameScene.banditThreatSystem.toJSON(),
            combat:       { campHp: gameScene.combatSystem.campHp },
            ui: {
                everPlaced:          this._getEverPlaced(gameScene),
                cameraHintDismissed: gameScene.scene.get('UI')?.cameraHint?.isDismissed() ?? false,
            },
        };
    },

    _getEverPlaced(gameScene) {
        const menu = gameScene.scene.get('UI')?.buildingMenu;
        if (menu?.getEverPlaced) return menu.getEverPlaced();
        // UI not up yet — derive from currently placed buildings
        return [...new Set(
            [...gameScene.buildSystem.placedBuildings.values()].map(b => b.configId),
        )];
    },

    /**
     * Restores pure-state systems after construction, before any renderer exists.
     * Quests go last so their QUEST_STARTED emission sees fully-hydrated state.
     */
    hydrateSystems(gameScene, snapshot) {
        gameScene.resourceSystem.fromJSON(snapshot.resources);
        gameScene.buildSystem.fromJSON(snapshot.buildings);
        gameScene.roadSystem.fromJSON(snapshot.roads);
        gameScene.villagerManager.fromJSON(snapshot.villagers);
        gameScene.fogOfWarSystem.fromJSON(snapshot.fog);
        gameScene.hungerSystem.fromJSON(snapshot.hunger);
        gameScene.banditCampSystem.fromJSON(snapshot.banditCamp);
        gameScene.banditThreatSystem.fromJSON(snapshot.banditThreat);
        gameScene.questSystem.fromJSON(snapshot.quests);
    },

    /**
     * Rebuilds the event-driven renderers from hydrated system state.
     * Called after all renderers and the combat system are constructed.
     */
    syncRenderers(gameScene) {
        gameScene.buildingRenderer.syncFromState();
        gameScene.villagerRenderer.hydrateStationed();
        // Spawns the free wanderers (entity pool tops up to villagerManager.total)
        gameScene.villagerManager.notifyChanged();

        for (const b of gameScene.buildSystem.placedBuildings.values()) {
            if (b.configId === 'BARRACKS' && b.assignedVillagers > 0) {
                GameEvents.emit(EventNames.WARRIORS_CHANGED, { buildingUid: b.uid, building: b });
            }
        }

        GameEvents.emit(EventNames.BANDIT_PILLAGE_TARGET, {
            buildingUid: gameScene.banditThreatSystem.getPillageTargetUid(),
        });
    },
};
