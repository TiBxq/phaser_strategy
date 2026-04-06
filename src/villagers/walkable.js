import { MAP_SIZE } from '../map/TileMap.js';

/** A tile is walkable if it is grass with no building on it. */
export function isWalkable(tile) {
    return tile && tile.type === 'GRASS' && !tile.buildingId;
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
