import * as Phaser from 'phaser';
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
        this.load.image('building-iron-mine',  'assets/buildings/iron_mine.png');
        this.load.image('building-smithy',     'assets/buildings/smithy.png');
        this.load.image('building-barracks',     'assets/buildings/barracks.png');
        this.load.image('building-bandit-camp', 'assets/buildings/bandit_camp.png');

        // UI icon spritesheet (16×16 frames)
        this.load.image('icons-sheet', 'assets/ui/icons/items_sheet.png');

        // Character spritesheets and shadow
        this.load.spritesheet('soldier-walk',     'assets/characters/Soldier-Walk.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('soldier-idle',     'assets/characters/Soldier-Idle.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('soldier-attack01', 'assets/characters/Soldier-Attack01.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('soldier-attack02', 'assets/characters/Soldier-Attack02.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('soldier-hurt',     'assets/characters/Soldier-Hurt.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('soldier-death',    'assets/characters/Soldier-Death.png',    { frameWidth: 100, frameHeight: 100 });
        this.load.image('soldier-shadow', 'assets/characters/Soldier-Shadow.png');
        this.load.spritesheet('orc-walk',     'assets/characters/Orc-Walk.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('orc-idle',     'assets/characters/Orc-Idle.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('orc-attack01', 'assets/characters/Orc-Attack01.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('orc-attack02', 'assets/characters/Orc-Attack02.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('orc-hurt',     'assets/characters/Orc-Hurt.png',     { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('orc-death',    'assets/characters/Orc-Death.png',    { frameWidth: 100, frameHeight: 100 });

        // Critter: stag — walk 11 frames (352px / 32px), idle 24 frames (768px / 32px)
        for (const dir of ['NE', 'NW', 'SE', 'SW']) {
            this.load.spritesheet(`stag-${dir}-walk`, `assets/characters/critters/stag/critter_stag_${dir}_walk.png`, { frameWidth: 32, frameHeight: 41 });
            this.load.spritesheet(`stag-${dir}-idle`, `assets/characters/critters/stag/critter_stag_${dir}_idle.png`, { frameWidth: 32, frameHeight: 41 });
        }

        // Critter: boar — NW frameWidth=40, others=41; NE/NW frameHeight=30, SE/SW frameHeight=25
        this.load.spritesheet('boar-NE-idle', 'assets/characters/critters/boar/boar_NE_idle_strip.png', { frameWidth: 41, frameHeight: 30 });
        this.load.spritesheet('boar-NW-idle', 'assets/characters/critters/boar/boar_NW_idle_strip.png', { frameWidth: 40, frameHeight: 30 });
        this.load.spritesheet('boar-SE-idle', 'assets/characters/critters/boar/boar_SE_idle_strip.png', { frameWidth: 41, frameHeight: 25 });
        this.load.spritesheet('boar-SW-idle', 'assets/characters/critters/boar/boar_SW_idle_strip.png', { frameWidth: 41, frameHeight: 25 });
        this.load.spritesheet('boar-NE-run',  'assets/characters/critters/boar/boar_NE_run_strip.png',  { frameWidth: 41, frameHeight: 30 });
        this.load.spritesheet('boar-NW-run',  'assets/characters/critters/boar/boar_NW_run_strip.png',  { frameWidth: 40, frameHeight: 30 });
        this.load.spritesheet('boar-SE-run',  'assets/characters/critters/boar/boar_SE_run_strip.png',  { frameWidth: 41, frameHeight: 25 });
        this.load.spritesheet('boar-SW-run',  'assets/characters/critters/boar/boar_SW_run_strip.png',  { frameWidth: 41, frameHeight: 25 });

        // Music
        this.load.audio('music-ambient', 'assets/music/Ambient.wav');

        // SFX
        this.load.audio('sfx-build',   'assets/sfx/build.wav');
        this.load.audio('sfx-destroy', 'assets/sfx/destroy.wav');
        // Combat SFX — optional files; playback is cache-guarded (playSfx in Combatant.js)
        this.load.audio('sfx-hit',   'assets/sfx/hit.wav');
        this.load.audio('sfx-death', 'assets/sfx/death.wav');

        this._generateUITextures();
    }

    create() {
        this._generateTileTexturesFromSpritesheet();
        this._generateOceanTextures();
        this._generateTileOverlays();
        this._generateNoRoadIcon();
        this._generateStarvationIcon();
        this._generatePillageIcon();
        this._generateMouseRightIcon();
        this._generateNoWorkersIcon();
        this._generateDepletedIcon();
        this._generateIconTextures();
        this._generateParticleTextures();

        this.anims.create({
            key: 'soldier-walk',
            frames: this.anims.generateFrameNumbers('soldier-walk', { start: 0, end: 7 }),
            frameRate: 10,
            repeat: -1,
        });
        this.anims.create({
            key: 'soldier-idle',
            frames: this.anims.generateFrameNumbers('soldier-idle', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: -1,
        });
        this.anims.create({
            key: 'orc-walk',
            frames: this.anims.generateFrameNumbers('orc-walk', { start: 0, end: 7 }),
            frameRate: 10,
            repeat: -1,
        });
        this.anims.create({
            key: 'orc-idle',
            frames: this.anims.generateFrameNumbers('orc-idle', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: -1,
        });
        // Stag critter animations
        for (const dir of ['NE', 'NW', 'SE', 'SW']) {
            this.anims.create({
                key: `stag-${dir}-walk`,
                frames: this.anims.generateFrameNumbers(`stag-${dir}-walk`, { start: 0, end: 10 }),
                frameRate: 10,
                repeat: -1,
            });
            this.anims.create({
                key: `stag-${dir}-idle`,
                frames: this.anims.generateFrameNumbers(`stag-${dir}-idle`, { start: 0, end: 23 }),
                frameRate: 8,
                repeat: -1,
            });
        }
        // Boar critter animations — idle: 7 frames, run: 4 frames
        for (const dir of ['NE', 'NW', 'SE', 'SW']) {
            this.anims.create({
                key: `boar-${dir}-idle`,
                frames: this.anims.generateFrameNumbers(`boar-${dir}-idle`, { start: 0, end: 6 }),
                frameRate: 8,
                repeat: -1,
            });
            this.anims.create({
                key: `boar-${dir}-run`,
                frames: this.anims.generateFrameNumbers(`boar-${dir}-run`, { start: 0, end: 3 }),
                frameRate: 12,
                repeat: -1,
            });
        }

        this.anims.create({
            key: 'soldier-attack01',
            frames: this.anims.generateFrameNumbers('soldier-attack01', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: 0,
        });
        this.anims.create({
            key: 'soldier-attack02',
            frames: this.anims.generateFrameNumbers('soldier-attack02', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: 0,
        });
        this.anims.create({
            key: 'orc-attack01',
            frames: this.anims.generateFrameNumbers('orc-attack01', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: 0,
        });
        this.anims.create({
            key: 'orc-attack02',
            frames: this.anims.generateFrameNumbers('orc-attack02', { start: 0, end: 5 }),
            frameRate: 8,
            repeat: 0,
        });
        // Hurt is quick (~330 ms) so it finishes well before the next duel swing;
        // death (~670 ms) matches the old procedural fall-over duration.
        for (const who of ['soldier', 'orc']) {
            this.anims.create({
                key: `${who}-hurt`,
                frames: this.anims.generateFrameNumbers(`${who}-hurt`, { start: 0, end: 3 }),
                frameRate: 12,
                repeat: 0,
            });
            this.anims.create({
                key: `${who}-death`,
                frames: this.anims.generateFrameNumbers(`${who}-death`, { start: 0, end: 3 }),
                frameRate: 6,
                repeat: 0,
            });
        }

        this.scene.start('Menu');
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
        const FRAME_GRASS    = 2 * SHEET_COLS;       // 22 — row 2, col 0
        const FRAME_FOREST   = 3 * SHEET_COLS + 3;   // 36 — row 3, col 3
        const FRAME_ROCKS    = 5 * SHEET_COLS + 6;   // 61 — row 5, col 6
        const FRAME_ROAD     = 0 * SHEET_COLS + 9;   //  9 — row 0, col 9
        const FRAME_FIELD    = 2 * SHEET_COLS + 4;   // row 2, col 4

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
            'tile-road':   FRAME_ROAD,
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

        // Iron tile — uses the rocks spritesheet frame with an orange tint overlay.
        const ironSrc = this.textures.getFrame('tileset', FRAME_ROCKS);
        for (let h = 0; h <= MAX_TILE_HEIGHT; h++) {
            const canvasH = TILE_W + h * HEIGHT_STEP;
            const dest    = this.textures.createCanvas(`tile-iron-h${h}`, TILE_W, canvasH);
            const ctx     = dest.getContext();
            ctx.imageSmoothingEnabled = false;

            ctx.drawImage(
                ironSrc.source.image,
                ironSrc.cutX, ironSrc.cutY, SRC_FRAME_SIZE, SRC_FRAME_SIZE,
                0, 0, TILE_W, TILE_W,
            );
            for (let k = 0; k < h; k++) {
                ctx.drawImage(
                    ironSrc.source.image,
                    ironSrc.cutX, ironSrc.cutY + SRC_WALL_OFFSET, SRC_FRAME_SIZE, SRC_WALL_HEIGHT,
                    0, TILE_W + k * HEIGHT_STEP, TILE_W, HEIGHT_STEP,
                );
            }

            // Apply orange tint over existing (non-transparent) pixels only
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = 0.50;
            ctx.fillStyle = '#cc5500';
            ctx.fillRect(0, 0, TILE_W, canvasH);
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';

            dest.refresh();
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

    _generateOceanTextures() {
        const SHEET_COLS = 11;
        const SRC = 32;

        // Row 10 (0-indexed) ocean tile layout:
        //   col 0: deep water (no land adjacent)
        //   col 1: NE ripple  (land to NE, i.e. row-1 is land)
        //   col 2: NW ripple  (land to NW, i.e. col-1 is land)
        //   col 3: SE ripple  (land to SE, i.e. col+1 is land)
        //   col 4: SW ripple  (land to SW, i.e. row+1 is land)
        //   col 5: NE+NW      (land to both upper edges)
        //   col 6: SE+SW      (land to both lower edges)
        //   col 7: NW+SW      (land to both left edges)
        //   col 8: NE+SE      (land to both right edges)
        //   col 9: surrounded (land on all 4 sides)
        const R = 10 * SHEET_COLS;  // row 10 base = 110
        const OCEAN_FRAMES = {
            'tile-ocean':            R + 0,
            'tile-shore-ne':         R + 1,
            'tile-shore-nw':         R + 2,
            'tile-shore-se':         R + 3,
            'tile-shore-sw':         R + 4,
            'tile-shore-nw-ne':      R + 5,
            'tile-shore-se-sw':      R + 6,
            'tile-shore-nw-sw':      R + 7,
            'tile-shore-ne-se':      R + 8,
            'tile-shore-surrounded': R + 9,
        };

        for (const [key, frameIndex] of Object.entries(OCEAN_FRAMES)) {
            const src  = this.textures.getFrame('tileset', frameIndex);
            const dest = this.textures.createCanvas(key, TILE_W, TILE_W);
            const ctx  = dest.getContext();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src.source.image, src.cutX, src.cutY, SRC, SRC, 0, 0, TILE_W, TILE_W);
            dest.refresh();
        }
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
        this._makeHighlight('tile-hint',         CW, CH, 0xffee00, 0.30);
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

    _generateNoRoadIcon() {
        const S  = 20;  // icon size in pixels
        const cx = S / 2;
        const cy = S / 2;
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Red filled circle with a dark border
        g.fillStyle(0xdd2222, 1);
        g.fillCircle(cx, cy, cx);
        g.lineStyle(1.5, 0x880000, 1);
        g.strokeCircle(cx, cy, cx - 0.75);

        // White exclamation mark: body bar + dot
        g.fillStyle(0xffffff, 1);
        g.fillRect(cx - 1.5, 4,  3, 7);   // body
        g.fillRect(cx - 1.5, 13, 3, 3);   // dot

        g.generateTexture('icon-no-road', S, S);
        g.destroy();
    }

    _generateStarvationIcon() {
        const S  = 20;
        const cx = S / 2;
        const cy = S / 2;
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Orange filled circle with a dark border
        g.fillStyle(0xdd6600, 1);
        g.fillCircle(cx, cy, cx);
        g.lineStyle(1.5, 0x884400, 1);
        g.strokeCircle(cx, cy, cx - 0.75);

        // White exclamation mark: body bar + dot
        g.fillStyle(0xffffff, 1);
        g.fillRect(cx - 1.5, 4,  3, 7);   // body
        g.fillRect(cx - 1.5, 13, 3, 3);   // dot

        g.generateTexture('icon-starving', S, S);
        g.destroy();
    }

    _generateMouseRightIcon() {
        const W = 18;
        const H = 24;
        const g = this.make.graphics({ x: 0, y: 0, add: false });

        // Mouse body — dark fill
        g.fillStyle(0x222233, 1);
        g.fillRoundedRect(1, 1, 16, 22, 7);

        // Right button highlighted (top-right quadrant)
        g.fillStyle(0xffcc44, 1);
        g.fillRoundedRect(9, 1, 8, 10, { tl: 0, tr: 7, bl: 0, br: 0 });

        // Outline + button dividers
        g.lineStyle(1.5, 0xddddee, 1);
        g.strokeRoundedRect(1, 1, 16, 22, 7);
        g.lineBetween(9, 1, 9, 11);    // vertical split between buttons
        g.lineBetween(1, 11, 17, 11);  // bottom edge of the buttons

        g.generateTexture('icon-mouse-right', W, H);
        g.destroy();
    }

    _generatePillageIcon() {
        const S  = 20;
        const cx = S / 2;
        const cy = S / 2;
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Dark red filled circle with crimson border
        g.fillStyle(0x880000, 1);
        g.fillCircle(cx, cy, cx);
        g.lineStyle(1.5, 0xff2222, 1);
        g.strokeCircle(cx, cy, cx - 0.75);

        // White X mark
        g.lineStyle(2.5, 0xffffff, 1);
        g.lineBetween(cx - 4, cy - 4, cx + 4, cy + 4);
        g.lineBetween(cx + 4, cy - 4, cx - 4, cy + 4);

        g.generateTexture('icon-pillage', S, S);
        g.destroy();
    }

    // ─── UI ──────────────────────────────────────────────────────────────────

    _generateNoWorkersIcon() {
        const S  = 20;
        const cx = S / 2;
        const cy = S / 2;
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Gold filled circle
        g.fillStyle(0xddaa00, 1);
        g.fillCircle(cx, cy, cx);
        g.lineStyle(1.5, 0x886600, 1);
        g.strokeCircle(cx, cy, cx - 0.75);

        // White "Z" for idle/sleeping
        g.lineStyle(2, 0xffffff, 1);
        g.lineBetween(cx - 4, cy - 4, cx + 4, cy - 4);
        g.lineBetween(cx + 4, cy - 4, cx - 4, cy + 4);
        g.lineBetween(cx - 4, cy + 4, cx + 4, cy + 4);

        g.generateTexture('icon-no-workers', S, S);
        g.destroy();
    }

    _generateDepletedIcon() {
        const S  = 20;
        const cx = S / 2;
        const cy = S / 2;
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Gray filled circle
        g.fillStyle(0x666666, 1);
        g.fillCircle(cx, cy, cx);
        g.lineStyle(1.5, 0x333333, 1);
        g.strokeCircle(cx, cy, cx - 0.75);

        // White dash — empty/exhausted symbol
        g.fillStyle(0xffffff, 1);
        g.fillRect(cx - 5, cy - 1.5, 10, 3);

        g.generateTexture('icon-depleted', S, S);
        g.destroy();
    }

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

        // Weapons icon — small sword shape
        const wepIcon = this.textures.createCanvas('icon-weapons', 16, 16);
        const wCtx    = wepIcon.getContext();
        wCtx.fillStyle = '#888888';
        wCtx.fillRect(7, 1, 2, 10);    // blade
        wCtx.fillStyle = '#bbbbbb';
        wCtx.fillRect(7, 1, 2, 5);     // blade highlight
        wCtx.fillStyle = '#664400';
        wCtx.fillRect(4, 11, 8, 2);    // guard
        wCtx.fillRect(7, 13, 2, 2);    // handle
        wepIcon.refresh();

        // Iron icon — generated programmatically (no sheet frame available)
        const ironIcon = this.textures.createCanvas('icon-iron', 16, 16);
        const iCtx     = ironIcon.getContext();
        iCtx.fillStyle = '#994400';
        iCtx.fillRect(2, 5, 12, 7);    // dark base bar
        iCtx.fillStyle = '#cc5500';
        iCtx.fillRect(2, 5, 12, 5);    // mid bar
        iCtx.fillStyle = '#ff8844';
        iCtx.fillRect(3, 6, 10, 2);    // highlight streak
        ironIcon.refresh();
    }

    _generateParticleTextures() {
        // Soft cloud puff — gradient circle for large dust billows
        const SIZE = 64;
        const cx   = SIZE / 2;
        const dest = this.textures.createCanvas('particle-dust', SIZE, SIZE);
        const ctx  = dest.getContext();
        const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        grad.addColorStop(0,    'rgba(255,255,255,0.95)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.2)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SIZE, SIZE);
        dest.refresh();

        // Solid dot — fully opaque small particle for debris specks
        const DOT = 6;
        const dot  = this.textures.createCanvas('particle-dot', DOT, DOT);
        const dctx = dot.getContext();
        dctx.fillStyle = 'rgba(255,255,255,1)';
        dctx.beginPath();
        dctx.arc(DOT / 2, DOT / 2, DOT / 2, 0, Math.PI * 2);
        dctx.fill();
        dot.refresh();

        // Elongated chip — stone/wood splinter, tapered ends, fat enough to survive rotation
        const CW = 16, CH = 6;
        const chip = this.textures.createCanvas('particle-chip', CW, CH);
        const cctx = chip.getContext();
        cctx.fillStyle = 'rgba(255,255,255,1)';
        cctx.beginPath();
        cctx.moveTo(0,        CH / 2);
        cctx.lineTo(CW * 0.2, 0);
        cctx.lineTo(CW * 0.8, 0);
        cctx.lineTo(CW,       CH / 2);
        cctx.lineTo(CW * 0.8, CH);
        cctx.lineTo(CW * 0.2, CH);
        cctx.closePath();
        cctx.fill();
        chip.refresh();
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

}
