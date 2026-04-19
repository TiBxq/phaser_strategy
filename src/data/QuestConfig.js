/**
 * All quest and task definitions.
 *
 * Task types:
 *   buildingPlaced   — player places a building with the given configId
 *   buildingConnected — any non-Town-Hall building gains road connectivity
 *   workerAssigned   — any building has at least 1 worker assigned
 *   warriorsHired    — total warriors across all Barracks reaches `count`
 */
export const QUESTS = Object.freeze([
    {
        id: 'FIRST_STEPS',
        label: 'First Steps',
        tasks: Object.freeze([
            { id: 'build_town_hall',  label: 'Build a Town Hall',         type: 'buildingPlaced',   configId: 'TOWN_HALL'  },
            { id: 'build_farm',       label: 'Build a Farm',              type: 'buildingPlaced',   configId: 'FARM'       },
            { id: 'build_lumbermill', label: 'Build a Lumbermill',        type: 'buildingPlaced',   configId: 'LUMBERMILL' },
            { id: 'connect_road',     label: 'Connect buildings by road', type: 'buildingConnected' },
            { id: 'assign_worker',    label: 'Put workers to work',       type: 'workerAssigned'    },
        ]),
    },
    {
        id: 'ESTABLISHING_ECONOMY',
        label: 'Establishing an Economy',
        tasks: Object.freeze([
            { id: 'build_house',     label: 'Build a House',     type: 'buildingPlaced', configId: 'HOUSE'     },
            { id: 'build_quarry',    label: 'Build a Quarry',    type: 'buildingPlaced', configId: 'QUARRY'    },
            { id: 'build_market',    label: 'Build a Market',    type: 'buildingPlaced', configId: 'MARKET'    },
        ]),
    },
    {
        id: 'PROTECT_VILLAGE',
        label: 'Prepare Your Defences',
        tasks: Object.freeze([
            { id: 'build_iron_mine', label: 'Build an Iron Mine', type: 'buildingPlaced', configId: 'IRON_MINE' },
            { id: 'build_smithy',   label: 'Build a Smithy',     type: 'buildingPlaced', configId: 'SMITHY'    },
            { id: 'build_barracks', label: 'Build a Barracks',   type: 'buildingPlaced', configId: 'BARRACKS'  },
        ]),
    },
    {
        id: 'DRIVE_OUT_BANDITS',
        label: 'Drive Out the Bandits',
        tasks: Object.freeze([
            { id: 'hire_warriors', label: 'Train 5 Warriors',      type: 'warriorsHired', count: 5 },
            { id: 'clear_camp',    label: 'Clear the Bandit Camp', type: 'campCleared'             },
        ]),
    },
    {
        id: 'PREPARE_FOR_JOURNEY',
        label: 'Prepare for the Journey',
        tasks: Object.freeze([
            { id: 'reach_population', label: 'Reach 30 population', type: 'populationReached', count: 30  },
            { id: 'collect_gold',     label: 'Collect 300 gold',    type: 'goldCollected',     amount: 300 },
        ]),
    },
    {
        id: 'ENJOY',
        label: 'Enjoy the Game!',
        tasks: Object.freeze([]), // terminal quest — panel shows congratulations
    },
]);
