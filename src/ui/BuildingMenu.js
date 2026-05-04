import { BUILDING_CONFIGS, ROAD_CONFIG } from '../data/BuildingConfig.js';
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

const LOCKED_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '9px',
    color:      '#888899',
};

const ICON_SIZE  = 16;
const ICON_GAP   = 2;   // gap between icon and its number
const ENTRY_GAP  = 5;   // gap between cost entries
const NUM_W      = 18;  // approximate width of a cost number (up to 3 digits at 9px monospace)
const ENTRY_W    = ICON_SIZE + ICON_GAP + NUM_W;

// Displayed order of buildings in the menu ('ROAD' is a special pseudo-entry)
const MENU_ORDER = ['TOWN_HALL', 'HOUSE', 'FARM', 'LUMBERMILL', 'QUARRY', 'IRON_MINE', 'SMITHY', 'BARRACKS', 'MARKET', 'WAREHOUSE', 'ROAD'];

export class BuildingMenu {
    constructor(scene, resourceSystem, buildSystem) {
        this.scene           = scene;
        this._resourceSystem = resourceSystem;
        this._buildSystem    = buildSystem;
        this._activeId       = null;
        this._buttons        = {};
        this._priceTags      = {}; // id -> { texts, cost }

        // Background
        scene.add.image(scene.scale.width / 2, scene.scale.height, 'ui-bottombar')
            .setOrigin(0.5, 1)
            .setScrollFactor(0)
            .setDepth(DEPTH_UI_BACKGROUND);

        const canvasW  = scene.scale.width;
        const canvasH  = scene.scale.height;
        const barH     = 40;
        const btnH     = 30;
        // Fit all buttons dynamically
        const MIN_GAP  = 8;
        const btnW     = Math.floor((canvasW - (MENU_ORDER.length + 1) * MIN_GAP) / MENU_ORDER.length);
        const gap      = (canvasW - MENU_ORDER.length * btnW) / (MENU_ORDER.length + 1);
        const y        = canvasH - barH / 2;

        this._btnH    = btnH;
        this._barY    = y;
        this._MIN_GAP = MIN_GAP;

        MENU_ORDER.forEach((id, i) => {
            const config = id === 'ROAD' ? ROAD_CONFIG : BUILDING_CONFIGS[id];
            const x = gap + i * (btnW + gap);

            const btn = scene.add.image(x, y, 'btn-normal')
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(DEPTH_UI_ELEMENT)
                .setDisplaySize(btnW, btnH)
                .setInteractive({ useHandCursor: true });

            const lbl = scene.add.text(x + btnW / 2, y - btnH / 4, config.label, LABEL_STYLE)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(DEPTH_UI_TEXT);

            const costEntries  = Object.entries(config.cost).filter(([, v]) => v > 0);
            const totalPriceW  = costEntries.length * ENTRY_W + (costEntries.length - 1) * ENTRY_GAP;
            let   priceX       = x + btnW / 2 - totalPriceW / 2;
            const priceTexts   = [];
            const priceIcons   = [];
            const priceY       = y + btnH / 4;

            for (const [resource, amount] of costEntries) {
                const icon = scene.add.image(priceX + ICON_SIZE / 2, priceY, `icon-${resource}`)
                    .setOrigin(0.5, 0.5)
                    .setScrollFactor(0)
                    .setDepth(DEPTH_UI_TEXT);
                const numText = scene.add.text(priceX + ICON_SIZE + ICON_GAP, priceY, `${amount}`, PRICE_STYLE)
                    .setOrigin(0, 0.5)
                    .setScrollFactor(0)
                    .setDepth(DEPTH_UI_TEXT);
                priceTexts.push(numText);
                priceIcons.push(icon);
                priceX += ENTRY_W + ENTRY_GAP;
            }

            // "Needs: X" label shown only when locked (hidden by default)
            const lockedLabel = scene.add.text(x + btnW / 2, priceY, '', LOCKED_STYLE)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(DEPTH_UI_TEXT)
                .setVisible(false);

            this._priceTags[id] = { texts: priceTexts, icons: priceIcons, cost: config.cost, lockedLabel };

            btn.on('pointerover', () => {
                if (this._activeId !== id) btn.setTexture('btn-hover');
            });
            btn.on('pointerout', () => {
                if (this._activeId !== id) btn.setTexture('btn-normal');
            });
            btn.on('pointerdown', () => {
                if (id === 'ROAD') {
                    if (this._activeId === 'ROAD') {
                        this._deactivate();
                        GameEvents.emit(EventNames.ROAD_MODE_EXIT);
                    } else {
                        this._activate('ROAD');
                        GameEvents.emit(EventNames.ROAD_MODE_ENTER);
                    }
                } else if (this._activeId === id) {
                    this._deactivate();
                    GameEvents.emit(EventNames.BUILD_MODE_EXIT);
                } else {
                    this._activate(id);
                    GameEvents.emit(EventNames.BUILD_MODE_ENTER, { configId: id });
                }
            });

            this._buttons[id] = { btn, lbl };
        });

        // Exit build/road mode from outside (Escape / right-click)
        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => this._deactivate());
        GameEvents.on(EventNames.ROAD_MODE_EXIT,  () => this._deactivate());

        // Update price colours when resources change
        GameEvents.on(EventNames.RESOURCES_CHANGED, () => this._updatePriceColors());

