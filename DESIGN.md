# Settlement — Game Design Document

*A browser-based isometric economic strategy game.*

---

## Overview

Settlement is a single-player economic strategy game viewed from an isometric perspective. The player arrives by ship on an uncharted continent, stepping ashore with a handful of supplies and a small crew. The goal is to establish a foothold, grow a thriving village, and push deeper inland — where the terrain grows harsher, the resources richer, and the world stranger.

The game rewards deliberate, spatial thinking. Where you place a building matters — terrain shapes opportunity, and every tile of forest or field you claim is one fewer available to a future expansion. The challenge begins as a logistical puzzle — food, wood, placement — and gradually transforms into something broader: an expedition into the unknown, where every ridge crossed reveals new opportunities and new threats.

## What This Game Is Not

- Not a real-time action game. Pace is set by the simulation, not by twitch skill.
- Not a tower-defense game. Combat exists, but it is a consequence of expansion, not the core loop.
- Not a puzzle game. There is no single correct solution to the map.
- Not a city painter. Every decision has a functional consequence.

---

## Setting and Tone

The player's ship has anchored off the coast of an unknown continent. The landing site is a sheltered bay — temperate grasslands, patches of forest, a rocky outcrop or two visible from the shore. It feels like a good place to start. The visual style is clean pixel art: warm colors, readable silhouettes, no UI clutter. Small villager figures wander the map between assignments, giving the settlement a sense of life.

The tone begins calm and contemplative. The coastline is safe and familiar. Failure in the early game comes from within — a mismanaged food supply, a storage cap hit at the worst moment, a lumbermill starved of forest because it was placed too late.

But the continent stretches inland, and the further the player pushes from the coast, the more the world changes. Forests grow denser. Rivers cut through valleys. Rocky highlands block easy passage. And beyond the highlands — glimpsed through the fog of war — the terrain takes on qualities that don't quite match the natural world. The tone shifts from pastoral management to cautious exploration to something that borders on the uncanny.

---

## Core Pillars

1. **Spatial decisions matter.** Building placement is not arbitrary. Farms claim neighboring grass tiles as fields; Lumbermills absorb all forest within reach. A poorly placed building leaves resources stranded. Roads, rivers, and elevation all shape what is possible where.

2. **Workers are your most constrained resource.** Every villager is a mouth to feed *and* a potential producer. Deciding which buildings to staff — and how many — is the central ongoing decision. With a living day cycle, even how far a worker has to walk to their job affects productivity.

3. **Terrain is opportunity and obstacle.** Forest tiles are wood reserves waiting to be claimed. Rocky outcrops host Quarries. But cliffs block expansion, rivers demand bridges, and some of the richest resources lie on the far side of the map behind fog of war. The world is not designed to be convenient.

4. **Growth has a cost.** More villagers means more food consumed, more roads needed, more logistical complexity. Expanding too fast without the infrastructure to support it is as dangerous as running out of food. Every expansion decision carries compounding risk.

5. **The continent rewards the bold.** The fog of war hides terrain, resources, and threats. Exploration is not optional — it is how the game opens up. But venturing further from the coast also means venturing into danger, and eventually into the unknown.

---

## The World

The map is an isometric grid of tiles. The player's ship anchors at the southern coast; the continent extends north and inland. Each tile belongs to one of the following terrain types:

| Terrain | Character | Use |
|---------|-----------|-----|
| **Grass** | Open, buildable land | Default building site; Farms cultivate it into fields |
| **Forest** | Dense trees | Claimed by Lumbermills for ongoing wood harvesting |
| **Rocks** | Stone outcroppings | The only valid site for Quarries |
| **Iron** | Orange-tinted rock deposits | The only valid site for Iron Mines; placed deep inland, requires exploration |
| **Water** | Ocean and rivers | Natural barriers; crossable only by bridge |
| **Elevated land** | Hills and cliffs | Blocks movement and building; gates off parts of the map |

Terrain is generated with a smoothing pass so forests cluster naturally and rocky outcrops appear in isolated patches. The coastline provides a natural southern boundary. Rivers run from the interior toward the coast, dividing the map into regions — some accessible from the start, others requiring bridges. Elevation increases as the player moves inland, gating access to deeper territory behind infrastructure investment.

