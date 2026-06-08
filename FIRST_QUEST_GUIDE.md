# Guide: Completing "First Steps" Quest via Playwright

## Quest Tasks
1. ✅ Build a Town Hall
2. ✅ Build a Farm
3. ✅ Build a Lumbermill
4. ✅ Connect buildings by road
5. ✅ Put workers to work

---

## Critical Facts

### Canvas & Coordinate System

Constants (from MapRenderer.js): `TILE_W=64, TILE_H=32, ORIGIN_X=480, ORIGIN_Y=60, HEIGHT_STEP=16`

**Tile → world (sprite anchor, for computing click targets):**
```
world_x = (col - row) * 32 + 480
world_y = (col + row) * 16 + 60 + 32 - height * 16
         = (col + row) * 16 + 92            // height=0 (flat tiles)
```
The `+32` (TILE_H) is essential — it moves from the tile's geometric origin to the sprite anchor point. Omitting it gives coordinates ~32px too high, causing clicks to miss the building.

**Tile → viewport (use this to compute page.mouse.click targets):**
```js
// read from game at runtime:
const cam = game.cameras.main;
const ds = window.__game.scale.displayScale;   // { x: 0.9375, y: 0.9375 }
const rect = document.querySelector('canvas').getBoundingClientRect();

const worldX = (col - row) * 32 + 480;
const worldY = (col + row) * 16 + 92;          // +92 for flat tiles
const vp_x = (worldX - cam.scrollX) / ds.x + rect.left;
const vp_y = (worldY - cam.scrollY) / ds.y + rect.top;
```

**World → tile (for back-calculating tile from a world point):**
```
A = (world_x - 480) / 32
B = (world_y - 60)  / 16      // NOTE: uses ORIGIN_Y=60, NOT +92
col = round((A + B) / 2)
row = round((B - A) / 2)
```
worldToTile uses `ORIGIN_Y=60` (without TILE_H), because Phaser's hit-detection is based on the tile geometric origin, not the sprite anchor.

**Viewport → game pixel (for reading a click position):**
```
game_x = (clientX - rect.left) * ds.x
game_y = (clientY - rect.top)  * ds.y
```
`ds.x ≈ 0.9375` (game is 960px, canvas CSS width ≈ 1024px; 960/1024 = 0.9375).

### Camera Scroll (calibrate each session!)
- Confirmed stable across sessions: `scrollX = 0, scrollY = 348`
- **Always verify** by reading `game.cameras.main.scrollX/scrollY` via JS before computing click targets
- Camera does NOT shift after TH placement in the current build (fog reveal does not auto-scroll)

### Visible Area
- Visible tiles: col/row ∈ [12..23] (VIS_MIN=12, VIS_MAX=23)
- Tiles with col OR row outside [12..23] are fog-hidden and NOT clickable
- Buildings cannot be placed in fog

### Food & Starvation Timeline (CRITICAL)
- Starting food: 80
- Food consumed: 1 per villager per tick (every 5 seconds)
- TH spawns **4 villagers** on placement → 4 food/tick
- At 4/tick: food hits 0 after 80/4 = **20 ticks = 100 seconds**
- HUNGRY state: 3 more ticks (15s) of 0 food → efficiency penalty starts
- STARVING: 10 more ticks (50s) → **villagers depart every 5 ticks**
- Starvation kills the run: villagers reach 0 → can never recover without food production
- **With 0 villagers: food consumption = 0, but starvation state persists — no recovery possible!**
- **Total safe time from TH placement to Farm producing: ~100 seconds**

### Building Menu Button Positions (bottom bar, ~y=800)
- Town Hall: x ≈ 46
- House: x ≈ 140
- Farm: x ≈ 232  *(NOTE: locked until TH is placed)*
- Lumbermill: x ≈ 325
- Road: x ≈ rightmost ≈ 972
- All buttons show "Needs: Town Hall" until TH is placed

### Pause Button
- Pause button: vp(1011, 160) — click to toggle pause
- When paused, a PAUSED dialog appears with Continue/Restart buttons
- Continue button: vp(511, 479)
- Restart Game button: vp(511, 527)

### Demolish Button
- Located in TileInfoPanel at approximately vp(918, 402)
- **MUST use `page.mouse.click(918, 402)` via browser_run_code_unsafe** — dispatchEvent doesn't work reliably
- Building must be selected (clicked in idle mode) before Demolish button appears

