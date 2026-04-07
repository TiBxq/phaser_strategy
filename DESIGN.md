# Settlement — Game Design Document

*A browser-based isometric economic strategy game.*

---

## Overview

Settlement is a single-player economic strategy game viewed from an isometric perspective. The player takes on the role of a settlement founder, starting with a modest plot of land and a handful of resources. The goal is to grow a thriving village by constructing buildings, managing a workforce of villagers, and balancing a web of interdependent resources.

The game rewards deliberate, spatial thinking. Where you place a building matters — terrain shapes opportunity, and every tile of forest or field you claim is one fewer available to a future expansion. Early settlements are sheltered by the fog of unexplored territory, but the world beyond the safe starting area holds real dangers. The challenge begins as a logistical puzzle and gradually transforms into something broader: a civilization carved out of an unknown, sometimes hostile world.

## What This Game Is Not

- Not a real-time action game. Pace is set by the simulation, not by twitch skill.
- Not a tower-defense game. Combat exists, but it is a consequence of expansion, not the core loop.
- Not a puzzle game. There is no single correct solution to the map.
- Not a city painter. Every decision has a functional consequence.

---

## Setting and Tone

The world is a compact isometric landscape — rolling grasslands, dense forest patches, and outcroppings of rock. It feels handcrafted even though the terrain is procedurally generated. The visual style is clean pixel art: warm colors, readable silhouettes, no UI clutter. Small villager figures wander the map between assignments, giving the settlement a sense of life.

The tone begins calm and contemplative. The starting area is safe and familiar. Failure in the early game comes from within — a mismanaged food supply, a storage cap hit at the worst moment, a lumbermill starved of forest because it was placed too late. But as the player pushes outward, past rivers and into uncharted territory, the world reveals itself to be larger and less forgiving. The tone shifts accordingly.

---

## Core Pillars

1. **Spatial decisions matter.** Building placement is not arbitrary. Farms claim neighboring grass tiles as fields; Lumbermills absorb all forest within reach. A poorly placed building leaves resources stranded. Roads, rivers, and elevation all shape what is possible where.

2. **Workers are your most constrained resource.** Every villager born in the settlement is a mouth to feed *and* a potential producer. Deciding which buildings to staff — and how many — is the central ongoing decision. With a living day cycle, even how far a worker has to walk to their job affects productivity.

3. **Terrain is opportunity and obstacle.** Forest tiles are wood reserves waiting to be claimed. Rocky outcrops host Quarries. But cliffs block expansion, rivers demand bridges, and some of the richest resources lie on the far side of the map behind fog of war. The world is not designed to be convenient.

4. **Growth has a cost.** More villagers means more food consumed, more roads needed, more logistical complexity. Expanding too fast without the infrastructure to support it is as dangerous as running out of food. Every expansion decision carries compounding risk.

5. **The world is larger than your starting area.** The fog of war hides terrain, resources, and threats. Exploration is not optional — it is how the game opens up. But venturing further from home also means venturing into danger.

---

## The World

The map is an isometric grid of tiles, each belonging to one of three terrain types:

| Terrain | Character | Use |
|---------|-----------|-----|
| **Grass** | Open, buildable land | Default building site; Farms cultivate it into fields |
| **Forest** | Dense trees | Claimed by Lumbermills for ongoing wood harvesting |
| **Rocks** | Stone outcroppings | The only valid site for Quarries |
| **Water** | Ocean and rivers | Natural barriers; crossable only by bridge |
| **Elevated land** | Hills and cliffs | Blocks movement and building; gates off parts of the map |

Terrain is generated with a smoothing pass so forests cluster naturally and rocky outcrops appear in isolated patches. Elevation gives the world a three-dimensional feel even in isometric view — higher ground reads as deeper into the map, further from safety. Water divides the map into regions, some accessible from the start, others requiring investment to reach. No two maps feel identical, but all maps are legible and fair.

---

## Resources

Four resources drive the economy. Each has a shared storage cap — initially 200 across all resources — that grows only by building Warehouses.

| Resource | Role |
|----------|------|
| **Food** | Consumed each production cycle by every villager. The lifeblood of population growth. |
| **Wood** | Primary construction material. Required for almost every building. |
| **Stone** | Mid-game material. Needed for more advanced buildings. |
| **Money** | Used alongside stone for late-tier construction. |

**Starting reserves:** Food 80 · Wood 60 · Stone 30 · Money 100.

Resources are capped. A full storage bin stops accepting new production. The player must either spend resources on buildings or build a Warehouse before production goes to waste. This creates natural pacing pressure.