No two maps feel identical, but all maps are legible and fair. The starting coastal area is always resource-rich enough to establish a foothold; the interior is always worth reaching.

---

## Resources

Four material resources and one currency drive the economy, plus two military resources. Food, wood, stone, and money share a storage cap — initially 200 — that grows only by building Warehouses. Iron and weapons have no cap.

| Resource | Role |
|----------|------|
| **Food** | Consumed each cycle by every villager. Also spent when building Houses to attract new settlers. The lifeblood of growth. |
| **Wood** | Primary construction material. Required for almost every building. |
| **Stone** | Mid-game material. Needed for advanced buildings, infrastructure, and roads. |
| **Money** | Currency earned through trade. Used for Lumbermills, Quarries, Iron Mines, Warehouses, roads, and warrior upkeep. Tracked separately with no cap. |
| **Iron** | Rare resource mined from Iron deposits deep inland. Consumed by the Smithy to forge weapons. No storage cap. |
| **Weapons** | Forged at the Smithy from iron. Spent to train warriors at the Barracks. No storage cap. |

**Starting reserves:** Food 80 · Wood 60 · Stone 30 · Money 100 · Iron 0 · Weapons 0.

Material resources (food, wood, stone) are capped. A full storage bin stops accepting new production. The player must either spend resources on buildings or build a Warehouse before production goes to waste. This creates natural pacing pressure.

Money is different. It does not occupy storage, is not produced by a production cycle, and cannot be stockpiled passively. It is earned by converting surplus goods into currency at a Market (see Buildings), and spent on buildings, bounties, and services. Money is the economy's lubricant — it enables expansion but produces nothing on its own.

---

## Hunger and Starvation

Food is not optional. Every villager consumes **1 food per production cycle** regardless of assignment. When food runs out, the consequences escalate:

**Fed** — Food is available. Villagers work at full productivity. This is the default state.

**Hungry** — Food has been at zero for **3 or more consecutive cycles**. All villagers work at **50% productivity** — Farms produce half as much, Lumbermills cut half as much, Quarries mine half as much. A visual indicator (icon above villagers, UI warning) signals the crisis. The economy enters a downward spiral: less food produced means longer recovery.

**Starving** — Food has been at zero for **10 or more consecutive cycles**. Productivity drops to **25%**. Villagers begin **leaving the settlement** — one villager departs every 5 cycles until food is restored. Departing villagers are lost permanently. The population shrinks, which reduces food demand, which eventually stabilizes the crisis — but at a steep cost.

The hunger system ensures that food is the game's primary constraint. A player who ignores farming will not lose to a game-over screen — they will watch their settlement slowly hollow out as workers leave, production stalls, and the economy contracts. Recovery is always possible, but the lost time and population represent real, painful setbacks.

---

## Buildings

All buildings occupy a **2×2 tile footprint**. Placement requires the footprint to land on valid terrain with no overlapping structures. All buildings except the Town Hall require road connectivity to function — an unconnected building produces nothing and defers villager spawning.

### Town Hall
> *Cost: Free*

The anchor of the settlement. Must be placed first — all other buildings require the Town Hall to exist before they can be built. Cannot be demolished. Houses **4 villagers** on placement (the founding crew). The Town Hall is the origin of the road network; all connectivity traces back to an adjacent road tile.

*Placed on: Grass. Can be placed only once.*

---

### House
> *Cost: 15 Wood · 20 Food*

Houses villagers. Each House built adds two villagers to the settlement — two new workers, and two new mouths to feed. The food cost represents supplies needed to attract and settle newcomers from the ship.

The food cost is critical: it means the player cannot grow population without a food surplus. Building a House is an investment — spend 20 food now to gain 2 workers who will (hopefully) produce more than they consume. A House built during a food shortage accelerates the crisis.

**Upgrade (Tier 2):** Cost 25 Wood · 30 Stone · 50 Money. Increases resident capacity from 2 to 4. Use the Upgrade button in the building's info panel.

