import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const HINT_X = 480;     // screen center (canvas 960×640)
const HINT_Y = 290;
const PAD_X  = 16;
const PAD_Y  = 9;
const BORDER = 2;

// How many completed pans before the hint goes away
const PANS_TO_DISMISS = 3;

export class CameraHint {
    constructor(scene, startDismissed = false) {
        this._scene     = scene;
        this._panCount  = 0;
        this._dismissed = startDismissed;

        // Already dismissed in a previous session (restored from a save) —
        // the player knows how to pan, never show the hint again.
        if (startDismissed) return;

        this._bg = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1001);

        this._icon = scene.add.image(0, 0, 'icon-mouse-right')
            .setScrollFactor(0)
            .setDepth(1002);

        this._text = scene.add.text(0, 0, 'Hold the right mouse button to move the camera', {
            fontFamily: 'monospace',
            fontSize:   '15px',
            fontStyle:  'bold',
            color:      '#ddddee',
        })
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1002);

        // Badge layout: [icon] gap [text], centered as a block on HINT_X
        const GAP      = 9;
        const contentW = this._icon.width + GAP + this._text.width;
        const contentH = Math.max(this._icon.height, this._text.height);
        const bw = contentW + PAD_X * 2;
        const bh = contentH + PAD_Y * 2;
        const bx = HINT_X - bw / 2;
        const by = HINT_Y - PAD_Y;
        const cy = by + bh / 2;

        this._icon.setPosition(bx + PAD_X + this._icon.width / 2, cy);
        this._text.setPosition(bx + PAD_X + this._icon.width + GAP, cy);

        this._bg
            .fillStyle(0x666688, 0.9)
            .fillRoundedRect(bx - BORDER, by - BORDER, bw + BORDER * 2, bh + BORDER * 2, 5)
            .fillStyle(0x1a1a2e, 0.95)
            .fillRoundedRect(bx, by, bw, bh, 4);

        this._tween = scene.tweens.add({
            targets:  [this._icon, this._text],
            alpha:    { from: 1, to: 0.45 },
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this._onPanned = () => {
            this._panCount++;
            if (this._panCount >= PANS_TO_DISMISS) this._dismiss();
        };
        GameEvents.on(EventNames.CAMERA_PANNED, this._onPanned);
    }

    /** True once the player has completed enough pans — persisted by the save system. */
    isDismissed() {
        return this._dismissed;
    }

    _dismiss() {
        if (this._dismissed) return;
        this._dismissed = true;

        GameEvents.off(EventNames.CAMERA_PANNED, this._onPanned);
        if (this._tween) { this._tween.stop(); this._tween = null; }

        this._scene.tweens.add({
            targets:    [this._bg, this._icon, this._text],
            alpha:      0,
            duration:   500,
            ease:       'Sine.easeIn',
            onComplete: () => {
                this._bg.destroy();
                this._icon.destroy();
                this._text.destroy();
            },
        });
    }
}
