import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { DEPTH_UI_BACKGROUND, DEPTH_UI_ELEMENT, DEPTH_UI_TEXT } from '../config/DepthLayers.js';

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

const ICON_SIZE  = 16;
const ICON_GAP   = 2;   // gap between icon and its number
const ENTRY_GAP  = 5;   // gap between cost entries
const NUM_W      = 18;  // approximate width of a cost number (up to 3 digits at 9px monospace)
const ENTRY_W    = ICON_SIZE + ICON_GAP + NUM_W;

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
        scene.add.image(scene.scale.width / 2, scene.scale.height, 'ui-bottombar')
            .setOrigin(0.5, 1)
            .setScrollFactor(0)
            .setDepth(DEPTH_UI_BACKGROUND);

        const canvasW  = scene.scale.width;
        const canvasH  = scene.scale.height;
        const barH     = 40;
        const btnW     = 148;
        const btnH     = 30;
        const gap      = (canvasW - MENU_ORDER.length * btnW) / (MENU_ORDER.length + 1);
        const y        = canvasH - barH / 2;

        MENU_ORDER.forEach((id, i) => {
            const config = BUILDING_CONFIGS[id];
            const x = gap + i * (btnW + gap);

            const btn = scene.add.image(x, y, 'btn-normal')
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(DEPTH_UI_ELEMENT)
                .setInteractive({ useHandCursor: true });

            const lbl = scene.add.text(x + btnW / 2, y - btnH / 4, config.label, LABEL_STYLE)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(DEPTH_UI_TEXT);

            const costEntries  = Object.entries(config.cost).filter(([, v]) => v > 0);
            const totalPriceW  = costEntries.length * ENTRY_W + (costEntries.length - 1) * ENTRY_GAP;
            let   priceX       = x + btnW / 2 - totalPriceW / 2;
            const priceTexts   = [];
            const priceY       = y + btnH / 4;

            for (const [resource, amount] of costEntries) {
                scene.add.image(priceX + ICON_SIZE / 2, priceY, `icon-${resource}`)
                    .setOrigin(0.5, 0.5)
                    .setScrollFactor(0)
                    .setDepth(DEPTH_UI_TEXT);
                const numText = scene.add.text(priceX + ICON_SIZE + ICON_GAP, priceY, `${amount}`, PRICE_STYLE)
                    .setOrigin(0, 0.5)
                    .setScrollFactor(0)
                    .setDepth(DEPTH_UI_TEXT);
                priceTexts.push(numText);
                priceX += ENTRY_W + ENTRY_GAP;
            }

            this._priceTags[id] = { texts: priceTexts, cost: config.cost };

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
        for (const { texts, cost } of Object.values(this._priceTags)) {
            const color = this._resourceSystem.canAfford(cost) ? '#ffdd88' : '#ff4444';
            for (const t of texts) t.setColor(color);
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