*Placed on: Grass.*

---

### Farm
> *Cost: 20 Wood*

The primary food source. When placed, a Farm automatically claims up to four adjacent 2×2 blocks of grass as cultivated fields. The more open grass surrounds it, the more fields it can cultivate — and the more workers it can employ.

Each assigned villager tends one field, producing **3 food per production cycle**. A Farm surrounded by four full field blocks supports four workers and generates 12 food per cycle.

The spatial lesson: a Farm placed in the middle of open land is worth far more than one squeezed into a corner.

*Placed on: Grass.*

---

### Lumbermill
> *Cost: 15 Stone · 10 Money · Must be adjacent to Forest*

Wood is the most consumed construction resource, and the Lumbermill is how you produce it. Upon placement, it automatically claims **all unclaimed forest tiles within a radius of 2** from its footprint. More forest nearby means a higher worker cap and more wood per cycle.

Worker capacity is derived directly from the claimed forest: one worker slot per four forest tiles. Each worker produces **2 wood per production cycle**.

The spatial lesson: a Lumbermill placed at the heart of a large forest grove is dramatically more valuable than one placed at its edge. Competing Lumbermills will fight over the same tiles — plan ahead.

*Placed on: Grass, adjacent to Forest.*

---

### Quarry
> *Cost: 10 Wood · 15 Money*

Stone is required for Lumbermills, Warehouses, roads, and other mid-game buildings. Quarries must be built on rocky terrain — terrain that is often sparse and not always near the starting area. Getting a Quarry online early unlocks the mid-game economy.

Supports up to **6 workers**, each producing **1 stone per production cycle**. The Quarry mines its 4 footprint tiles (100 stone each, 400 total); when the deposit is exhausted it goes idle.

*Placed on: Rocks.*

---

### Iron Mine
> *Cost: 15 Wood · 5 Stone · 20 Money*

Iron is rare, found only in deposits placed deep inland — requiring exploration to locate. The Iron Mine must be built directly on an Iron deposit. It mines its 4 footprint tiles (100 iron each, 400 total). Supports up to **6 workers**, each producing **1 iron per production cycle**. When exhausted, the mine goes idle.

Iron feeds the Smithy. Finding and developing the iron deposit is a mid-to-late-game milestone that unlocks the military supply chain.

*Placed on: Iron.*

---

### Smithy
> *Cost: 20 Wood · 10 Stone · 30 Money*

Forges weapons from iron. Requires **1 worker**. Every **5 production cycles**, if 10 iron is available, the Smithy consumes 10 iron and produces **1 weapon**. If iron is unavailable at cycle 5 the Smithy waits and retries each tick until iron arrives.

Weapons are the sole input for training warriors at the Barracks.

*Placed on: Grass.*

---

### Barracks
> *Cost: 30 Wood · 20 Stone · 40 Money*

Trains villagers as warriors. Supports up to **5 warriors**. Assigning each warrior costs **1 weapon**. Warriors consume **2 money per production cycle** each as upkeep — maintaining a garrison is an ongoing economic drain that must be justified by the territory or resources it secures.

*Placed on: Grass.*

---

### Market
> *Cost: 25 Wood · 10 Stone*

The Market is the settlement's source of money. It does not produce goods — it converts them. The player assigns villagers to the Market as merchants. Each merchant converts **3 food per cycle into 5 money**.

The Market creates a deliberate trade-off: food spent on trade cannot feed workers. A settlement with a large food surplus can afford to trade aggressively; a settlement running tight on food cannot. This makes money a function of economic health — you earn it by being efficient, not by clicking a button.

Supports up to **4 merchants**. The Market also serves as a social hub. When the day cycle is implemented, the Market's location will affect villager commute times and trade efficiency.

*Placed on: Grass.*

---

### Warehouse
> *Cost: 30 Wood · 25 Stone · 40 Money*

A Warehouse does not produce anything. Instead, it **increases the storage cap for all material resources by 100** (from a base of 200 to 300, then 400, etc.).

