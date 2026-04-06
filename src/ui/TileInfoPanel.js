import { BUILDING_CONFIGS } from '../data/BuildingConfig.js';
import { GameEvents } from '../events/GameEvents.js';
import { EventNames } from '../events/EventNames.js';

const HEADER_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '12px',
    color:      '#aaccff',
};

const BODY_STYLE = {
    fontFamily: 'monospace',
    fontSize:   '10px',
    color:      '#ccddf0',
    wordWrap:   { width: 176 },
};

const PX = 762;   // panel left edge
const PY = 50;    // panel top edge

export class TileInfoPanel {
    constructor(scene, buildSystem) {
        this.scene       = scene;
        this.buildSystem = buildSystem;

        // Background (200×200 — VillagerPanel sits below at PY+200)
        this._bg = scene.add.image(PX, PY, 'ui-sidepanel')
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setDisplaySize(200, 200)
            .setVisible(false);

        this._titleText = scene.add.text(PX + 8, PY + 10, '', HEADER_STYLE)
            .setScrollFactor(0)
            .setDepth(1001);

        this._bodyText = scene.add.text(PX + 8, PY + 32, '', BODY_STYLE)
            .setScrollFactor(0)
            .setDepth(1001);

        GameEvents.on(EventNames.TILE_SELECTED, ({ col, row, tile }) => {
            this._show(col, row, tile);
        });

        GameEvents.on(EventNames.TILE_DESELECTED, () => this._hide());

        GameEvents.on(EventNames.BUILDING_PLACED, () => {
            // If the selected tile now has a building, refresh
            if (this._currentTile) {
                this._show(this._currentTile.col, this._currentTile.row, this._currentTile.tile);
            }
        });
    }

    _show(col, row, tile) {
        this._currentTile = { col, row, tile };

        const building = this.buildSystem.getBuildingAt(col, row);
        const config   = building ? BUILDING_CONFIGS[building.configId] : null;

        this._bg.setVisible(true);
        this._titleText.setVisible(true);
        this._bodyText.setVisible(true);

        if (config) {
            this._titleText.setText(config.label);
            const assigned = building.assignedVillagers;
            const maxV     = config.maxVillagers;
            let body = config.description + '\n';
            if (maxV > 0) {
                body += `\nWorkers: ${assigned}/${maxV}`;
            }
            if (config.producesResource) {
                body += `\nProduces: ${config.producesResource}`;
            }
            if (building.fieldTiles && building.fieldTiles.length > 0) {
                body += `\nFields: ${building.fieldTiles.length}`;
            }
            this._bodyText.setText(body);
        } else {
            this._titleText.setText(`Tile (${col}, ${row})`);
            const typeLabel = tile.isField
                ? 'Farm Field'
                : tile.type.charAt(0) + tile.type.slice(1).toLowerCase();
            this._bodyText.setText(
                `Type: ${typeLabel}\nNo building.\n\nSelect a building\nfrom the menu below\nto build here.`,
            );
        }
    }

    _hide() {
        this._currentTile = null;
        this._bg.setVisible(false);
        this._titleText.setVisible(false);
        this._bodyText.setVisible(false);
    }
}
