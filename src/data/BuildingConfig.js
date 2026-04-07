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
 *   producesResource    — resource name string this building outputs, or null
 *   productionPerVillager — resource units produced per assigned villager per tick
 *   maxVillagers        — max villagers that can be assigned to work here
 *   villagerCapacity    — how many villagers this building HOUSES (House only)
 *   claimsTileType      — tile type this building claims for production workers, or null
 *   onPlace             — string token dispatched by BuildSystem after placement:
 *                         null | 'spawnVillager' | 'spawnFields' | 'claimForest' | 'increaseStorageCap'
 *   description         — short text shown in TileInfoPanel
 */
export const BUILDING_CONFIGS = Object.freeze({
    HOUSE: {
        id: 'HOUSE',
        label: 'House',
        textureKey: 'building-house',
        cost: { food: 0, wood: 20, stone: 0, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 2,
        onPlace: 'spawnVillager',
        description: 'Houses 2 villagers. Required to have workers.',
    },

    FARM: {
        id: 'FARM',
        label: 'Farm',
        textureKey: 'building-farm',
        cost: { food: 0, wood: 30, stone: 10, money: 0 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        claimsTileType: 'GRASS',
        producesResource: 'food',
        productionPerVillager: 5,
        maxVillagers: 4,
        villagerCapacity: 0,
        onPlace: 'spawnFields',
        description: 'Claims adjacent grass as fields. Assign 1 villager per field to produce food.',
    },

    QUARRY: {
        id: 'QUARRY',
        label: 'Quarry',
        textureKey: 'building-quarry',
        cost: { food: 0, wood: 10, stone: 0, money: 20 },
        buildableOn: ['ROCKS'],
        requiresAdjacentTo: null,
        claimsTileType: null,
        producesResource: 'stone',
        productionPerVillager: 3,
        maxVillagers: 3,
        villagerCapacity: 0,
        onPlace: null,
        description: 'Must be built on rocks. Each villager produces 3 stone/tick.',
    },

    LUMBERMILL: {
        id: 'LUMBERMILL',
        label: 'Lumbermill',
        textureKey: 'building-lumbermill',
        cost: { food: 0, wood: 0, stone: 20, money: 20 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: 'FOREST',
        claimsTileType: 'FOREST',
        producesResource: 'wood',
        productionPerVillager: 4,
        maxVillagers: 4,
        villagerCapacity: 0,
        onPlace: 'claimForest',
        description: 'Claims adjacent forest tiles. Assign 1 villager per tile to produce wood.',
    },

    WAREHOUSE: {
        id: 'WAREHOUSE',
        label: 'Warehouse',
        textureKey: 'building-warehouse',
        cost: { food: 0, wood: 40, stone: 30, money: 50 },
        buildableOn: ['GRASS'],
        requiresAdjacentTo: null,
        claimsTileType: null,
        producesResource: null,
        productionPerVillager: 0,
        maxVillagers: 0,
        villagerCapacity: 0,
        onPlace: 'increaseStorageCap',
        description: 'Increases all resource caps by 100.',
    },
});