---

## Placement Rules

### Town Hall
- 2×2 footprint of flat GRASS tiles (all 4 must be same height)
- Cannot be placed on ramps, elevated tiles, or in fog
- Can only be placed once; cannot be demolished
- Spawns 4 villagers immediately (always connected)
- Does NOT need a road

### Farm
- 2×2 footprint of flat GRASS tiles
- Needs road connection to produce food
- Workers: up to 4 (1 per field block, max 4 fields = 2x2 GRASS blocks in cardinal directions)
- Production: 3 food/tick per worker-field pair
- **Must have 1+ tile gap from TH to allow road placement**

### Road
- Costs: 1 stone + 2 money
- Placed on unoccupied, flat GRASS tiles (not ramps, not buildings)
- Farm is "connected" if any footprint tile OR field block is adjacent to a road reachable from TH
- One road tile can connect TH and Farm if placed adjacent to BOTH

### Lumbermill
- 2×2 footprint of flat GRASS tiles
- Needs forest tiles nearby to work
- Workers assigned based on forest tiles claimed

---

## Step-by-Step Execution Plan

### Phase 1: Preparation (before placing anything)
1. Start new game → **immediately pause** (`page.mouse.click(1011, 160)`)
2. Continue pause, then **calibrate coordinates** by clicking a visible tile and reading TileInfoPanel
3. Scan for a flat grass area large enough for: `TH(2) + road(1) + Farm(2) = 5 tiles horizontally`

### Phase 2: Scouting (in idle mode, game paused)
**Strategy: use TH build mode ghost to find valid placement**
1. Click Town Hall button (x≈46, y≈800)
2. Hover around the map looking for a **GREEN ghost** (building sprite tint = green = valid)
3. Find a position with flat GRASS extending in one direction for Farm + road
4. Note the anchor tile position
5. Press ESC to exit TH build mode

**Good areas to check:**
- Center-right of visible area (col 19-21, row 17-19) — tends to be flat
- Avoid the elevated hill cluster visible in upper-center of screen
- Avoid the water edge at the bottom (tiles near col+row > 40 tend to be underwater)
- Avoid right edge: if Farm anchor col + 1 ≥ 24 (col+1 > VIS_MAX), placement invalid

### Phase 3: Place TH (game paused is fine)
1. Click TH button (x≈46, y≈800)
2. `await page.mouse.move(vp_x, vp_y)` — hover at target anchor
3. Take screenshot to confirm **GREEN building sprite** (not orange)
4. `await page.mouse.click(vp_x, vp_y)` — place it
5. **Pause immediately** after placement (`page.mouse.click(1011, 160)`)
6. Take screenshot to confirm quest "Build a Town Hall" ✓ and Villagers shows 4

### Phase 4: Enter Farm Mode and Find Farm Position
**IMPORTANT: Farm mode is only available AFTER TH is placed**
1. Continue pause, ESC to exit TH mode if still active
2. Click Farm button (x≈157 or x≈232, y≈800) — second button in the unlocked menu
3. Move mouse to canvas, then hover around area adjacent to TH
4. Look for **GREEN Farm ghost** (building sprite tint = green)
5. Key: the Farm footprint must NOT overlap TH footprint

**Farm placement relative to TH:**
- TH at anchor (col_th, row_th): footprint (col_th, row_th), (col_th+1, row_th), (col_th, row_th+1), (col_th+1, row_th+1)
- Farm 2+ tiles away in col OR row direction
- Recommended: Farm anchor at (col_th - 3, row_th) — 3 cols left → road at (col_th - 1, row_th)
- OR: Farm anchor at (col_th, row_th - 3) — 3 rows above → road at (col_th, row_th - 1)

### Phase 5: Place Farm
1. Confirm green ghost at Farm position
2. `await page.mouse.click(farm_vp_x, farm_vp_y)` to place
3. **Pause immediately** 
4. Take screenshot to confirm quest "Build a Farm" ✓
5. Check TileInfoPanel shows Farm with "No road connection"

