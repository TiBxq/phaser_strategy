import * as Phaser from 'phaser';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { aStar } from '../pathfinding/AStar.js';
import { isWalkable, randomWalkableTileNear, heightMoveCost } from '../villagers/walkable.js';
import { LAYER_VILLAGER, LAYER_SHADOW, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { FOG_HIDDEN, FOG_BORDER } from '../systems/FogOfWarSystem.js';
import { Combatant } from '../combat/Combatant.js';
import { BANDIT_STATS } from '../data/CombatConfig.js';

const MOVE_DURATION    = 650;
const IDLE_MIN_MS      = 1000;
const IDLE_MAX_MS      = 2500;
const MAX_RETRIES      = 3;
const WANDER_RADIUS    = 4;
const ORC_SCALE        = 1.0;
const ORC_Y_ADJUST     = 34;

export class BanditEntity {
    constructor(scene, tileMap, col, row, campCol, campRow, fogSystem) {
        this._scene     = scene;
        this._tileMap   = tileMap;
        this.col        = col;
        this.row        = row;
        this._campCol   = campCol;
        this._campRow   = campRow;
        this._fogSystem = fogSystem;
        this._path        = [];
        this._pathStep    = 0;
        this._isWalking   = false;
        this._wanderTimer = null;

        const spawnTile = tileMap.getTile(col, row);
        const spawnH    = spawnTile ? spawnTile.height : 0;
        const { x, y } = tileToWorld(col, row, spawnH);
        const spriteY   = y - TILE_H + ORC_Y_ADJUST;
        const baseDepth = col + row + spawnH * HEIGHT_DEPTH_BIAS;

        this._shadow = scene.add.image(x, spriteY, 'soldier-shadow')
            .setOrigin(0.5, 1)
            .setScale(ORC_SCALE)
            .setDepth(baseDepth + LAYER_SHADOW);

        this._sprite = scene.add.sprite(x, spriteY, 'orc-idle', 0)
            .setOrigin(0.5, 1)
            .setScale(ORC_SCALE)
            .setDepth(baseDepth + LAYER_VILLAGER);
        this._sprite.play('orc-idle');

        this.combat      = new Combatant(scene, this, BANDIT_STATS);
        this._held       = false;
        this._engagedBy  = null;
        this._onWalkDone = null;

        this.refreshFogVisibility();
        this._scheduleWander();
    }

    destroy() {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        this.combat.destroy();
        this._scene.tweens.killTweensOf(this._sprite);
        this._scene.tweens.killTweensOf(this._shadow);
        this._sprite.destroy();
        this._shadow.destroy();
    }

    /** Stop wandering and stand ground (battle started). */
    holdPosition() {
        this._held = true;
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
    }

    /** Walk to a nearby tile and hold there — de-stacking at assault start. */
    relocateTo(col, row) {
        if (this.combat.isDead || this._isWalking) return;
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
        const path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col, row },
            isWalkable,
            heightMoveCost,
        );
        if (path.length < 2) { this._held = true; return; }
        this._held       = false;
        this._onWalkDone = () => { this._held = true; };
        this._path       = path;
        this._pathStep   = 1;
        this._walkStep();
    }

    /** Resume normal wandering (assault failed / was aborted). */
    resumeWandering() {
        if (!this._held) return;
        this._held = false;
        if (!this._isWalking && !this._wanderTimer && !this.combat.isDead) {
            this._scheduleWander();
        }
    }

    /** Face (targetCol, targetRow) and lunge toward it (no attack spritesheet for orcs). */
    playAttackSwing(targetCol, targetRow) {
        if (this.combat.isDead) return;
        const dx = (targetCol - this.col) - (targetRow - this.row);
        if (dx !== 0) this._sprite.setFlipX(dx < 0);

        const here   = this._currentWorldPos();
        const there  = tileToWorld(targetCol, targetRow, 0);
        const dist   = Math.hypot(there.x - here.x, there.y - here.y) || 1;
        const lungeX = (there.x - here.x) / dist * 12;
        const lungeY = (there.y - here.y) / dist * 8;
        this._scene.tweens.add({
            targets:  this._sprite,
            x:        this._sprite.x + lungeX,
            y:        this._sprite.y + lungeY,
            duration: 140,
            yoyo:     true,
            ease:     'Quad.Out',
        });
    }

    _currentWorldPos() {
        const tile = this._tileMap.getTile(this.col, this.row);
        return tileToWorld(this.col, this.row, tile ? tile.height : 0);
    }

    /** Show/hide based on whether the current tile is in the fog. */
    refreshFogVisibility() {
        if (!this._fogSystem) return;
        const state   = this._fogSystem.getState(this.col, this.row);
        const visible = state !== FOG_HIDDEN && state !== FOG_BORDER;
        this._sprite.setVisible(visible);
        this._shadow.setVisible(visible);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _scheduleWander() {
        if (this._held || this.combat.isDead) return;
        this._wanderTimer = this._scene.time.delayedCall(
            Phaser.Math.Between(IDLE_MIN_MS, IDLE_MAX_MS),
            () => this._startWander(0),
        );
    }

    _startWander(retries) {
        if (retries >= MAX_RETRIES) { this._scheduleWander(); return; }

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
        if (this._held || this.combat.isDead) {
            this._path = []; this._pathStep = 0;
            if (this._isWalking) {
                this._isWalking = false;
                if (!this.combat.isDead) this._sprite.play('orc-idle');
            }
            return;
        }
        if (this._pathStep >= this._path.length) {
            this._path = []; this._pathStep = 0;
            if (this._isWalking) {
                this._isWalking = false;
                this._sprite.play('orc-idle');
            }
            if (this._onWalkDone) {
                const cb = this._onWalkDone;
                this._onWalkDone = null;
                cb();
                return;
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

        const dx = (next.col - this.col) - (next.row - this.row);
        this._sprite.setFlipX(dx < 0);
        if (!this._isWalking) {
            this._isWalking = true;
            this._sprite.play('orc-walk');
        }

        const srcDepth  = this.col + this.row + currH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        const dstDepth  = next.col + next.row + nextH * HEIGHT_DEPTH_BIAS + LAYER_VILLAGER;
        const peakDepth = Math.max(srcDepth, dstDepth);
        this._sprite.setDepth(peakDepth);
        this._shadow.setDepth(peakDepth - (LAYER_VILLAGER - LAYER_SHADOW));

        const targetY = y - TILE_H + ORC_Y_ADJUST;
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
                this.refreshFogVisibility();
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