Without Warehouses, a growing settlement will hit its cap constantly, wasting production ticks. Warehouses are expensive and require all three material resources plus money to build. Timing the first Warehouse — building it before the cap is hit, but not so early that you forgo more productive buildings — is one of the game's key strategic moments.

*Placed on: Grass.*

---

## Villagers

Villagers are the workforce of the settlement. They are not individually controlled — they are assigned to buildings by the player and act autonomously from there.

- **Unassigned** villagers contribute nothing to production but still consume food.
- **Assigned** villagers work production buildings during working hours.
- Every villager consumes **1 food per production cycle** regardless of assignment.

The player assigns and unassigns workers from buildings via the info panel. Each building has a worker cap — set either by a fixed maximum or dynamically by how much terrain it has claimed.

The fundamental tension: a larger workforce means more production, but also more food pressure, more housing, and more logistical load. A villager assigned to the Lumbermill must be fed by a villager assigned to the Farm — and the balance between producers and consumers is the game's central equation.

---

## Production Cycle

Every **5 seconds**, all connected production buildings fire simultaneously:

- Farms yield **3 food per staffed field**.
- Lumbermills yield **2 wood per staffed worker**; deplete claimed forest tiles.
- Quarries yield **1 stone per staffed worker**; deplete footprint rock tiles.
- Iron Mines yield **1 iron per staffed worker**; deplete footprint iron tiles.
- Smithy increments its 5-cycle counter; at cycle 5 with ≥10 iron available, produces **1 weapon** and resets.
- Markets convert **3 food per merchant into 5 money**.
- All villagers consume **1 food**.
- Warriors consume **2 money** each.

Disconnected buildings are skipped entirely. Floating labels appear briefly over the map showing what was produced and consumed. If food drops to zero, a hunger warning fires. If food remains at zero for 3+ cycles, the Hungry state activates (see Hunger and Starvation).

---

## Economy Reference

### Starting State

| | Value |
|---|---|
| Food | 80 |
| Wood | 60 |
| Stone | 30 |
| Money | 100 |
| Iron | 0 |
| Weapons | 0 |
| Villagers | 4 (from Town Hall) |
| Storage cap | 200 (food/wood/stone/money) |

### Building Costs

| Building | Food | Wood | Stone | Money | Terrain |
|----------|------|------|-------|-------|---------|
| Town Hall | — | — | — | — | Grass |
| House | 20 | 15 | — | — | Grass |
| House T2 (upgrade) | — | 25 | 30 | 50 | — |
| Farm | — | 20 | — | — | Grass |
| Lumbermill | — | — | 15 | 10 | Grass, adj. Forest |
| Quarry | — | 10 | — | 15 | Rocks |
| Iron Mine | — | 15 | 5 | 20 | Iron |
| Smithy | — | 20 | 10 | 30 | Grass |
| Barracks | — | 30 | 20 | 40 | Grass |
| Market | — | 25 | 10 | — | Grass |
| Warehouse | — | 30 | 25 | 40 | Grass |
| Road (per tile) | — | — | 1 | 2 | Grass |

### Production per Worker per Cycle

| Building | Output | Rate | Notes |
|----------|--------|------|-------|
| Farm | Food | 3 | Per field block staffed |
| Lumbermill | Wood | 2 | Depletes forest tiles |
| Quarry | Stone | 1 | Depletes rock tiles; max 6 workers |
| Iron Mine | Iron | 1 | Depletes iron tiles; max 6 workers |
| Smithy | Weapons | 1 per 5 cycles | Consumes 10 iron; 1 worker only |
| Market | Money | 5 | Consumes 3 food per merchant; max 4 merchants |

### Consumption

| | Rate |
|---|---|
| Food per villager per cycle | 1 |
| Food per Market merchant per cycle (extra) | 3 |
| Money per warrior per cycle | 2 |
| Cycle interval | 5 seconds |

---

## Core Gameplay Loop

