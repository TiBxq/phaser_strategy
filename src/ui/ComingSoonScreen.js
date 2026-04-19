import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { TILE_W, TILE_H } from '../map/MapRenderer.js';

const CANVAS_W = 960;
const CANVAS_H = 640;
const PANEL_W  = 500;
const PANEL_H  = 430;
const DEPTH    = 2000;

// Isometric helpers for the mini scene
const HW = TILE_W / 2; // 32
const HH = TILE_H / 2; // 16

export class ComingSoonScreen {
    /** @param {Phaser.Scene} scene */
    constructor(scene) {
        this._scene   = scene;
        this._objects = [];

        GameEvents.on(EventNames.QUEST_COMPLETED, ({ quest }) => {
            if (quest.id === 'ENJOY') this._show();
        });
    }

    _show() {
        if (this._objects.length) return;

        const scene = this._scene;
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2;
        const px = cx - PANEL_W / 2;
        const py = cy - PANEL_H / 2;

        // Full-screen dimmer
        const overlay = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
        overlay.fillStyle(0x000000, 0.72);
        overlay.fillRect(0, 0, CANVAS_W, CANVAS_H);
        this._add(overlay);

        // Panel background
        const panel = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
        panel.fillStyle(0x0c0c20, 0.97);
        panel.fillRoundedRect(px, py, PANEL_W, PANEL_H, 8);
        panel.lineStyle(2, 0x3a5060, 1);
        panel.strokeRoundedRect(px, py, PANEL_W, PANEL_H, 8);
        this._add(panel);

        // ── Mini isometric picture ──────────────────────────────────────────
        // 3×3 tile grid; building sprites on back rows; characters in front
        const sceneBase = py + 20; // y where tile(0,0) bottom sits
        this._drawMiniScene(cx, sceneBase);

        // Thin separator line below the picture
        const sep = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 2);
        sep.lineStyle(1, 0x3a5060, 0.6);
        sep.lineBetween(px + 20, py + 145, px + PANEL_W - 20, py + 145);
        this._add(sep);

        // ── Text ────────────────────────────────────────────────────────────
        this._add(scene.add.text(cx, py + 158, 'Coming Soon', {
            fontFamily: 'monospace',
            fontSize:   '22px',
            fontStyle:  'bold',
            color:      '#ffd700',
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2));

        this._add(scene.add.text(cx, py + 196,
            'The demo is complete!\n\n' +
            'You can continue developing your town.\n\n' +
            'Follow me to know when a new\ndemo will be released.',
            {
                fontFamily: 'monospace',
                fontSize:   '13px',
                color:      '#cccccc',
                align:      'center',
                lineSpacing: 3,
            },
        ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2));

        // ── Continue button ─────────────────────────────────────────────────
        const btnY = py + PANEL_H - 48;
        const btn  = scene.add.image(cx, btnY, 'btn-normal')
            .setScrollFactor(0).setDepth(DEPTH + 2);
        this._add(btn);

        const btnLabel = scene.add.text(cx, btnY, 'Continue Playing', {
            fontFamily: 'monospace',
            fontSize:   '13px',
            color:      '#ffffff',
        }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH + 3);
        this._add(btnLabel);

        btn.setInteractive({ useHandCursor: true })
            .on('pointerover', () => btn.setTexture('btn-hover'))
            .on('pointerout',  () => btn.setTexture('btn-normal'))
            .on('pointerdown', () => this._hide());
    }

    _drawMiniScene(cx, baseY) {
        const scene = this._scene;

        // Render 3×3 grass tile grid in isometric order (back to front)
        for (let sum = 0; sum <= 4; sum++) {
            for (let col = 0; col <= 2; col++) {
                const row = sum - col;
                if (row < 0 || row > 2) continue;
                const tx = cx + (col - row) * HW;
                const ty = baseY + (col + row) * HH + TILE_H;
                const depth = DEPTH + 1.5 + sum * 0.01;
                this._add(scene.add.image(tx, ty, 'tile-grass-h0')
                    .setScrollFactor(0).setDepth(depth).setOrigin(0.5, 1));
            }
        }

        // Buildings: triangle layout — townhall back-center, farm right, barracks left
        const buildings = [
            { col: 0, row: 0, key: 'building-townhall' },
            { col: 1, row: 0, key: 'building-farm'      },
            { col: 0, row: 1, key: 'building-barracks'  },
        ];
        for (const { col, row, key } of buildings) {
            const tx = cx + (col - row) * HW;
            const ty = baseY + (col + row) * HH + TILE_H;
            this._add(scene.add.image(tx, ty, key)
                .setScrollFactor(0)
                .setDepth(DEPTH + 2 + (col + row) * 0.01)
                .setOrigin(0.5, 1)
                .setScale(0.5));
        }

        // Characters in foreground — evenly spread, 2× scale (integer = crisp pixel art)
        const chars = [
            { col: 0, row: 2, key: 'sprite-villager' },
            { col: 1, row: 1, key: 'sprite-warrior'  },
            { col: 2, row: 1, key: 'sprite-bandit'   },
        ];
        for (const { col, row, key } of chars) {
            const tx = cx + (col - row) * HW;
            const ty = baseY + (col + row) * HH + TILE_H - 4;
            this._add(scene.add.image(tx, ty, key)
                .setScrollFactor(0)
                .setDepth(DEPTH + 2.5 + (col + row) * 0.01)
                .setOrigin(0.5, 1)
                .setScale(2));
        }
    }

    _hide() {
        for (const obj of this._objects) obj.destroy();
        this._objects = [];
    }

    _add(obj) {
        this._objects.push(obj);
        return obj;
    }
}
