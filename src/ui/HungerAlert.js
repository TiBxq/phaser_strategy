import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

// X positions depending on whether the TileInfoPanel is visible (left edge = 762)
const ALERT_X_PANEL_OPEN   = 750;   // right edge when panel is open
const ALERT_X_PANEL_CLOSED = 955;   // right edge when panel is hidden
const ALERT_Y  = 48;
const PAD_X    = 14;
const PAD_Y    = 7;
const BORDER   = 2;

const COLORS = {
    hungry:   { text: '#ffaa00', bg: 0x5a2a00, border: 0xff8800 },
    starving: { text: '#ff4444', bg: 0x500000, border: 0xff2222 },
};

export class HungerAlert {
    constructor(scene) {
        this._scene        = scene;
        this._state        = 'fed';
        this._panelVisible = false;
        this._tween        = null;

        this._bg = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1001)
            .setVisible(false);

        this._text = scene.add.text(ALERT_X_PANEL_CLOSED, ALERT_Y, '', {
            fontFamily: 'monospace',
            fontSize:   '15px',
            fontStyle:  'bold',
            color:      '#ffaa00',
        })
            .setOrigin(0.5, 0)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        GameEvents.on(EventNames.HUNGER_STATE_CHANGED, ({ state }) => {
            this._state = state;
            this._redraw();
        });

        GameEvents.on(EventNames.TILE_SELECTED, () => {
            this._panelVisible = true;
            this._redraw();
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._panelVisible = false;
            this._redraw();
        });
    }

    _redraw() {
        // Stop any existing pulse tween
        if (this._tween) { this._tween.stop(); this._tween = null; }
        this._text.setAlpha(1);

        if (this._state === 'fed') {
            this._bg.setVisible(false);
            this._text.setVisible(false);
            return;
        }

        const alertX = this._panelVisible ? ALERT_X_PANEL_OPEN : ALERT_X_PANEL_CLOSED;
        const { text: textColor, bg: bgColor, border: borderColor } = COLORS[this._state];
        const label = this._state === 'hungry' ? '⚠ HUNGRY' : '☠ STARVING!';

        this._text.setColor(textColor).setText(label).setVisible(true);

        const tw = this._text.width;
        const th = this._text.height;
        const bw = tw + PAD_X * 2;
        const bh = th + PAD_Y * 2;
        const bx = alertX - bw;
        const by = ALERT_Y - PAD_Y;

        // Center text within the badge
        this._text.setX(bx + bw / 2).setOrigin(0.5, 0);

        this._bg.clear()
            // Border (slightly larger rect behind)
            .fillStyle(borderColor, 0.9)
            .fillRoundedRect(bx - BORDER, by - BORDER, bw + BORDER * 2, bh + BORDER * 2, 5)
            // Fill
            .fillStyle(bgColor, 0.95)
            .fillRoundedRect(bx, by, bw, bh, 4)
            .setVisible(true);

        // Pulse alpha on the text for attention
        this._tween = this._scene.tweens.add({
            targets:    this._text,
            alpha:      { from: 1, to: 0.45 },
            duration:   700,
            yoyo:       true,
            repeat:     -1,
            ease:       'Sine.easeInOut',
        });
    }
}