        // Re-evaluate lock conditions when any building is placed
        GameEvents.on(EventNames.BUILDING_PLACED, () => this._updateLockStates());

        // Apply initial lock states
        this._updateLockStates();
    }

    // ─── Lock system ───────────────────────────────────────────────────────────

    /**
     * Returns true if all requires conditions for this building ID are met.
     * Extensible: add new condition types here as the game grows.
     */
    _checkRequirements(id) {
        const config = id === 'ROAD' ? ROAD_CONFIG : BUILDING_CONFIGS[id];
        if (!config.requires || config.requires.length === 0) return true;
        return config.requires.every(req => {
            if (req.type === 'buildingPlaced') {
                for (const b of this._buildSystem.placedBuildings.values()) {
                    if (b.configId === req.configId) return true;
                }
                return false;
            }
            return true;
        });
    }

    _isTownHallPlaced() {
        for (const b of this._buildSystem.placedBuildings.values()) {
            if (b.configId === 'TOWN_HALL') return true;
        }
        return false;
    }

    _updateLockStates() {
        for (const id of MENU_ORDER) {
            const { btn, lbl } = this._buttons[id];
            const { texts, icons, lockedLabel } = this._priceTags[id];

            if (id === 'TOWN_HALL' && this._isTownHallPlaced()) {
                btn.setVisible(false).disableInteractive();
                lbl.setVisible(false);
                for (const t of texts) t.setVisible(false);
                for (const ic of icons) ic.setVisible(false);
                lockedLabel.setVisible(false);
                continue;
            }

            const unlocked = this._checkRequirements(id);
            const LOCKED_ALPHA = 0.4;

            if (unlocked) {
                btn.setAlpha(1).setInteractive({ useHandCursor: true });
                lbl.setAlpha(1);
                for (const t of texts) t.setVisible(true);
                for (const ic of icons) ic.setVisible(true);
                lockedLabel.setVisible(false);
            } else {
                // If this locked entry was active, cancel the appropriate mode
                if (this._activeId === id) {
                    this._deactivate();
                    GameEvents.emit(id === 'ROAD' ? EventNames.ROAD_MODE_EXIT : EventNames.BUILD_MODE_EXIT);
                }
                btn.setAlpha(LOCKED_ALPHA).disableInteractive();
                lbl.setAlpha(LOCKED_ALPHA);
                for (const t of texts) t.setVisible(false);
                for (const ic of icons) ic.setVisible(false);

                // Show what's needed
                lockedLabel.setText(this._lockedLabelText(id)).setVisible(true);
            }
        }
        this._relayout();
    }

    _relayout() {
        const visibleIds = MENU_ORDER.filter(id => !(id === 'TOWN_HALL' && this._isTownHallPlaced()));
        const n       = visibleIds.length;
        const canvasW = this.scene.scale.width;
        const btnH    = this._btnH;
        const btnW    = Math.floor((canvasW - (n + 1) * this._MIN_GAP) / n);
        const gap     = (canvasW - n * btnW) / (n + 1);
        const y       = this._barY;

        visibleIds.forEach((id, i) => {
            const x = gap + i * (btnW + gap);
            const { btn, lbl } = this._buttons[id];
            const { texts, icons, cost, lockedLabel } = this._priceTags[id];

            btn.setX(x).setDisplaySize(btnW, btnH);
            lbl.setX(x + btnW / 2);
            lockedLabel.setX(x + btnW / 2);

            const costEntries = Object.entries(cost).filter(([, v]) => v > 0);
            const totalPriceW = costEntries.length * ENTRY_W + (costEntries.length - 1) * ENTRY_GAP;
            const scale       = totalPriceW > 0 ? Math.min(1, (btnW - 8) / totalPriceW) : 1;
            let priceX = x + btnW / 2 - totalPriceW * scale / 2;
            for (let j = 0; j < costEntries.length; j++) {
                icons[j].setX(priceX + ICON_SIZE * scale / 2).setScale(scale);
                texts[j].setX(priceX + ICON_SIZE * scale + ICON_GAP * scale).setScale(scale);
                priceX += (ENTRY_W + ENTRY_GAP) * scale;
            }
        });
    }

    // ─── Price colours ─────────────────────────────────────────────────────────

    _updatePriceColors() {
        for (const id of MENU_ORDER) {
            if (!this._checkRequirements(id)) continue;
            const { texts, cost } = this._priceTags[id];
            const costEntries = Object.entries(cost).filter(([, v]) => v > 0);
            for (let j = 0; j < costEntries.length; j++) {
                const [resource, amount] = costEntries[j];
                const has = this._resourceSystem.get(resource) ?? 0;
                texts[j].setColor(has >= amount ? '#ffdd88' : '#ff4444');
            }
        }
    }

    // Also fix locked label for ROAD (uses ROAD_CONFIG.requires)
    _lockedLabelText(id) {
        const config   = id === 'ROAD' ? ROAD_CONFIG : BUILDING_CONFIGS[id];
        const firstReq = config.requires?.[0];
        if (firstReq?.type === 'buildingPlaced') {
            const reqLabel = BUILDING_CONFIGS[firstReq.configId]?.label ?? firstReq.configId;
            return `Needs: ${reqLabel}`;
        }
        return '';
    }

    // ─── Active state ──────────────────────────────────────────────────────────

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
