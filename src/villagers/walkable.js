import { MAP_SIZE } from '../map/TileMap.js';

const FLAT_MOVE_COST = 1;   // cost for movement between tiles at the same height
const RAMP_MOVE_COST = 2;   // cost for movement up/down a ramp tile

/** A tile is walkable if it is grass with no building on it. */
export function isWalkable(tile) {
    return tile && tile.type === 'GRASS' && !tile.buildingId;
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
export function randomWalkableTile(tileMap, exclude = null) {
    const candidates = [];
    for (let row = 0; row < MAP_SIZE; row++) {
        for (let col = 0; col < MAP_SIZE; col++) {
            if (exclude && col === exclude.col && row === exclude.row) continue;
            const t = tileMap.getTile(col, row);
            if (isWalkable(t)) candidates.push(t);
        }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}
