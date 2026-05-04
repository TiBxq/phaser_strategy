import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWildTile, isDeepWildTile, isEscapableTile, escapeMoveCost, randomWildTile } from '../villagers/walkable.js';
import { LAYER_CRITTER, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { MAP_SIZE } from '../map/TileMap.js';
import { WanderingEntity } from './WanderingEntity.js';

const MOVE_DURATION    = 700;
const IDLE_MIN_MS      = 2000;
const IDLE_MAX_MS      = 6000;
const MAX_RETRIES      = 3;
const CRITTER_SCALE    = 1.0;
const CRITTER_Y_ADJUST = 0;    // feet at diamond face center (y - TILE_H)
const FLEE_RADIUS      = 5;    // Manhattan distance that triggers fleeing
const SAFE_DIST        = 7;    // minimum distance from any villager in flee destination
const PROXIMITY_CHECK  = 600;  // ms between proximity checks while idling

export class CritterEntity extends WanderingEntity {
    constructor(scene, tileMap, col, row, fogSystem = null, getVillagers = null) {
        super(scene, tileMap, col, row);
        this._fogSystem    = fogSystem;
        this._getVillagers = getVillagers ?? (() => []);
        this._lastDir      = 'SE';
        this._proximityTimer = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y }  = tileToWorld(col, row, spawnH);
        const spriteY   = y - TILE_H + CRITTER_Y_ADJUST;

        this._sprite = scene.add.sprite(x, spriteY, 'stag-SE-idle', 0)
            .setOrigin(0.5, 1)
            .setScale(CRITTER_SCALE)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER);
        this._sprite.play('stag-SE-idle');

        this._updateVisibility();
        this._scheduleWander();
    }

    destroy() {
        if (this._proximityTimer) { this._proximityTimer.remove(); this._proximityTimer = null; }
        super.destroy();
        this._scene.tweens.killTweensOf(this._sprite);
        this._sprite.destroy();
    }

    updateVisibility() {
        this._updateVisibility();
    }

    // ── WanderingEntity overrides ─────────────────────────────────────────────

    _idleMinMs()  { return IDLE_MIN_MS; }
    _idleMaxMs()  { return IDLE_MAX_MS; }
    _maxRetries() { return MAX_RETRIES; }

    _isWalkableTile(tile) { return isWildTile(tile); }

    _pickDestination() {
        const villagers = this._getVillagers();
        const tooClose  = villagers.some(v =>
            Math.abs(v.col - this.col) + Math.abs(v.row - this.row) <= FLEE_RADIUS,
        );
        if (tooClose) return this._pickFleeDest(villagers);
        return this._pickDeepWildDest();
    }

    // Picks a random destination that is wild AND has no civilization within buffer tiles.
    // Falls back to any wild tile if no deep-wild tile exists (late-game dense maps).
    _pickDeepWildDest() {
        const candidates = [];
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                if (col === this.col && row === this.row) continue;
                if (isDeepWildTile(this._tileMap, col, row)) candidates.push({ col, row });
            }
        }
        if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
        return randomWildTile(this._tileMap, { col: this.col, row: this.row });
    }

    // Override to cancel proximity check when starting to move and add escape fallback.
    _startWander(retries) {
        if (this._proximityTimer) { this._proximityTimer.remove(); this._proximityTimer = null; }

        if (retries < MAX_RETRIES) {
            super._startWander(retries);
            return;
        }
        // All normal retries exhausted — try escape pathfinding to cross roads/buildings
        const dest = this._pickDestination();
        if (!dest) { this._scheduleWander(); return; }

        const path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col: dest.col, row: dest.row },
            isEscapableTile,
            escapeMoveCost,
        );

        if (path.length < 2) { this._scheduleWander(); return; }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    // Override to add villager proximity check during idle pauses.
    _scheduleWander() {
        if (this._proximityTimer) { this._proximityTimer.remove(); this._proximityTimer = null; }
        super._scheduleWander();
        this._scheduleProximityCheck();
    }

    _walkStep() {
        if (this._pathStep >= this._path.length) {
            this._path     = [];
            this._pathStep = 0;
            if (this._isWalking) {
                this._isWalking = false;
                this._sprite.play(`stag-${this._lastDir}-idle`);
            }
            this._scheduleWander();
            return;
        }

        const next     = this._path[this._pathStep];
        const nextTile = this._tileMap.getTile(next.col, next.row);
        const nextH    = nextTile ? nextTile.height : 0;
        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(next.col, next.row, nextH);

        const dc  = next.col - this.col;
        const dr  = next.row - this.row;
        const dir = this._dirFromDelta(dc, dr);
        this._lastDir = dir;

        this._sprite.play(`stag-${dir}-walk`, true);
        this._isWalking = true;

        const srcDepth  = this.col + this.row + currH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER;
        const dstDepth  = next.col + next.row + nextH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER;
        const peakDepth = Math.max(srcDepth, dstDepth);
        this._sprite.setDepth(peakDepth);

        const targetY = y - TILE_H + CRITTER_Y_ADJUST;
        this._scene.tweens.add({
            targets:  this._sprite,
            x,
            y:        targetY,
            duration: MOVE_DURATION,
            ease:     'Linear',
            onComplete: () => {
                this.col = next.col;
                this.row = next.row;
                this._sprite.setDepth(dstDepth);
                this._pathStep++;
                this._updateVisibility();
                this._walkStep();
            },
        });
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    // Polls for nearby villagers every PROXIMITY_CHECK ms while the critter is idling.
    // Interrupts the idle immediately if a villager comes within FLEE_RADIUS.
    _scheduleProximityCheck() {
        this._proximityTimer = this._scene.time.delayedCall(PROXIMITY_CHECK, () => {
            this._proximityTimer = null;
            if (this._isWalking) return;

            const tooClose = this._getVillagers().some(v =>
                Math.abs(v.col - this.col) + Math.abs(v.row - this.row) <= FLEE_RADIUS,
            );
            if (tooClose) {
                if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
                this._startWander(0);
            } else {
                this._scheduleProximityCheck();
            }
        });
    }

    // Picks a destination tile that is at least SAFE_DIST away from all villagers.
    _pickFleeDest(villagers) {
        const candidates = [];
        for (let row = 0; row < MAP_SIZE; row++) {
            for (let col = 0; col < MAP_SIZE; col++) {
                if (col === this.col && row === this.row) continue;
                if (!isDeepWildTile(this._tileMap, col, row)) continue;
                const minDist = Math.min(...villagers.map(v =>
                    Math.abs(v.col - col) + Math.abs(v.row - row),
                ));
                if (minDist >= SAFE_DIST) candidates.push({ col, row });
            }
        }
        if (!candidates.length) return this._pickDeepWildDest();
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    _dirFromDelta(dc, dr) {
        if (dc > 0 && dr === 0) return 'SE';
        if (dc < 0 && dr === 0) return 'NW';
        if (dc === 0 && dr > 0) return 'SW';
        if (dc === 0 && dr < 0) return 'NE';
        if (Math.abs(dc) >= Math.abs(dr)) return dc > 0 ? 'SE' : 'NW';
        return dr > 0 ? 'SW' : 'NE';
    }

    _updateVisibility() {
        if (!this._fogSystem) return;
        this._sprite.setVisible(this._fogSystem.isVisible(this.col, this.row));
    }
}
