import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWildTile, isDeepWildTile, isEscapableTile, escapeMoveCost, randomWildTile } from '../villagers/walkable.js';
import { LAYER_CRITTER, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { MAP_SIZE } from '../map/TileMap.js';
import { WanderingEntity } from './WanderingEntity.js';

// ── Species configs ───────────────────────────────────────────────────────────

export const STAG_SPECIES = {
    idleAnimKey:  dir => `stag-${dir}-idle`,
    walkAnimKey:  dir => `stag-${dir}-walk`,
    moveDuration: 700,
    idleMin:      2000,
    idleMax:      6000,
    yAdjust:      0,
    scale:        1.0,
    defaultDir:   'SE',
};

export const BOAR_SPECIES = {
    idleAnimKey:  dir => `boar-${dir}-idle`,
    walkAnimKey:  dir => `boar-${dir}-run`,
    moveDuration: 400,
    idleMin:      3000,
    idleMax:      8000,
    yAdjust:      0,
    scale:        1.0,
    defaultDir:   'SE',
};

// ── Shared behaviour constants ────────────────────────────────────────────────

const MAX_RETRIES     = 3;
const FLEE_RADIUS     = 5;   // Manhattan distance that triggers fleeing
const SAFE_DIST       = 7;   // min distance from villagers in flee destination
const PROXIMITY_CHECK = 600; // ms between proximity checks while idling

export class CritterEntity extends WanderingEntity {
    constructor(scene, tileMap, col, row, fogSystem = null, getVillagers = null, species = STAG_SPECIES) {
        super(scene, tileMap, col, row);
        this._fogSystem    = fogSystem;
        this._getVillagers = getVillagers ?? (() => []);
        this._species      = species;
        this._lastDir      = species.defaultDir;
        this._proximityTimer = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y }  = tileToWorld(col, row, spawnH);
        const spriteY   = y - TILE_H + species.yAdjust;

        this._sprite = scene.add.sprite(x, spriteY, species.idleAnimKey(species.defaultDir), 0)
            .setOrigin(0.5, 1)
            .setScale(species.scale)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER);
        this._sprite.play(species.idleAnimKey(species.defaultDir));

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

    _idleMinMs()  { return this._species.idleMin; }
    _idleMaxMs()  { return this._species.idleMax; }
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

    _startWander(retries) {
        if (retries < MAX_RETRIES) {
            super._startWander(retries);
            return;
        }
        // All normal retries exhausted — escape-path through roads/buildings
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
                this._sprite.play(this._species.idleAnimKey(this._lastDir));
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

        this._sprite.play(this._species.walkAnimKey(dir), true);
        this._isWalking = true;

        const srcDepth  = this.col + this.row + currH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER;
        const dstDepth  = next.col + next.row + nextH * HEIGHT_DEPTH_BIAS + LAYER_CRITTER;
        const peakDepth = Math.max(srcDepth, dstDepth);
        this._sprite.setDepth(peakDepth);

        const targetY = y - TILE_H + this._species.yAdjust;
        this._scene.tweens.add({
            targets:  this._sprite,
            x,
            y:        targetY,
            duration: this._species.moveDuration,
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

    _scheduleProximityCheck() {
        this._proximityTimer = this._scene.time.delayedCall(PROXIMITY_CHECK, () => {
            this._proximityTimer = null;

            const tooClose = this._getVillagers().some(v =>
                Math.abs(v.col - this.col) + Math.abs(v.row - this.row) <= FLEE_RADIUS,
            );
            if (tooClose) {
                if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
                if (this._isWalking) {
                    this._scene.tweens.killTweensOf(this._sprite);
                    this._path     = [];
                    this._pathStep = 0;
                    this._isWalking = false;
                    this._sprite.play(this._species.idleAnimKey(this._lastDir));
                }
                this._startWander(0);
            } else {
                this._scheduleProximityCheck();
            }
        });
    }

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
