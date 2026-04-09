/**
 * Depth constants for isometric rendering in the Game scene.
 *
 * ── Per-tile layers ──────────────────────────────────────────────────────────
 * Added to (col + row) for correct isometric overlap within the same depth band.
 * LAYER_BUILDING must exceed the maximum footprint offset:
 *   for a 2×2 building the frontmost tile is (col+1, row+1) → offset = 2,
 *   so LAYER_BUILDING > 2.
 */
/**
 * Fractional depth bias per height level.
 * Keeps elevated tiles visually above same col+row ground tiles at cliff edges
 * without affecting relative order of objects at the same height.
 */
export const HEIGHT_DEPTH_BIAS = 0.01;

export const LAYER_GHOST_TILE  = 0.15;  // ghost tile previews in build mode
export const LAYER_FIELD       = 0.20;  // farm field sprites
export const LAYER_WORKER      = 0.25;  // worker icon overlays on tiles
export const LAYER_VILLAGER    = 0.30;  // villager sprites
export const LAYER_TILE_SELECT = 0.60;  // tile selection highlight
export const LAYER_BUILDING    = 2.90;  // building sprite (above all 4 footprint tiles)

/**
 * ── Fixed depths ─────────────────────────────────────────────────────────────
 * Must stay above  max(col + row) + LAYER_BUILDING  for any supported map size.
 * A 10 000×10 000 map has max col+row = 20 000; ABOVE_MAP = 1 000 000 is safe.
 *
 * Note: Phaser 3 represents depth as a 64-bit float; integers are exact up to
 * 2^53, so 1 000 000 carries no precision risk.
 */
const ABOVE_MAP = 1_000_000;

export const DEPTH_TILE_HOVER        = ABOVE_MAP + 1;
export const DEPTH_FLOATING_LABEL    = ABOVE_MAP + 2;
export const DEPTH_GHOST_BUILDING    = ABOVE_MAP + 3;
export const DEPTH_SELECTION_OVERLAY = ABOVE_MAP + 4;

/**
 * ── UI scene depths ───────────────────────────────────────────────────────────
 * The UI runs as a separate Phaser scene (setScrollFactor(0)), so its depths
 * are independent of the game camera depth bands above.
 */
export const DEPTH_UI_BACKGROUND = 1000;  // panel / bar backgrounds
export const DEPTH_UI_ELEMENT    = 1001;  // buttons, icon images
export const DEPTH_UI_TEXT       = 1002;  // text labels rendered above buttons
