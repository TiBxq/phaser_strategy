import Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, randomWalkableTileNear, heightMoveCost } from '../villagers/walkable.js';
import { LAYER_VILLAGER, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';

const MOVE_DURATION = 600;   // slightly slower than villagers
const IDLE_MIN_MS   = 800;
const IDLE_MAX_MS   = 2000;
const MAX_RETRIES   = 3;
const WANDER_RADIUS = 4;     // Manhattan radius around home barracks

export class WarriorEntity {
    constructor(scene, tileMap, col, row, homeCol, homeRow) {
        this._scene   = scene;
        this._tileMap = tileMap;
        this.col      = col;
        this.row      = row;
        this._homeCol = homeCol;
        this._homeRow = homeRow;
        this._path     = [];
        this._pathStep = 0;

        // March state
        this._marching      = false;
        this._marchCallback = null;
        this._wanderTimer   = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y }  = tileToWorld(col, row, spawnH);
        this._sprite = scene.add.image(x, y - TILE_H, 'sprite-warrior')
            .setOrigin(0.5, 1)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER);

        this._scheduleWander();
    }

    destroy() {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);
        this._sprite.destroy();
    }

    // ── March API ──────────────────────────────────────────────────────────────

    /**
     * Interrupt wandering and march to (targetCol, targetRow) via A*.
     * Calls onArrived() when the warrior reaches the destination (or gets as close
     * as possible if the exact tile is unreachable).
     */
    marchTo(targetCol, targetRow, onArrived) {
        // Cancel pending wander timer and any active movement tween
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this._scene.tweens.killTweensOf(this._sprite);

        // Snap sprite to logical position so there's no visual jump
        const currTile = this._tileMap.getTile(this.col, this.row);
        const currH    = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(this.col, this.row, currH);
        this._sprite.setPosition(x, y - TILE_H);

        this._marching      = true;
        this._marchCallback = onArrived;
        this._path          = [];
        this._pathStep      = 0;

        // Try to path directly to the target; fall back to adjacent tiles
        let path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col: targetCol, row: targetRow },
            isWalkable,
            heightMoveCost,
        );

        if (path.length < 2) {
            // Target may be non-walkable — try 4-directional neighbours
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            for (const [dc, dr] of dirs) {
                const alt = aStar(
                    this._tileMap,
                    { col: this.col, row: this.row },
                    { col: targetCol + dc, row: targetRow + dr },
                    isWalkable,
                    heightMoveCost,
                );
                if (alt.length >= 2) { path = alt; break; }
            }
        }

        if (path.length < 2) {
            // Still unreachable — fire callback immediately
            this._marching = false;
            this._marchCallback = null;
            if (onArrived) onArrived();
            return;
        }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    /** March back to home barracks, then resume normal wandering. */
    marchHome() {
        this.marchTo(this._homeCol, this._homeRow, () => {
            this._marching = false;
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
            if (this._marching) {
                // Reached march destination
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
                this._walkStep();
            },
        });
    }
}
