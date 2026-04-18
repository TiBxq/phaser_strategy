import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const ALERT_X_PANEL_OPEN   = 750;
const ALERT_X_PANEL_CLOSED = 955;
const ALERT_Y  = 90;   // positioned below HungerAlert (which sits at y=48)
const PAD_X    = 14;
const PAD_Y    = 7;
const SUB_GAP  = 2;    // gap between main label and subtitle
const BORDER   = 2;

const COLORS = {
    raiding:   { text: '#ffaa00', bg: 0x5a2a00, border: 0xff8800 },
    pillaging: { text: '#ff4444', bg: 0x500000, border: 0xff2222 },
};

const MAIN_LABELS = {
    raiding:   '⚠ BANDITS RAIDING!',
    pillaging: '☠ BANDITS PILLAGING!',
};

export class BanditAlert {
    constructor(scene) {
        this._scene        = scene;
        this._state        = 'inactive';
        this._stealAmount  = 0;
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

        this._subText = scene.add.text(ALERT_X_PANEL_CLOSED, ALERT_Y, '', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#ffaa00',
        })
            .setOrigin(0.5, 0)
            .setScrollFactor(0)
            .setDepth(1002)
            .setVisible(false);

        GameEvents.on(EventNames.BANDIT_THREAT_STATE_CHANGED, ({ state, stealAmount }) => {
            this._state       = state;
            this._stealAmount = stealAmount ?? this._stealAmount;
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
        if (this._tween) { this._tween.stop(); this._tween = null; }
        this._text.setAlpha(1);
        this._subText.setAlpha(1);

        if (this._state === 'inactive') {
            this._bg.setVisible(false);
            this._text.setVisible(false);
            this._subText.setVisible(false);
            return;
        }

        const alertX = this._panelVisible ? ALERT_X_PANEL_OPEN : ALERT_X_PANEL_CLOSED;
        const { text: textColor, bg: bgColor, border: borderColor } = COLORS[this._state];
        const mainLabel = MAIN_LABELS[this._state];
        const subLabel  = this._stealAmount > 0 ? `-${this._stealAmount} gold/cycle` : '';

        this._text.setColor(textColor).setText(mainLabel).setVisible(true);
        this._subText.setColor(textColor).setText(subLabel).setVisible(subLabel.length > 0);

        const tw   = this._text.width;
        const th   = this._text.height;
        const stw  = subLabel ? this._subText.width  : 0;
        const sth  = subLabel ? this._subText.height : 0;
        const bw   = Math.max(tw, stw) + PAD_X * 2;
        const bh   = th + (subLabel ? SUB_GAP + sth : 0) + PAD_Y * 2;
        const bx   = alertX - bw;
        const by   = ALERT_Y - PAD_Y;

        this._text.setX(bx + bw / 2).setY(ALERT_Y);
        if (subLabel) {
            this._subText.setX(bx + bw / 2).setY(ALERT_Y + th + SUB_GAP);
        }

        this._bg.clear()
            .fillStyle(borderColor, 0.9)
            .fillRoundedRect(bx - BORDER, by - BORDER, bw + BORDER * 2, bh + BORDER * 2, 5)
            .fillStyle(bgColor, 0.95)
            .fillRoundedRect(bx, by, bw, bh, 4)
            .setVisible(true);

        this._tween = this._scene.tweens.add({
            targets:  [this._text, this._subText],
            alpha:    { from: 1, to: 0.45 },
            duration: 700,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }
}
