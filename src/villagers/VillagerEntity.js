import * as Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, randomWalkableTile, heightMoveCost } from './walkable.js';
import { LAYER_VILLAGER, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';

const MOVE_DURATION = 550;   // ms per tile step
const IDLE_MIN_MS   = 400;
const IDLE_MAX_MS   = 1200;
const MAX_RETRIES   = 3;

export class VillagerEntity {
    constructor(scene, tileMap, col, row, fogSystem = null) {
        this._scene     = scene;
        this._tileMap   = tileMap;
        this._fogSystem = fogSystem;
        this.col       = col;
        this.row       = row;
        this._path     = [];   // full path for the current wander goal
        this._pathStep = 0;    // index of the next step to walk

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y } = tileToWorld(col, row, spawnH);
        this._sprite = scene.add.image(x, y - TILE_H, 'sprite-villager')
            .setOrigin(0.5, 1)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER);

        // Stagger start so villagers don't all move in lockstep
        this._scheduleWander();
    }

    destroy() {
        this._scene.tweens.killTweensOf(this._sprite);
        this._sprite.destroy();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _scheduleWander() {
        this._scene.time.delayedCall(
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
            // No path or already at dest — retry with different destination
            this._startWander(retries + 1);
            return;
        }

        this._path     = path;
        this._pathStep = 1;   // index 0 is the current tile; start from 1
        this._walkStep();
    }

    _walkStep() {
        if (this._pathStep >= this._path.length) {
            this._path     = [];
            this._pathStep = 0;
            this._scheduleWander();
            return;
        }

        const next      = this._path[this._pathStep];
        const nextTile  = this._tileMap.getTile(next.col, next.row);
        const nextH     = nextTile ? nextTile.height : 0;
        const currTile  = this._tileMap.getTile(this.col, this.row);
        const currH     = currTile ? currTile.height : 0;
        const { x, y } = tileToWorld(next.col, next.row, nextH);

        // Use the higher depth of source and destination during movement so the
        // sprite is never hidden behind its source tile when walking toward the
        // viewer (NW/NE — decreasing col+row sum). Settle to exact dest depth on arrival.
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
