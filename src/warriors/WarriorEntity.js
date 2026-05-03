import * as Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, isWalkableForMarch, marchMoveCost, randomWalkableTileNear, heightMoveCost } from '../villagers/walkable.js';
import { LAYER_VILLAGER, LAYER_SHADOW, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';

const MOVE_DURATION    = 600;
const IDLE_MIN_MS      = 800;
const IDLE_MAX_MS      = 2000;
const MAX_RETRIES      = 3;
const WANDER_RADIUS    = 4;
const SOLDIER_SCALE    = 1.0;
const SOLDIER_Y_ADJUST = 34;
const WARRIOR_TINT     = 0xff4444;

export class WarriorEntity {
    constructor(scene, tileMap, col, row, homeCol, homeRow, fogSystem) {
        this._scene     = scene;
        this._tileMap   = tileMap;
        this._fogSystem = fogSystem ?? null;
        this.col        = col;
        this.row        = row;
        this._homeCol   = homeCol;
        this._homeRow   = homeRow;
        this._path      = [];
        this._pathStep  = 0;
        this._isWalking = false;

        // March state
        this._marching      = false;
        this._marchCallback = null;
        this._wanderTimer   = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y } = tileToWorld(col, row, spawnH);
        const spriteY   = y - TILE_H + SOLDIER_Y_ADJUST;
        const baseDepth = col + row + spawnH * HEIGHT_DEPTH_BIAS;

        this._shadow = scene.add.image(x, spriteY, 'soldier-shadow')
            .setOrigin(0.5, 1)
            .setScale(SOLDIER_SCALE)
            .setDepth(baseDepth + LAYER_SHADOW);

        this._sprite = scene.add.sprite(x, spriteY, 'soldier-idle', 0)
            .setOrigin(0.5, 1)
            .setScale(SOLDIER_SCALE)
            .setTint(WARRIOR_TINT)
            .setDepth(baseDepth + LAYER_VILLAGER);
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

    // ── March API ──────────────────────────────────────────────────────────────

    marchTo(targetCol, targetRow, onArrived) {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);

        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(this.col, this.row, currH);
        const spriteY  = y - TILE_H + SOLDIER_Y_ADJUST;
        this._sprite.setPosition(x, spriteY);
        this._shadow.setPosition(x, spriteY);

        this._marching      = true;
        this._marchCallback = onArrived;
        this._path          = [];
        this._pathStep      = 0;

        const allTargets = [
            [0,0],[1,0],[0,1],[1,1],
            [-1,0],[-1,1],
            [2,0],[2,1],
            [0,-1],[1,-1],
            [0,2],[1,2],
        ];

        let path = [];
        for (const [dc, dr] of allTargets) {
            const alt = aStar(
                this._tileMap,
                { col: this.col, row: this.row },
                { col: targetCol + dc, row: targetRow + dr },
                isWalkableForMarch,
                marchMoveCost,
            );
            if (alt.length >= 2) { path = alt; break; }
        }

        if (path.length < 2) {
            this._marching = false;
            this._marchCallback = null;
            if (onArrived) onArrived();
            return;
        }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    marchHome() {
        this.marchTo(this._homeCol, this._homeRow, () => {
            this._marching = false;
            if (this._isWalking) {
                this._isWalking = false;
                this._sprite.play('soldier-idle');
            }
            this._scheduleWander();
        });
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _scheduleWander() {
        if (this._marching) return;
        this._wanderTimer = this._scene.time.delayedCall(
            Phaser.Math.Between(IDLE_MIN_MS, IDLE_MAX_MS),
            () => this._startWander(0),
        );
    }

    _startWander(retries) {
        if (this._marching) return;
        if (retries >= MAX_RETRIES) { this._scheduleWander(); return; }

        const dest = randomWalkableTileNear(this._tileMap, this._homeCol, this._homeRow, WANDER_RADIUS);
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

        const next     = this._path[this._pathStep];
        const nextTile = this._tileMap.getTile(next.col, next.row);
        const nextH    = nextTile ? nextTile.height : 0;
        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
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
                this._sprite.setDepth(dstDepth);
                this._shadow.setDepth(dstDepth - (LAYER_VILLAGER - LAYER_SHADOW));
                this._pathStep++;
                if (this._marching && this._fogSystem) {
                    this._fogSystem.revealAround(this.col, this.row, 1);
                }
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
