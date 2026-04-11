/** Number of forest tiles required per Lumbermill worker slot. */
export const FOREST_TILES_PER_WORKER = 4;

/**
 * Central data-driven registry for all building types.
 * Adding a new building requires only a new entry here — no new classes.
 *
 * Fields:
 *   id                  — unique string key, matches the object key
 *   label               — display name
 *   textureKey          — Phaser texture key for the building sprite
 *   cost                — resource cost object {food, wood, stone, money}
 *   buildableOn         — array of TILE_TYPE ids this building can be placed on
 *   requiresAdjacentTo  — tile type id that must exist in a neighbour, or null
 *   footprint           — tile footprint size (all buildings are 2×2)
 *   claimsTileType      — tile type this building claims for production workers, or null
 *   producesResource    — resource name string this building outputs, or null
 *   productionPerVillager — resource units produced per assigned villager per tick
 *   maxVillagers        — max villagers (static cap; tile-based buildings use dynamic cap)
 *   villagerCapacity    — how many villagers this building HOUSES (House only)
 *   onPlace             — string token dispatched by BuildSystem after placement:
 *                         null | 'spawnVillager' | 'spawnFields' | 'claimForest' | 'increaseStorageCap' | 'initRocksTiles'
 *   description         — short text shown in TileInfoPanel
 */
export const BUILDING_CONFIGS = Object.freeze({
    TOWN_HALL: {
        id: 'TOWN_HALL',
        label: 'Town Hall',
        textureKey: 'building-townhall',
        cost: { food: 0, wood: 0, stone: 0, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 4,
        onPlace: 'spawnVillager',
        requires: [],
        description: '2×2 building. Houses 4 villagers. Required before other buildings.',
    },

    HOUSE: {
        id: 'HOUSE',
        label: 'House',
        textureKey: 'building-house',
        cost: { food: 20, wood: 15, stone: 0, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 2,
        onPlace: 'spawnVillager',
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building. Houses 2 villagers.',
        upgradesTo: 'HOUSE_T2',
        upgradeCost: { food: 0, wood: 25, stone: 30, money: 50 },
    },

    HOUSE_T2: {
        id: 'HOUSE_T2',
        label: 'House Tier 2',
        textureKey: 'building-house-t2',
        cost: { food: 0, wood: 0, stone: 0, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 4,
        onPlace: null,
        isUpgrade: true,
        description: '2×2 building. Houses 4 villagers.',
    },

    FARM: {
        id: 'FARM',
        label: 'Farm',
        textureKey: 'building-farm',
        cost: { food: 0, wood: 20, stone: 0, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: 'GRASS',
        producesResource: 'food',
        productionPerVillager: 3,
        maxVillagers: 4,
        villagerCapacity: 0,
        onPlace: 'spawnFields',
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building. Claims adjacent 2×2 grass blocks as fields. 1 villager per field → 3 food/tick.',
    },

    LUMBERMILL: {
        id: 'LUMBERMILL',
        label: 'Lumbermill',
        textureKey: 'building-lumbermill',
        cost: { food: 0, wood: 0, stone: 15, money: 10 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: 'FOREST',
        footprint: 2,
        claimsTileType: 'FOREST',
        producesResource: 'wood',
        productionPerVillager: 2,
        maxVillagers: 0,   // dynamic: ceil(forestTiles.length / FOREST_TILES_PER_WORKER)
        villagerCapacity: 0,
        onPlace: 'claimForest',
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building. Claims all forest within radius 2. Workers = floor(tiles/4), each → 2 wood/tick.',
    },

    QUARRY: {
        id: 'QUARRY',
        label: 'Quarry',
        textureKey: 'building-quarry',
        cost: { food: 0, wood: 10, stone: 0, money: 15 },
        buildableOn: ['ROCKS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: 'stone',
        productionPerVillager: 1,
        maxVillagers: 6,
        villagerCapacity: 0,
        onPlace: 'initRocksTiles',
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building on rocks. Mines the 4 tiles it occupies (400 stone total). Up to 6 workers → 1 stone/tick each.',
    },

    MARKET: {
        id: 'MARKET',
        label: 'Market',
        textureKey: 'building-market',
        cost: { food: 0, wood: 25, stone: 10, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: 'money',
        productionPerVillager: 5,
        maxVillagers: 4,
        villagerCapacity: 0,
        onPlace: null,
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building. Each merchant converts 3 food → 5 money/tick.',
    },

    WAREHOUSE: {
        id: 'WAREHOUSE',
        label: 'Warehouse',
        textureKey: 'building-warehouse',
        cost: { food: 0, wood: 30, stone: 25, money: 40 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        footprint: 2,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 0,
        onPlace: 'increaseStorageCap',
        requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
        description: '2×2 building. Increases all resource caps by 100.',
    },
});

/**
 * Pseudo-config for Road — not a building, used only by BuildingMenu for display.
 * Roads are 1×1 tiles placed via RoadSystem, not BuildSystem.
 */
export const ROAD_CONFIG = Object.freeze({
    id: 'ROAD',
    label: 'Road',
    cost: { stone: 1, money: 2 },
    requires: [{ type: 'buildingPlaced', configId: 'TOWN_HALL' }],
    description: '1×1 path tile. Connects buildings to Town Hall. 1 stone + 2 money each.',
});
