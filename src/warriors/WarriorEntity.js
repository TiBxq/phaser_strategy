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

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y }  = tileToWorld(col, row, spawnH);
        this._sprite = scene.add.image(x, y - TILE_H, 'sprite-warrior')
            .setOrigin(0.5, 1)
            .setDepth(col + row + spawnH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER);

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
                this._walkStep();
            },
        });
    }
}