```
Arrive by ship with limited supplies
    → Place Town Hall (free) → gain 4 starting villagers
    → Build a Farm → road → assign workers → get food production running
    → Build a Lumbermill → road → assign workers → gain wood
    → Build a House (costs food + wood) → road → gain 2 more villagers
    → Grow population (more Houses, each costing food)
    → Hit stone bottleneck → find rocks → build Quarry → road
    → Build a Market → convert food surplus to money
    → Hit storage cap → build Warehouse
    → Explore inland → find Iron deposit → build Iron Mine → road
    → Build Smithy → produce weapons → build Barracks → train warriors
    → Expand further...
```

Each cycle of expansion introduces a new constraint. Early game is about food and wood. Mid-game introduces stone and money as gating resources. Late game is about managing all four resources simultaneously while pushing the frontier inland.

---

## Strategic Depth

**Terrain reading.** Before placing anything, the player should survey the map: where is the largest contiguous forest? Where are the rock outcroppings? Is there open grass near the forest edge for a Lumbermill? Planning the settlement's spatial layout is half the game.

**The food-workforce tradeoff.** Every new villager is an investment that costs 10 food upfront (half of a House) and 1 food per cycle forever. A Farm worker producing 3 food is net +2 per cycle — they pay for themselves quickly. A Quarry worker produces no food and costs 1 per cycle — they need Farm support to justify their existence. A Market merchant consumes 3 food on top of their 1 personal consumption — they must be backed by a strong food economy.

**Storage timing.** Warehouses are expensive but necessary. A player who builds one too late will watch production evaporate into a capped storage bar. A player who builds one too early may lack the resources to staff their economy.

**Money management.** Money starts at 100 and is spent on Lumbermills, Quarries, and Warehouses. Without a Market, money is finite — it runs out by mid-game. Building a Market too early diverts food from feeding workers; building one too late means running out of money before the Warehouse is affordable. The timing creates a natural decision point around minute 15–20.

**Competitive terrain claiming.** Multiple Lumbermills will compete for forest tiles. The player must decide whether to consolidate forest claiming around one well-placed mill or spread several mills across the map.

---

## First 30 Minutes — Reference Timeline

This timeline describes optimal play to illustrate the intended pacing. Real play will vary based on map layout, terrain, and player decisions.

**Minutes 0–5: Landfall.** Build a Farm (20 wood), then a House (15 wood + 20 food). Assign both villagers to the Farm. Net food: +4/cycle after consumption. Wood and stone are not yet being produced. The settlement is fragile but functional.

**Minutes 5–10: First trade-off.** Build a Lumbermill (15 stone + 10 money). Reassign one farmer to lumber. Net food drops to +1/cycle — tight, but survivable. Wood income begins at +2/cycle. Stone reserve is nearly depleted (15 remaining). Every cycle feels meaningful.

**Minutes 10–17: Growth spurt.** Build a second House (food has accumulated). Assign new workers: one to farm, one to lumber. Net food: +2/cycle. Wood: +4/cycle. Build a second Farm when wood recovers. Build a third House. Population reaches 6. Food surplus builds comfortably.

**Minutes 17–25: Mid-game opening.** Build a Quarry (10 wood + 15 money) once rocks are found. Stone income begins. Build a fourth House. Assign workers across all production buildings. Net food tightens to +1/cycle with 8 villagers — the player must build another Farm soon or risk hunger.

**Minutes 25–30: Stabilization.** Third Farm secures food supply. 8–10 villagers, 9 buildings. Food ~110, wood ~50, stone ~30, money running low (~60). Economy is self-sustaining but not comfortable. The player faces a choice: build a Market to generate money, build a Warehouse to raise the storage cap, or push inland to explore.

---

## Progression Feel

Early game feels like careful setup — every resource spent is weighed, every building placement considered. The first food surplus feels like a turning point.

Mid game opens up as the Quarry and Market come online and all four resources are in play. Decisions multiply: more workers, more buildings, more things that can go wrong.

Late game is about sustaining a large, interdependent economy while expanding into increasingly challenging terrain. Storage caps and workforce limits become binding constraints. The map fills in near the coast, and the player must push inland for new resources and new space.

The game does not end. But a settlement that has weathered its early fragility, built a stable economy, and begun its march inland has clearly crossed the threshold from survival to ambition.

---

## Roads and Connectivity

