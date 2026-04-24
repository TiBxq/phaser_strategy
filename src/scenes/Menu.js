import * as Phaser from 'phaser';

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

        // New Game button
        const btnX = W / 2;
        const btnY = H / 2 + 50;

        const btn = this.add.image(btnX, btnY, 'btn-normal')
            .setInteractive({ useHandCursor: true })
            .on('pointerover',  () => btn.setTexture('btn-hover'))
            .on('pointerout',   () => btn.setTexture('btn-normal'))
            .on('pointerdown',  () => this.scene.start('Game'));

        this.add.text(btnX, btnY, 'New Game', {
            fontFamily: 'monospace',
            fontSize:   '14px',
            color:      '#ffffff',
        }).setOrigin(0.5);
    }
}
