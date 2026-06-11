/**
 * Combat tuning for the bandit camp assault.
 *
 * Damage formula: dmg = max(0, attacker.damage - defender.armor)
 * A 1v1 duel: warrior takes 10-3=7 per bandit hit, bandit takes 10-2=8 per
 * warrior hit. The warrior swings first, needs 5 swings to kill and eats 4
 * retaliations — it wins, but barely, at 12/40 hp.
 */
export const WARRIOR_STATS = Object.freeze({ maxHp: 40, armor: 3, damage: 10 });
export const BANDIT_STATS  = Object.freeze({ maxHp: 40, armor: 2, damage: 10 });

/** The camp building itself — attacked like a unit but never retaliates.
 *  Sized as a siege: 60 warrior swings total, ~13 s for a full squad of 5. */
export const CAMP_STATS = Object.freeze({ maxHp: 600, armor: 0 });

/** Time between alternating swings in a duel (and between camp hits). */
export const HIT_INTERVAL_MS = 1100;

/** Delay from swing start until the damage lands (mid attack animation). */
export const HIT_IMPACT_MS = 350;

/** Out-of-combat regeneration: +HEAL_AMOUNT hp every HEAL_INTERVAL_MS. */
export const HEAL_INTERVAL_MS = 3000;
export const HEAL_AMOUNT      = 2;

/** Chebyshev distance at which an approaching warrior engages its target. */
export const ENGAGE_RANGE = 1;
