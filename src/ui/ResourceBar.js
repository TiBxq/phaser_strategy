import { RESOURCE_NAMES } from '../data/ResourceConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const ICON_KEYS = {
    food:    'icon-food',
    wood:    'icon-wood',
    stone:   'icon-stone',
    money:   'icon-money',
    iron:    'icon-iron',
    weapons: 'icon-weapons',
};

const TEXT_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '11px',
    color:      '#eeeeff',
};

export class ResourceBar {
    constructor(scene, questHintSystem) {
        this.scene = scene;

        // Background
        scene.add.image(480, 0, 'ui-topbar').setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);

        this._labels        = {};
        this._icons         = {};
        this._prevValues    = {};
        this._flashing      = new Set();   // resource names currently mid-flash
        this._starvingFlash = false;
        this._hintResource  = null;        // resource slot pulsed by the quest hint
        this._hintTween     = null;

        const slotW  = 128;
        const startX = 30;
        const y      = 20;

        RESOURCE_NAMES.forEach((name, i) => {
            const x = startX + i * slotW;

            // Icon
            this._icons[name] = scene.add.image(x, y, ICON_KEYS[name])
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
        this._villagerLabel = scene.add.text(910, y, 'Villagers: 0 (0 free)', TEXT_STYLE)
            .setOrigin(1, 0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        // Subscribe
        GameEvents.on(EventNames.RESOURCES_CHANGED, (data) => this._onResourcesChanged(data));
        GameEvents.on(EventNames.VILLAGERS_CHANGED, (data) => this._onVillagersChanged(data));
        GameEvents.on(EventNames.STARVATION_WARNING, () => this._flashFood());
        GameEvents.on(EventNames.QUEST_HINT_CHANGED, ({ hint }) => this._applyHint(hint));
        this._applyHint(questHintSystem?.currentHint ?? null);
    }

    // ─── Quest hint pulse on a resource slot ───────────────────────────────────

    // Pulses alpha only — label color stays owned by the flash/starvation logic.
    _applyHint(hint) {
        const resource = hint?.type === 'resource' ? hint.resource : null;
        if (resource === this._hintResource) return;

        if (this._hintTween) {
            this._hintTween.stop();
            this._hintTween = null;
        }
        if (this._hintResource) {
            this._labels[this._hintResource]?.setAlpha(1);
            this._icons[this._hintResource]?.setAlpha(1);
        }

        this._hintResource = resource;
        if (resource && this._labels[resource]) {
            this._hintTween = this.scene.tweens.add({
                targets:  [this._labels[resource], this._icons[resource]],
                alpha:    { from: 1, to: 0.35 },
                duration: 600,
                ease:     'Sine.easeInOut',
                yoyo:     true,
                loop:     -1,
            });
        }
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
