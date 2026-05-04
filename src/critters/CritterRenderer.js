import { CritterEntity } from './CritterEntity.js';
import { isWildTile, isDeepWildTile } from '../villagers/walkable.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { MAP_SIZE } from '../map/TileMap.js';

const TILES_PER_CRITTER = 30;
const MAX_CRITTERS      = 20;

export class CritterRenderer {
    constructor(scene, tileMap, fogSystem, villagerRenderer) {
        this._scene       = scene;
        this._tileMap     = tileMap;
        this._fogSystem   = fogSystem;
        this._critters    = [];
        this._getVillagers = villagerRenderer
            ? () => villagerRenderer.getVisiblePositions()
            : () => [];

        this._recalculate();

        for (const evt of [
            EventNames.BUILDING_PLACED,
            EventNames.BUILDING_REMOVED,
            EventNames.ROAD_PLACED,
            EventNames.ROAD_REMOVED,
        ]) {
            GameEvents.on(evt, () => this._recalculate());
        }

        GameEvents.on(EventNames.FOG_UPDATED, () => {
            for (const critter of this._critters) critter.updateVisibility();
        });
    }

    // ── Population management ─────────────────────────────────────────────────

    _recalculate() {
        const wildCount = this._countWildTiles();
        const target    = Math.min(Math.floor(wildCount / TILES_PER_CRITTER), MAX_CRITTERS);
        this._syncCount(target);
    }

    _countWildTiles() {
        let count = 0;
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                if (isWildTile(this._tileMap.getTile(col, row))) count++;
            }
        }
        return count;
    }

    _syncCount(target) {
        while (this._critters.length < target) {
            const tile = this._randomSpawnTile();
            if (!tile) break;
            this._critters.push(
                new CritterEntity(this._scene, this._tileMap, tile.col, tile.row, this._fogSystem, this._getVillagers),
            );
        }
        while (this._critters.length > target) {
            this._critters.pop().destroy();
        }
    }

    // Prefer fog-hidden/border tiles so critters start in the unexplored wilderness.
    // Falls back to visible wild tiles only if no hidden wild tiles remain.
    _randomSpawnTile() {
        const hidden = [];
        const visible = [];
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                if (!isDeepWildTile(this._tileMap, col, row)) continue;
                if (this._fogSystem && this._fogSystem.isVisible(col, row)) {
                    visible.push({ col, row });
                } else {
                    hidden.push({ col, row });
                }
            }
        }
        const pool = hidden.length ? hidden : visible;
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }
}
