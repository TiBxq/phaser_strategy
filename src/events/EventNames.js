export const EventNames = Object.freeze({
    // Resource ledger changed (amounts or cap)
    RESOURCES_CHANGED: 'resources:changed',

    // A building was placed on the map
    BUILDING_PLACED: 'building:placed',

    // A building was removed from the map
    BUILDING_REMOVED: 'building:removed',

    // Production tick fired (every 5 seconds)
    PRODUCTION_TICK: 'production:tick',

    // Food hit 0 while villagers are alive
    STARVATION_WARNING: 'starvation:warning',

    // Villager pool or assignment changed
    VILLAGERS_CHANGED: 'villagers:changed',

    // Player clicked a tile
    TILE_SELECTED: 'tile:selected',

    // Player deselected (right-click or Escape)
    TILE_DESELECTED: 'tile:deselected',

    // Pointer moved over a tile
    TILE_HOVERED: 'tile:hovered',

    // Player picked a building type from the menu
    BUILD_MODE_ENTER: 'build:mode_enter',

    // Player cancelled build mode
    BUILD_MODE_EXIT: 'build:mode_exit',

    // Player clicked a tile while in build mode
    BUILD_PLACEMENT_REQUEST: 'build:placement_request',

    // UI requested to assign a villager to a building
    VILLAGER_ASSIGN_REQUEST: 'villager:assign_request',

    // UI requested to unassign a villager from a building
    VILLAGER_UNASSIGN_REQUEST: 'villager:unassign_request',

    // Display a transient notification message to the player
    SHOW_NOTIFICATION: 'ui:notification',   // payload: { message: string }

    // A resource tile (FOREST or ROCKS) was fully depleted by a production building
    // payload: { col, row, buildingUid, isBuildingFootprint }
    TILE_DEPLETED: 'tile:depleted',
});
