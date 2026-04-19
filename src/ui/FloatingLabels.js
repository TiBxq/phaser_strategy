import { tileToWorld, TILE_DEPTH } from '../map/MapRenderer.js';
import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { DEPTH_FLOATING_LABEL } from '../config/DepthLayers.js';

const RESOURCE_COLORS = {
    food:    '#44cc44',
    wood:    '#cc9944',
    stone:   '#aaaaaa',
    money:   '#ddcc00',
    iron:    '#cc6600',
    weapons: '#dddddd',
};

const ICON_SIZE = 16;
const ICON_GAP  = 3;

export class FloatingLabels {
    constructor(scene) {
        this._scene = scene;

        GameEvents.on(EventNames.PRODUCTION_TICK, ({ yields }) => {
            const offsetByUid = new Map();
            for (const entry of yields) {
                const idx = offsetByUid.get(entry.uid) ?? 0;
                offsetByUid.set(entry.uid, idx + 1);
                const negative = entry.amount < 0;
                const label = negative ? `${entry.amount}` : `+${entry.amount}`;
                this._spawnLabel({ col: entry.col, row: entry.row,
                                   resource: entry.resource, label, yOffset: idx * 17, negative });
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

    _spawnLabel({ col, row, resource, label, yOffset = 0, negative = false }) {
        const tile     = this._scene.tileMap?.getTile(col, row);
        const h        = tile ? tile.height : 0;
        const { x, y } = tileToWorld(col, row, h);
        // 2×2 building center is at y+16; label rises from above the building top
        const startY   = y + 16 - TILE_DEPTH - 28 - yOffset;

        const container = this._scene.add.container(x, startY)
            .setDepth(DEPTH_FLOATING_LABEL);

        const icon = this._scene.add.image(-(ICON_SIZE / 2 + ICON_GAP), 0, `icon-${resource}`)
            .setOrigin(0.5, 0.5);

        const color = negative ? '#ff4444' : (RESOURCE_COLORS[resource] ?? '#ffffff');
        const text = this._scene.add.text(ICON_GAP, 0, label, {
            fontFamily:      'monospace',
            fontSize:        '14px',
            color,
            stroke:          '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);

        container.add([icon, text]);

        // Rise continuously over the full lifetime
        this._scene.tweens.add({
            targets:  container,
            y:        startY - 44,
            duration: 1600,
            ease:     'Cubic.Out',
        });

        // Stay fully opaque for a moment, then fade out
        this._scene.tweens.add({
            targets:  container,
            alpha:    0,
            delay:    800,
            duration: 800,
            ease:     'Linear',
            onComplete: () => container.destroy(),
        });
    }
}