### Phase 6: Place Road
1. Continue pause, press ESC to exit Farm mode
2. Click Road button (x≈972, y≈800) — rightmost button
3. Hover over the gap tile between TH and Farm
4. Road ghost will show green (valid) or red (invalid)
5. Click to place road
6. **Pause, verify**: Farm's TileInfoPanel should no longer show "No road connection"

**Identifying the road tile:**
- Road must be adjacent to TH footprint AND adjacent to Farm footprint (or Farm's field blocks)
- If TH at (20,17) and Farm at (17,17): road at (19,17) works
- The road tile must be flat GRASS — if red ghost, try adjacent tiles

### Phase 7: Assign Workers to Farm — MUST come before Lumbermill
1. Exit Road mode (ESC)
2. Click Farm building in idle mode to select it
3. VillagerPanel shows "Workers: 0/N, Free: 4"
4. Click the `[+]` button to assign workers (button at ~vp(877, 523))
5. Assign **at least 2 workers** — need `ceil(villagerCount / 3)` to cover food consumption (4 villagers → 2 workers → 6 food/tick produced vs 4 consumed)
6. **Wait 2–3 seconds unpaused** for the villager to walk to the Farm and confirm arrival (see PITFALL 11) — do NOT re-pause immediately
7. Confirm quest "Put workers to work" ✓ in quest panel, then pause
8. **Do not proceed to Lumbermill until food is stable** — if still STARVING, assign a third worker and wait for food to recover above 0 before continuing

### Phase 8: Lumbermill (only after food is stable)
1. Confirm food > 0 and Farm is producing before entering Lumbermill build mode
2. Lumbermill needs flat GRASS adjacent to Forest tiles
3. Place Lumbermill near the forest cluster visible on the map
4. Place road tile(s) from the existing road network to Lumbermill
5. Assign workers

---

## Pitfalls & Lessons Learned

### PITFALL 1: Farm directly adjacent to TH (no road gap)
- **Problem**: Placing Farm footprint tile adjacent to TH footprint tile leaves no room for a road tile between them. Road can't be placed on building tiles.
- **Fix**: Ensure at least 1 free GRASS tile between TH and Farm footprints. Farm anchor must be at least 3 col/row steps away from TH anchor.

### PITFALL 2: Screenshot after clicking UI button (no mouse move)
- **Problem**: Taking screenshot immediately after clicking a building menu button shows no ghost because the mouse is still over the UI, not the game canvas.
- **Fix**: After clicking menu button, always `await page.mouse.move(600, 400)` (or any game tile) BEFORE taking a screenshot or checking ghost color.

### PITFALL 3: Ghost tint confusion
- **Problem**: Farm field preview tiles are TEAL/CYAN regardless of validity. Only the building SPRITE tint matters.
- **Fix**: Look at the building sprite only: GREEN sprite = valid, ORANGE sprite = invalid. Ignore field tile color.

### PITFALL 4: Farm footprint hitting water or ramp
- **Problem**: 2×2 footprint with anchor near water/cliff edge includes invalid tiles.
- **Fix**: Keep Farm anchor such that anchor+1 row is also safe. Avoid row > 21 or tiles near the cliff edge.

### PITFALL 5: Farm build mode locked before TH
- **Problem**: All building buttons show "Needs: Town Hall" until TH is placed. Clicking Farm button does nothing.
- **Fix**: Always place TH first. You cannot even preview Farm placement until TH exists.

### PITFALL 6: Starvation deadlock
- **Problem**: If all 4 villagers depart due to starvation, food consumption drops to 0. But with 0 food production (Farm disconnected) and no villagers to assign, the game cannot recover.
- **Fix**: If starvation hits before Farm is producing, restart the game. No recovery is possible.

### PITFALL 7: Camera scroll changes after TH placement
- **Problem**: TH placement triggers a fog reveal that may scroll the camera. Pre-computed viewport coordinates become invalid.
- **Fix**: Always recalibrate after TH placement by clicking a known tile in idle mode and re-deriving scrollX/scrollY.

### PITFALL 8: Farm placement in Farm build mode vs idle click
- **Problem**: TileInfoPanel only updates when clicking in IDLE mode (not during build mode hover). Can't read tile type during build mode.
- **Fix**: Scout tiles in idle mode first. OR: trust the ghost color (green = all 4 tiles valid flat GRASS).

### PITFALL 9: VIS_MAX boundary for Farm
- **Problem**: Farm anchor at col=22 gives footprint tile at col=23 (ok) AND col=23 row offset = fine, but anchor at col=23 gives col=24 which is outside visible range.
- **Fix**: Farm anchor col must be ≤ 22. Farm anchor row must be ≤ 22. (anchor + 1 must still be ≤ 23)

### PITFALL 10: dispatchEvent vs page.mouse.click for UI buttons
- **Problem**: `canvas.dispatchEvent(new MouseEvent(...))` works for some Phaser interactions but is unreliable for the Phaser UI scene (TileInfoPanel buttons like Demolish, VillagerPanel [+]).
- **Fix**: Always use `page.mouse.click(x, y)` via `browser_run_code_unsafe` for reliable clicking.

### PITFALL 11: [+] button uses reserveWorker — pausing immediately leaves worker "pending"
- **Problem**: The VillagerPanel [+] button calls `reserveWorker`, which decrements `vm.unassigned` and sets `building.pendingWorkers++`, then starts a villager walk animation. `confirmWorker` (which sets `building.assignedVillagers`) is only called when the villager *arrives*. If you pause immediately after clicking [+], the game freezes mid-walk and the worker stays pending forever — `building.assignedVillagers` stays 0, the `VILLAGERS_CHANGED` event with the new count never fires, and the `workerAssigned` quest task never completes.
- **Detection**: VillagerPanel shows "Workers: 1/N" but the quest task is still unchecked; JS state read shows `building.pendingWorkers > 0` and `building.assignedVillagers === 0`.
- **Fix**: After clicking [+], wait **at least 2–3 seconds unpaused** for the villager to walk to the building before re-pausing. Only re-pause once the VillagerPanel shows the worker count stable and the quest task ticks green.

### PITFALL 13: Placing Lumbermill before Farm has workers — starvation during scouting
- **Problem**: Placing the Lumbermill (Phase 8) before assigning workers to the Farm (Phase 7) means the game must be unpaused to scout for forest tiles and hover the ghost — burning starvation timer with 0 food production. Even a brief unpaused scouting pass can push the game into HUNGRY or STARVING state before Farm ever produces food.
- **Fix**: Strictly follow Phase 7 → Phase 8 order. The Farm must have workers assigned AND confirmed (villager arrived) before entering Lumbermill build mode. The quest task "Put workers to work" ticking green is the gate to proceed.

### PITFALL 12: Farm food production must exceed total villager consumption
- **Problem**: Farm produces 3 food/tick per worker. With 4 villagers consuming 4 food/tick, 1 worker (3 food/tick) still results in net -1/tick — food continues draining even with a worker assigned.
- **Fix**: Assign at least `ceil(villagerCount / 3)` workers to Farm. With 4 villagers, assign **2 workers** (6 food/tick produced vs 4 consumed = net +2/tick). Always check the math before unpausing.

---

## Efficient Run Checklist

```
[ ] New Game → Pause immediately
[ ] Calibrate scrollX/scrollY (click a tile, read TileInfoPanel)
[ ] TH build mode: find GREEN ghost → note anchor tile
[ ] Verify Farm gap: 3+ tiles from TH anchor in one direction
[ ] Place TH → Pause → confirm quest ✓ and Villagers=4
[ ] Farm build mode: hover to Farm anchor → confirm GREEN ghost
[ ] Place Farm → Pause → confirm quest ✓
[ ] Road mode: click tile between TH and Farm → confirm green road ghost
[ ] Place road → verify Farm "No road connection" disappears
[ ] Click Farm → VillagerPanel → [+] assign 2+ workers (need ceil(villagers/3) to break even on food)
[ ] Wait 2–3s unpaused for villager to arrive before re-pausing
[ ] Pause → confirm "Connect buildings" ✓ and "Put workers to work" ✓
[ ] Lumbermill: find forest edge position, place, road, assign workers
```

---

## Timing Budget (from TH placement)
- 0s: TH placed, 4 villagers, food=80
- 100s: food hits 0 → HUNGRY warning
- 115s: HUNGRY penalty kicks in (×0.5 production)
- 165s: STARVING starts (×0.25, villager departures begin)
- **Farm must be PRODUCING (connected + workers assigned) before 100s**
- With pausing the game: effectively unlimited time — **ALWAYS PAUSE** between steps
