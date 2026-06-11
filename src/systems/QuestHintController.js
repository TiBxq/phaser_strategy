import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { MAP_SIZE } from '../map/TileMap.js';
import { aStar } from '../pathfinding/AStar.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

/**
 * Keeps world-space hint visuals in sync with the active quest hint:
 *  - roadPath:     suggested road-path tiles while in road mode
 *  - buildButton:  valid placement anchors while in build mode (constrained
 *                  buildings only — Lumbermill/Quarry/Iron Mine)
 *  - assignWorker: gold pulsing overlay on the building to click
 *
 * Tracks input mode and tile selection from events itself, so it has no
 * dependency on Game-scene state or listener registration order.
 */
export class QuestHintController {
    constructor({ questHintSystem, buildSystem, tileMap, fogSystem, mapRenderer, buildingRenderer }) {
        this._questHintSystem  = questHintSystem;
        this._buildSystem      = buildSystem;
        this._tileMap          = tileMap;
        this._fogSystem        = fogSystem;
        this._mapRenderer      = mapRenderer;
        this._buildingRenderer = buildingRenderer;

        // Mirrors of Game-scene input state, maintained from the same events
        this._mode            = 'idle';   // 'idle' | 'build' | 'road'
        this._pendingConfigId = null;
        this._selectedTile    = null;

        const refresh = () => this._refresh();

        GameEvents.on(EventNames.BUILD_MODE_ENTER, ({ configId }) => {
            this._mode            = 'build';
            this._pendingConfigId = configId;
            this._refresh();
        });
        GameEvents.on(EventNames.BUILD_MODE_EXIT, () => {
            this._mode            = 'idle';
            this._pendingConfigId = null;
            this._refresh();
        });
        GameEvents.on(EventNames.ROAD_MODE_ENTER, () => {
            this._mode = 'road';
            this._refresh();
        });
        GameEvents.on(EventNames.ROAD_MODE_EXIT, () => {
            if (this._mode === 'road') this._mode = 'idle';
            this._refresh();
        });
        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row }) => {
            // Game.js ignores selection while placing — mirror that
            if (this._mode === 'idle') this._selectedTile = { col, row };
            this._refresh();
        });
        GameEvents.on(EventNames.TILE_DESELECTED, () => {
            this._selectedTile = null;
            this._refresh();
        });

        // Hint / map changes that invalidate or enable the current hint visuals
        GameEvents.on(EventNames.QUEST_HINT_CHANGED, refresh);
        GameEvents.on(EventNames.ROAD_PLACED,        refresh);
        GameEvents.on(EventNames.ROAD_REMOVED,       refresh);
        GameEvents.on(EventNames.BUILDING_PLACED,    refresh);

        this._refresh();
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    _refresh() {
        const hint = this._questHintSystem.currentHint;

        // ── Hint tiles ──
        let tiles = [];
        if (hint?.type === 'roadPath' && this._mode === 'road') {
            tiles = this._computeRoadPathHint(hint.targetConfigId);
        } else if (hint?.type === 'buildButton' && this._mode === 'build'
                   && this._pendingConfigId === hint.configId) {
            tiles = this._computePlacementHint(hint.configId);
        }
        if (tiles.length > 0) this._mapRenderer.showHintTiles(tiles);
        else                  this._mapRenderer.clearHintTiles();

        // ── Building overlay (assign worker) ──
        let target = null;
        if (hint?.type === 'assignWorker') {
            target = this._findHintBuilding(hint.configId);
            // While the target itself is selected, the blue selection overlay takes over
            if (target && this._selectedTile) {
                const sel = this._buildSystem.getBuildingAt(this._selectedTile.col, this._selectedTile.row);
                if (sel?.uid === target.uid) target = null;
            }
        }
        if (target) this._buildingRenderer.showQuestHintOverlay(target);
        else        this._buildingRenderer.hideQuestHintOverlay();
    }

    _findHintBuilding(configId) {
        for (const b of this._buildSystem.placedBuildings.values()) {
            if (!configId || b.configId === configId) return b;
        }
        return null;
    }

    /** Tile is usable for the suggested road path: an existing road, or grass a road could go on. */
    _isHintPathTile(tile) {
        if (!tile || tile.isOcean || tile.banditClaimed) return false;
        if (!this._fogSystem.isVisible(tile.col, tile.row)) return false;
        if (tile.isRoad) return true;
        return tile.type === 'GRASS' && !tile.buildingId && !tile.isField && !tile.ownedBy && !tile.isRamp;
    }

    /** All tile positions owned by a building: 2×2 footprint plus field blocks. */
    _ownedTilePositions(building) {
        const owned = [];
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            owned.push({ col: building.col + dc, row: building.row + dr });
        }
        for (const block of building.fieldTiles ?? []) {
            for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                owned.push({ col: block.col + dc, row: block.row + dr });
            }
        }
        return owned;
    }

    /** Path-usable tiles 4-adjacent to a building's owned tiles. */
    _hintPathCandidates(building) {
        const ownedKeys = new Set(
            this._ownedTilePositions(building).map(p => `${p.col},${p.row}`));
        const seen = new Set();
        const out  = [];
        for (const { col, row } of this._ownedTilePositions(building)) {
            for (const n of this._tileMap.getNeighbors(col, row)) {
                const key = `${n.col},${n.row}`;
                if (seen.has(key) || ownedKeys.has(key)) continue;
                seen.add(key);
                if (this._isHintPathTile(n)) out.push({ col: n.col, row: n.row });
            }
        }
        return out;
    }

    /**
     * Suggested road path from the Town Hall to the first disconnected building
     * of the hinted type. Existing roads cost almost nothing, so the suggestion
     * rides any partial road the player has already laid. Returns the tiles
     * still missing a road (possibly []).
     */
    _computeRoadPathHint(targetConfigId) {
        const townHall = this._findHintBuilding('TOWN_HALL');
        if (!townHall) return [];

        let target = null;
        for (const b of this._buildSystem.placedBuildings.values()) {
            if (b.isConnected || b.configId === 'TOWN_HALL') continue;
            if (!targetConfigId || b.configId === targetConfigId) { target = b; break; }
        }
        if (!target) return [];

        const starts = this._hintPathCandidates(townHall);
        const goals  = this._hintPathCandidates(target);
        if (starts.length === 0 || goals.length === 0) return [];

        // Try the closest few (start, goal) pairs; first path found wins.
        const pairs = [];
        for (const s of starts) for (const g of goals) {
            pairs.push({ s, g, d: Math.abs(s.col - g.col) + Math.abs(s.row - g.row) });
        }
        pairs.sort((a, b) => a.d - b.d);

        const isWalkable = (tile) => this._isHintPathTile(tile);
        const moveCost   = (from, to) => (to.isRoad ? 0.1 : 1);

        for (const { s, g } of pairs.slice(0, 9)) {
            const path = aStar(this._tileMap, s, g, isWalkable, moveCost);
            if (path.length > 0) {
                return path.filter(p => !this._tileMap.getTile(p.col, p.row).isRoad);
            }
        }
        return [];
    }

    /**
     * Valid placement anchors for the hinted building. Only shown for
     * placement-constrained buildings (terrain or adjacency requirements) —
     * highlighting half the map for plain-grass buildings would be noise.
     */
    _computePlacementHint(configId) {
        const config = BUILDING_CONFIGS[configId];
        if (!config) return [];
        const constrained = config.requiresAdjacentTo
            || !config.buildableOn.includes('GRASS');
        if (!constrained) return [];

        const anchors = [];
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                const result = this._buildSystem.canPlace(configId, col, row, this._tileMap);
                // Affordability shouldn't hide the hint — the spot is still right
                if (result.valid || result.reason === 'Insufficient resources.') {
                    anchors.push({ col, row });
                }
            }
        }
        return anchors;
    }
}
