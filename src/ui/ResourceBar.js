import { RESOURCE_NAMES } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const ICON_KEYS = {
    food:  'icon-food',
    wood:  'icon-wood',
    stone: 'icon-stone',
    money: 'icon-money',
};

const TEXT_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '11px',
    color:      '#eeeeff',
};

export class ResourceBar {
    constructor(scene) {
        this.scene = scene;

        // Background
        scene.add.image(480, 0, 'ui-topbar').setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);

        this._labels        = {};
        this._prevValues    = {};
        this._flashing      = new Set();   // resource names currently mid-flash
        this._starvingFlash = false;

        const slotW  = 200;
        const startX = 30;
        const y      = 20;

        RESOURCE_NAMES.forEach((name, i) => {
            const x = startX + i * slotW;

            // Icon
            scene.add.image(x, y, ICON_KEYS[name])
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(1001);

            // Label  "wood: 60/200"
            const label = scene.add.text(x + 20, y, `${name}: --/--`, TEXT_STYLE)
                .setOrigin(0, 0.5)
                .setScrollFactor(0)
                .setDepth(1001);

            this._labels[name] = label;
        });

        // Villager count (far right)
        this._villagerLabel = scene.add.text(880, y, 'Villagers: 0 (0 free)', TEXT_STYLE)
            .setOrigin(1, 0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        // Subscribe
        GameEvents.on(EventNames.RESOURCES_CHANGED, (data) => this._onResourcesChanged(data));
        GameEvents.on(EventNames.VILLAGERS_CHANGED, (data) => this._onVillagersChanged(data));
        GameEvents.on(EventNames.STARVATION_WARNING, () => this._flashFood());
    }

    _onResourcesChanged(data) {
        this._starvingFlash = false;
        for (const name of RESOURCE_NAMES) {
            const lbl = this._labels[name];
            if (!lbl) continue;
            const amount = data[name] ?? 0;
            const cap    = data.cap ?? 200;
            lbl.setText(`${name}: ${amount}/${cap}`);

            const prev = this._prevValues[name] ?? 0;
            if (amount > prev) {
                this._flashLabel(name, lbl);
            } else if (!this._flashing.has(name)) {
                lbl.setColor('#eeeeff');
            }
            this._prevValues[name] = amount;
        }
    }

    _flashLabel(name, lbl) {
        this._flashing.add(name);
        lbl.setColor('#ffff66');
        this.scene.time.delayedCall(400, () => {
            this._flashing.delete(name);
            lbl.setColor('#eeeeff');
        });
    }

    _onVillagersChanged({ total, unassigned }) {
        this._villagerLabel.setText(`Villagers: ${total} (${unassigned} free)`);
    }

    _flashFood() {
        const lbl = this._labels['food'];
        if (!lbl || this._starvingFlash) return;
        this._starvingFlash = true;
        lbl.setColor('#ff4444');
    }
}
