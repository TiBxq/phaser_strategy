import * as Phaser from 'phaser';

// Module-level singleton — import this in any scene or system
// to emit/listen to game-wide events without cross-scene coupling.
export const GameEvents = new Phaser.Events.EventEmitter();