Roads are the circulatory system of the settlement. **All buildings except the Town Hall must be connected to the road network to function.** An unconnected building produces nothing and defers villager spawning.

- **Cost:** 1 stone + 2 money per tile
- **Placement:** 1×1 tiles on flat, unoccupied GRASS (not ramps)
- **Removal:** Select a road tile in idle mode → Remove Road button; refunds 1 money. Buildings that lose their road path immediately go inactive.
- **Connectivity:** A building is connected if any tile in its footprint or claimed field blocks is 4-directionally adjacent to a road tile reachable from the Town Hall. Re-evaluated after every road placement or removal.

**Disconnection consequences:** Houses that lose road connectivity lose residents over time — after a 3-tick grace period, one resident departs every 3 ticks. Residents return 1-per-3-ticks when the road is restored.

---

## Quests

A linear quest system guides new players through the core loop. One quest is active at a time; all tasks completed auto-advances to the next. The quest panel is displayed top-left.

| Quest | Tasks |
|-------|-------|
| **First Steps** | Place Town Hall · Place Farm · Place Lumbermill · Connect a building by road · Assign a worker |
| **Establishing an Economy** | Build House · Build Quarry · Build Iron Mine · Build Market |
| **Protect Your Village** | Build Smithy · Build Barracks · Train 5 warriors |
| **Enjoy the Game!** | Terminal state — congratulations display |

---

## Planned Systems

The following systems represent the intended direction of the game. They are not yet implemented but are treated as authoritative design intent — existing systems should be built with these in mind.

---

### Villager Day Cycle

Villagers follow a daily routine: wake, commute to work, labor, eat, return home, sleep. Production happens only while workers are physically present at their assigned building.

**Implications:**
- A worker assigned to a distant Quarry arrives late, works fewer hours, and returns home before full yield is achieved. Road quality and building placement directly affect output.
- Housing placement matters. Workers who live close to their workplace have longer effective working hours.
- Night is downtime. No production occurs. Events may still happen.

The day cycle transforms villagers from abstract units into characters with needs and routines. The settlement stops feeling like a spreadsheet and starts feeling inhabited.

---

### Physical Economy

Resources do not teleport to storage. When a Quarry worker mines stone, that stone sits stacked in the Quarry building until a carrier comes to collect it. If the Quarry's internal storage fills up, mining stops.

**Carriers** are villagers assigned to logistics routes. They pick up resources from production buildings and walk them to the nearest Warehouse.

**Construction** is also physical. When the player orders a building, the required resources must first be carried from storage to the construction site. Then a Builder villager must walk to the site and spend time constructing it. There is no instant placement.

This system rewards players who think in flows rather than snapshots. It is not enough to have enough workers and buildings in theory; the goods have to physically move.

---

### Exploration and Fog of War

The majority of the map is hidden at the start. The player sees only the immediate coastal area — enough terrain to establish a foothold and understand the basic layout, but not enough to plan comprehensively.

Fog is lifted by **proximity** — as villagers move across new tiles, those tiles and their neighbors become visible. The player can send villagers to explore on purpose, but every explorer is a worker pulled from the economy.

**What exploration reveals:**
- Terrain type and elevation — understanding where buildable land, forests, and rock outcroppings lie.
- Water boundaries — discovering rivers before committing to expansion directions.
- Resource deposits — locating rare materials that unlock new building types.
- Threats — discovering that the next valley is occupied before walking into it.
- Mysteries — ruins, strange formations, and artifacts that hint at something deeper in the continent's interior.

Fog of war changes the early game from a known-quantity optimization problem into an act of discovery. The player commits to a direction before knowing fully what lies there.

---

### Threats and Indirect Combat

The coastal starting area is safe. What lies beyond it may not be.

As the player pushes inland — building bridges across rivers, clearing fog in distant regions, pushing into new map zones — they encounter **bandits**: hostile groups that patrol unclaimed territory. Bandits do not attack established settlements unprovoked, but expansion into their territory is treated as intrusion.

**Combat is indirect.** The player does not micromanage warriors in battle. Instead, combat follows a bounty system inspired by Majesty:

