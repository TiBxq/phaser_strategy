import Phaser from 'phaser';
import { ResourceBar } from '../ui/ResourceBar.js';
import { BuildingMenu } from '../ui/BuildingMenu.js';
import { TileInfoPanel } from '../ui/TileInfoPanel.js';
import { VillagerPanel } from '../ui/VillagerPanel.js';
import { BuildModeIndicator } from '../ui/BuildModeIndicator.js';
import { NotificationManager } from '../ui/NotificationManager.js';
import { HungerAlert } from '../ui/HungerAlert.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class UI extends Phaser.Scene {
    constructor() {
        super({ key: 'UI' });
    }

    create() {
        // Get references to the systems living in the Game scene
        const gameScene = this.scene.get('Game');

        this.resourceBar  = new ResourceBar(this);
        this.buildingMenu = new BuildingMenu(this, gameScene.resourceSystem, gameScene.buildSystem);
        this.buildModeIndicator = new BuildModeIndicator(this);
        this.notificationManager = new NotificationManager(this);
        this.tileInfoPanel = new TileInfoPanel(this, gameScene.buildSystem, gameScene.tileMap, gameScene.resourceSystem);
        this.villagerPanel = new VillagerPanel(this, gameScene.buildSystem, gameScene.villagerManager);
        this.hungerAlert   = new HungerAlert(this);

        // Wire villager assignment events to VillagerManager
        GameEvents.on(EventNames.VILLAGER_ASSIGN_REQUEST, ({ buildingUid, count }) => {
            gameScene.villagerManager.assign(buildingUid, count, gameScene.buildSystem);
        });

        GameEvents.on(EventNames.VILLAGER_UNASSIGN_REQUEST, ({ buildingUid, count }) => {
            gameScene.villagerManager.unassign(buildingUid, count, gameScene.buildSystem);
        });

        GameEvents.on(EventNames.BUILDING_UPGRADE_REQUEST, ({ buildingUid }) => {
            const result = gameScene.buildSystem.canUpgrade(buildingUid);
            if (!result.valid) {
                GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: result.reason });
                return;
            }
            gameScene.buildSystem.upgrade(buildingUid, gameScene.villagerManager);
        });

        // Trigger initial resource display
        const resources = gameScene.resourceSystem.getAll();
        GameEvents.emit(EventNames.RESOURCES_CHANGED, {
            ...resources,
            cap: gameScene.resourceSystem.getCap(),
        });
    }
}
