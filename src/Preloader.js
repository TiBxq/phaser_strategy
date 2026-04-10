import Phaser from 'phaser';
import { TILE_W, TILE_H, TILE_DEPTH, HEIGHT_STEP } from './map/MapRenderer.js';
import { MAX_TILE_HEIGHT } from './map/TileMap.js';

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

        // Building sprites — 128×96 px each (2×2 tile footprint, 32px top decoration)
        this.load.image('building-house',      'assets/buildings/house_lvl1.png');
        this.load.image('building-house-t2',   'assets/buildings/house_lvl2.png');
        this.load.image('building-farm',       'assets/buildings/farm.png');
        this.load.image('building-lumbermill', 'assets/buildings/lumbermill.png');
        this.load.image('building-quarry',     'assets/buildings/quarry.png');
        this.load.image('building-market',     'assets/buildings/market.png');
        this.load.image('building-warehouse',  'assets/buildings/warehouse.png');
        this.load.image('building-townhall',   'assets/buildings/town_hall.png');

        // UI icon spritesheet (16×16 frames)
        this.load.image('icons-sheet', 'assets/ui/icons/items_sheet.png');

        this._generateUITextures();
    }

    create() {
        this._generateTileTexturesFromSpritesheet();
        this._generateTileOverlays();
        this._generateIconTextures();
        this.scene.start('Game');
    }

    // ─── Tiles ───────────────────────────────────────────────────────────────

    /**
     * Copy spritesheet frames into named CanvasTextures scaled 2×, generating
     * height variants (h0–h3) for each terrain type.
     *
     * Source frame layout (32×32):
     *   y=0..7   — 8px decoration above diamond
     *   y=8..23  — 16px diamond face
     *   y=24..31 — 8px side walls (isometric cube faces)
     *
     * At 2× the canvas is 64px wide.  Height variant h0 is 64px tall (normal).
     * Each additional height level adds a 16px repetition of the side-wall band,
     * growing the canvas downward so the cliff face fills the gap to ground level.
     * The sprite anchor remains at the canvas bottom, so the diamond visually
     * rises by HEIGHT_STEP (16px) for each level.
     *
     * Frame index = row * 11 + col  (11 columns, 32px each)
     */
    _generateTileTexturesFromSpritesheet() {
        // Spritesheet layout: frame index = row * SHEET_COLS + col, each frame 32×32.
        const SHEET_COLS     = 11;
        const FRAME_GRASS    = 2 * SHEET_COLS;   // 22 — row 2, col 0
        const FRAME_FOREST   = 3 * SHEET_COLS + 3;   // 55 — row 5, col 0
        const FRAME_ROCKS    = 5 * SHEET_COLS + 6;   // 77 — row 7, col 0
        const FRAME_FIELD    = 0;                 //  0 — row 0, col 0

        // Source frame layout (32×32 px, 1× scale):
        //   y =  0.. 7 — 8px decoration above diamond
        //   y =  8..23 — 16px diamond face
        //   y = 24..31 — 8px side-wall band (cliff face, tiled for height)
        const SRC_FRAME_SIZE  = 32;    // source frame width and height in px
        const SRC_WALL_OFFSET = 24;    // y-offset of the wall band within a source frame
        const SRC_WALL_HEIGHT = 8;     // height of the wall band in the source frame

        const TERRAIN_FRAMES = {
            'tile-grass':  FRAME_GRASS,
            'tile-forest': FRAME_FOREST,
            'tile-rocks':  FRAME_ROCKS,
        };

        for (const [base, frameIndex] of Object.entries(TERRAIN_FRAMES)) {
            const src = this.textures.getFrame('tileset', frameIndex);

            for (let h = 0; h <= MAX_TILE_HEIGHT; h++) {
                const canvasH = TILE_W + h * HEIGHT_STEP;
                const dest    = this.textures.createCanvas(`${base}-h${h}`, TILE_W, canvasH);
                const ctx     = dest.getContext();
                ctx.imageSmoothingEnabled = false;

                // Draw full source frame at 2× into the top TILE_W×TILE_W px of the canvas.
                ctx.drawImage(
                    src.source.image,
                    src.cutX, src.cutY, SRC_FRAME_SIZE, SRC_FRAME_SIZE,
                    0, 0, TILE_W, TILE_W,
                );

                // Repeat the side-wall band for each extra height level.
                for (let k = 0; k < h; k++) {
                    ctx.drawImage(
                        src.source.image,
                        src.cutX, src.cutY + SRC_WALL_OFFSET, SRC_FRAME_SIZE, SRC_WALL_HEIGHT,
                        0, TILE_W + k * HEIGHT_STEP, TILE_W, HEIGHT_STEP,
                    );
                }

                dest.refresh();
            }
        }

        // Field tile — always flat (height 0), no variants needed.
        const fieldSrc  = this.textures.getFrame('tileset', FRAME_FIELD);
        const fieldDest = this.textures.createCanvas('tile-field', TILE_W, TILE_W);
        const fieldCtx  = fieldDest.getContext();
        fieldCtx.imageSmoothingEnabled = false;
        fieldCtx.drawImage(
            fieldSrc.source.image,
            fieldSrc.cutX, fieldSrc.cutY, SRC_FRAME_SIZE, SRC_FRAME_SIZE,
            0, 0, TILE_W, TILE_W,
        );
        fieldDest.refresh();
    }

    /**
     * Generate overlay textures (hover highlight, selection, ghost, worker).
     * These must be 64×64 to match the 2× scaled tile sprites.
     * TILE_H=32, effective TILE_DEPTH=32 → CH=64.
     */
    _generateTileOverlays() {
        const CW = TILE_W;              // canvas width = isometric tile width
        const CH = TILE_H + TILE_DEPTH; // canvas height = diamond face + cliff depth

        this._makeHighlight('tile-highlight',    CW, CH, 0xffee00, 0.45);
        this._makeHighlight('tile-selected',     CW, CH, 0x44aaff, 0.65);
        this._makeHighlight('tile-ghost-claim',  CW, CH, 0x00ffcc, 0.40);
        this._makeWorkerOverlay('tile-worker-overlay', CW, CH);
    }

    _makeHighlight(key, cw, ch, color, alpha) {
        const g  = this.make.graphics({ x: 0, y: 0, add: false });
        const hw = cw / 2;
        const hh = (ch - TILE_DEPTH) / 2;   // half the diamond face height

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
        const hw = cw / 2;                   // horizontal centre of tile top face
        const cy = (ch - TILE_DEPTH) / 2;   // vertical centre of top face

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

    // ─── UI ──────────────────────────────────────────────────────────────────

    _generateIconTextures() {
        const src = this.textures.get('icons-sheet').getSourceImage();
        const ICONS = [
            { key: 'icon-food',  col:  7, row:  9 },
            { key: 'icon-wood',  col: 19, row: 27 },
            { key: 'icon-stone', col: 10, row: 31 },
            { key: 'icon-money', col: 10, row: 32 },
        ];
        for (const { key, col, row } of ICONS) {
            const dest = this.textures.createCanvas(key, 16, 16);
            const ctx  = dest.getContext();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, col * 16, row * 16, 16, 16, 0, 0, 16, 16);
            dest.refresh();
        }
    }

    _generateUITextures() {
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
