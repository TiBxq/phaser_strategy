import { CritterEntity, STAG_SPECIES, BOAR_SPECIES } from './CritterEntity.js';
import { isWildTile, isDeepWildTile } from '../villagers/walkable.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { MAP_SIZE } from '../map/TileMap.js';

const TILES_PER_CRITTER = 30;
const MAX_PER_SPECIES   = 10;

export class CritterRenderer {
    constructor(scene, tileMap, fogSystem, villagerRenderer) {
        this._scene       = scene;
        this._tileMap     = tileMap;
        this._fogSystem   = fogSystem;
        this._stags       = [];
        this._boars       = [];
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
            for (const c of this._stags) c.updateVisibility();
            for (const c of this._boars) c.updateVisibility();
        });
    }

    // ── Population management ─────────────────────────────────────────────────

    _recalculate() {
        const wildCount = this._countWildTiles();
        const target    = Math.min(Math.floor(wildCount / TILES_PER_CRITTER), MAX_PER_SPECIES);
        this._syncPool(this._stags, target, STAG_SPECIES);
        this._syncPool(this._boars, target, BOAR_SPECIES);
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

    _syncPool(pool, target, species) {
        while (pool.length < target) {
            const tile = this._randomSpawnTile();
            if (!tile) break;
            pool.push(
                new CritterEntity(this._scene, this._tileMap, tile.col, tile.row, this._fogSystem, this._getVillagers, species),
            );
        }
        while (pool.length > target) pool.pop().destroy();
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
