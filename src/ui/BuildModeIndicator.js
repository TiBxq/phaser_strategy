import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const X   = 381;   // center of the 0–762 game area
const Y   = 52;
const BGW = 320;
const BGH = 22;

export class BuildModeIndicator {
    constructor(scene) {
        this._scene = scene;

        this._bg = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1004)
            .setVisible(false);

        this._bg.fillStyle(0x000000, 0.60);
        this._bg.fillRoundedRect(X - BGW / 2, Y - BGH / 2, BGW, BGH, 4);

        this._nameText = scene.add.text(X - 10, Y, '', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#ffffff',
        })
            .setOrigin(1, 0.5)
            .setScrollFactor(0)
            .setDepth(1005)
            .setVisible(false);

        this._hintText = scene.add.text(X - 6, Y, '  RMB / ESC to cancel', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#aaaaaa',
        })
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1005)
            .setVisible(false);

        GameEvents.on(EventNames.BUILD_MODE_ENTER, ({ configId }) => {
            const label = BUILDING_CONFIGS[configId]?.label ?? configId;
            this._nameText.setText(`Placing: ${label}`);
            this._bg.setVisible(true);
            this._nameText.setVisible(true);
            this._hintText.setVisible(true);
        });

        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => {
            this._bg.setVisible(false);
            this._nameText.setVisible(false);
            this._hintText.setVisible(false);
        });
    }
}
