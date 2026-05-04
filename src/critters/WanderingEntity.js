import * as Phaser from 'phaser';
import { aStar } from '../pathfinding/AStar.js';
import { heightMoveCost } from '../villagers/walkable.js';

const DEFAULT_IDLE_MIN = 400;
const DEFAULT_IDLE_MAX = 1200;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Base class for any entity that wanders the map via a timer-driven A* wander loop.
 * Subclasses implement _isWalkableTile, _pickDestination, and _walkStep.
 * Shadow management, animation, fog, and march logic all live in the subclass.
 */
export class WanderingEntity {
    constructor(scene, tileMap, col, row) {
        this._scene    = scene;
        this._tileMap  = tileMap;
        this.col       = col;
        this.row       = row;
        this._path     = [];
        this._pathStep = 0;
        this._isWalking   = false;
        this._wanderTimer = null;
    }

    destroy() {
        if (this._wanderTimer) { this._wanderTimer.remove(); this._wanderTimer = null; }
    }

    resumeWander() {
        this._scheduleWander();
    }

    // ── Wander loop ───────────────────────────────────────────────────────────

    _scheduleWander() {
        this._wanderTimer = this._scene.time.delayedCall(
            Phaser.Math.Between(this._idleMinMs(), this._idleMaxMs()),
            () => this._startWander(0),
        );
    }

    _startWander(retries) {
        if (retries >= this._maxRetries()) { this._scheduleWander(); return; }

        const dest = this._pickDestination();
        if (!dest) { this._scheduleWander(); return; }

        const path = aStar(
            this._tileMap,
            { col: this.col, row: this.row },
            { col: dest.col, row: dest.row },
            (tile) => this._isWalkableTile(tile),
            heightMoveCost,
        );

        if (path.length < 2) { this._startWander(retries + 1); return; }

        this._path     = path;
        this._pathStep = 1;
        this._walkStep();
    }

    // ── Overridable ───────────────────────────────────────────────────────────

    _idleMinMs()          { return DEFAULT_IDLE_MIN; }
    _idleMaxMs()          { return DEFAULT_IDLE_MAX; }
    _maxRetries()         { return DEFAULT_MAX_RETRIES; }
    _isWalkableTile(_tile) { return false; }
    _pickDestination()    { return null; }
    _walkStep()           { }
}
