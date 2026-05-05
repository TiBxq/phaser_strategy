import { MAP_SIZE } from '../map/TileMap.js';

const FLAT_MOVE_COST = 1;   // cost for movement between tiles at the same height
const RAMP_MOVE_COST = 2;   // cost for movement up/down a ramp tile

/** A tile is walkable if it is grass with no building on it. */
export function isWalkable(tile) {
    return tile && tile.type === 'GRASS' && !tile.buildingId;
}

/** March-mode walkability: GRASS only, ignores buildings (they're passable at high cost). */
export function isWalkableForMarch(tile) {
    return tile && tile.type === 'GRASS';
}

const BUILDING_MARCH_COST = 20;  // high enough that A* prefers a ~20-tile detour

/** Movement cost for marching warriors: same as heightMoveCost but adds a large
 *  penalty for tiles occupied by buildings so the pathfinder routes around them
 *  unless no reasonable detour exists. */
export function marchMoveCost(fromTile, toTile) {
    const base = heightMoveCost(fromTile, toTile);
    if (base === Infinity) return Infinity;
    return base + (toTile.buildingId ? BUILDING_MARCH_COST : 0);
}

/**
 * Movement cost between two adjacent tiles, used by A* for height-aware pathfinding.
 * - Same height: cost 1.
 * - Height diff of 1 via a ramp on the upper tile: cost 2.
 * - Any other height change (cliff, diff > 1): Infinity (impassable).
 */
export function heightMoveCost(fromTile, toTile) {
    const diff = Math.abs(fromTile.height - toTile.height);
    if (diff === 0) return FLAT_MOVE_COST;
    if (diff === 1) {
        const upper = fromTile.height > toTile.height ? fromTile : toTile;
        return upper.isRamp ? RAMP_MOVE_COST : Infinity;
    }
    return Infinity;
}

/**
 * Returns a random walkable tile from the map, optionally excluding one position.
 * @param {import('../map/TileMap').TileMap} tileMap
 * @param {{ col: number, row: number } | null} exclude  Tile to exclude (e.g. current position)
 * @returns {{ col: number, row: number } | null}
 */
/**
 * Returns a random walkable tile within Manhattan `radius` of (centerCol, centerRow).
 * Used by warriors to wander near their barracks.
 */
export function randomWalkableTileNear(tileMap, centerCol, centerRow, radius) {
    const candidates = [];
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            if (Math.abs(dc) + Math.abs(dr) > radius) continue;
            const t = tileMap.getTile(centerCol + dc, centerRow + dr);
            if (isWalkable(t)) candidates.push(t);
        }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Wild tile: GRASS or FOREST with no building, road, or civilization claim (farm field / forest). */
export function isWildTile(tile) {
    return tile
        && (tile.type === 'GRASS' || tile.type === 'FOREST')
        && !tile.buildingId
        && !tile.isRoad
        && !tile.ownedBy;
}

/**
 * Returns true if (col, row) is wild AND no tile within `buffer` steps
 * contains a building or road. Use for destination selection so animals
 * never pick resting spots adjacent to civilization.
 */
export function isDeepWildTile(tileMap, col, row, buffer = 2) {
    for (let dr = -buffer; dr <= buffer; dr++) {
        for (let dc = -buffer; dc <= buffer; dc++) {
            const t = tileMap.getTile(col + dc, row + dr);
            if (t && (t.buildingId || t.isRoad)) return false;
        }
    }
    return isWildTile(tileMap.getTile(col, row));
}

/** Escape-mode walkability: GRASS/FOREST regardless of roads or buildings.
 *  Used when a critter is trapped and needs to cross civilized tiles. */
export function isEscapableTile(tile) {
    return tile && (tile.type === 'GRASS' || tile.type === 'FOREST');
}

const ESCAPE_PENALTY = 100;

/** Movement cost for escaping critters: normal height cost plus a heavy penalty for
 *  non-wild tiles so A* routes through the minimum number of road/building tiles. */
export function escapeMoveCost(fromTile, toTile) {
    const base = heightMoveCost(fromTile, toTile);
    if (base === Infinity) return Infinity;
    return base + (isWildTile(toTile) ? 0 : ESCAPE_PENALTY);
}

/** Returns a random wild tile from the entire map, optionally excluding one position. */
export function randomWildTile(tileMap, exclude = null) {
    const candidates = [];
    for (let row = 0; row < MAP_SIZE; row++) {
        for (let col = 0; col < MAP_SIZE; col++) {
            if (exclude && col === exclude.col && row === exclude.row) continue;
            const t = tileMap.getTile(col, row);
            if (isWildTile(t)) candidates.push(t);
        }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function randomWalkableTile(tileMap, exclude = null, fogSystem = null) {
    const candidates = [];
    for (let row = 0; row < MAP_SIZE; row++) {
        for (let col = 0; col < MAP_SIZE; col++) {
            if (exclude && col === exclude.col && row === exclude.row) continue;
            if (fogSystem && !fogSystem.isVisible(col, row)) continue;
            const t = tileMap.getTile(col, row);
            if (isWalkable(t)) candidates.push(t);
        }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}
