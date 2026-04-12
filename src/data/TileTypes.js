export const TILE_TYPES = Object.freeze({
    GRASS: {
        id: 'GRASS',
        weight: 60,
        textureKey: 'tile-grass',
        buildable: true,
        initialResources: 0,
    },
    FOREST: {
        id: 'FOREST',
        weight: 25,
        textureKey: 'tile-forest',
        buildable: false,
        initialResources: 50,
    },
    ROCKS: {
        id: 'ROCKS',
        weight: 15,
        textureKey: 'tile-rocks',
        buildable: false,
        initialResources: 100,
    },
    IRON: {
        id: 'IRON',
        weight: 0,
        textureKey: 'tile-iron',
        buildable: false,
        initialResources: 100,
    },
});

// Pre-built weighted pool for fast random picks
const pool = [];
for (const type of Object.values(TILE_TYPES)) {
    for (let i = 0; i < type.weight; i++) pool.push(type.id);
}
export const TILE_TYPE_POOL = pool;
