# Settlement — Balance Document v4

*Depletable resources, house upgrades, revised quarry.*

---

## Overview

This document defines the current balance parameters for Settlement. It supersedes the economy tables in the main Game Design Document and reflects the results of simulation modeling across two player archetypes: an optimal player who builds efficiently and anticipates resource depletion, and a casual player who makes placement mistakes, delays decisions, and reacts to problems rather than preventing them.

The simulation covers the first 30 minutes of play on a 20×20 map with elevation. All numbers assume a 5-second production cycle.

---

## Key Changes from GDD

**Depletable wood.** Forest tiles are no longer infinite. Each tile holds **50 wood**. When a Lumbermill's claimed forest is exhausted, production stops and workers become idle. The player must find and claim new forest to continue wood production.

**Revised Quarry.** Stone production is reduced to **1 stone per worker per cycle** (was 2). To compensate, Quarry capacity is increased to **6 workers** (was 3). Stone deposits are finite — **400 stone per quarry site**.

**House Upgrades.** Houses can be upgraded once. An upgrade costs **25 Wood · 30 Stone · 50 Money** and adds **2 villagers** without requiring a new building footprint. Upgrades serve as a late-game resource sink and the only way to grow population once map space runs out.

---

## Resources

Three material resources and one currency drive the economy. Each material resource has a shared storage cap — initially 200 — that grows only by building Warehouses.

| Resource | Role |
|----------|------|
| **Food** | Consumed each cycle by every villager. Also spent when building Houses to attract new settlers. The lifeblood of growth. |
| **Wood** | Primary construction material. **Finite** — sourced from forest tiles that deplete over time. |
| **Stone** | Mid-game material. **Finite** — sourced from rock deposits that deplete over time. |
| **Money** | Currency earned through trade. Used for Lumbermills, Quarries, Warehouses, upgrades, and bounties. Not stored in Warehouses — tracked separately with no cap. |

**Starting reserves:** Food 80 · Wood 60 · Stone 30 · Money 100.

---

## Map Resources

The starting 20×20 map contains a finite pool of extractable materials distributed across the terrain.

| Resource | Distribution | Total |
|----------|-------------|-------|
| **Forest** | 3 groves: 8 + 8 + 12 tiles | 28 tiles · 50 wood = **1,400 wood** |
| **Rock** | 2 outcrops | 400 + 400 = **800 stone** |

Forest groves cluster naturally. Coastal groves (8 tiles each) are accessible from the start. The large inland grove (12 tiles) requires expansion to reach.

Rock outcrops are sparse. The first is near the coast; the second requires exploration. Each outcrop supports one Quarry.

When all resources on the starting map are exhausted, the player must push inland to find new deposits — creating natural pressure toward exploration and the planned Settlement Network system.

---

## Buildings

All buildings occupy a **2×2 tile footprint**.

### House
> *Cost: 15 Wood · 20 Food*
>
> *Upgrade cost: 25 Wood · 30 Stone · 50 Money*

Houses villagers. Each House built adds **2 villagers**. A House can be upgraded once, adding **2 more villagers** (4 total per House) without consuming map space.

The upgrade requires all three material resources plus money, making it significantly more expensive per villager than a new House (~3× cost per head). New Houses are always preferable when space exists; upgrades become relevant when the map fills up.

The upgrade intentionally has no food cost. Food pressure is already high at large population counts, and the money component indirectly taxes food via the Market conversion chain.

*Placed on: Grass.*

---

### Farm
> *Cost: 20 Wood*

The primary food source. When placed, a Farm automatically claims up to four adjacent 2×2 blocks of grass as cultivated fields.

Each assigned villager tends one field, producing **3 food per production cycle**. A well-placed Farm with four fields supports four workers and generates 12 food per cycle. A poorly placed Farm may only claim two fields — a difference that cascades through the entire session.

*Placed on: Grass.*

---

### Lumbermill
> *Cost: 15 Stone · 10 Money · Must be adjacent to Forest*

Upon placement, a Lumbermill claims **all unclaimed forest tiles within a radius of 2**. Worker capacity: **one slot per 4 forest tiles**. Each worker produces **2 wood per production cycle**.

**Forest tiles are depletable.** Each tile holds **50 wood**. When the Lumbermill's forest reserve is exhausted, production stops permanently and all assigned workers become idle. The player must build a new Lumbermill at an unclaimed grove to resume wood production.

Lumbermill placement quality varies significantly by map:

| Placement quality | Forest tiles claimed | Workers | Total reserve | Depletion time (full staff) |
|---|---|---|---|---|
| Excellent (rare) | 12 | 3 | 600 wood | ~8 min |
| Good | 8 | 2 | 400 wood | ~8 min |
| Marginal | 4 | 1 | 200 wood | ~8 min |

Depletion time is roughly consistent regardless of size because larger groves support more workers. The critical difference is throughput: a 2-worker mill produces 4 wood/cycle vs. 2 wood/cycle from a 1-worker mill.

