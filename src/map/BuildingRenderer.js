import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { tileToWorld, TILE_DEPTH } from './MapRenderer.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

export class BuildingRenderer {
    constructor(scene, tileMap) {
        this.scene   = scene;
        this.tileMap = tileMap;

        // Map<uid, Phaser.GameObjects.Image>
        this._buildingSprites = new Map();
        // Map<'col_row', Phaser.GameObjects.Image> for farm fields
        this._fieldSprites = new Map();

        this._ghost = null;

        this._bindEvents();
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    _bindEvents() {
        GameEvents.on(EventNames.BUILDING_PLACED, ({ building }) => {
            this._addBuilding(building);
        });

        GameEvents.on(EventNames.BUILDING_REMOVED, ({ uid, col, row }) => {
            this._removeBuilding(uid);
        });
    }

    _addBuilding(building) {
        const config    = BUILDING_CONFIGS[building.configId];
        const { x, y }  = tileToWorld(building.col, building.row);
        const depth     = building.col + building.row + 0.5;

        // Offset up by TILE_DEPTH so the building sits on the diamond surface,
        // not at the bottom of the tile cube's depth face.
        const img = this.scene.add.image(x, y - TILE_DEPTH, config.textureKey)
            .setOrigin(0.5, 1)
            .setDepth(depth);

        this._buildingSprites.set(building.uid, img);

        // Farm fields
        for (const ft of building.fieldTiles) {
            this._addFieldSprite(ft.col, ft.row);
        }
    }

    _addFieldSprite(col, row) {
        const key       = `${col}_${row}`;
        if (this._fieldSprites.has(key)) return;
        const { x, y }  = tileToWorld(col, row);
        const depth     = col + row + 0.2;
        const img = this.scene.add.image(x, y, 'tile-field')
            .setOrigin(0.5, 1)
            .setDepth(depth);
        this._fieldSprites.set(key, img);
    }

    _removeBuilding(uid) {
        const img = this._buildingSprites.get(uid);
        if (img) {
            img.destroy();
            this._buildingSprites.delete(uid);
        }
        // Field sprites are NOT removed here — they are removed by BuildSystem
        // which clears tileMap isField flags; caller can refresh tiles manually.
    }

    // ─── Ghost preview ─────────────────────────────────────────────────────────

    showGhost(configId) {
        if (!this._ghost) {
            this._ghost = this.scene.add.image(0, 0, 'building-house')
                .setOrigin(0.5, 1)
                .setAlpha(0.55)
                .setDepth(99999)
                .setVisible(false);
        }
        const config = BUILDING_CONFIGS[configId];
        this._ghost.setTexture(config.textureKey).setVisible(true);
    }

    updateGhost(col, row, isValid) {
        if (!this._ghost) return;
        const { x, y } = tileToWorld(col, row);
        this._ghost.setPosition(x, y - TILE_DEPTH).setVisible(true);
        // Green tint = valid, red tint = invalid
        this._ghost.setTint(isValid ? 0x88ff88 : 0xff6666);
    }

    hideGhost() {
        if (this._ghost) this._ghost.setVisible(false);
    }
}
