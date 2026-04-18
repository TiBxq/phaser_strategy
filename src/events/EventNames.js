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

    // Hunger state changed (fed → hungry → starving → fed)
    // payload: { state: 'fed' | 'hungry' | 'starving' }
    HUNGER_STATE_CHANGED: 'hunger:state_changed',

    // A villager departed a residential building
    // payload: { buildingUid: string, reason: 'starvation' | 'disconnected' }
    VILLAGER_DEPARTED: 'villager:departed',

    // A villager returned to a residential building after recovery
    // payload: { buildingUid: string }
    VILLAGER_RETURNED: 'villager:returned',

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

    // UI requested to upgrade a building
    // payload: { buildingUid }
    BUILDING_UPGRADE_REQUEST: 'building:upgrade_request',

    // UI requested to demolish a building
    // payload: { buildingUid }
    BUILDING_DEMOLISH_REQUEST: 'building:demolish_request',

    // A building was upgraded to the next tier
    // payload: { building }
    BUILDING_UPGRADED: 'building:upgraded',

    // Player entered road-placement mode
    ROAD_MODE_ENTER: 'road:mode_enter',

    // Player exited road-placement mode
    ROAD_MODE_EXIT: 'road:mode_exit',

    // Player clicked a tile while in road mode — payload: { col, row }
    ROAD_PLACEMENT_REQUEST: 'road:placement_request',

    // UI requested to demolish a road tile — payload: { col, row }
    ROAD_DEMOLISH_REQUEST: 'road:demolish_request',

    // A road tile was successfully placed — payload: { col, row }
    ROAD_PLACED: 'road:placed',

    // A road tile was successfully removed — payload: { col, row }
    ROAD_REMOVED: 'road:removed',

    // One or more buildings changed road-connectivity state
    // payload: { changed: Array<{ building, wasConnected }> }
    BUILDING_CONNECTIVITY_CHANGED: 'building:connectivity_changed',

    // Warriors assigned to / unassigned from a Barracks changed — payload: { buildingUid, building }
    WARRIORS_CHANGED: 'warriors:changed',

    // A quest was started (first quest or after previous completed) — payload: { quest }
    QUEST_STARTED: 'quest:started',

    // A single task within the active quest was completed — payload: { quest, task }
    QUEST_TASK_COMPLETED: 'quest:task_completed',

    // All tasks in the active quest are done — payload: { quest }
    QUEST_COMPLETED: 'quest:completed',

    // Fog of war state changed for one or more tiles
    // payload: { changes: Array<{ col, row, state: 'hidden'|'border'|'visible' }> }
    FOG_UPDATED: 'fog:updated',

    // Player requested to attack the bandit camp
    BANDIT_CAMP_ATTACK_REQUEST: 'bandit:attack_request',

    // Bandit camp was destroyed — payload: { clearedTiles: Array<{ col, row }> }
    BANDIT_CAMP_CLEARED: 'bandit:camp_cleared',

    // Bandit threat escalated or ended — payload: { state: 'inactive'|'raiding'|'pillaging', stealAmount: number }
    BANDIT_THREAT_STATE_CHANGED: 'bandit:threat_state_changed',

    // A building has been marked as the next pillage target — payload: { buildingUid: string|null }
    BANDIT_PILLAGE_TARGET: 'bandit:pillage_target',
});
