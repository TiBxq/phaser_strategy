import * as Phaser from 'phaser';
import { SaveManager } from '../save/SaveManager.js';

const W = 960;
const H = 640;

export class Menu extends Phaser.Scene {
    constructor() {
        super('Menu');
    }

    create() {
        // Background
        const bg = this.add.graphics();
        bg.fillStyle(0x06060f, 1);
        bg.fillRect(0, 0, W, H);

        // Title
        this.add.text(W / 2, H / 2 - 80, 'Homestead Frontier', {
            fontFamily: 'monospace',
            fontSize:   '36px',
            fontStyle:  'bold',
            color:      '#ffd700',
            stroke:     '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(W / 2, H / 2 - 30, 'An economic strategy game', {
            fontFamily: 'monospace',
            fontSize:   '14px',
            color:      '#8899aa',
        }).setOrigin(0.5);

        // Buttons: Continue (when a save exists) above New Game
        const btnX    = W / 2;
        const hasSave = SaveManager.hasSave();

        if (hasSave) {
            this._addButton(btnX, H / 2 + 40, 'Continue', () => {
                this.scene.start('Game', { loadSave: true });
            });
            this._addButton(btnX, H / 2 + 95, 'New Game', () => {
                SaveManager.clear();
                this.scene.start('Game');
            });
        } else {
            this._addButton(btnX, H / 2 + 50, 'New Game', () => {
                this.scene.start('Game');
            });
        }
    }

    _addButton(x, y, label, onClick) {
        const btn = this.add.image(x, y, 'btn-normal')
            .setInteractive({ useHandCursor: true })
            .on('pointerover',  () => btn.setTexture('btn-hover'))
            .on('pointerout',   () => btn.setTexture('btn-normal'))
            .on('pointerdown',  onClick);

        this.add.text(x, y, label, {
            fontFamily: 'monospace',
            fontSize:   '14px',
            color:      '#ffffff',
        }).setOrigin(0.5);

        return btn;
    }
}
