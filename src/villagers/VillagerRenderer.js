import { VillagerEntity } from './VillagerEntity.js';
import { randomWalkableTile } from './walkable.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class VillagerRenderer {
    constructor(scene, tileMap) {
        this._scene    = scene;
        this._tileMap  = tileMap;
        this._entities = [];

        GameEvents.on(EventNames.VILLAGERS_CHANGED, ({ total }) => {
            this._syncCount(total);
        });

    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _syncCount(target) {
        while (this._entities.length < target) this._spawnVillager();
        while (this._entities.length > target) this._entities.pop().destroy();
    }

    _spawnVillager() {
        const tile = randomWalkableTile(this._tileMap);
        if (!tile) return;
        this._entities.push(new VillagerEntity(this._scene, this._tileMap, tile.col, tile.row));
    }
}