1. The player builds a **Barracks** to train warriors from unassigned villagers. Warriors consume food and require housing like any other villager, but they do not produce resources.

2. When a threat is identified (a bandit camp, a hostile patrol route, a dangerous ruin), the player places a **bounty** on it — spending money to mark it as a target.

3. Warriors evaluate the bounty against their own assessment of risk. A high bounty attracts more warriors; a low bounty may be ignored. Warriors may refuse to engage a target they consider too dangerous without sufficient reward or numbers.

4. Combat resolves automatically when warriors engage. Outcomes depend on warrior count, equipment (from a Smithy, if built), and threat difficulty. Losses are possible — a failed assault costs the settlement trained warriors who are expensive to replace.

**The economic cost of military power:** Warriors still need food, housing, and road access. A standing garrison of 4 warriors consumes the same food as 4 farmers but produces nothing. Maintaining military capacity is an ongoing drain that must be justified by the resources and territory it secures. Bounties cost money, which means the Market must be running well before military operations are viable.

**Design intent:** Combat is a consequence of ambition, not a constant threat. A player who consolidates near the coast is never attacked. But reaching the rare resources, the ruins, and the deeper mysteries of the continent requires the military capacity to hold new ground.

---

### Settlement Network

As the player pushes deeper inland, they may establish new settlements at strategic locations — a river crossing, a mountain pass, a resource-rich valley. Each new settlement is a fresh starting point with its own local economy.

**Implementation is deliberately lightweight:** the player does not manage multiple active settlements simultaneously. Instead, previous settlements become **supply points**. A settled outpost generates a periodic supply shipment (food, wood, stone, or money) that arrives at the active settlement automatically. The volume depends on how well-developed the outpost was when the player moved on.

This gives the player a tangible reward for building well — a strong first settlement means better support for the second — without requiring them to manage two economies in parallel.

---

### The Interior — Progression and Mystery

The continent is structured in rough bands extending inland from the coast:

**The Coast (starting area).** Temperate, resource-rich, safe. This is where the player learns the game. The terrain is gentle, forests are plentiful, and rocky outcrops are within reach. No threats. The ship remains anchored offshore as a psychological anchor — home is behind you.

**The Lowlands.** Rolling grasslands crossed by rivers. Resources are sparser and more spread out. The first bandit camps appear. Bridges are needed to cross waterways. The player begins making real exploration decisions — which direction to push, which resources to prioritize.

**The Highlands.** Elevated terrain with cliffs, narrow passes, and limited buildable land. Stone is abundant but wood is scarce. Bandits are more organized and dangerous. The terrain itself becomes a puzzle — finding paths through the cliffs, choosing where to invest in infrastructure. The ruins begin appearing here: crumbling structures of unknown origin, marked on the map with distinct visual language.

**The Deep Interior.** Beyond the highlands, the terrain changes in ways that are harder to categorize. The exact nature of the deep interior is deliberately left open — it is where the game transitions from historical settlement simulation to something with elements of mystery and the uncanny. Materials found here may have properties that don't follow normal rules. Structures may predate any known civilization. The threats may not be human.

This progression is not rigid — the map generation ensures variety — but the general pattern of increasing difficulty and strangeness as the player moves inland provides a natural narrative arc without scripted story beats.

---

### Future Biomes (Expansion Content)

If the game supports multiple distinct maps or expeditions beyond the first continent, each destination should introduce fundamentally different terrain rules and challenges rather than simply scaling difficulty:

| Biome | Character | Unique challenge |
|-------|-----------|-----------------|
| **Coastal Continent** | Starting biome. Temperate, resource-rich. | Learning all systems |
| **Desert** | Scarce water, extreme heat cycle. | Food and water logistics |
| **Rainforest** | Dense, impenetrable terrain. | Clearing land, disease |
| **Frozen Land** | Harsh winters, permafrost soil. | Heating, seasonal production |
| **Volcanic Islands** | Volcanic activity, rare minerals. | Risk management, heat hazards |

These are long-term expansion ideas, not near-term commitments. The core game should be complete and compelling on the first map before any additional biomes are built.

---
