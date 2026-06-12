import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { tileToWorld } from '../map/MapRenderer.js';
import { DEPTH_FLOATING_LABEL } from '../config/DepthLayers.js';
import {
    PILLAGE_BUILDING_STATS, HIT_INTERVAL_MS, HIT_IMPACT_MS, ENGAGE_RANGE,
    SWING_FOLLOW_THROUGH_MS, RAID_LAUNCH_DELAY_MS, RAID_COOLDOWN_MS,
    BANDIT_RESPAWN_MS, RAID_RETRY_MS,
} from '../data/CombatConfig.js';
import { playSfx, spawnDamageFloat } from './Combatant.js';
import { isWalkable } from '../villagers/walkable.js';
import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';

/** Raid party size per steal tier (gold demanded per cycle). */
const RAID_SIZE_BY_STEAL = { 1: 1, 5: 2, 10: 3 };
const APPROACH_RETRIES   = 3;
const BAR_W = 64;
const BAR_H = 5;

/**
 * Physical pillaging: when BanditThreatSystem escalates to 'pillaging', this
 * system marches camp bandits to the marked building, where they hack at its
 * HP pool until it falls (demolishHard). Warriors automatically defend — the
 * nearest free warrior duels each attacking raider 1v1, reusing the same
 * turn-based swing rhythm as the camp assault. A repelled raid (all raiders
 * dead) leaves the building unharmed; killed raiders respawn at the camp and
 * the next raid departs after a cooldown, until the player pays the demanded
 * gold or clears the camp.
 *
 * BanditThreatSystem stays the economic state machine (when to raid, whom to
 * target, steal tier); raids are transient and never saved — on load a fresh
 * raid is scheduled if the threat state is still 'pillaging'.
 */
