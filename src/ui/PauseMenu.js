import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const PANEL_W = 360;
const PANEL_H = 220;
const PANEL_X = 480 - PANEL_W / 2;
const PANEL_Y = 210;

const BTN_W = 148;
const BTN_H = 30;

export class PauseMenu {
    constructor(scene) {
        this._scene = scene;
        this._visible = false;

        // Full-screen dim overlay
        this._overlay = scene.add.graphics()
            .fillStyle(0x000000, 0.65)
            .fillRect(0, 0, 960, 640)
            .setScrollFactor(0)
            .setDepth(1100);

        // Panel background
        this._panel = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1101);
        this._panel.fillStyle(0x080818, 1);
        this._panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6);
        this._panel.lineStyle(2, 0x3a5060, 1);
        this._panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6);

        // Title
        this._title = scene.add.text(480, PANEL_Y + 40, 'PAUSED', {
            fontFamily: 'monospace',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#eeeeff',
        }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1102);

        // Divider
        this._divider = scene.add.graphics()
            .setScrollFactor(0)
            .setDepth(1102);
        this._divider.lineStyle(1, 0x3a5060, 0.6);
        this._divider.lineBetween(PANEL_X + 20, PANEL_Y + 70, PANEL_X + PANEL_W - 20, PANEL_Y + 70);

        // Continue button
        this._continueImg = scene.add.image(480, PANEL_Y + 110, 'btn-normal')
            .setScrollFactor(0).setDepth(1102).setInteractive({ useHandCursor: true });
        this._continueLbl = scene.add.text(480, PANEL_Y + 110, 'Continue', {
            fontFamily: 'monospace', fontSize: '13px', color: '#eeeeff',
        }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1103);

        // Restart button
        this._restartImg = scene.add.image(480, PANEL_Y + 155, 'btn-normal')
            .setScrollFactor(0).setDepth(1102).setInteractive({ useHandCursor: true });
        this._restartLbl = scene.add.text(480, PANEL_Y + 155, 'Restart Game', {
            fontFamily: 'monospace', fontSize: '13px', color: '#ffaaaa',
        }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1103);

        this._continueImg.on('pointerover', () => this._continueImg.setTexture('btn-hover'));
        this._continueImg.on('pointerout',  () => this._continueImg.setTexture('btn-normal'));
        this._continueImg.on('pointerdown', () => GameEvents.emit(EventNames.GAME_RESUMED));

        this._restartImg.on('pointerover', () => this._restartImg.setTexture('btn-hover'));
        this._restartImg.on('pointerout',  () => this._restartImg.setTexture('btn-normal'));
        this._restartImg.on('pointerdown', () => GameEvents.emit(EventNames.GAME_RESTART_REQUEST));

        this._escKey = scene.input.keyboard.addKey('ESC');

        this.hide();
    }

    show() {
        this._visible = true;
        this._overlay.setVisible(true);
        this._panel.setVisible(true);
        this._divider.setVisible(true);
        this._title.setVisible(true);
        this._continueImg.setVisible(true);
        this._continueLbl.setVisible(true);
        this._restartImg.setVisible(true);
        this._restartLbl.setVisible(true);

        this._escKey.on('down', this._onEsc, this);
    }

    hide() {
        this._visible = false;
        this._overlay.setVisible(false);
        this._panel.setVisible(false);
        this._divider.setVisible(false);
        this._title.setVisible(false);
        this._continueImg.setVisible(false);
        this._continueLbl.setVisible(false);
        this._restartImg.setVisible(false);
        this._restartLbl.setVisible(false);

        this._escKey.off('down', this._onEsc, this);
    }

    isVisible() {
        return this._visible;
    }

    _onEsc() {
        GameEvents.emit(EventNames.GAME_RESUMED);
    }
}
