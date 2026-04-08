import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const LABEL_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '10px',
    color:      '#ddeeff',
};

const PRICE_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '9px',
    color:      '#ffdd88',
};

const RESOURCE_SYMBOLS = { food: 'F', wood: 'W', stone: 'S', money: '$' };

function formatCost(cost) {
    return Object.entries(cost)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${RESOURCE_SYMBOLS[k]}:${v}`)
        .join(' ');
}

// Displayed order of buildings in the menu
const MENU_ORDER = ['HOUSE', 'FARM', 'LUMBERMILL', 'QUARRY', 'MARKET', 'WAREHOUSE'];

export class BuildingMenu {
    constructor(scene, resourceSystem) {
        this.scene          = scene;
        this._resourceSystem = resourceSystem;
        this._activeId      = null;
        this._buttons       = {};
        this._priceTags     = {}; // id -> { text, cost }

        // Background
        scene.add.image(480, 640, 'ui-bottombar')
            .setOrigin(0.5, 1)
            .setScrollFactor(0)
            .setDepth(1000);

        const totalW  = 960;
        const btnW    = 148;
        const btnH    = 30;
        const gap     = (totalW - MENU_ORDER.length * btnW) / (MENU_ORDER.length + 1);
        const y       = 640 - 20;

        MENU_ORDER.forEach((id, i) => {
            const config = BUILDING_CONFIGS[id];
            const x = gap + i * (btnW + gap);

            const btn = scene.add.image(x, y, 'btn-normal')
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(1001)
                .setInteractive({ useHandCursor: true });

            const lbl = scene.add.text(x + btnW / 2, y - 7, config.label, LABEL_STYLE)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(1002);

            const priceText = scene.add.text(x + btnW / 2, y + 6, formatCost(config.cost), PRICE_STYLE)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(1002);

            this._priceTags[id] = { text: priceText, cost: config.cost };

            btn.on('pointerover', () => {
                if (this._activeId !== id) btn.setTexture('btn-hover');
            });
            btn.on('pointerout', () => {
                if (this._activeId !== id) btn.setTexture('btn-normal');
            });
            btn.on('pointerdown', () => {
                if (this._activeId === id) {
                    // Toggle off
                    this._deactivate();
                    GameEvents.emit(EventNames.BUILD_MODE_EXIT);
                } else {
                    this._activate(id);
                    GameEvents.emit(EventNames.BUILD_MODE_ENTER, { configId: id });
                }
            });

            this._buttons[id] = { btn, lbl };
        });

        // Exit build mode from outside (Escape / right-click)
        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => this._deactivate());

        // Update price colours when resources change
        GameEvents.on(EventNames.RESOURCES_CHANGED, () => this._updatePriceColors());
    }

    _updatePriceColors() {
        for (const [id, { text, cost }] of Object.entries(this._priceTags)) {
            const canAfford = this._resourceSystem.canAfford(cost);
            text.setColor(canAfford ? '#ffdd88' : '#ff4444');
        }
    }

    _activate(id) {
        this._deactivate();
        this._activeId = id;
        this._buttons[id]?.btn.setTexture('btn-active');
    }

    _deactivate() {
        if (this._activeId) {
            this._buttons[this._activeId]?.btn.setTexture('btn-normal');
        }
        this._activeId = null;
    }
}
