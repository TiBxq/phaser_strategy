import * as Phaser from 'phaser';
import { Preloader } from './Preloader.js';
import { Menu } from './scenes/Menu.js';
import { Game } from './scenes/Game.js';
import { UI } from './scenes/UI.js';

const config = {
    title: 'Isometric Strategy',
    type: Phaser.AUTO,
    width: 960,
    height: 640,
    parent: 'game-container',
    backgroundColor: '#0a0a1a',
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [Preloader, Menu, Game, UI],
};

new Phaser.Game(config);

document.getElementById('game-container').addEventListener('contextmenu', e => e.preventDefault());
