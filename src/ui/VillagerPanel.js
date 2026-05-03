import { BUILDING_CONFIGS, FOREST_TILES_PER_WORKER } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const LABEL_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '11px',
    color:      '#ddeeff',
};

const BTN_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '14px',
    color:      '#ffffff',
};

// Sits below TileInfoPanel (230px tall, from PY=50 to 280) + 5px gap
const PX = 762;
const PY = 290;

export class VillagerPanel {
    constructor(scene, buildSystem, villagerManager) {
        this.scene          = scene;
        this.buildSystem    = buildSystem;
        this.villagerManager = villagerManager;

        this._currentBuildingUid = null;
        this._unassigned         = 0;

        // Background
        this._bg = scene.add.image(PX, PY, 'ui-sidepanel')
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false)
            .setDisplaySize(200, 100);

        this._title = scene.add.text(PX + 8, PY + 8, 'Assign Villagers', LABEL_STYLE)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        this._countLabel = scene.add.text(PX + 8, PY + 28, '', LABEL_STYLE)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        this._freeLabel = scene.add.text(PX + 8, PY + 46, '', LABEL_STYLE)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        // Minus button
        this._btnMinus = scene.add.image(PX + 10, PY + 70, 'btn-small')
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this._lblMinus = scene.add.text(PX + 24, PY + 70, '–', BTN_STYLE)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        // Plus button
        this._btnPlus = scene.add.image(PX + 50, PY + 70, 'btn-small')
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        this._lblPlus = scene.add.text(PX + 64, PY + 70, '+', BTN_STYLE)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        this._btnMinus.on('pointerdown', () => {
            if (this._currentBuildingUid) {
                GameEvents.emit(EventNames.VILLAGER_UNASSIGN_REQUEST, {
                    buildingUid: this._currentBuildingUid,
                    count: 1,
                });
            }
        });

        this._btnPlus.on('pointerdown', () => {
            if (this._currentBuildingUid) {
                GameEvents.emit(EventNames.VILLAGER_ASSIGN_REQUEST, {
                    buildingUid: this._currentBuildingUid,
                    count: 1,
                });
            }
        });

        this._btnMinus.on('pointerover', () => this._btnMinus.setTexture('btn-small-hover'));
        this._btnMinus.on('pointerout',  () => this._btnMinus.setTexture('btn-small'));
        this._btnPlus.on('pointerover',  () => this._btnPlus.setTexture('btn-small-hover'));
        this._btnPlus.on('pointerout',   () => this._btnPlus.setTexture('btn-small'));

        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row }) => {
            const building = buildSystem.getBuildingAt(col, row);
            const cfg = building && BUILDING_CONFIGS[building.configId];
            if (building && (cfg.maxVillagers > 0 || cfg.claimsTileType)) {
                this._currentBuildingUid = building.uid;
                this._refresh();
                this._setVisible(true);
            } else {
                this._setVisible(false);
                this._currentBuildingUid = null;
            }
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._setVisible(false);
            this._currentBuildingUid = null;
        });

        GameEvents.on(EventNames.VILLAGERS_CHANGED, ({ unassigned }) => {
            this._unassigned = unassigned;
            if (this._currentBuildingUid) this._refresh();
        });
    }

    _refresh() {
        const building = this.buildSystem.getBuilding(this._currentBuildingUid);
        if (!building) return;
        const config  = BUILDING_CONFIGS[building.configId];
        const assigned = building.assignedVillagers ?? 0;
        const max      = config.claimsTileType === 'FOREST'
            ? Math.ceil(building.forestTiles.length / FOREST_TILES_PER_WORKER)
            : config.claimsTileType
                ? building.fieldTiles.length
                : config.maxVillagers;

        const label    = config.id === 'BARRACKS' ? 'Warriors' : 'Workers';
        const effective = assigned + (building.pendingWorkers ?? 0);
        this._countLabel.setText(`${label}: ${effective} / ${max}`);
        this._freeLabel.setText(`Free: ${this._unassigned}`);
    }

    _setVisible(v) {
        [this._bg, this._title, this._countLabel, this._freeLabel,
         this._btnMinus, this._lblMinus, this._btnPlus, this._lblPlus
        ].forEach(o => o.setVisible(v));
    }
}
