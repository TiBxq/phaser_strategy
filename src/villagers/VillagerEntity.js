import * as Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, randomWalkableTile, heightMoveCost } from './walkable.js';
import { LAYER_VILLAGER, LAYER_SHADOW, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';

const MOVE_DURATION   = 550;
const IDLE_MIN_MS     = 400;
const IDLE_MAX_MS     = 1200;
const MAX_RETRIES     = 3;
const SOLDIER_SCALE    = 1.0;
const SOLDIER_Y_ADJUST = 34;

// Adjacent offsets around a 2×2 building footprint (perimeter tiles)
const BUILDING_PERIMETER = [
    [-1, 0], [-1, 1],
    [ 2, 0], [ 2, 1],
    [ 0,-1], [ 1,-1],
    [ 0, 2], [ 1, 2],
];

export class VillagerEntity {
    constructor(scene, tileMap, col, row, fogSystem = null) {
        this._scene     = scene;
        this._tileMap   = tileMap;
        this._fogSystem = fogSystem;
        this.col       = col;
        this.row       = row;
        this._path     = [];
        this._pathStep = 0;
        this._isWalking    = false;
        this._marching     = false;
        this._marchCallback = null;
        this._wanderTimer  = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y } = tileToWorld(col, row, spawnH);
        this._shadow = scene.add.image(x, y - TILE_H + SOLDIER_Y_ADJUST, 'soldier-shadow')
            .setOrigin(0.5, 1)
            .setScale(SOLDIER_SCALE)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_SHADOW);
        this._sprite = scene.add.sprite(x, y - TILE_H + SOLDIER_Y_ADJUST, 'soldier-idle', 0)
            .setOrigin(0.5, 1)
            .setScale(SOLDIER_SCALE)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER);
        this._sprite.play('soldier-idle');

        this._scheduleWander();
    }

    destroy() {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);
        this._sprite.destroy();
        this._shadow.destroy();
    }

    setVisible(v) {
        this._sprite.setVisible(v);
        this._shadow.setVisible(v);
        return this;
    }

    // ── March API ─────────────────────────────────────────────────────────────

    /** March to an adjacent walkable tile near the target building footprint. Calls onArrived on completion. */
    marchTo(targetCol, targetRow, onArrived) {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);
        this._path     = [];
        this._pathStep = 0;

        // Snap sprite to current tile (may have been mid-tween)
        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(this.col, this.row, currH);
        const spriteY  = y - TILE_H + SOLDIER_Y_ADJUST;
        this._sprite.setPosition(x, spriteY);
        this._shadow.setPosition(x, spriteY);

        let path = [];
        for (const [dc, dr] of BUILDING_PERIMETER) {
            const alt = aStar(
                this._tileMap,
                { col: this.col, row: this.row },
                { col: targetCol + dc, row: targetRow + dr },
                isWalkable,
                heightMoveCost,
            );
            if (alt.length >= 2) { path = alt; break; }
        }

        if (path.length < 2) {
            if (onArrived) onArrived();
            return;
        }

        this._marching      = true;
        this._marchCallback = onArrived;
        this._path          = path;
        this._pathStep      = 1;
        this._walkStep();
    }

    /** Cancel an in-progress march and resume wandering. */
    cancelMarch() {
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);
        this._path          = [];
        this._pathStep      = 0;
        this._marching      = false;
        this._marchCallback = null;
        if (this._isWalking) {
            this._isWalking = false;
            this._sprite.play('soldier-idle');
        }
        this._scheduleWander();
    }

    /** Teleport to a tile and play idle — call resumeWander() afterwards if needed. */
    teleportTo(col, row) {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);
        this._path          = [];
        this._pathStep      = 0;
        this._marching      = false;
        this._marchCallback = null;
        this._isWalking     = false;

        this.col = col;
        this.row = row;
        const tile    = this._tileMap.getTile(col, row);
        const h       = tile ? tile.height : 0;
        const { x, y } = tileToWorld(col, row, h);
        const spriteY = y - TILE_H + SOLDIER_Y_ADJUST;
        this._sprite.setPosition(x, spriteY);
        this._shadow.setPosition(x, spriteY);
        const depth = col + row + h * HEIGHT_DEPTH_BIAS;
        this._sprite.setDepth(depth + LAYER_VILLAGER);
        this._shadow.setDepth(depth + LAYER_SHADOW);
        this._sprite.play('soldier-idle');
    }

    resumeWander() {
        this._scheduleWander();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _scheduleWander() {
        this._wanderTimer = this._scene.time.delayedCall(
            Phaser.Math.Between(IDLE_MIN_MS, IDLE_MAX_MS),
            () => this._startWander(0),
        );
    }

    _startWander(retries) {
        if (retries >= MAX_RETRIES) {
            this._scheduleWander();
            return;
        }

        const dest = randomWalkableTile(this._tileMap, { col: this.col, row: this.row }, this._fogSystem);
        if (!dest) {
            this._scheduleWander();
            return;
        }

        const path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col: dest.col, row: dest.row },
            isWalkable,
            heightMoveCost,
        );

        if (path.length < 2) {
            this._startWander(retries + 1);
            return;
        }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    _walkStep() {
        if (this._pathStep >= this._path.length) {
            this._path     = [];
            this._pathStep = 0;
            if (this._isWalking) {
                this._isWalking = false;
                this._sprite.play('soldier-idle');
            }
            if (this._marching) {
                this._marching = false;
                const cb = this._marchCallback;
                this._marchCallback = null;
                if (cb) cb();
            } else {
                this._scheduleWander();
            }
            return;
        }

        const next      = this._path[this._pathStep];
        const nextTile  = this._tileMap.getTile(next.col, next.row);
        const nextH     = nextTile ? nextTile.height : 0;
        const currTile  = this._tileMap.getTile(this.col, this.row);
        const currH     = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(next.col, next.row, nextH);

        const dx = (next.col - this.col) - (next.row - this.row);
        this._sprite.setFlipX(dx < 0);
        if (!this._isWalking) {
            this._isWalking = true;
            this._sprite.play('soldier-walk');
        }

        const srcDepth  = this.col + this.row + currH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        const dstDepth  = next.col + next.row + nextH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        const peakDepth = Math.max(srcDepth, dstDepth);
        this._sprite.setDepth(peakDepth);
        this._shadow.setDepth(peakDepth - (LAYER_VILLAGER - LAYER_SHADOW));

        const targetY = y - TILE_H + SOLDIER_Y_ADJUST;
        this._scene.tweens.add({
            targets:  this._sprite,
            x,
            y:        targetY,
            duration: MOVE_DURATION,
            ease:     'Linear',
            onComplete: () => {
                this.col = next.col;
                this.row = next.row;
                if (this._fogSystem) {
                    this._fogSystem.revealAround(this.col, this.row, 1);
                }
                this._sprite.setDepth(dstDepth);
                this._shadow.setDepth(dstDepth - (LAYER_VILLAGER - LAYER_SHADOW));
                this._pathStep++;
                this._walkStep();
            },
        });
        this._scene.tweens.add({
            targets:  this._shadow,
            x,
            y:        targetY,
            duration: MOVE_DURATION,
            ease:     'Linear',
        });
    }
}