*Placed on: Grass, adjacent to Forest.*

---

### Quarry
> *Cost: 10 Wood · 15 Money*

Quarries must be built on rocky terrain. Upon placement, a Quarry claims the underlying rock deposit.

Supports up to **6 workers**, each producing **1 stone per production cycle**.

**Rock deposits are depletable.** Each deposit holds **400 stone**. At full staffing (6 workers, 6 stone/cycle), a deposit lasts approximately **5.5 minutes**. At moderate staffing (2–3 workers), it lasts 11–17 minutes.

The reduced per-worker output (1 stone, down from 2) makes the Quarry a significant workforce decision. Six quarry workers consume 6 food/cycle while producing no food — they must be supported by a strong farming base.

*Placed on: Rocks.*

---

### Market
> *Cost: 25 Wood · 10 Stone*

The settlement's source of money. Each assigned merchant converts **3 food per cycle into 5 money**.

The Market creates a deliberate trade-off: food spent on trade cannot feed workers. Money earned at the Market funds Lumbermills, Quarries, Warehouses, and House upgrades — making it essential for mid-to-late-game progression.

*Placed on: Grass.*

---

### Warehouse
> *Cost: 30 Wood · 25 Stone · 40 Money*

Increases the storage cap for all material resources by **100** (base 200 → 300, then 400, etc.). Requires all three material resources plus money.

Timing the first Warehouse is a key strategic moment. Building it too late means wasting production at the cap; building it too early diverts scarce stone from Lumbermills.

*Placed on: Grass.*

---

## Production per Worker per Cycle

| Building | Output | Rate per worker |
|----------|--------|-----------------|
| Farm | Food | 3 |
| Lumbermill | Wood | 2 |
| Quarry | Stone | 1 |
| Market | Money | 5 (consumes 3 food) |

## Consumption

| | Rate |
|---|---|
| Food per villager per cycle | 1 |
| Cycle interval | 5 seconds |

---

## Building Costs

| Building | Food | Wood | Stone | Money | Terrain |
|----------|------|------|-------|-------|---------|
| House | 20 | 15 | — | — | Grass |
| House Upgrade | — | 25 | 30 | 50 | (existing House) |
| Farm | — | 20 | — | — | Grass |
| Lumbermill | — | — | 15 | 10 | Grass, adj. Forest |
| Quarry | — | 10 | — | 15 | Rocks |
| Market | — | 25 | 10 | — | Grass |
| Warehouse | — | 30 | 25 | 40 | Grass |

---

## Starting State

| | Value |
|---|---|
| Food | 80 |
| Wood | 60 |
| Stone | 30 |
| Money | 100 |
| Villagers | 0 |
| Storage cap | 200 |

---

## Hunger and Starvation

Food is not optional. Every villager consumes **1 food per production cycle** regardless of assignment. When food runs out, the consequences escalate:

**Fed** — Food is available. Full productivity.

**Hungry** — Food has been at zero for **3+ consecutive cycles**. All production at **50%**.

**Starving** — Food has been at zero for **10+ consecutive cycles**. Production at **25%**. One villager departs every 5 cycles until food is restored.

---

## Depletion Events

Depletion is a core strategic mechanic. When a Lumbermill or Quarry exhausts its reserve, all assigned workers are automatically freed (become idle). The building remains on the map but produces nothing.

The player must respond by reassigning freed workers to productive buildings and, for continued resource income, finding and claiming new deposits elsewhere on the map.

**Typical depletion timeline (optimal play):**

| Event | Time | Impact |
|-------|------|--------|
| LM1 depleted (8 tiles, 400W) | ~10:00 | Wood income drops. Must have LM2 ready. |
| LM2 depleted (8 tiles, 400W) | ~24:00 | Need LM3 or stored wood to continue. |
| Quarry 1 depleted (400S) | ~22:00 | Stone income stops. Need second quarry site. |
| LM3 depleted (12 tiles, 600W) | ~25:00 | All starting-area wood gone. Must explore. |
| All starting resources gone | ~25:00 | Expansion inland is now mandatory. |

---

## First 30 Minutes — Optimal Play

This timeline describes a player who builds efficiently, places buildings well, and anticipates depletion. Real play varies by map.

**0:00 — Landfall.** Farm (4 fields) + House. Both villagers to Farm. Net food: +4/cycle.

**1:00 — Wood production.** Lumbermill 1 (8 tiles). One farmer moves to lumber. Net food: +1/cycle. Wood: +2/cycle. Economy is fragile but functional.

**3:00 — First expansion.** House 2. New workers split between Farm and Lumbermill. Net food: +2. Wood: +4.

**6:00 — Growth.** Farm 2 + House 3. Four farmers, two lumberjacks. Net food: +6. Food surplus builds.

**6:30 — Stone.** Quarry (one farmer reassigned). Stone trickles in at +1/cycle. This is slow — intentionally.