**Starvation** occurs when food reaches zero. The game warns the player before this happens, but it is not forgiving of neglect.

---

## Buildings

All buildings occupy a **2×2 tile footprint**. Placement requires the footprint to land on valid terrain with no overlapping structures.

### House
> *Cost: 20 Wood*

Houses villagers. Each House built adds two villagers to the settlement — two new workers, and two new mouths to feed. Houses are the engine of population growth, but every House built without a corresponding food surplus is a ticking clock.

*Placed on: Grass.*

---

### Farm
> *Cost: 30 Wood · 10 Stone*

The primary food source. When placed, a Farm automatically claims up to four adjacent 2×2 blocks of grass as cultivated fields. The more open grass surrounds it, the more fields it can cultivate — and the more workers it can employ.

Each assigned villager tends one field, producing **5 food per production cycle**. A Farm surrounded by four full field blocks supports four workers and generates 20 food per cycle — comfortably feeding a young settlement.

The spatial lesson: a Farm placed in the middle of open land is worth far more than one squeezed into a corner.

*Placed on: Grass.*

---

### Lumbermill
> *Cost: 20 Stone · 20 Money · Must be adjacent to Forest*

Wood is the most consumed construction resource, and the Lumbermill is how you produce it. Upon placement, it automatically claims **all unclaimed forest tiles within a radius of 2** from its footprint. More forest nearby means a higher worker cap and more wood per cycle.

Worker capacity is derived directly from the claimed forest: one worker slot per four forest tiles. Each worker produces **4 wood per production cycle**.

The spatial lesson: a Lumbermill placed at the heart of a large forest grove is dramatically more valuable than one placed at its edge. Competing Lumbermills will fight over the same tiles — plan ahead.

*Placed on: Grass, adjacent to Forest.*

---

### Quarry
> *Cost: 10 Wood · 20 Money*

Stone is required for Farms, Lumbermills, and Warehouses. Quarries must be built on rocky terrain — terrain that is often sparse and far from the starting area. Getting a Quarry online early unlocks the mid-game economy.

Supports up to **3 workers**, each producing **3 stone per production cycle**.

*Placed on: Rocks.*

---

### Warehouse
> *Cost: 40 Wood · 30 Stone · 50 Money*

A Warehouse does not produce anything. Instead, it **increases the storage cap for all resources by 100**. Without Warehouses, a growing settlement will hit its cap constantly, wasting production ticks.

Warehouses are expensive and require late-game resources to build. Timing the first Warehouse — building it before the cap is hit, but not so early that you forgo more productive buildings — is one of the game's key strategic moments.

*Placed on: Grass.*

---

## Villagers

Villagers are the workforce of the settlement. They are not individually controlled — they are assigned to buildings by the player and act autonomously from there. Their numbers are managed at the aggregate level.

- **Unassigned** villagers contribute nothing to production.
- **Assigned** villagers work production buildings during working hours.
- Every villager must eat and sleep regardless of assignment.

The player assigns and unassigns workers from buildings via the info panel. Each building has a worker cap — set either by a fixed maximum or dynamically by how much terrain it has claimed.

The fundamental tension: a larger workforce means more production, but also more food pressure, more housing, and more logistical load on the road network. A villager assigned to the Lumbermill must be fed by a villager assigned to the Farm — and must be able to *walk there* in time to actually work.

---

## Production Cycle

Every **5 seconds**, all production buildings fire simultaneously:

- Farms yield food for each staffed field.
- Lumbermills yield wood for each staffed forest section.
- Quarries yield stone for each staffed worker.
- All villagers consume food.

Floating labels appear briefly over the map showing what was produced and consumed. If food drops to zero, a starvation warning fires — a reminder that the population has outgrown its food supply.

---

## Core Gameplay Loop

```
Start with limited resources
    → Place a House → gain villagers
    → Place a Farm → assign workers → gain food
    → Place a Lumbermill → assign workers → gain wood
    → Grow population (more Houses)
    → Reach stone bottleneck → find rocks → place Quarry
    → Hit storage cap → build Warehouse
    → Expand further...
```

Each cycle of expansion introduces a new constraint. Early game is about food and wood. Mid-game introduces stone as a gating resource. Late game is about managing all four resources simultaneously while keeping storage ahead of production.

---

## Strategic Depth

**Terrain reading.** Before placing anything, the player should survey the map: where is the largest contiguous forest? Where are the rock outcroppings? Is there open grass near the forest edge for a Lumbermill? Planning the settlement's spatial layout is half the game.

