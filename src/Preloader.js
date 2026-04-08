import Phaser from 'phaser';

export class Preloader extends Phaser.Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        // Load the tile spritesheet — frames are created in create() once it's available
        this.load.spritesheet('tileset', 'assets/tiles/spritesheet.png', {
            frameWidth:  32,
            frameHeight: 32,
        });

        this._generateBuildingTextures();
        this._generateUITextures();
    }

    create() {
        this._generateTileTexturesFromSpritesheet();
        this._generateTileOverlays();
        this.scene.start('Game');
    }

    // ─── Tiles ───────────────────────────────────────────────────────────────

    /**
     * Copy spritesheet frames into named CanvasTextures, scaled 2× (32×32 → 64×64).
     * At 2× the 32px-wide diamond top face becomes 64px wide × 32px tall,
     * matching TILE_W and TILE_H exactly.
     *
     * Frame index = row * 11 + col  (11 columns, 32px each)
     */
    _generateTileTexturesFromSpritesheet() {
        const FRAMES = {
            'tile-grass':  22,   // row 2 — green grass
            'tile-forest': 55,   // row 5 — dense shrubs
            'tile-rocks':  77,   // row 7 — rocky outcrops
            'tile-field':  0,    // row 0 — dark soil (tilled farmland)
        };

        for (const [key, frameIndex] of Object.entries(FRAMES)) {
            const src  = this.textures.getFrame('tileset', frameIndex);
            const dest = this.textures.createCanvas(key, 64, 64);
            const ctx  = dest.getContext();
            ctx.imageSmoothingEnabled = false;
            // Full 32×32 source scaled 2× → 64×64.
            // Layout: 8px decoration (top) | 16px diamond | 8px sides | (bottom flush).
            // The hit polygon in MapRenderer is offset by 16px to match the diamond position.
            ctx.drawImage(src.source.image, src.cutX, src.cutY, 32, 32, 0, 0, 64, 64);
            dest.refresh();
        }
    }

    /**
     * Generate overlay textures (hover highlight, selection, ghost, worker).
     * These must be 64×64 to match the 2× scaled tile sprites.
     * TILE_H=32, effective TILE_DEPTH=32 → CH=64.
     */
    _generateTileOverlays() {
        const CW = 64;
        const CH = 48;   // 32 top face + 16 depth (matches 64×48 tile textures)

        this._makeHighlight('tile-highlight',    CW, CH, 0xffee00, 0.45);
        this._makeHighlight('tile-selected',     CW, CH, 0x44aaff, 0.65);
        this._makeHighlight('tile-ghost-claim',  CW, CH, 0x00ffcc, 0.40);
        this._makeWorkerOverlay('tile-worker-overlay', CW, CH);
    }

    _makeHighlight(key, cw, ch, color, alpha) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;
        const hh = (ch - 16) / 2;   // TILE_H/2 = 16 (ch=48, depth=16)

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

    _makeWorkerOverlay(key, cw, ch) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;           // 32 — horizontal centre of tile top face
        const cy = (ch - 16) / 2;   // 16 — vertical centre of top face (depth=16)

        // Person centred on the top diamond face
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

    // ─── Buildings ───────────────────────────────────────────────────────────

    _generateBuildingTextures() {
        this._makeBuilding('building-house',      80, 72, 0xd4a574, 0xe8c89a, 0xb88550);
        this._makeBuilding('building-farm',       80, 72, 0x8b6914, 0xa07828, 0x6a5010);
        this._makeBuilding('building-quarry',     80, 72, 0x777777, 0x999999, 0x555555);
        this._makeBuilding('building-lumbermill', 80, 72, 0x7b4a2d, 0x9b6a4d, 0x5b2a0d);
        this._makeBuilding('building-market',     80, 72, 0xc8a832, 0xe8c852, 0xa88812);
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
