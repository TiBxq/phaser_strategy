/**
 * A* pathfinding on a tile grid.
 *
 * @param {import('../map/TileMap').TileMap} tileMap
 * @param {{col: number, row: number}} start
 * @param {{col: number, row: number}} goal
 * @param {(tile: object) => boolean} isWalkable
 * @param {((from: object, to: object) => number) | null} getMoveCost
 *   Optional cost function for moving between adjacent tiles.
 *   Return Infinity to treat the edge as impassable.
 *   Defaults to a uniform cost of 1 when null.
 * @returns {{col: number, row: number}[]}  Path from start to goal inclusive, or [] if unreachable.
 */
export function aStar(tileMap, start, goal, isWalkable, getMoveCost = null) {
    if (start.col === goal.col && start.row === goal.row) return [{ col: start.col, row: start.row }];

    const key = (c, r) => `${c},${r}`;
    const h   = (c, r) => Math.abs(c - goal.col) + Math.abs(r - goal.row);

    // open: key → node { col, row, g, f, parent }
    const open   = new Map();
    const closed = new Set();

    open.set(key(start.col, start.row), {
        col: start.col, row: start.row,
        g: 0, f: h(start.col, start.row),
        parent: null,
    });

    while (open.size > 0) {
        // Pick node with lowest f
        let current = null;
        for (const n of open.values()) {
            if (!current || n.f < current.f) current = n;
        }

        if (current.col === goal.col && current.row === goal.row) {
            const path = [];
            for (let n = current; n; n = n.parent) {
                path.unshift({ col: n.col, row: n.row });
            }
            return path;
        }

        const ck = key(current.col, current.row);
        open.delete(ck);
        closed.add(ck);

        // 4-directional neighbours
        for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nc = current.col + dc;
            const nr = current.row + dr;
            const nk = key(nc, nr);

            if (closed.has(nk)) continue;

            const tile = tileMap.getTile(nc, nr);
            if (!tile || !isWalkable(tile)) continue;

            const currentTile = tileMap.getTile(current.col, current.row);
            const stepCost    = getMoveCost ? getMoveCost(currentTile, tile) : 1;
            if (!isFinite(stepCost)) continue;

            const g        = current.g + stepCost;
            const existing = open.get(nk);
            if (!existing || g < existing.g) {
                open.set(nk, {
                    col: nc, row: nr,
                    g, f: g + h(nc, nr),
                    parent: current,
                });
            }
        }
    }

    return []; // no path found
}
