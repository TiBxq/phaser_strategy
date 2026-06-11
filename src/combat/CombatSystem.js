import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { tileToWorld } from '../map/MapRenderer.js';
import { DEPTH_FLOATING_LABEL } from '../config/DepthLayers.js';
import {
    CAMP_STATS, HIT_INTERVAL_MS, HIT_IMPACT_MS, ENGAGE_RANGE,
} from '../data/CombatConfig.js';
import { playSfx, spawnDamageFloat } from './Combatant.js';
import { isWalkable } from '../villagers/walkable.js';

const APPROACH_RETRIES = 3;
const RING_WAIT_RETRIES = 10;   // waiting for a camp perimeter spot to free up
const DESTACK_DELAY_MS  = 1000; // let held bandits finish their current step first
const UNREACHABLE_TTL_MS = 8000; // failed-path marks expire so bandits get retried
const DUEL_HP_RATIO      = 0.5;  // min hp fraction to volunteer for a new duel
const CAMP_BAR_W       = 64;
const CAMP_BAR_H       = 5;

/**
 * Orchestrates the bandit camp assault: 1v1 turn-based duels between warriors
 * and bandits, plus the camp-building attack run by warriors without a free
 * opponent. The camp has its own HP pool (persistent across failed assaults)
 * and is destroyed when it reaches 0 — that ends the battle and fires the
 * existing BANDIT_CAMP_CLEARED flow.
 */
export class CombatSystem {
    constructor(scene, { tileMap, warriorRenderer, banditRenderer, banditCampSystem,
                         buildSystem, villagerManager, fogSystem }) {
        this._scene            = scene;
        this._tileMap          = tileMap;
        this._warriorRenderer  = warriorRenderer;
        this._banditRenderer   = banditRenderer;
        this._banditCampSystem = banditCampSystem;
        this._buildSystem      = buildSystem;
        this._villagerManager  = villagerManager;
        this._fogSystem        = fogSystem;

        this._active        = false;
        this._campDestroyed = false;
        this._campHp        = CAMP_STATS.maxHp;
        this._campBar       = null;
        this._campBaseX     = null;
        this._claims        = new Map();   // warrior → "col,row" destination reservation
    }

    get isActive() { return this._active; }

