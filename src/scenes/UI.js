import Phaser from 'phaser';
import { ResourceBar } from '../ui/ResourceBar.js';
import { BuildingMenu } from '../ui/BuildingMenu.js';
import { TileInfoPanel } from '../ui/TileInfoPanel.js';
import { VillagerPanel } from '../ui/VillagerPanel.js';
import { BuildModeIndicator } from '../ui/BuildModeIndicator.js';
import { NotificationManager } from '../ui/NotificationManager.js';
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
        this.buildingMenu = new BuildingMenu(this, gameScene.resourceSystem);
        this.buildModeIndicator = new BuildModeIndicator(this);
        this.notificationManager = new NotificationManager(this);
        this.tileInfoPanel = new TileInfoPanel(this, gameScene.buildSystem);
        this.villagerPanel = new VillagerPanel(this, gameScene.buildSystem, gameScene.villagerManager);

        // Wire villager assignment events to VillagerManager
        GameEvents.on(EventNames.VILLAGER_ASSIGN_REQUEST, ({ buildingUid, count }) => {
            gameScene.villagerManager.assign(buildingUid, count, gameScene.buildSystem);
        });

        GameEvents.on(EventNames.VILLAGER_UNASSIGN_REQUEST, ({ buildingUid, count }) => {
            gameScene.villagerManager.unassign(buildingUid, count, gameScene.buildSystem);
        });

        // Trigger initial resource display
        const resources = gameScene.resourceSystem.getAll();
        GameEvents.emit(EventNames.RESOURCES_CHANGED, {
            ...resources,
            cap: gameScene.resourceSystem.getCap(),
        });
    }
}
