import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const HEADER_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '12px',
    color:      '#aaccff',
};

const BODY_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '10px',
    color:      '#ccddf0',
    wordWrap:   { width: 176 },
};

const BTN_LABEL_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '10px',
    color:      '#ffffff',
};

const BTN_COST_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '9px',
    color:      '#ffdd88',
};

const ICON_SIZE = 16;
const ICON_GAP  = 2;
const ENTRY_GAP = 5;
const NUM_W     = 18;

const PX = 762;   // panel left edge
const PY = 50;    // panel top edge

export class TileInfoPanel {
    constructor(scene, buildSystem, tileMap, resourceSystem) {
        this.scene          = scene;
        this.buildSystem    = buildSystem;
        this.tileMap        = tileMap;
        this._resourceSystem = resourceSystem;

        // Background (200×230 — VillagerPanel sits below at PY+235)
        this._bg = scene.add.image(PX, PY, 'ui-sidepanel')
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setDisplaySize(200, 230)
            .setVisible(false);

        this._titleText = scene.add.text(PX + 8, PY + 10, '', HEADER_STYLE)
            .setScrollFactor(0)
            .setDepth(1001);

        this._bodyText = scene.add.text(PX + 8, PY + 32, '', BODY_STYLE)
            .setScrollFactor(0)
            .setDepth(1001);

        this._noRoadText = scene.add.text(PX + 8, PY + 32, 'No road connection', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#ff4444',
        })
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        this._starvationText = scene.add.text(PX + 8, PY + 32, '', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#ff8800',
            wordWrap:   { width: 184 },
        })
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        // Upgrade button (hidden by default)
        // btn-normal is 148×30; centered in 200px panel → left edge at PX+26
        this._upgradeBtn = scene.add.image(PX + 26, PY + 155, 'btn-normal')
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        // "Upgrade" label in top half of button
        this._upgradeBtnLabel = scene.add.text(PX + 100, PY + 148, 'Upgrade', BTN_LABEL_STYLE)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        // Demolish button (hidden by default, red tint)
        this._demolishBtn = scene.add.image(PX + 26, PY + 197, 'btn-normal')
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001)
            .setTint(0xdd3333)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this._demolishBtnLabel = scene.add.text(PX + 100, PY + 197, 'Demolish', BTN_LABEL_STYLE)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        this._noWorkersText = scene.add.text(PX + 8, PY + 32, '⚠ No workers assigned!', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#ddaa00',
        })
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        this._depletedText = scene.add.text(PX + 8, PY + 32, '— Resource depleted', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#888888',
        })
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        // Pillage target warning (shown when this building is the bandit's next target)
        this._pillageWarningText = scene.add.text(PX + 8, PY + 32, '⚠ Targeted by bandits!', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#ff2222',
        })
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        // Cost icons/numbers — created dynamically, stored here for cleanup
        this._upgradeCostObjects = [];

        this._upgradeBtn.on('pointerover', () => {
            if (this._upgradeBtn.visible) this._upgradeBtn.setTexture('btn-hover');
        });
        this._upgradeBtn.on('pointerout', () => {
            if (this._upgradeBtn.visible) this._upgradeBtn.setTexture('btn-normal');
        });
        this._upgradeBtn.on('pointerdown', () => {
            if (this._currentUpgradeBuildingUid) {
                GameEvents.emit(EventNames.BUILDING_UPGRADE_REQUEST, {
                    buildingUid: this._currentUpgradeBuildingUid,
                });
            }
        });

        this._demolishBtn.on('pointerover', () => {
            if (this._demolishBtn.visible) {
                this._demolishBtn.setTexture('btn-hover').setTint(0xff4444);
            }
        });
        this._demolishBtn.on('pointerout', () => {
            if (this._demolishBtn.visible) {
                this._demolishBtn.setTexture('btn-normal').setTint(0xdd3333);
            }
        });
        this._demolishBtn.on('pointerdown', () => {
            if (this._currentDemolishBuildingUid) {
                GameEvents.emit(EventNames.BUILDING_DEMOLISH_REQUEST, {
                    buildingUid: this._currentDemolishBuildingUid,
                });
            } else if (this._currentDemolishRoadTile) {
                GameEvents.emit(EventNames.ROAD_DEMOLISH_REQUEST, this._currentDemolishRoadTile);
            }
        });

        // Attack Camp button (hidden by default, green tint)
        this._attackBtn = scene.add.image(PX + 26, PY + 197, 'btn-normal')
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001)
            .setTint(0x336633)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this._attackBtnLabel = scene.add.text(PX + 100, PY + 197, 'Attack Camp', BTN_LABEL_STYLE)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        this._attackBtn.on('pointerover', () => {
            if (this._attackBtn.visible) this._attackBtn.setTexture('btn-hover').setTint(0x44bb44);
        });
        this._attackBtn.on('pointerout', () => {
            if (this._attackBtn.visible) this._attackBtn.setTexture('btn-normal').setTint(0x336633);
        });
        this._attackBtn.on('pointerdown', () => {
            if (this._currentBanditCampTile) {
                GameEvents.emit(EventNames.BANDIT_CAMP_ATTACK_REQUEST);
            }
        });

        this._currentUpgradeBuildingUid  = null;
        this._currentDemolishBuildingUid = null;
        this._currentDemolishRoadTile    = null;
        this._currentBanditCampTile      = false;
        this._pillageTargetUid           = null;

        GameEvents.on(EventNames.BANDIT_PILLAGE_TARGET, ({ buildingUid }) => {
            const prev = this._pillageTargetUid;
            this._pillageTargetUid = buildingUid;
            if (this._currentTile) {
                const b = this.buildSystem.getBuildingAt(
                    this._currentTile.col, this._currentTile.row);
                // Refresh if the selected building gained or lost target status
                if (b && (b.uid === buildingUid || b.uid === prev)) {
                    this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
                }
            }
        });

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED, () => {
            this._pillageTargetUid = null;
            if (this._currentTile) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });

        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row, tile }) => {
            this._show(col, row, tile);
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => this._hide());

        GameEvents.on(EventNames.BUILDING_PLACED, () => {
            // If the selected tile now has a building, refresh
            if (this._currentTile) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });

        GameEvents.on(EventNames.BUILDING_UPGRADED, ({ building }) => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b?.uid === building.uid) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });

        GameEvents.on(EventNames.RESOURCES_CHANGED, () => {
            if (this._currentUpgradeBuildingUid) this._refreshUpgradeBtn();
        });

        GameEvents.on(EventNames.WARRIORS_CHANGED, () => {
            if (this._currentBanditCampTile) this._refreshAttackBtn();
        });

        GameEvents.on(EventNames.PRODUCTION_TICK, () => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b?.configId === 'LUMBERMILL' || b?.configId === 'QUARRY' ||
                b?.configId === 'IRON_MINE'  || b?.configId === 'SMITHY') {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });


        GameEvents.on(EventNames.TILE_DEPLETED, ({ buildingUid }) => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b?.uid === buildingUid) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });

        // Refresh if the selected building's connectivity changed
        GameEvents.on(EventNames.BUILDING_CONNECTIVITY_CHANGED, () => {
            if (this._currentTile) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });

        // Refresh when a villager departs or returns to the selected building
        GameEvents.on(EventNames.VILLAGER_DEPARTED, ({ buildingUid }) => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b?.uid === buildingUid)
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
        });

        GameEvents.on(EventNames.VILLAGERS_CHANGED, () => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b) this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
        });

        GameEvents.on(EventNames.VILLAGER_RETURNED, ({ buildingUid }) => {
            if (!this._currentTile) return;
            const b = this.buildSystem.getBuildingAt(this._currentTile.col, this._currentTile.row);
            if (b?.uid === buildingUid)
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
        });
    }

    _show(col, row, tile) {
        this._currentTile = { col, row, tile };

        this._bg.setVisible(true);
        this._titleText.setVisible(true);
        this._bodyText.setVisible(true);

        // ── Bandit Camp tile ───────────────────────────────────────────────────
        if (tile.banditCampTile) {
            this._currentBanditCampTile = true;
            this._noRoadText.setVisible(false);
            this._starvationText.setVisible(false);
            this._pillageWarningText.setVisible(false);
            this._noWorkersText.setVisible(false);
            this._depletedText.setVisible(false);
            this._currentUpgradeBuildingUid  = null;
            this._currentDemolishBuildingUid = null;
            this._currentDemolishRoadTile    = null;
            this._clearUpgradeBtn();
            this._demolishBtn.setVisible(false);
            this._demolishBtnLabel.setVisible(false);
            this._titleText.setText('Bandit Camp');
            this._bodyText.setText('Enemy encampment.\nClear to expand\nyour territory.\n\nRequires 5 warriors.');
            this._refreshAttackBtn();
            return;
        }
        this._currentBanditCampTile = false;
        this._attackBtn.setVisible(false);
        this._attackBtnLabel.setVisible(false);

        const building = this.buildSystem.getBuildingAt(col, row);
        const config   = building ? BUILDING_CONFIGS[building.configId] : null;

        if (config) {
            this._titleText.setText(config.label);
            const assigned = building.assignedVillagers;
            const maxV     = config.maxVillagers;
            let body = config.description + '\n';
            if (maxV > 0) {
                body += `\nWorkers: ${assigned}/${maxV}`;
            }
            if (config.producesResource) {
                body += `\nProduces: ${config.producesResource}`;
            }
            if (building.fieldTiles && building.fieldTiles.length > 0) {
                body += `\nFields: ${building.fieldTiles.length}`;
            }
            if (building.configId === 'LUMBERMILL') {
                const total = building.forestTiles.reduce(
                    (s, ft) => s + (this.tileMap.getTile(ft.col, ft.row)?.resources ?? 0), 0);
                body += `\nWood left: ${total}`;
            }
            if (building.configId === 'QUARRY') {
                const total = building.rocksTiles.reduce(
                    (s, ft) => s + (this.tileMap.getTile(ft.col, ft.row)?.resources ?? 0), 0);
                body += `\nStone left: ${total}`;
            }
            if (building.configId === 'IRON_MINE') {
                const total = building.ironTiles.reduce(
                    (s, ft) => s + (this.tileMap.getTile(ft.col, ft.row)?.resources ?? 0), 0);
                body += `\nIron left: ${total}`;
            }
            if (building.configId === 'SMITHY') {
                body += `\nProgress: ${building._smithyProgress}/5`;
                body += `\nIron needed: 10`;
            }
            // Resident count for spawnVillager buildings (House, Town Hall)
            if (config.onPlace === 'spawnVillager' && building.maxResidents > 0) {
                body += `\nResidents: ${building.residents}/${building.maxResidents}`;
            }
            this._bodyText.setText(body);

            if (!building.isConnected) {
                this._noRoadText.setY(PY + 32 + this._bodyText.height + 4);
                this._noRoadText.setVisible(true);
            } else {
                this._noRoadText.setVisible(false);
            }

            const lostCount = building.maxResidents - building.residents;
            if (config.onPlace === 'spawnVillager' && lostCount > 0) {
                const disconnectLost = building._disconnectDeparted ?? 0;
                const starvLost      = lostCount - disconnectLost;
                let lostMsg = '';
                if (disconnectLost > 0)
                    lostMsg += `${disconnectLost} left (no road)\n`;
                if (starvLost > 0)
                    lostMsg += `${starvLost} left (starvation)`;
                const noRoadH = this._noRoadText.visible ? this._noRoadText.height + 4 : 0;
                this._starvationText
                    .setText(lostMsg.trim())
                    .setY(PY + 32 + this._bodyText.height + 4 + noRoadH)
                    .setVisible(true);
            } else {
                this._starvationText.setVisible(false);
            }

            // Pillage target warning
            if (building.uid === this._pillageTargetUid) {
                const noRoadH = this._noRoadText.visible    ? this._noRoadText.height    + 4 : 0;
                const starvH  = this._starvationText.visible ? this._starvationText.height + 4 : 0;
                this._pillageWarningText
                    .setY(PY + 32 + this._bodyText.height + 4 + noRoadH + starvH)
                    .setVisible(true);
            } else {
                this._pillageWarningText.setVisible(false);
            }

            // No-workers warning
            const depleted = this._isBuildingDepleted(building);
            const effectiveMax = config.maxVillagers > 0 ? config.maxVillagers
                : config.claimsTileType === 'GRASS'   ? building.fieldTiles.length
                : config.claimsTileType === 'FOREST'  ? building.forestTiles.length
                : 0;
            if (building.isConnected && effectiveMax > 0 && building.assignedVillagers === 0 && !depleted) {
                const noRoadH  = this._noRoadText.visible      ? this._noRoadText.height      + 4 : 0;
                const starvH   = this._starvationText.visible  ? this._starvationText.height  + 4 : 0;
                const pillageH = this._pillageWarningText.visible ? this._pillageWarningText.height + 4 : 0;
                this._noWorkersText
                    .setY(PY + 32 + this._bodyText.height + 4 + noRoadH + starvH + pillageH)
                    .setVisible(true);
            } else {
                this._noWorkersText.setVisible(false);
            }

            // Depleted warning
            if (depleted) {
                const noRoadH   = this._noRoadText.visible       ? this._noRoadText.height       + 4 : 0;
                const starvH    = this._starvationText.visible   ? this._starvationText.height   + 4 : 0;
                const pillageH  = this._pillageWarningText.visible ? this._pillageWarningText.height + 4 : 0;
                const workersH  = this._noWorkersText.visible    ? this._noWorkersText.height    + 4 : 0;
                this._depletedText
                    .setY(PY + 32 + this._bodyText.height + 4 + noRoadH + starvH + pillageH + workersH)
                    .setVisible(true);
            } else {
                this._depletedText.setVisible(false);
            }

            if (config.upgradesTo) {
                this._currentUpgradeBuildingUid = building.uid;
                this._refreshUpgradeBtn();
            } else {
                this._currentUpgradeBuildingUid = null;
                this._clearUpgradeBtn();
            }

            // Demolish button — all buildings except Town Hall
            this._currentDemolishRoadTile = null;
            if (building.configId !== 'TOWN_HALL') {
                this._currentDemolishBuildingUid = building.uid;
                this._demolishBtnLabel.setText('Demolish').setVisible(true);
                this._demolishBtn.setVisible(true);
            } else {
                this._currentDemolishBuildingUid = null;
                this._demolishBtn.setVisible(false);
                this._demolishBtnLabel.setVisible(false);
            }
        } else if (tile.isRoad) {
            this._noRoadText.setVisible(false);
            this._starvationText.setVisible(false);
            this._pillageWarningText.setVisible(false);
            this._noWorkersText.setVisible(false);
            this._depletedText.setVisible(false);
            this._titleText.setText('Road');
            this._bodyText.setText('Road tile.\nConnects buildings\nto the Town Hall.\n\nReturns 1 money\nif removed.');
            this._currentUpgradeBuildingUid  = null;
            this._currentDemolishBuildingUid = null;
            this._currentDemolishRoadTile    = { col, row };
            this._clearUpgradeBtn();
            this._demolishBtnLabel.setText('Remove Road').setVisible(true);
            this._demolishBtn.setVisible(true);
        } else {
            this._noRoadText.setVisible(false);
            this._starvationText.setVisible(false);
            this._pillageWarningText.setVisible(false);
            this._noWorkersText.setVisible(false);
            this._depletedText.setVisible(false);
            this._titleText.setText(`Tile (${col}, ${row})`);
            const typeLabel = tile.isField
                ? 'Farm Field'
                : tile.type.charAt(0) + tile.type.slice(1).toLowerCase();
            this._bodyText.setText(
                `Type: ${typeLabel}\nNo building.\n\nSelect a building\nfrom the menu below\nto build here.`,
            );
            this._currentUpgradeBuildingUid  = null;
            this._currentDemolishBuildingUid = null;
            this._currentDemolishRoadTile    = null;
            this._clearUpgradeBtn();
            this._demolishBtn.setVisible(false);
            this._demolishBtnLabel.setVisible(false);
        }
    }

    _refreshUpgradeBtn() {
        const building = this.buildSystem.getBuilding(this._currentUpgradeBuildingUid);
        if (!building) return;
        const config      = BUILDING_CONFIGS[building.configId];
        const upgradeCost = config.upgradeCost;
        const canAfford   = this._resourceSystem.canAfford(upgradeCost);

        // Destroy previous cost icons
        for (const obj of this._upgradeCostObjects) obj.destroy();
        this._upgradeCostObjects = [];

        // Build icon + number row in the bottom half of the button (PY+163)
        const costEntries = Object.entries(upgradeCost).filter(([, v]) => v > 0);
        const entryW      = ICON_SIZE + ICON_GAP + NUM_W;
        const totalW      = costEntries.length * entryW + (costEntries.length - 1) * ENTRY_GAP;
        // Center icons within the 148px button (left edge PX+26)
        let iconX = PX + 26 + (148 - totalW) / 2;
        const iconY = PY + 163;
        const numColor = canAfford ? '#ffdd88' : '#ff4444';

        for (const [resource, amount] of costEntries) {
            const icon = this.scene.add.image(iconX + ICON_SIZE / 2, iconY, `icon-${resource}`)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(1002);
            const num = this.scene.add.text(iconX + ICON_SIZE + ICON_GAP, iconY, `${amount}`, BTN_COST_STYLE)
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(1002)
                .setColor(numColor);
            this._upgradeCostObjects.push(icon, num);
            iconX += entryW + ENTRY_GAP;
        }

        this._upgradeBtnLabel.setColor(canAfford ? '#ffffff' : '#aaaaaa').setVisible(true);
        this._upgradeBtn.setVisible(true);
    }

    _clearUpgradeBtn() {
        for (const obj of this._upgradeCostObjects) obj.destroy();
        this._upgradeCostObjects = [];
        this._upgradeBtn.setVisible(false);
        this._upgradeBtnLabel.setVisible(false);
    }

    _isBuildingDepleted(building) {
        let tiles;
        if (building.configId === 'LUMBERMILL') tiles = building.forestTiles;
        else if (building.configId === 'QUARRY')    tiles = building.rocksTiles;
        else if (building.configId === 'IRON_MINE') tiles = building.ironTiles;
        else return false;
        if (!tiles || tiles.length === 0) return false;
        return tiles.every(ft => (this.tileMap.getTile(ft.col, ft.row)?.resources ?? 0) === 0);
    }

    _refreshAttackBtn() {
        const enabled = this._totalWarriors() >= 5;
        this._attackBtn.setVisible(true);
        this._attackBtnLabel
            .setVisible(true)
            .setColor(enabled ? '#ffffff' : '#888888');
        if (enabled) {
            this._attackBtn.setInteractive({ useHandCursor: true });
        } else {
            this._attackBtn.disableInteractive();
        }
    }

    _totalWarriors() {
        let total = 0;
        for (const b of this.buildSystem.placedBuildings.values()) {
            if (b.configId === 'BARRACKS') total += b.assignedVillagers;
        }
        return total;
    }

    _hide() {
        this._currentTile = null;
        this._currentUpgradeBuildingUid  = null;
        this._currentDemolishBuildingUid = null;
        this._currentDemolishRoadTile    = null;
        this._currentBanditCampTile      = false;
        this._bg.setVisible(false);
        this._titleText.setVisible(false);
        this._bodyText.setVisible(false);
        this._noRoadText.setVisible(false);
        this._starvationText.setVisible(false);
        this._pillageWarningText.setVisible(false);
        this._noWorkersText.setVisible(false);
        this._depletedText.setVisible(false);
        this._clearUpgradeBtn();
        this._demolishBtn.setVisible(false);
        this._demolishBtnLabel.setText('Demolish').setVisible(false);
        this._attackBtn.setVisible(false);
        this._attackBtnLabel.setVisible(false);
    }
}