    startAssault() {
        if (this._active) {
            GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: 'Attack already in progress.' });
            return;
        }
        if (!this._banditCampSystem.isActive()) return;

        const warriors = this._warriorRenderer.allWarriors();
        if (warriors.length === 0) return;

        this._active = true;
        this._claims.clear();
        for (const b of this._banditRenderer.bandits) {
            b.holdPosition();
            b.combat.onDeathComplete = (host) => this._banditRenderer.removeBandit(host);
        }
        for (const w of warriors) {
            w._combatTarget  = null;
            w._attackingCamp = false;
            w._stalled       = false;
            w._unreachable   = new Map();   // bandit → failure time (entries expire)
            w.combat.onDeathComplete = (host) => host.destroy();
        }

        // De-stack bandits (shared tiles / camp footprint) once their current
        // walk step has settled, so duels never happen under the camp sprite.
        this._scene.time.delayedCall(DESTACK_DELAY_MS, () => {
            if (this._active) this._destackBandits();
        });

        this._assignTargets();
    }

    // ── Tile occupancy ─────────────────────────────────────────────────────────

    _isCampFootprint(col, row) {
        const { campCol, campRow } = this._banditCampSystem;
        return col >= campCol && col <= campCol + 1 && row >= campRow && row <= campRow + 1;
    }

    /** True when a unit can STAND on (col, row): walkable, off the camp footprint,
     *  and not occupied/reserved by any other combatant. */
    _isStandFree(col, row, forWarrior = null) {
        if (!isWalkable(this._tileMap.getTile(col, row))) return false;
        if (this._isCampFootprint(col, row)) return false;
        for (const b of this._banditRenderer.bandits) {
            if (b.combat.isDead) continue;
            if (b.col === col && b.row === row) return false;
            // A relocating bandit's destination is reserved too
            if (b._relocTarget && b._relocTarget.col === col && b._relocTarget.row === row) return false;
        }
        const key = `${col},${row}`;
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w === forWarrior || w.combat.isDead) continue;
            if (!w._marching && w.col === col && w.row === row) return false;
            if (this._claims.get(w) === key) return false;
        }
        return true;
    }

    /** True when (col, row) is reserved or occupied by a warrior. */
    _isWarriorTile(col, row) {
        const key = `${col},${row}`;
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w.combat.isDead) continue;
            if (!w._marching && w.col === col && w.row === row) return true;
            if (this._claims.get(w) === key) return true;
        }
        return false;
    }

    /** Move stacked, footprint-standing, or warrior-tile bandits to a free nearby tile. */
    _destackBandits() {
        const taken = new Set();
        for (const b of this._banditRenderer.bandits) {
            if (b.combat.isDead) continue;
            const key = `${b.col},${b.row}`;
            if (!this._isCampFootprint(b.col, b.row) && !taken.has(key)
                && !this._isWarriorTile(b.col, b.row)) {
                taken.add(key);
                continue;
            }
            const spot = this._findFreeTileNear(b.col, b.row, taken);
            if (spot) {
                taken.add(`${spot.col},${spot.row}`);
                b.relocateTo(spot.col, spot.row);
            } else {
                taken.add(key);
            }
        }
    }

    _findFreeTileNear(col, row, taken) {
        for (let radius = 1; radius <= 2; radius++) {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
                    const c = col + dc, r = row + dr;
                    if (taken.has(`${c},${r}`)) continue;
                    if (this._isStandFree(c, r)) return { col: c, row: r };
                }
            }
        }
        return null;
    }

    // ── Target assignment ──────────────────────────────────────────────────────

    /** Send every idle warrior at the nearest free bandit, or at the camp. */
    _assignTargets() {
        if (!this._active) return;
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w.combat.isDead || w.combat.inCombat || w._combatTarget || w._attackingCamp) continue;
            this._assignOne(w);
        }
    }

    /** Pick the nearest reachable free bandit for one warrior, else attack the camp.
     *  Wounded warriors (below DUEL_HP_RATIO) skip duels and siege the camp instead,
     *  where they heal — they volunteer again once recovered. */
    _assignOne(w) {
        if (!this._active || w.combat.isDead) return;
        const bandit = this._fitForDuel(w) ? this._nearestFreeBandit(w) : null;
        if (bandit) {
            bandit._engagedBy = w;
            w._combatTarget   = bandit;
            w._stalled        = false;
            this._approach(w, bandit, 0);
        } else {
            this._sendToCamp(w, 0);
        }
    }

    _fitForDuel(w) {
        return w.combat.hp >= w.combat.maxHp * DUEL_HP_RATIO;
    }

    _nearestFreeBandit(warrior) {
        const now = this._scene.time.now;
        let best = null, bestDist = Infinity;
        for (const b of this._banditRenderer.bandits) {
            if (b.combat.isDead || b._engagedBy) continue;
            const failedAt = warrior._unreachable?.get(b);
            if (failedAt !== undefined && now - failedAt < UNREACHABLE_TTL_MS) continue;
            const d = Math.abs(b.col - warrior.col) + Math.abs(b.row - warrior.row);
            if (d < bestDist) { best = b; bestDist = d; }
        }
        return best;
    }

    /** March to a free tile adjacent to the bandit — never onto its own tile.
     *  The (+1,+1)/(−1,−1) diagonals are excluded: in the isometric projection
     *  they render almost on top of the bandit, making the duel look stacked. */
    _approach(w, bandit, retries) {
        const spots = [];
        for (const [dc, dr] of [[0,-1],[-1,0],[1,0],[0,1],[1,-1],[-1,1]]) {
            const c = bandit.col + dc, r = bandit.row + dr;
            if (this._isStandFree(c, r, w)) spots.push({ col: c, row: r });
        }
        spots.sort((a, b) =>
            (Math.abs(a.col - w.col) + Math.abs(a.row - w.row)) -
            (Math.abs(b.col - w.col) + Math.abs(b.row - w.row)));

        for (const p of spots) {
            this._claims.set(w, `${p.col},${p.row}`);
            const ok = w.marchToTile(p.col, p.row, () => {
                this._claims.delete(w);
                if (!this._active || w.combat.isDead) return;
                if (bandit.combat.isDead || bandit._engagedBy !== w) {
                    w._combatTarget = null;
                    this._assignTargets();
                    return;
                }
                const dist = Math.max(Math.abs(bandit.col - w.col), Math.abs(bandit.row - w.row));
                if (dist >= 1 && dist <= ENGAGE_RANGE) {
                    w._unreachable.clear();
                    this._startDuel(w, bandit);
                } else if (retries < APPROACH_RETRIES) {
                    // dist 0: the bandit ended its last wander step under the warrior —
                    // step off to an adjacent spot. dist > 1: it relocated mid-march.
                    this._approach(w, bandit, retries + 1);
                } else {
                    this._giveUpOnBandit(w, bandit);
                }
            });
            if (ok) return;
            this._claims.delete(w);
        }
        this._giveUpOnBandit(w, bandit);
    }

    /** Couldn't reach this opponent — remember that (with expiry) and reassign.
     *  Runs a full assignment pass so another warrior can take the freed bandit. */
    _giveUpOnBandit(w, bandit) {
        bandit._engagedBy = null;
        w._combatTarget   = null;
        w._unreachable.set(bandit, this._scene.time.now);
        this._assignOne(w);
        this._assignTargets();
    }

    // ── Duels ──────────────────────────────────────────────────────────────────

    _startDuel(warrior, bandit) {
        warrior.combat.inCombat = true;
        bandit.combat.inCombat  = true;
        // Make sure the fight is never hidden inside the fog
        this._fogSystem.revealAround(bandit.col, bandit.row, 2);

        // Attacker (the warrior) hits first
        this._swing(warrior, bandit);
    }

    /** One turn: attacker swings, damage lands at HIT_IMPACT_MS, then roles swap. */
    _swing(attacker, defender) {
        if (!this._active || attacker.combat.isDead || defender.combat.isDead) return;

        attacker.playAttackSwing(defender.col, defender.row);

        this._scene.time.delayedCall(HIT_IMPACT_MS, () => {
            if (!this._active || attacker.combat.isDead || defender.combat.isDead) return;
            playSfx(this._scene, 'sfx-hit', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
            const died = defender.combat.takeDamage(attacker.combat.damage);
            if (died) {
                this._onDuelDeath(defender, attacker);
            } else {
                this._scene.time.delayedCall(HIT_INTERVAL_MS - HIT_IMPACT_MS, () => {
                    this._swing(defender, attacker);
                });
            }
        });
    }

    _onDuelDeath(loser, winner) {
        playSfx(this._scene, 'sfx-death', { volume: 0.6 });
        winner.combat.inCombat = false;

        const loserIsBandit = this._banditRenderer.bandits.includes(loser);
        if (loserIsBandit) {
            winner._combatTarget = null;
            this._assignTargets();
        } else {
            this._onWarriorDied(loser);
            winner._engagedBy = null;
            winner.combat.inCombat = false;
            if (!this._anyWarriorAlive()) {
                this._failAssault();
            } else {
                this._assignTargets();
            }
        }
    }

    /** Permanent loss: remove from the renderer pool, then from the Barracks count. */
    _onWarriorDied(warrior) {
        this._claims.delete(warrior);
        const uid = this._warriorRenderer.findPoolUid(warrior);
        this._warriorRenderer.removeEntity(warrior);
        if (!uid) return;
        const building = this._buildSystem.getBuilding(uid);
        if (building) {
            this._villagerManager.killAssigned(uid, this._buildSystem);
            GameEvents.emit(EventNames.WARRIORS_CHANGED, { buildingUid: uid, building });
        }
    }

    // ── Camp attack ────────────────────────────────────────────────────────────

    /** March to a free tile on the perimeter ring around the 2×2 camp footprint —
     *  warriors attack from neighbouring tiles, never from under the building. */
    _sendToCamp(w, retries) {
        if (!this._active || this._campDestroyed || w.combat.isDead) return;
        const ring = this._campPerimeterTiles();
        const open = ring.filter(p => this._isStandFree(p.col, p.row, w));

        if (open.length === 0) {
            const anyWalkable = ring.some(p => isWalkable(this._tileMap.getTile(p.col, p.row)));
            if (anyWalkable && retries < RING_WAIT_RETRIES) {
                // All attack spots are taken — wait for one to free up
                this._scene.time.delayedCall(1500, () => this._sendToCamp(w, retries + 1));
            } else {
                w._stalled = true;
                this._checkStall();
            }
            return;
        }

        open.sort((a, b) =>
            (Math.abs(a.col - w.col) + Math.abs(a.row - w.row)) -
            (Math.abs(b.col - w.col) + Math.abs(b.row - w.row)));

        for (const p of open) {
            this._claims.set(w, `${p.col},${p.row}`);
            const ok = w.marchToTile(p.col, p.row, () => {
                this._claims.delete(w);
                if (!this._active || this._campDestroyed || w.combat.isDead) return;
                if (this._distToCamp(w) <= ENGAGE_RANGE) {
                    this._joinCampAttack(w);
                } else if (retries < APPROACH_RETRIES) {
                    this._sendToCamp(w, retries + 1);
                } else {
                    w._stalled = true;
                    this._checkStall();
                }
            });
            if (ok) return;
            this._claims.delete(w);
        }
        w._stalled = true;
        this._checkStall();
    }

    /** The 12 tiles surrounding the 2×2 camp footprint. */
    _campPerimeterTiles() {
        const { campCol, campRow } = this._banditCampSystem;
        const tiles = [];
        for (let r = campRow - 1; r <= campRow + 2; r++) {
            for (let c = campCol - 1; c <= campCol + 2; c++) {
                if (this._isCampFootprint(c, r)) continue;
                tiles.push({ col: c, row: r });
            }
        }
        return tiles;
    }

    /** Chebyshev distance from a warrior to the nearest tile of the 2×2 camp footprint. */
    _distToCamp(w) {
        const { campCol, campRow } = this._banditCampSystem;
        let best = Infinity;
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const d = Math.max(Math.abs(campCol + dc - w.col), Math.abs(campRow + dr - w.row));
            if (d < best) best = d;
        }
        return best;
    }

    _joinCampAttack(w) {
        w._attackingCamp = true;
        this._swingAtCamp(w);
    }

    _swingAtCamp(w) {
        if (!this._active || this._campDestroyed || w.combat.isDead) return;
        // Bandits come first: a healthy warrior leaves the siege to re-engage
        // any free bandit (wounded ones keep hacking the camp and healing up)
        if (this._fitForDuel(w) && this._nearestFreeBandit(w)) {
            w._attackingCamp = false;
            this._assignOne(w);
            return;
        }
        const { campCol, campRow } = this._banditCampSystem;
        w.playAttackSwing(campCol, campRow);

        this._scene.time.delayedCall(HIT_IMPACT_MS, () => {
            if (!this._active || this._campDestroyed || w.combat.isDead) return;
            playSfx(this._scene, 'sfx-hit', { volume: 0.5, rate: 0.8 + Math.random() * 0.2 });
            const dmg = Math.max(0, w.combat.damage - CAMP_STATS.armor);
            this._campHp = Math.max(0, this._campHp - dmg);
            this._campHitFeedback(dmg);
            if (this._campHp <= 0) {
                this._destroyCamp();
            } else {
                this._scene.time.delayedCall(HIT_INTERVAL_MS - HIT_IMPACT_MS, () => this._swingAtCamp(w));
            }
        });
    }

    _campHitFeedback(dmg) {
        const sprite = this._banditRenderer.campSprite;
        if (sprite?.active) {
            // Overlapping shakes capture a mid-shake x as their rest position and
            // drift the sprite over time — anchor every shake to the original x.
            if (this._campBaseX === null) this._campBaseX = sprite.x;
            this._scene.tweens.killTweensOf(sprite);
            sprite.x = this._campBaseX;
            spawnDamageFloat(this._scene, sprite.x, sprite.y - 96, dmg);
            this._scene.tweens.add({
                targets: sprite,
                x: this._campBaseX + 3,
                duration: 40,
                yoyo: true,
                repeat: 2,
            });
        }
        this._updateCampBar();
    }

    _updateCampBar() {
        const sprite = this._banditRenderer.campSprite;
        if (!sprite?.active) return;
        if (!this._campBar) {
            this._campBar = this._scene.add.graphics().setDepth(DEPTH_FLOATING_LABEL);
        }
        const ratio = this._campHp / CAMP_STATS.maxHp;
        const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xff8800 : 0xff3333;
        const { campCol, campRow } = this._banditCampSystem;
        const tile = this._tileMap.getTile(campCol, campRow);
        const { x, y } = tileToWorld(campCol, campRow, tile ? tile.height : 0);
        this._campBar.clear();
        this._campBar.setPosition(x - CAMP_BAR_W / 2, y - 92);
        this._campBar.fillStyle(0x000000, 0.7);
        this._campBar.fillRect(-1, -1, CAMP_BAR_W + 2, CAMP_BAR_H + 2);
        this._campBar.fillStyle(color, 1);
        this._campBar.fillRect(0, 0, Math.round(CAMP_BAR_W * ratio), CAMP_BAR_H);
    }

    // ── Battle end ─────────────────────────────────────────────────────────────

    _destroyCamp() {
        if (this._campDestroyed) return;
        this._campDestroyed = true;
        this._scene.sound.play('sfx-destroy', { volume: 0.8 });

        if (this._campBar) { this._campBar.destroy(); this._campBar = null; }

        // Remaining bandits fall with their camp
        for (const b of [...this._banditRenderer.bandits]) {
            b.combat.kill();
        }

        const { clearedTiles } = this._banditCampSystem.clear(this._tileMap);
        this._banditRenderer.destroyCampSprite();
        GameEvents.emit(EventNames.BANDIT_CAMP_CLEARED, { clearedTiles });
        GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: 'Bandit camp destroyed!' });
        GameEvents.emit(EventNames.TILE_DESELECTED);

        this._active = false;
        this._claims.clear();
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w.combat.isDead) continue;
            w.combat.inCombat = false;
            w._combatTarget   = null;
            w._attackingCamp  = false;
            w.marchHome();
        }
    }

    _failAssault() {
        this._active = false;
        this._claims.clear();
        GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: 'The attack failed! All warriors have fallen.' });
        for (const b of this._banditRenderer.bandits) {
            if (b.combat.isDead) continue;
            b._engagedBy      = null;
            b.combat.inCombat = false;
            b.resumeWandering();
        }
    }

    /** Abort cleanly when no warrior can reach anything (terrain fully blocked). */
    _checkStall() {
        for (const w of this._warriorRenderer.allWarriors()) {
            if (!w.combat.isDead && !w._stalled) return;
        }
        this._active = false;
        this._claims.clear();
        GameEvents.emit(EventNames.SHOW_NOTIFICATION,
            { message: 'Path to bandit camp is blocked! Remove the obstacle.' });
        for (const b of this._banditRenderer.bandits) {
            if (!b.combat.isDead) { b._engagedBy = null; b.resumeWandering(); }
        }
        this._warriorRenderer.marchAllHome();
    }

    _anyWarriorAlive() {
        return this._warriorRenderer.allWarriors().some(w => !w.combat.isDead);
    }
}
