import { BanditEntity } from './BanditEntity.js';
import { tileToWorld, TILE_H } from '../map/MapRenderer.js';
import { randomWalkableTileNear, randomWalkableTile } from '../villagers/walkable.js';
import { LAYER_BUILDING, HEIGHT_DEPTH_BIAS } from '../config/DepthLayers.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';
import { FOG_VISIBLE } from '../systems/FogOfWarSystem.js';

const BANDIT_COUNT   = 3;
const SPAWN_RADIUS   = 3;

export class BanditRenderer {
    constructor(scene, tileMap, banditCampSystem, fogSystem) {
        this._scene            = scene;
        this._tileMap          = tileMap;
        this._banditCampSystem = banditCampSystem;
        this._fogSystem        = fogSystem;
        this._bandits          = [];
        this._campSprite       = null;

        if (banditCampSystem.isActive()) {
            this._createCampSprite();
            this._spawnBandits();
        }

        // Refresh fog visibility whenever fog state changes
        GameEvents.on(EventNames.FOG_UPDATED, () => {
            this._refreshFogVisibility();
        });
    }

    /** Destroy all bandit entities and the camp sprite (called when camp is cleared). */
    clearCamp() {
        for (const b of this._bandits) b.destroy();
        this._bandits = [];
        this.destroyCampSprite();
    }

    /** Alive-or-dying bandit entities (combat reads/locks targets on these). */
    get bandits() { return this._bandits; }

    /** The camp building sprite (for hit feedback / HP bar anchoring). */
    get campSprite() { return this._campSprite; }

    /** Remove and destroy a single bandit (after its death animation). */
    removeBandit(entity) {
        const idx = this._bandits.indexOf(entity);
        if (idx !== -1) this._bandits.splice(idx, 1);
        entity.destroy();
    }

    /** Destroy only the camp sprite (combat kills the bandits individually). */
    destroyCampSprite() {
        if (this._campSprite) { this._campSprite.destroy(); this._campSprite = null; }
    }

    // ── Private ────────────────────────────────────────────────────────────────

    _createCampSprite() {
        const { campCol, campRow } = this._banditCampSystem;
        const tile = this._tileMap.getTile(campCol, campRow);
        const h    = tile ? tile.height : 0;
        const { x, y } = tileToWorld(campCol, campRow, h);

        this._campSprite = this._scene.add.image(x, y, 'building-bandit-camp')
            .setOrigin(0.5, 1)
            .setDepth(campCol + campRow + h * HEIGHT_DEPTH_BIAS + LAYER_BUILDING)
            .setInteractive();

        // Clicking the camp sprite emits TILE_SELECTED with the camp tile, bypassing
        // the fog tile's disableInteractive() so the Attack Camp panel works from fog.
        this._campSprite.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            const campTile = this._tileMap.getTile(campCol, campRow);
            if (campTile) GameEvents.emit(EventNames.TILE_SELECTED, { tile: campTile });
        });

        this._refreshCampSpriteVisibility();
    }

    _spawnBandits() {
        const { campCol, campRow } = this._banditCampSystem;
        const used = new Set();

        for (let i = 0; i < BANDIT_COUNT; i++) {
            let tile = null;
            for (let attempt = 0; attempt < 10 && !tile; attempt++) {
                const t = randomWalkableTileNear(this._tileMap, campCol, campRow, SPAWN_RADIUS)
                       ?? randomWalkableTile(this._tileMap);
                if (t && !used.has(`${t.col},${t.row}`)) tile = t;
            }
            if (!tile) continue;
            used.add(`${tile.col},${tile.row}`);
            this._bandits.push(new BanditEntity(
                this._scene, this._tileMap,
                tile.col, tile.row,
                campCol, campRow,
                this._fogSystem,
            ));
        }
    }

    _refreshFogVisibility() {
        this._refreshCampSpriteVisibility();
        for (const b of this._bandits) b.refreshFogVisibility();
    }

    _refreshCampSpriteVisibility() {
        if (!this._campSprite || !this._fogSystem) return;
        // Show the camp as soon as any claimed tile is visible — the player can
        // see the red territory and needs to know where the camp is.
        const visible = this._banditCampSystem.claimedTiles.some(
            ({ col, row }) => this._fogSystem.getState(col, row) === FOG_VISIBLE
        );
        this._campSprite.setVisible(visible);
        if (visible) this._campSprite.setInteractive();
        else this._campSprite.disableInteractive();
    }
}
