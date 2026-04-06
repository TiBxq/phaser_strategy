import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const X = 480;
const Y = 572;

export class NotificationManager {
    constructor(scene) {
        this._scene = scene;
        this._tween = null;

        this._bg = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1005)
            .setVisible(false);

        this._text = scene.add.text(X, Y, '', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#ffeeaa',
        })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1006)
            .setVisible(false);

        GameEvents.on(EventNames.SHOW_NOTIFICATION, ({ message }) => this._show(message));
    }

    _show(message) {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }

        this._text.setText(message).setAlpha(1).setVisible(true);

        const b = this._text.getBounds();
        this._bg.clear()
            .fillStyle(0x000000, 0.65)
            .fillRoundedRect(b.left - 8, b.top - 4, b.width + 16, b.height + 8, 4);
        this._bg.setAlpha(1).setVisible(true);

        this._tween = this._scene.tweens.add({
            targets:  [this._text, this._bg],
            alpha:    0,
            delay:    2000,
            duration: 500,
            onComplete: () => {
                this._text.setVisible(false);
                this._bg.setVisible(false);
                this._tween = null;
            },
        });
    }
}
