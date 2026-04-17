import Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, randomWalkableTileNear, heightMoveCost } from '../villagers/walkable.js';
import { LAYER_VILLAGER, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { FOG_HIDDEN, FOG_BORDER } from '../systems/FogOfWarSystem.js';

const MOVE_DURATION = 650;
const IDLE_MIN_MS   = 1000;
const IDLE_MAX_MS   = 2500;
const MAX_RETRIES   = 3;
const WANDER_RADIUS = 4;   // stays close to camp

export class BanditEntity {
    constructor(scene, tileMap, col, row, campCol, campRow, fogSystem) {
        this._scene     = scene;
        this._tileMap   = tileMap;
        this.col        = col;
        this.row        = row;
        this._campCol   = campCol;
        this._campRow   = campRow;
        this._fogSystem = fogSystem;
        this._path      = [];
        this._pathStep  = 0;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y }  = tileToWorld(col, row, spawnH);
        this._sprite = scene.add.image(x, y - TILE_H, 'sprite-bandit')
            .setOrigin(0.5, 1)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER);

        this.refreshFogVisibility();
        this._scheduleWander();
    }

    destroy() {
        this._scene.tweens.killTweensOf(this._sprite);
        this._sprite.destroy();
    }

    /** Show/hide based on whether the current tile is in the fog. */
    refreshFogVisibility() {
        if (!this._fogSystem) return;
        const state = this._fogSystem.getState(this.col, this.row);
        this._sprite.setVisible(state !== FOG_HIDDEN && state !== FOG_BORDER);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _scheduleWander() {
        this._scene.time.delayedCall(
            Phaser.Math.Between(IDLE_MIN_MS, IDLE_MAX_MS),
            () => this._startWander(0),
        );
    }

    _startWander(retries) {
        if (retries >= MAX_RETRIES) { this._scheduleWander(); return; }

        // Wander near the camp; no fog restriction — bandits live in the dark
        const dest = randomWalkableTileNear(this._tileMap, this._campCol, this._campRow, WANDER_RADIUS);
        if (!dest) { this._scheduleWander(); return; }

        const path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col: dest.col, row: dest.row },
            isWalkable,
            heightMoveCost,
        );

        if (path.length < 2) { this._startWander(retries + 1); return; }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    _walkStep() {
        if (this._pathStep >= this._path.length) {
            this._path = []; this._pathStep = 0;
            this._scheduleWander();
            return;
        }

        const next     = this._path[this._pathStep];
        const nextTile = this._tileMap.getTile(next.col, next.row);
        const nextH    = nextTile ? nextTile.height : 0;
        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(next.col, next.row, nextH);

        const srcDepth = this.col + this.row + currH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        const dstDepth = next.col + next.row + nextH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        this._sprite.setDepth(Math.max(srcDepth, dstDepth));

        this._scene.tweens.add({
            targets:  this._sprite,
            x,
            y:        y - TILE_H,
            duration: MOVE_DURATION,
            ease:     'Linear',
            onComplete: () => {
                this.col = next.col;
                this.row = next.row;
                this._sprite.setDepth(dstDepth);
                this._pathStep++;
                this.refreshFogVisibility();
                this._walkStep();
            },
        });
    }
}