export class RaidSystem {
    constructor(scene, { tileMap, banditRenderer, warriorRenderer, buildingRenderer,
                         buildSystem, villagerManager, banditCampSystem,
                         banditThreatSystem, combatSystem }) {
        this._scene              = scene;
        this._tileMap            = tileMap;
        this._banditRenderer     = banditRenderer;
        this._warriorRenderer    = warriorRenderer;
        this._buildingRenderer   = buildingRenderer;
        this._buildSystem        = buildSystem;
        this._villagerManager    = villagerManager;
        this._banditCampSystem   = banditCampSystem;
        this._banditThreatSystem = banditThreatSystem;
        this._combatSystem       = combatSystem;

        this._raidState  = 'idle';   // 'idle' | 'scheduled' | 'marching' | 'attacking'
        // Bumped on every raid end/abort — chained delayedCall closures capture
        // the generation at start and become inert once it moves on.
        this._raidGen    = 0;
        this._targetUid  = null;
        this._buildingHp = PILLAGE_BUILDING_STATS.maxHp;
        this._raiders    = [];
        this._hpBar      = null;
        this._spriteBaseX   = null;
        this._launchTimer   = null;
        this._respawnTimers = new Set();
        this._lastThreatState = banditThreatSystem.getState();

        GameEvents.on(EventNames.BANDIT_THREAT_STATE_CHANGED, ({ state }) => {
            // The event re-fires with the same state on steal-tier changes
            if (state === this._lastThreatState) return;
            this._lastThreatState = state;
            if (state === 'pillaging') {
                this._scheduleLaunch(RAID_LAUNCH_DELAY_MS);
            } else {
                // Paid off ('raiding') or camp gone ('inactive')
                this._cancelLaunch();
                if (this._isRaidInFlight()) this._endRaid();
                this._raidState = 'idle';
            }
        });

        GameEvents.on(EventNames.BANDIT_CAMP_ASSAULT_STARTED, () => {
            if (!this._isRaidInFlight()) return;
            // Dissolve in place — CombatSystem holds the raiders right after
            // this (synchronous) emission and duels them wherever they stand;
            // freed defenders join the assault as regular warriors.
            this._endRaid({ marchHome: false });
            this._scheduleLaunch(RAID_RETRY_MS);   // keeps deferring while the assault runs
        });

        GameEvents.on(EventNames.BANDIT_CAMP_CLEARED, () => this._stopPermanently());

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid }) => {
            // The player demolished the raid's target out from under it.
            // (Raid-caused destruction nulls _targetUid before demolishHard.)
            if (uid !== this._targetUid || !this._isRaidInFlight()) return;
            this._endRaid();
            this._scheduleNext();
        });

        GameEvents.on(EventNames.WARRIORS_CHANGED, () => {
            // Newly hired warriors (or a freed slot) can take over the defense
            if (this._raidState === 'attacking') this._assignDefenders();
        });

        // Save load: a raid is never serialized — restart the cycle fresh
        if (this._lastThreatState === 'pillaging') {
            this._scheduleLaunch(RAID_LAUNCH_DELAY_MS);
        }
    }

    get isRaidActive() { return this._isRaidInFlight(); }

    // ── Launch ─────────────────────────────────────────────────────────────────

    _isRaidInFlight() {
        return this._raidState === 'marching' || this._raidState === 'attacking';
    }

    _scheduleLaunch(delay) {
        this._cancelLaunch();
        this._raidState   = 'scheduled';
        this._launchTimer = this._scene.time.delayedCall(delay, () => this._tryLaunch());
    }

    _cancelLaunch() {
        if (this._launchTimer) { this._launchTimer.remove(); this._launchTimer = null; }
        if (this._raidState === 'scheduled') this._raidState = 'idle';
    }

    /** Schedule the next raid if the threat is still on, else go idle. */
    _scheduleNext() {
        if (this._banditThreatSystem.getState() === 'pillaging'
            && this._banditCampSystem.isActive()) {
            this._scheduleLaunch(RAID_COOLDOWN_MS);
        } else {
            this._raidState = 'idle';
        }
    }

    _tryLaunch() {
        this._launchTimer = null;
        if (this._raidState !== 'scheduled') return;
        if (this._banditThreatSystem.getState() !== 'pillaging'
            || !this._banditCampSystem.isActive()) {
            this._raidState = 'idle';
            return;
        }
        // Never overlap with a camp assault
        if (this._combatSystem.isActive) {
            this._scheduleLaunch(RAID_RETRY_MS);
            return;
        }

        let target = this._getTarget();
        if (!target) {
            // No target on record (e.g. it was the player's only building) —
            // ask the threat system to pick again, then wait if still nothing
            this._banditThreatSystem.reselectTarget(null);
            target = this._getTarget();
            if (!target) { this._scheduleLaunch(RAID_RETRY_MS); return; }
        }

        const available = this._banditRenderer.bandits.filter(
            b => !b.combat.isDead && !b.combat.inCombat);
        if (available.length === 0) {
            this._scheduleLaunch(RAID_RETRY_MS);   // wait out pending respawns
            return;
        }

        const size = RAID_SIZE_BY_STEAL[this._banditThreatSystem.getStealAmount()] ?? 1;
        this._raiders    = available.slice(0, Math.min(size, available.length));
        this._targetUid  = target.uid;
        this._buildingHp = PILLAGE_BUILDING_STATS.maxHp;
        this._spriteBaseX = null;
        this._raidState  = 'marching';
        this._raidGen++;
        const gen = this._raidGen;

        const label = BUILDING_CONFIGS[target.configId]?.label ?? target.configId;
        GameEvents.emit(EventNames.SHOW_NOTIFICATION,
            { message: `Bandits are marching on your ${label}!` });

        const taken = new Set();
        for (const raider of this._raiders) {
            raider._raidStalled = false;
            raider.combat.onDeathComplete = (host) => this._banditRenderer.removeBandit(host);
            this._sendRaider(raider, gen, 0, taken);
        }
        this._checkAllStalled(gen);
    }

    _getTarget() {
        const uid = this._banditThreatSystem.getPillageTargetUid();
        return uid ? this._buildSystem.getBuilding(uid) : null;
    }

    // ── Marching ───────────────────────────────────────────────────────────────

    /** The 12 tiles surrounding a building's 2×2 footprint. */
    _perimeterTiles(building) {
        const tiles = [];
        for (let r = building.row - 1; r <= building.row + 2; r++) {
            for (let c = building.col - 1; c <= building.col + 2; c++) {
                const inFootprint = c >= building.col && c <= building.col + 1
                                 && r >= building.row && r <= building.row + 1;
                if (!inFootprint) tiles.push({ col: c, row: r });
            }
        }
        return tiles;
    }

    /** Chebyshev distance from a unit to the nearest footprint tile. */
    _distToBuilding(unit, building) {
        let best = Infinity;
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const d = Math.max(Math.abs(building.col + dc - unit.col),
                               Math.abs(building.row + dr - unit.row));
            if (d < best) best = d;
        }
        return best;
    }

    _sendRaider(raider, gen, retries, taken = new Set()) {
        if (gen !== this._raidGen || raider.combat.isDead) return;
        const building = this._getRaidBuilding();
        if (!building) return;

        const spots = this._perimeterTiles(building)
            .filter(p => !taken.has(`${p.col},${p.row}`) && this._isStandFree(p.col, p.row, raider))
            .sort((a, b) =>
                (Math.abs(a.col - raider.col) + Math.abs(a.row - raider.row)) -
                (Math.abs(b.col - raider.col) + Math.abs(b.row - raider.row)));

        for (const p of spots) {
            const ok = raider.marchToTile(p.col, p.row, () => {
                if (gen !== this._raidGen || raider.combat.isDead) return;
                const b = this._getRaidBuilding();
                if (!b) return;
                if (this._distToBuilding(raider, b) <= ENGAGE_RANGE) {
                    this._onRaiderInPosition(raider, gen);
                } else if (retries < APPROACH_RETRIES) {
                    this._sendRaider(raider, gen, retries + 1);
                } else {
                    raider._raidStalled = true;
                    this._checkAllStalled(gen);
                }
            });
            if (ok) {
                taken.add(`${p.col},${p.row}`);
                return;
            }
        }
        raider._raidStalled = true;
        this._checkAllStalled(gen);
    }

    /** Building the current raid is attacking, or null once it's gone. */
    _getRaidBuilding() {
        return this._targetUid ? this._buildSystem.getBuilding(this._targetUid) : null;
    }

    /** True when a unit can stand on (col, row): walkable and not occupied by
     *  another living combatant. */
    _isStandFree(col, row, forUnit = null) {
        if (!isWalkable(this._tileMap.getTile(col, row))) return false;
        for (const b of this._banditRenderer.bandits) {
            if (b === forUnit || b.combat.isDead) continue;
            if (b.col === col && b.row === row) return false;
        }
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w === forUnit || w.combat.isDead) continue;
            if (!w._marching && w.col === col && w.row === row) return false;
        }
        return true;
    }

    _checkAllStalled(gen) {
        if (gen !== this._raidGen || this._raidState !== 'marching') return;
        const living = this._raiders.filter(r => !r.combat.isDead);
        if (living.length === 0 || !living.every(r => r._raidStalled)) return;
        // Nobody can reach the target (walled off) — pick another and retreat
        this._banditThreatSystem.reselectTarget(this._targetUid);
        this._endRaid();
        this._scheduleNext();
    }

    // ── Building attack ────────────────────────────────────────────────────────

    _onRaiderInPosition(raider, gen) {
        this._raidState = 'attacking';
        this._swingAtBuilding(raider, gen);
        this._assignDefender(raider);
    }

    _swingAtBuilding(raider, gen) {
        if (gen !== this._raidGen || this._raidState !== 'attacking') return;
        if (raider.combat.isDead || raider.combat.inCombat) return;   // a duel took over
        const building = this._getRaidBuilding();
        if (!building) return;

        raider.playAttackSwing(building.col, building.row);

        this._scene.time.delayedCall(HIT_IMPACT_MS, () => {
            if (gen !== this._raidGen || this._raidState !== 'attacking') return;
            if (raider.combat.isDead || raider.combat.inCombat) return;
            if (!this._getRaidBuilding()) return;
            playSfx(this._scene, 'sfx-hit', { volume: 0.5, rate: 0.8 + Math.random() * 0.2 });
            const dmg = Math.max(0, raider.combat.rollDamage() - PILLAGE_BUILDING_STATS.armor);
            this._buildingHp = Math.max(0, this._buildingHp - dmg);
            this._buildingHitFeedback(dmg);
            if (this._buildingHp <= 0) {
                this._onBuildingDestroyed(gen);
            } else {
                this._scene.time.delayedCall(HIT_INTERVAL_MS - HIT_IMPACT_MS,
                    () => this._swingAtBuilding(raider, gen));
            }
        });
    }

    _buildingHitFeedback(dmg) {
        const sprite = this._buildingRenderer.getSprite(this._targetUid);
        if (sprite?.active) {
            // Overlapping shakes capture a mid-shake x as their rest position and
            // drift the sprite over time — anchor every shake to the original x.
            if (this._spriteBaseX === null) this._spriteBaseX = sprite.x;
            this._scene.tweens.killTweensOf(sprite);
            sprite.x = this._spriteBaseX;
            spawnDamageFloat(this._scene, sprite.x, sprite.y - 96, dmg);
            this._scene.tweens.add({
                targets: sprite,
                x: this._spriteBaseX + 3,
                duration: 40,
                yoyo: true,
                repeat: 2,
            });
        }
        this._updateHpBar();
    }

    _updateHpBar() {
        const building = this._getRaidBuilding();
        if (!building) return;
        if (!this._hpBar) {
            this._hpBar = this._scene.add.graphics().setDepth(DEPTH_FLOATING_LABEL);
        }
        const ratio = this._buildingHp / PILLAGE_BUILDING_STATS.maxHp;
        const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xff8800 : 0xff3333;
        const tile = this._tileMap.getTile(building.col, building.row);
        const { x, y } = tileToWorld(building.col, building.row, tile ? tile.height : 0);
        this._hpBar.clear();
        this._hpBar.setPosition(x - BAR_W / 2, y - 92);
        this._hpBar.fillStyle(0x000000, 0.7);
        this._hpBar.fillRect(-1, -1, BAR_W + 2, BAR_H + 2);
        this._hpBar.fillStyle(color, 1);
        this._hpBar.fillRect(0, 0, Math.round(BAR_W * ratio), BAR_H);
    }

    _destroyHpBar() {
        if (this._hpBar) { this._hpBar.destroy(); this._hpBar = null; }
    }

    _onBuildingDestroyed(gen) {
        if (gen !== this._raidGen) return;
        const building = this._getRaidBuilding();
        if (!building) return;
        const label = BUILDING_CONFIGS[building.configId]?.label ?? building.configId;
        const uid   = this._targetUid;

        // End the raid before demolishing so our own BUILDING_REMOVED handler
        // doesn't mistake this for a player demolition (it checks _targetUid).
        this._endRaid();
        GameEvents.emit(EventNames.SHOW_NOTIFICATION,
            { message: `Bandits destroyed your ${label}!` });
        // demolishHard fires BUILDING_REMOVED → BuildingRenderer plays the
        // demolition effect, BanditThreatSystem marks the next target.
        this._buildSystem.demolishHard(uid, this._tileMap, this._villagerManager);
        this._scheduleNext();
    }

    // ── Warrior defense ────────────────────────────────────────────────────────

    /** Assign a defender to every unengaged raider currently attacking. */
    _assignDefenders() {
        for (const raider of this._raiders) {
            if (raider.combat.isDead || raider._engagedBy) continue;
            this._assignDefender(raider);
        }
    }

    /** Send the nearest free warrior to duel this raider. */
    _assignDefender(raider) {
        if (this._raidState !== 'attacking') return;
        if (raider.combat.isDead || raider._engagedBy) return;

        const candidates = this._warriorRenderer.allWarriors()
            .filter(w => !w.combat.isDead && !w.combat.inCombat && !w._defenseTarget
                      && !w._combatTarget && !w._attackingCamp)
            .sort((a, b) =>
                (Math.abs(a.col - raider.col) + Math.abs(a.row - raider.row)) -
                (Math.abs(b.col - raider.col) + Math.abs(b.row - raider.row)));

        for (const w of candidates) {
            if (this._approachDefend(w, raider, 0)) return;
        }
        // Nobody can come — the raider hacks away undefended. Re-checked on
        // WARRIORS_CHANGED and whenever a defender frees up.
    }

    /** March a warrior to a tile adjacent to the raider, then start the duel.
     *  The (+1,+1)/(−1,−1) diagonals are excluded — in the isometric projection
     *  they render almost on top of the raider. Returns false when no adjacent
     *  spot is reachable. */
    _approachDefend(w, raider, retries) {
        const gen = this._raidGen;
        const spots = [];
        for (const [dc, dr] of [[0,-1],[-1,0],[1,0],[0,1],[1,-1],[-1,1]]) {
            const c = raider.col + dc, r = raider.row + dr;
            if (this._isStandFree(c, r, w)) spots.push({ col: c, row: r });
        }
        spots.sort((a, b) =>
            (Math.abs(a.col - w.col) + Math.abs(a.row - w.row)) -
            (Math.abs(b.col - w.col) + Math.abs(b.row - w.row)));

        for (const p of spots) {
            const ok = w.marchToTile(p.col, p.row, () => {
                if (gen !== this._raidGen || this._raidState !== 'attacking') return;
                if (w.combat.isDead) return;
                if (raider.combat.isDead || raider._engagedBy !== w) {
                    w._defenseTarget = null;
                    this._reassignDefender(w);
                    return;
                }
                const dist = Math.max(Math.abs(raider.col - w.col), Math.abs(raider.row - w.row));
                if (dist >= 1 && dist <= ENGAGE_RANGE) {
                    this._startDuel(w, raider, gen);
                } else if (retries < APPROACH_RETRIES) {
                    this._approachDefend(w, raider, retries + 1);
                } else {
                    // Couldn't pin the raider down — release it for another warrior
                    raider._engagedBy = null;
                    w._defenseTarget  = null;
                    this._assignDefender(raider);
                }
            });
            if (ok) {
                raider._engagedBy = w;
                w._defenseTarget  = raider;
                return true;
            }
        }
        return false;
    }

    /** A freed warrior picks the next unengaged attacking raider, or goes home. */
    _reassignDefender(w) {
        if (this._raidState === 'attacking') {
            const next = this._raiders.find(r => !r.combat.isDead && !r._engagedBy);
            if (next && this._approachDefend(w, next, 0)) return;
        }
        w.marchHome();
    }

    // ── Duels (same rhythm as the camp assault) ────────────────────────────────

    _startDuel(warrior, raider, gen) {
        warrior.combat.inCombat = true;
        raider.combat.inCombat  = true;
        warrior.combat.onDeathComplete = (host) => host.destroy();
        // The warrior strikes first
        this._swingDuel(warrior, raider, gen);
    }

    _swingDuel(attacker, defender, gen) {
        if (gen !== this._raidGen || attacker.combat.isDead || defender.combat.isDead) return;

        attacker.playAttackSwing(defender.col, defender.row);

        this._scene.time.delayedCall(HIT_IMPACT_MS, () => {
            if (gen !== this._raidGen || attacker.combat.isDead || defender.combat.isDead) return;
            playSfx(this._scene, 'sfx-hit', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
            const died = defender.combat.takeDamage(attacker.combat.rollDamage());
            if (died) {
                this._onDuelDeath(defender, attacker, gen);
            } else {
                this._scene.time.delayedCall(HIT_INTERVAL_MS - HIT_IMPACT_MS, () => {
                    this._swingDuel(defender, attacker, gen);
                });
            }
        });
    }

    _onDuelDeath(loser, winner, gen) {
        playSfx(this._scene, 'sfx-death', { volume: 0.6 });
        winner.combat.inCombat = false;

        if (this._raiders.includes(loser)) {
            // Raider slain — defender re-engages or goes home; camp refills later
            loser._engagedBy       = null;
            winner._defenseTarget  = null;
            this._scheduleRespawn();
            this._scene.time.delayedCall(SWING_FOLLOW_THROUGH_MS, () => {
                if (winner.combat.isDead || winner.combat.inCombat) return;
                if (gen === this._raidGen && this._raidState === 'attacking') {
                    this._reassignDefender(winner);
                } else if (!this._combatSystem.isActive) {
                    winner.marchHome();
                }
            });
            this._checkRepelled(gen);
        } else {
            // Defender fell — permanent loss, the raider returns to the building
            this._onWarriorDied(loser);
            winner._engagedBy      = null;
            winner.combat.inCombat = false;
            this._scene.time.delayedCall(SWING_FOLLOW_THROUGH_MS, () => {
                if (gen !== this._raidGen || this._raidState !== 'attacking') return;
                if (winner.combat.isDead || winner.combat.inCombat) return;
                this._swingAtBuilding(winner, gen);
                this._assignDefender(winner);
            });
        }
    }

    /** Permanent loss: remove from the renderer pool, then from the Barracks count. */
    _onWarriorDied(warrior) {
        warrior._defenseTarget = null;
        const uid = this._warriorRenderer.findPoolUid(warrior);
        this._warriorRenderer.removeEntity(warrior);
        if (!uid) return;
        const building = this._buildSystem.getBuilding(uid);
        if (building) {
            this._villagerManager.killAssigned(uid, this._buildSystem);
            GameEvents.emit(EventNames.WARRIORS_CHANGED, { buildingUid: uid, building });
        }
    }

    _checkRepelled(gen) {
        if (gen !== this._raidGen || !this._isRaidInFlight()) return;
        if (this._raiders.some(r => !r.combat.isDead)) return;
        GameEvents.emit(EventNames.SHOW_NOTIFICATION, { message: 'Raid repelled!' });
        this._endRaid();
        this._scheduleNext();
    }

    // ── Respawns ───────────────────────────────────────────────────────────────

    /** One respawn per raider killed in a raid. Deferred while a camp assault
     *  is running; cancelled for good once the camp is cleared. */
    _scheduleRespawn() {
        const attempt = () => {
            this._respawnTimers.delete(timer);
            if (!this._banditCampSystem.isActive()) return;
            if (this._combatSystem.isActive) {
                timer = this._scene.time.delayedCall(RAID_RETRY_MS, attempt);
                this._respawnTimers.add(timer);
                return;
            }
            this._banditRenderer.spawnOne();
        };
        let timer = this._scene.time.delayedCall(BANDIT_RESPAWN_MS, attempt);
        this._respawnTimers.add(timer);
    }

    // ── Raid end / aborts ──────────────────────────────────────────────────────

    /**
     * Dissolve the current raid: invalidate all chained timers, break up the
     * duels, reset the building HP (no lasting damage), and send everyone home
     * (unless a camp assault is taking over the survivors in place).
     */
    _endRaid({ marchHome = true } = {}) {
        this._raidGen++;
        this._destroyHpBar();
        this._buildingHp  = PILLAGE_BUILDING_STATS.maxHp;
        this._spriteBaseX = null;

        for (const raider of this._raiders) {
            raider._raidStalled = false;
            if (raider._engagedBy) {
                const w = raider._engagedBy;
                w.combat.inCombat = false;
                w._defenseTarget  = null;
                raider._engagedBy = null;
                if (marchHome && !w.combat.isDead) w.marchHome();
            }
            raider.combat.inCombat = false;
            if (marchHome && !raider.combat.isDead) raider.marchHome();
        }
        // Defenders still marching toward a raider (duel not started yet)
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w._defenseTarget && this._raiders.includes(w._defenseTarget)) {
                w._defenseTarget = null;
                if (marchHome && !w.combat.isDead && !w.combat.inCombat) w.marchHome();
            }
        }

        this._raiders   = [];
        this._targetUid = null;
        this._raidState = 'idle';
    }

    /** Camp cleared — raids are over for good. CombatSystem already kills every
     *  bandit (wherever it stands) and marches all warriors home. */
    _stopPermanently() {
        this._raidGen++;
        this._cancelLaunch();
        for (const t of this._respawnTimers) t.remove();
        this._respawnTimers.clear();
        this._destroyHpBar();
        for (const w of this._warriorRenderer.allWarriors()) {
            if (w._defenseTarget) {
                w._defenseTarget  = null;
                w.combat.inCombat = false;
            }
        }
        this._raiders   = [];
        this._targetUid = null;
        this._raidState = 'idle';
    }
}