**7:45 — Anticipating depletion.** Lumbermill 2 built before LM1 runs dry. The player has read the map and secured the second grove early.

**8:00 — More workers.** House 4. Second quarry worker. Net food: +1. Stone: +2/cycle.

**9:05 — Warehouse.** Stone has finally accumulated to 25. Warehouse built. Cap → 300. This is the key mid-game unlock — delayed ~40 seconds vs. the old 2-stone-per-worker rate.

**10:10 — LM1 depletes.** First grove exhausted. Two workers freed. Because LM2 is already running, wood income continues uninterrupted. Freed workers go to Farm.

**11:00–16:00 — Scaling.** More Houses, Market comes online, Farm 3, Warehouse 2. Economy is self-sustaining. All four resources flowing. Population reaches 12.

**17:00 — Lumbermill 3.** The big 12-tile inland grove. Three workers assigned. This is the last wood source on the starting map.

**22:00 — Quarry depletes.** 400 stone mined. Three workers freed. By now the player has enough stored stone for remaining upgrades.

**23:00–29:00 — Upgrades.** Four House upgrades over this period, spending 100W + 120S + 200M total. Population grows from 16 to 24 without new building sites.

**25:00 — All wood depleted.** Every forest on the starting map is gone. The player must expand inland for new groves.

**30:00 — State.** 24 villagers. Food 500. Wood 320 (stored, no income). Stone 180 (stored, no income). Money 1970. Cap 500. Economy is food-positive (+9/cycle) but resource-starved — the continent beckons.

---

## First 30 Minutes — Casual Play

This timeline describes a player who makes typical beginner mistakes: wrong build order, poor placement, forgotten workers, reactive rather than proactive decisions.

**0:30 — House first.** Builds House before Farm. Two idle villagers eating food with no production. Loses ~12 food over 6 cycles.

**1:30 — Farm.** Bad placement — only 2 fields. This caps farm workers at 2 and halves food throughput for the first 10 minutes.

**4:00 — Lumbermill.** Edge placement — only 4 forest tiles, 1 worker max. Total reserve: 200W. Will deplete by 13:00.

**7:00–12:00 — Slow growth.** Houses and a second Farm, but an idle worker sits unassigned for 3 minutes. Food wastes at storage cap. Wood accumulates slowly.

**13:00 — LM1 depletes.** Only 200W mined from the bad 4-tile spot. Zero wood income for the next 13 minutes. The player must spend stored wood carefully.

**16:00 — Quarry (delayed).** Stone begins accumulating. Warehouse at 17:30. But no wood income means no new buildings that cost wood.

**22:00 — Market.** Comes online very late. Money has been stuck at 35–90 for most of the game.

**26:00 — Lumbermill 2.** Finally builds a proper LM on the second grove. Wood income resumes after 13 minutes of drought.

**28:00 — Hunger crisis.** Population has grown to 12 but food production can't keep up. Two Markets consuming 6 food/cycle, 4 quarry workers consuming food but producing no food. Net food: -8/cycle. Starvation begins.

**30:00 — State.** 14 villagers. Food 0 (STARVING). Wood 162. Stone 270. Money 630. Cap 300. Economy is collapsing. The player needs to cut Market/Quarry workers and stabilize food before expanding.

---

## Balance Insights

**Wood depletion is the mid-game crisis.** LM1 running dry at ~10 minutes creates the game's first strategic inflection point. An optimal player prepares by scouting the second grove and building LM2 in advance. A casual player discovers the problem when wood income hits zero. This is a healthy learning moment — painful but recoverable.

**Stone scarcity shapes the mid-game.** At 1 stone per worker, the Quarry produces slowly but steadily. The Warehouse (25 stone) and House Upgrade (30 stone) are now genuine investments. Players must choose between staffing the Quarry heavily (faster stone but more food drain) or lightly (slower but safer). This creates a real decision without a single correct answer.

**The 25-minute wall.** By ~25 minutes, an optimal player has exhausted all starting-area wood and stone. The economy shifts from production to consumption of stored reserves. This naturally pushes the player toward exploration and the Settlement Network system described in the GDD.

**House upgrades drain late-game surplus.** Four upgrades cost 100W + 120S + 200M — substantial amounts that would otherwise sit unused. The no-food-cost design is intentional: money already taxes food through the Market chain, and direct food costs would make upgrades punishing at high population.

**Casual players hit a food crisis, not a resource crisis.** The casual player's main failure mode is not running out of wood or stone — it's overcommitting workers to non-food buildings (Market, Quarry) without enough Farm support. This means the hunger system is working as designed: it punishes unbalanced economies, not slow play.

**Placement quality cascades.** A 2-field Farm produces half the food of a 4-field Farm. A 4-tile Lumbermill holds half the wood of an 8-tile one and depletes at the same time with fewer workers. These differences compound over 30 minutes into a ~10 villager gap between optimal and casual play. This is good — it means the map reading skill described in the Core Pillars section has real mechanical weight.
