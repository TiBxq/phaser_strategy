/**
 * Tracks the state of the non-player Bandit Camp.
 * Plain class — no Phaser dependency.
 *
 * Call initFromMap() after TileMap.generate() to load the camp position
 * and claimed tile list that were stamped during map generation.
 */
export class BanditCampSystem {
    constructor() {
        this.campCol          = null;
        this.campRow          = null;
        this.isCleared        = false;
        this._claimedTiles    = [];   // Array<{ col, row }> — tiles to unset on clear
    }

    /**
     * Read the camp position and claimed tiles from the generated tileMap.
     * No-ops if the map generator failed to place a camp.
     */
    initFromMap(tileMap) {
        if (tileMap.banditCampCol === undefined) return;
        this.campCol       = tileMap.banditCampCol;
        this.campRow       = tileMap.banditCampRow;
        this._claimedTiles = tileMap.banditClaimedTiles ?? [];
    }

    /** Read-only access to claimed tile positions. */
    get claimedTiles() { return this._claimedTiles; }

    /** True when the camp exists and has not been cleared yet. */
    isActive() {
        return !this.isCleared && this.campCol !== null;
    }

    /**
     * Clears the camp: removes all banditClaimed / banditCampTile flags from tiles.
     * Returns the list of tile positions that were cleared (for MapRenderer refresh).
     */
    clear(tileMap) {
        for (const { col, row } of this._claimedTiles) {
            const t = tileMap.getTile(col, row);
            if (t) {
                t.banditClaimed  = false;
                t.banditCampTile = false;
            }
        }
        const clearedTiles = this._claimedTiles.slice();
        this._claimedTiles = [];
        this.isCleared = true;
        return { clearedTiles };
    }
}