**The food-workforce tradeoff.** Every new villager is an investment. The break-even point — when a new worker produces more than they consume — depends on what building they're assigned to. A Farm worker is food-neutral at just one field. A Quarry worker needs Farm support to justify their existence.

**Storage timing.** Warehouses are expensive but necessary. A player who builds one too late will watch production evaporate into a capped storage bar. A player who builds one too early may lack the resources to staff their economy.

**Competitive terrain claiming.** Multiple Lumbermills will compete for forest tiles. The player must decide whether to consolidate forest claiming around one well-placed mill or spread several mills across the map.

---

## Progression Feel

Early game feels like careful setup — every resource spent is weighed, every building placement considered. The first food surplus feels like a turning point.

Mid game opens up as the Quarry comes online and stone unlocks more building options. Decisions multiply: more workers, more buildings, more things that can go wrong.

Late game is about sustaining a large, interdependent economy. Storage caps and workforce limits become binding constraints. The map fills in. Every new building competes for space, terrain, and workers.

There is no designed endpoint — the game is a sandbox. But a settlement that has weathered its early fragility, built a stable food surplus, and expanded to fill the map has clearly *won*, even without a score screen.

---

## Planned Expansions

The following features represent the intended direction of the game. They are not yet implemented but should be treated as authoritative design intent — existing systems should be built with these in mind.

---

### Roads and Infrastructure

All buildings must be connected to the road network to function. An isolated Farm with no road access cannot be staffed; a Warehouse with no road cannot receive deliveries. Roads are manually placed by the player, tile by tile, and cost resources to build.

The road network is not just a checkbox — it is an active design constraint. Villagers travel faster on roads than on open terrain, so the layout of the network directly affects how productive a settlement is. A worker who spends half their working hours walking an inefficient route to the Quarry is worth far less than their nominal output suggests.

**Key decisions the road system creates:**
- Efficient routing vs. cheapest routing. A longer road through flat terrain may be faster than a shorter road over rough ground.
- Hub-and-spoke layouts vs. grid networks. Centralizing road connections reduces cost but creates bottlenecks.
- Prioritization: which buildings get connected first when resources are scarce.

Roads transform the map from a placement puzzle into a logistics network. The player is not just deciding *where* to build — they are designing the veins through which the settlement breathes.

---

### Terrain and Geography

The map is no longer flat. Elevation levels create visual depth and strategic meaning: highlands, lowlands, cliffsides, and valley floors each behave differently.

**Elevation** blocks direct movement and building placement. A cliff face is not crossable without a dedicated structure. This gates off portions of the map and creates natural progression: the player must invest in infrastructure before they can access the resources beyond.

**Water** — rivers and ocean coastlines — divides the map into islands of reachable territory. Bridges must be built to cross rivers; ocean crossing may require more advanced technology. Water is not wasteland; coastal and riverbank tiles may have unique properties.

**Rare terrain-locked resources** exist deeper in the map, behind elevation barriers or water crossings. These resources unlock new building types and economy tiers. The player cannot rush them — they require solving the infrastructure problem of *reaching* them first.

The result is a map that feels like a real place: a starting valley that is safe and resource-rich, ringed by cliffs and rivers, with a wider world waiting on the other side.

---

### Villager Day Cycle

Villagers follow a daily routine: wake, commute to work, labor, eat, return home, sleep. Production is no longer a passive background tick — it happens only while workers are physically present at their assigned building.

**Implications:**
- A worker assigned to a distant Quarry arrives late, works fewer hours, and returns home before full yield is achieved. Road quality and building placement directly affect output.
- Villagers must eat during the day, likely at a designated eating location (a cookhouse, a communal fire, or back at home). Food logistics become a physical problem, not just an accounting one.
- Housing placement matters. Workers who live close to their workplace have longer effective working hours. Clustering Houses near production zones is an optimization worth pursuing.
- Night is downtime. No production occurs. Events may still happen.

The day cycle transforms villagers from abstract units into characters with needs and routines. The settlement stops feeling like a spreadsheet and starts feeling inhabited.

---

### Physical Economy

Resources do not teleport to storage. When a Quarry worker mines stone, that stone sits stacked in the Quarry building until a carrier comes to collect it. If the Quarry's internal storage fills up, mining stops — the worker has nowhere to put what they extract.

**Carriers** are villagers assigned to logistics routes. They pick up resources from production buildings and walk them to the nearest Warehouse. The speed of the economy depends on how well this delivery network is staffed and routed.

