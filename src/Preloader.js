import Phaser from 'phaser';

export class Preloader extends Phaser.Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        this._generateTileTextures();
        this._generateBuildingTextures();
        this._generateUITextures();
    }

    create() {
        this.scene.start('Game');
    }

    // ─── Tiles ───────────────────────────────────────────────────────────────

    _generateTileTextures() {
        const W  = 64;      // diamond width
        const H  = 32;      // diamond height (top face)
        const D  = 16;      // depth of side faces
        const CW = W;
        const CH = H + D;

        this._makeTile('tile-grass',  CW, CH, 0x4a7c59, 0x3a6349, 0x2d5a27);
        this._makeTile('tile-forest', CW, CH, 0x2d5a27, 0x1e4219, 0x142e11);
        this._makeTile('tile-rocks',  CW, CH, 0x888888, 0x666666, 0x444444);
        this._makeTile('tile-field',  CW, CH, 0xc8a96e, 0xa8894e, 0x88692e);

        this._makeHighlight('tile-highlight',    CW, CH, 0xffee00, 0.45);
        this._makeHighlight('tile-selected',     CW, CH, 0x44aaff, 0.65);
        this._makeHighlight('tile-ghost-claim',  CW, CH, 0x00ffcc, 0.40);
        this._makeWorkerOverlay('tile-worker-overlay', CW, CH);
    }

    _makeTile(key, cw, ch, topColor, leftColor, rightColor) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;
        const hh = (ch - 16) / 2; // half of diamond top face height = 8

        // Top diamond face
        g.fillStyle(topColor, 1);
        g.fillPoints([
            { x: hw, y: 0 },
            { x: cw, y: hh },
            { x: hw, y: hh * 2 },
            { x: 0,  y: hh },
        ], true);

        // Left depth face
        g.fillStyle(leftColor, 1);
        g.fillPoints([
            { x: 0,  y: hh },
            { x: hw, y: hh * 2 },
            { x: hw, y: ch },
            { x: 0,  y: hh + 16 },
        ], true);

        // Right depth face
        g.fillStyle(rightColor, 1);
        g.fillPoints([
            { x: hw, y: hh * 2 },
            { x: cw, y: hh },
            { x: cw, y: hh + 16 },
            { x: hw, y: ch },
        ], true);

        g.generateTexture(key, cw, ch);
        g.destroy();
    }

    _makeWorkerOverlay(key, cw, ch) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;  // 32 — horizontal center of tile top face
        const cy = (ch - 16) / 2; // 8 — vertical center of top face

        // Person centered on the top diamond face (~hw, cy)
        g.fillStyle(0xffcc88, 1);
        g.fillCircle(hw, cy - 3, 4);   // head
        g.fillStyle(0x4466aa, 1);
        g.fillRect(hw - 4, cy + 1, 8, 6); // body
        g.lineStyle(1, 0x000000, 0.7);
        g.strokeCircle(hw, cy - 3, 4);
        g.strokeRect(hw - 4, cy + 1, 8, 6);

        g.generateTexture(key, cw, ch);
        g.destroy();
    }

    _makeHighlight(key, cw, ch, color, alpha) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;
        const hh = (ch - 16) / 2;

        g.fillStyle(color, alpha);
        g.fillPoints([
            { x: hw, y: 0 },
            { x: cw, y: hh },
            { x: hw, y: hh * 2 },
            { x: 0,  y: hh },
        ], true);

        g.generateTexture(key, cw, ch);
        g.destroy();
    }

    // ─── Buildings ───────────────────────────────────────────────────────────

    _generateBuildingTextures() {
        this._makeBuilding('building-house',      80, 72, 0xd4a574, 0xe8c89a, 0xb88550);
        this._makeBuilding('building-farm',       80, 72, 0x8b6914, 0xa07828, 0x6a5010);
        this._makeBuilding('building-quarry',     80, 72, 0x777777, 0x999999, 0x555555);
        this._makeBuilding('building-lumbermill', 80, 72, 0x7b4a2d, 0x9b6a4d, 0x5b2a0d);
        this._makeBuilding('building-warehouse',  80, 72, 0x5a6a7a, 0x7a8a9a, 0x3a4a5a);
    }

    _makeBuilding(key, cw, ch, frontColor, topColor, sideColor) {
        const g   = this.make.graphics({ x: 0, y: 0, add: false });
        const hw  = cw / 2;
        const th  = Math.round(cw * 14 / 48);   // top face height, proportional to width
        const bh  = ch - th;                     // box body height

        // Top diamond face
        g.fillStyle(topColor, 1);
        g.fillPoints([
            { x: hw, y: 0 },
            { x: cw, y: th / 2 },
            { x: hw, y: th },
            { x: 0,  y: th / 2 },
        ], true);

        // Left face
        g.fillStyle(frontColor, 1);
        g.fillPoints([
            { x: 0,  y: th / 2 },
            { x: hw, y: th },
            { x: hw, y: th + bh },
            { x: 0,  y: th / 2 + bh },
        ], true);

        // Right face
        g.fillStyle(sideColor, 1);
        g.fillPoints([
            { x: hw, y: th },
            { x: cw, y: th / 2 },
            { x: cw, y: th / 2 + bh },
            { x: hw, y: th + bh },
        ], true);

        // Outline
        g.lineStyle(1, 0x000000, 0.35);
        g.strokePoints([
            { x: hw, y: 0 },
            { x: cw, y: th / 2 },
            { x: cw, y: th / 2 + bh },
            { x: hw, y: th + bh },
            { x: 0,  y: th / 2 + bh },
            { x: 0,  y: th / 2 },
        ], true);

        g.generateTexture(key, cw, ch);
        g.destroy();
    }

    // ─── UI ──────────────────────────────────────────────────────────────────

    _generateUITextures() {
        this._makeResourceIcon('icon-food',  0x44bb44);
        this._makeResourceIcon('icon-wood',  0x885522);
        this._makeResourceIcon('icon-stone', 0x888888);
        this._makeResourceIcon('icon-money', 0xddcc00);

        this._makePanel('ui-topbar',     960,  40, 0x08081a, 0.92);
        this._makePanel('ui-bottombar',  960,  40, 0x08081a, 0.92);
        this._makePanel('ui-sidepanel',  200, 560, 0x0c0c20, 0.92);

        this._makeButton('btn-normal',      148, 30, 0x2a3a4a, 0x3a5060);
        this._makeButton('btn-hover',       148, 30, 0x3a5878, 0x4a78a8);
        this._makeButton('btn-active',      148, 30, 0x1a3060, 0x2a4080);
        this._makeButton('btn-build',        52, 30, 0x2a3a4a, 0x3a5060);
        this._makeButton('btn-build-hover',  52, 30, 0x3a5878, 0x4a78a8);
        this._makeButton('btn-build-active', 52, 30, 0x1a3060, 0x2a4080);
        this._makeButton('btn-small',        28, 24, 0x334455, 0x445566);
        this._makeButton('btn-small-hover',  28, 24, 0x446688, 0x5588aa);

        this._makeVillagerIcon('icon-villager');
        this._makeVillagerSprite('sprite-villager');
    }

    _makeResourceIcon(key, color) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(color, 1);
        g.fillRect(2, 2, 12, 12);
        g.lineStyle(1, 0x000000, 0.5);
        g.strokeRect(2, 2, 12, 12);
        g.generateTexture(key, 16, 16);
        g.destroy();
    }

    _makePanel(key, w, h, color, alpha) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(color, alpha);
        g.fillRect(0, 0, w, h);
        g.lineStyle(1, 0x223355, 0.7);
        g.strokeRect(0, 0, w, h);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    _makeButton(key, w, h, fillColor, strokeColor) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(fillColor, 1);
        g.fillRoundedRect(0, 0, w, h, 4);
        g.lineStyle(1, strokeColor, 1);
        g.strokeRoundedRect(0, 0, w, h, 4);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    _makeVillagerIcon(key) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffcc88, 1);
        g.fillCircle(8, 5, 4);
        g.fillStyle(0x4466aa, 1);
        g.fillRect(4, 9, 8, 7);
        g.generateTexture(key, 16, 20);
        g.destroy();
    }

    _makeVillagerSprite(key) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        // Head
        g.fillStyle(0xffcc88, 1);
        g.fillCircle(5, 3, 3);
        // Body / shirt
        g.fillStyle(0x4466aa, 1);
        g.fillRect(2, 6, 6, 5);
        // Outline
        g.lineStyle(1, 0x000000, 0.4);
        g.strokeCircle(5, 3, 3);
        g.strokeRect(2, 6, 6, 5);
        g.generateTexture(key, 10, 14);
        g.destroy();
    }
}
