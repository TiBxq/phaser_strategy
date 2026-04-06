import { tileToWorld, TILE_DEPTH } from '../map/MapRenderer.js';
import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const RESOURCE_COLORS = {
    food:  '#44cc44',
    wood:  '#cc9944',
    stone: '#aaaaaa',
    money: '#ddcc00',
};

export class FloatingLabels {
    constructor(scene) {
        this._scene = scene;

        GameEvents.on(EventNames.PRODUCTION_TICK, ({ yields }) => {
            for (const entry of yields) {
                this._spawnLabel({ col: entry.col, row: entry.row,
                                   resource: entry.resource, label: `+${entry.amount}` });
            }
        });

        GameEvents.on(EventNames.BUILDING_PLACED, ({ building }) => {
            const cost = BUILDING_CONFIGS[building.configId]?.cost;
            if (!cost) return;
            const spent = Object.entries(cost).filter(([, v]) => v > 0);
            spent.forEach(([resource, amount], i) => {
                this._spawnLabel({ col: building.col, row: building.row,
                                   resource, label: `-${amount}`,
                                   yOffset: i * 17 });
            });
        });
    }

    _spawnLabel({ col, row, resource, label, yOffset = 0 }) {
        const { x, y } = tileToWorld(col, row);
        const startY   = y - TILE_DEPTH - 28 - yOffset;

        const text = this._scene.add.text(x, startY, label, {
            fontFamily:      'monospace',
            fontSize:        '14px',
            color:           RESOURCE_COLORS[resource] ?? '#ffffff',
            stroke:          '#000000',
            strokeThickness: 3,
        })
            .setOrigin(0.5, 1)
            .setDepth(99998);

        // Rise continuously over the full lifetime
        this._scene.tweens.add({
            targets:  text,
            y:        startY - 44,
            duration: 1600,
            ease:     'Cubic.Out',
        });

        // Stay fully opaque for a moment, then fade out
        this._scene.tweens.add({
            targets:  text,
            alpha:    0,
            delay:    800,
            duration: 800,
            ease:     'Linear',
            onComplete: () => text.destroy(),
        });
    }
}