**Construction** is also physical. When the player orders a building, the required resources must first be carried from storage to the construction site. Then a Builder villager must walk to the site and spend time physically constructing it. There is no instant placement.

**Implications:**
- Production buildings need carrier support. A Lumbermill running at full capacity generates more wood than one carrier can move, so the wood stacks up and eventually halts production.
- Construction queues are real. In the early game, one builder may be handling multiple sites. Priority matters.
- The warehouse network becomes critical infrastructure — not just a cap upgrade, but the central hub of the physical economy.

This system rewards players who think in flows rather than snapshots. It is not enough to have enough workers and buildings in theory; the goods have to physically move.

---

### Exploration and Fog of War

The majority of the map is hidden at the start. The player sees only the immediate starting area — enough terrain to establish a foothold and understand the basic layout, but not enough to plan comprehensively.

Fog is lifted by **proximity** — as villagers and scouts move across new tiles, those tiles and their neighbors become visible. The player can send villagers to explore on purpose, but every explorer is a worker away from the settlement.

**What exploration reveals:**
- Terrain type and elevation — understanding where the buildable land, forests, and rock outcroppings lie.
- Water boundaries — discovering rivers and ocean coastlines before committing to expansion directions.
- Resource deposits — locating the rare terrain-locked materials that unlock the mid and late economy.
- Threats — discovering that the next valley is occupied before walking into it.

Fog of war changes the early game from a known-quantity optimization problem into an act of discovery. The player commits to a direction before knowing fully what lies there. Sometimes the gamble pays off; sometimes the chosen expansion corridor leads to a cliff with no bridge, or worse, bandits.

---

### Threats and Combat

The starting area is safe. What lies beyond it may not be.

As the player builds bridges across rivers, clears fog of war in distant regions, and pushes into new map zones, they encounter **bandits** — hostile groups that patrol unclaimed territory. Bandits do not attack unprovoked settlements inside their established borders, but expansion into new zones is treated as intrusion.

**Defense requires investment.** New production chains are needed:
- A **Smithy** (or equivalent) produces weapons and armor from stone, wood, and potentially rare materials.
- A **Barracks** (or equivalent) converts unassigned villagers into Warriors.
- Warriors are assigned to patrol routes or posted at defensive points near the frontier.

Warriors still need food, housing, and road access. They are expensive compared to a production worker — maintaining a garrison is an ongoing economic cost, not a one-time purchase.

**Design intent:** Combat should feel like a consequence of ambition, not a constant threat. A player who never explores is never attacked. The game does not punish consolidation — it rewards it. But a player who wants to reach the rare resources deeper in the map must build the military capacity to hold the ground they take.

Bandits are not the final word on hostility. What lies in the furthest reaches of the map is, as yet, unknown.

---

### World Progression and Multiple Maps

Mastering the first map is not the end of the game — it is the beginning of a larger journey.

When the player has established a stable, self-sustaining settlement and accomplished the map's core objectives (exact form TBD — perhaps a milestone structure or score threshold), they unlock the ability to move on.

**The Caravan**. Departure is not free. The player must assemble a caravan — a supply of food, materials, and at minimum a small party of villagers — sufficient to survive the journey to the next map. The travel itself is a mini-challenge: the caravan must endure a number of days in transit, consuming food, and potentially facing hazards along the route. Arriving at the next map with a depleted caravan is a harsh start; arriving well-stocked is an advantage.

**New maps are different, not just harder.** Each map is a biome with its own terrain rules, resource availability, and challenges:

| Map | Character | Unique challenge |
|-----|-----------|-----------------|
| **Starting Valley** | Tutorial biome. Temperate, resource-rich. | Learning all systems |
| **Desert** | Scarce water, extreme heat cycle. | Food and water logistics |
| **Rainforest** | Dense, impenetrable terrain. | Clearing land, disease |
| **Frozen Land** | Harsh winters, permafrost soil. | Heating buildings, seasonal production |
| **Lava Land** | Volcanic activity, rare minerals. | Risk management, heat hazards |

Each biome introduces new tile types, new hazards, and potentially new buildings specific to that environment. Resources and knowledge accumulated on previous maps may carry forward in part — the caravan is not just a survival challenge, it is the player's "save state" between chapters.

**The further horizon.** Beyond the natural maps, deeper exploration may reveal something stranger: ruins with unexplained properties, creatures that do not behave like bandits, materials with no obvious source. Whether the game eventually incorporates fantasy or supernatural elements is an open question — but the design should leave room for it. The world should feel like it has edges the player has not yet found.

---
