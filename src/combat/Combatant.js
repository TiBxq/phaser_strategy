import * as Phaser from 'phaser';
import { DEPTH_FLOATING_LABEL, LAYER_HP_BAR, LAYER_VILLAGER } from '../config/DepthLayers.js';
import { HEAL_INTERVAL_MS, HEAL_AMOUNT } from '../data/CombatConfig.js';

const BAR_W        = 24;
const BAR_H        = 3;
const BAR_Y_OFFSET = -72;   // above the unit sprite (origin 0.5,1)
const FLASH_MS     = 90;
const DEATH_MS     = 700;

/** Play a loaded SFX, silently skipping if the audio file was not provided. */
export function playSfx(scene, key, config = {}) {
    if (scene.cache.audio.exists(key)) scene.sound.play(key, config);
}

/** Red "-N" damage float rising above (x, y) in world space. */
export function spawnDamageFloat(scene, x, y, amount) {
    const text = scene.add.text(x, y, `-${amount}`, {
        fontFamily:      'monospace',
        fontSize:        '14px',
        color:           amount > 0 ? '#ff4444' : '#aaaaaa',
        stroke:          '#000000',
        strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH_FLOATING_LABEL);

    scene.tweens.add({
        targets:  text,
        y:        y - 36,
        duration: 1000,
        ease:     'Cubic.Out',
    });
    scene.tweens.add({
        targets:  text,
        alpha:    0,
        delay:    500,
        duration: 500,
        ease:     'Linear',
        onComplete: () => text.destroy(),
    });
}

/**
 * Combat state component composed into unit entities (WarriorEntity / BanditEntity).
 * The host must expose `_sprite`, `_shadow`, `col`, `row`.
 *
 * Owns: hp/armor/damage, the floating HP bar (shown only when injured),
 * out-of-combat regeneration, hit flash + damage floats, and the death tween.
 * Set `onDeathComplete` to be notified once the death animation has finished.
 */
export class Combatant {
    constructor(scene, host, stats, { baseTint = 0xffffff } = {}) {
        this._scene   = scene;
        this._host    = host;
        this.maxHp     = stats.maxHp;
        this.hp        = stats.maxHp;
        this.armor     = stats.armor;
        this.damageMin = stats.damageMin;
        this.damageMax = stats.damageMax;
        this.inCombat = false;
        this.isDead   = false;
        this.onDeathComplete = null;
        this._baseTint = baseTint;
        this._destroyed = false;

        this._bar = scene.add.graphics().setVisible(false);
        this._redrawBar();

        // Entities tween sprite and shadow independently, so the bar follows
        // the sprite per-frame. Self-detaches once the sprite is gone.
        this._followFn = () => this._follow();
        scene.events.on(Phaser.Scenes.Events.UPDATE, this._followFn);

        this._healTimer = scene.time.addEvent({
            delay: HEAL_INTERVAL_MS,
            loop:  true,
            callback: () => {
                if (this.isDead || this.inCombat || this.hp >= this.maxHp) return;
                this.hp = Math.min(this.maxHp, this.hp + HEAL_AMOUNT);
                this._redrawBar();
            },
        });
    }

    /** Random integer damage roll in [damageMin, damageMax] for one swing. */
    rollDamage() {
        return Phaser.Math.Between(this.damageMin, this.damageMax);
    }

    /**
     * Apply an incoming hit: dmg = max(0, rawDamage - armor).
     * Returns true when this hit was lethal (death tween starts immediately).
     */
    takeDamage(rawDamage) {
        if (this.isDead) return false;
        const dmg = Math.max(0, rawDamage - this.armor);
        this.hp = Math.max(0, this.hp - dmg);

        const sprite = this._host._sprite;
        spawnDamageFloat(this._scene, sprite.x, sprite.y + BAR_Y_OFFSET, dmg);
        this._flash();
        this._redrawBar();

        if (this.hp <= 0) {
            this.kill();
            return true;
        }
        return false;
    }

    /** Immediate death (no damage float) — also the shared path for lethal hits. */
    kill() {
        if (this.isDead) return;
        this.hp       = 0;
        this.isDead   = true;
        this.inCombat = false;
        this._bar.setVisible(false);
        this._playDeath();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._scene.events.off(Phaser.Scenes.Events.UPDATE, this._followFn);
        this._healTimer.remove();
        this._bar.destroy();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _flash() {
        const sprite = this._host._sprite;
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this._scene.time.delayedCall(FLASH_MS, () => {
            if (this.isDead || !sprite.active) return;
            sprite.setTintMode(Phaser.TintModes.MULTIPLY);
            if (this._baseTint === 0xffffff) sprite.clearTint();
            else sprite.setTint(this._baseTint);
        });
    }

    /** Fall over sideways around the feet, darken and fade out. */
    _playDeath() {
        const sprite = this._host._sprite;
        const shadow = this._host._shadow;
        sprite.anims.stop();
        sprite.setTintMode(Phaser.TintModes.MULTIPLY);
        if (this._baseTint === 0xffffff) sprite.clearTint();
        else sprite.setTint(this._baseTint);
        const fallDir = sprite.flipX ? -90 : 90;

        this._scene.tweens.add({
            targets:  sprite,
            angle:    fallDir,
            duration: DEATH_MS * 0.4,
            ease:     'Quad.In',
        });
        this._scene.tweens.add({
            targets:  [sprite, shadow],
            alpha:    0,
            delay:    DEATH_MS * 0.4,
            duration: DEATH_MS * 0.6,
            ease:     'Linear',
            onComplete: () => this.onDeathComplete?.(this._host),
        });
        this._scene.tweens.addCounter({
            from: 0, to: 1,
            duration: DEATH_MS * 0.4,
            onUpdate: (tw) => {
                if (!sprite.active) return;
                const shade = 255 - Math.floor(tw.getValue() * 160);
                sprite.setTint(Phaser.Display.Color.GetColor(shade, shade, shade));
            },
        });
    }

    _follow() {
        const sprite = this._host._sprite;
        if (this._destroyed) return;
        if (!sprite.active) {
            // Scene-restart / external destroy safety: clean ourselves up
            this.destroy();
            return;
        }
        const show = !this.isDead && this.hp < this.maxHp && sprite.visible;
        this._bar.setVisible(show);
        if (!show) return;
        this._bar.setPosition(sprite.x - BAR_W / 2, sprite.y + BAR_Y_OFFSET);
        this._bar.setDepth(sprite.depth + (LAYER_HP_BAR - LAYER_VILLAGER));
    }

    _redrawBar() {
        const ratio = this.hp / this.maxHp;
        const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xff8800 : 0xff3333;
        this._bar.clear();
        this._bar.fillStyle(0x000000, 0.7);
        this._bar.fillRect(-1, -1, BAR_W + 2, BAR_H + 2);
        this._bar.fillStyle(color, 1);
        this._bar.fillRect(0, 0, Math.round(BAR_W * ratio), BAR_H);
    }
}
