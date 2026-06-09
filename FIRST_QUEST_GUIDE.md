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

**Tile → world (two variants — use the right one for the context):**
```
// Sprite anchor (+92): where the building sprite is visually drawn
world_x = (col - row) * 32 + 480
world_y = (col + row) * 16 + 92            // height=0 (flat tiles)

// Geometric origin (+60): what Game.js pointermove uses to determine hovered tile
world_x = (col - row) * 32 + 480
world_y = (col + row) * 16 + 60            // height=0 (flat tiles)
```

**Tile → viewport for BUILD MODE ghost hover (use +60 geometric origin):**
```js
const cam = game.scene.getScene('Game').cameras.main;
const ds = window.__game.scale.displayScale;
const rect = document.querySelector('canvas').getBoundingClientRect();

const worldX = (col - row) * 32 + 480;
const worldY = (col + row) * 16 + 60;          // +60: geometric origin for ghost hover
const vp_x = (worldX - cam.scrollX) / ds.x + rect.left;
const vp_y = (worldY - cam.scrollY) / ds.y + rect.top;
```

**Tile → viewport for IDLE MODE building selection (use +92 sprite anchor):**
```js
const worldX = (col - row) * 32 + 480;
const worldY = (col + row) * 16 + 92;          // +92: sprite anchor to click on building
const vp_x = (worldX - cam.scrollX) / ds.x + rect.left;
const vp_y = (worldY - cam.scrollY) / ds.y + rect.top;
```

**Why two formulas?** Game.js `pointermove` in build mode calls `worldToTile(pointer.worldX, pointer.worldY)` using `+60` to identify the hovered tile, then positions the ghost at `tileToWorld(col, row)` using `+92`. So to make the ghost land on tile (col, row), you must hover at the `+60` position. Clicking on an *existing* building sprite in idle mode requires aiming at its visual center (closer to `+92`).

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

### Building Menu Button Positions (bottom bar)

**⚠ Button positions shift when TH is placed.** The menu shows 11 buttons before TH placement and 10 after (TH disappears). Phaser reflows the remaining buttons with wider spacing (btnW 78→87 game px). Hardcoded x values become wrong by ~75px.

**Always read button centers from the live game:**
```js
const ui = window.__game.scene.getScene('UI');
const canvas = document.querySelector('canvas');
const rect = canvas.getBoundingClientRect();
const ds = window.__game.scale.displayScale;         // ds.x ≈ 0.9353
const { btn } = ui.buildingMenu._buttons['FARM'];    // or 'LUMBERMILL', 'ROAD', etc.
const btnW = 87;                                      // after TH placed; 78 before
const centerGameX = btn.x + btnW / 2;                // btn.x is left edge (origin 0, 0.5)
const vpX = Math.round(centerGameX / ds.x + rect.left);
const vpY = Math.round(btn.y / ds.y + rect.top);
```

**Approximate values (before TH placed, 11 buttons):**
- Town Hall: vpX ≈ 51, vpY ≈ 802
- Farm: vpX ≈ 236, vpY ≈ 802
- Road: vpX ≈ 930, vpY ≈ 802

**Approximate values (after TH placed, 10 buttons, DIFFERENT):**
- Farm: vpX ≈ 157, vpY ≈ 802
- Lumbermill: vpX ≈ 259, vpY ≈ 802
- Road: vpX ≈ 972, vpY ≈ 802

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

**Correct placement pattern — use this for every building:**
```js
// 1. Read button center from live game state (see Button Positions section)
await page.mouse.click(btnVpX, btnVpY);  // enter build mode

// 2. Sweep to target with steps (like human mouse movement across tiles)
await page.mouse.move(targetVpX, targetVpY, { steps: 15 });
await page.waitForTimeout(100);          // let Phaser process pointermove events

// 3. Verify ghost via JS — do NOT rely on screenshots for tint check
const tint = await page.evaluate(() => {
  const gh = window.__game.scene.getScene('Game').buildingRenderer._ghost;
  return gh?.tintTopLeft?.toString(16);
});
if (tint !== '88ff88') { /* adjust target */ }

// 4. Click to place
await page.mouse.click(targetVpX, targetVpY);
```

Steps:
1. Read TH button vpX/vpY from live game (see Button Positions section)
2. Sweep to target anchor with `{ steps: 15 }`, wait 100ms, verify green via JS
3. Click to place
4. **Pause immediately** after placement (`page.mouse.click(1011, 160)`)
5. Confirm via JS: `questSystem.isTaskDone('buildTownHall')` and `villagerManager.total === 4`

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

**⚠ Check field yield BEFORE committing to a Farm position:**
Farm claims up to 4 cardinal 2×2 GRASS blocks as fields. Each field = 1 worker slot = 3 food/tick. With 4 villagers consuming 4/tick you need **at least 2 fields** to run a surplus going into Quest 2. A Farm that only claims 1 field (3/tick production) breaks even at best — and once the hunger recovery system returns departed villagers, you're stuck in a food deadlock with no way to accumulate the 20 food needed to build a House.

Before clicking to place, verify the candidate position has 2+ claimable blocks:
```js
// Check cardinal 2×2 GRASS blocks around Farm anchor (fc, fr)
const dirs = [[fc, fr-2], [fc, fr+2], [fc-2, fr], [fc+2, fr]]; // N/S/W/E
for (const [bc, br] of dirs) {
  const tiles = [[bc,br],[bc+1,br],[bc,br+1],[bc+1,br+1]];
  const ok = tiles.every(([c,r]) => {
    const t = tileMap.getTile(c,r);
    return t && t.type==='GRASS' && !t.buildingId && !t.isField
        && !t.isRamp && t.height===0 && !t.banditClaimed && !t.isOcean;
  });
  // ok === true → this direction yields a field
}
```
Forests, elevated tiles, ocean tiles, or already-claimed fields in the cardinal blocks reduce yield. Favour Farm positions with open flat GRASS in at least 2 directions.

### Phase 5: Place Farm
1. Confirm green ghost at Farm position
2. `await page.mouse.click(farm_vp_x, farm_vp_y)` to place
3. **Pause immediately**
4. Confirm via JS: `questSystem.isTaskDone('buildFarm')`
5. Read `building.fieldTiles` to see which 2×2 blocks were claimed as fields — **do this before planning your road tile** (see PITFALL 18)

### Phase 6: Place Road
1. Continue pause, press ESC to exit Farm mode
2. Click Road button (x≈972, y≈800) — rightmost button
3. Hover over the gap tile between TH and Farm
4. Road ghost will show green (valid) or red (invalid)
5. Click to place road
6. **Pause, verify**: Farm's TileInfoPanel should no longer show "No road connection"

**Identifying the road tile:**
- Road must be adjacent to TH footprint AND adjacent to Farm footprint **or any field tile** (field tiles count for connectivity even though you cannot place a road ON them)
- If TH at (20,17) and Farm at (17,17): road at (19,17) works
- The road tile must be flat GRASS and not a field tile — if red ghost, try adjacent tiles
- **Farm field blocks occupy GRASS tiles adjacent to the Farm footprint.** You cannot place a road ON a field tile. Check `building.fieldTiles` after Farm placement to know which anchor blocks were claimed, and avoid those 2×2 zones when choosing your road tile (see PITFALL 18).
- Because field tiles count for connectivity, a road tile adjacent to any field tile also connects the Farm — this gives you more valid road positions than just the footprint edges.

### Phase 7: Assign Workers to Farm — MUST come before Lumbermill
1. Exit Road mode (ESC)
2. Click Farm building in idle mode to select it
3. VillagerPanel shows "Workers: 0/N, Free: 4"
4. Click the `[+]` button to assign workers (button at ~vp(877, 523))
5. Assign **as many workers as possible**, targeting `ceil(villagerCount / 3)` to cover food consumption (4 villagers → need 2 workers → 6 food/tick produced vs 4 consumed). **Note**: worker cap = `building.fieldTiles.length` (1 field = max 1 worker). If only 1 field was claimed, net food will be -1/tick; losing a villager to starvation is expected — that reduces consumption to 3/tick which breaks even.
6. **Wait 2–3 seconds unpaused** for the villager to walk to the Farm and confirm arrival (see PITFALL 11) — do NOT re-pause immediately
7. Confirm quest "Put workers to work" ✓ in quest panel, then pause
8. **Do not proceed to Lumbermill until food is stable** — if still STARVING, assign a third worker and wait for food to recover above 0 before continuing

### Phase 8: Lumbermill (only after food is stable)
1. Confirm food > 0 and Farm is producing before entering Lumbermill build mode
2. **For First Quest purposes, Lumbermill only needs to be PLACED** — "Connect buildings by road" and "Put workers to work" are already satisfied by the Farm. No road or worker assignment needed to complete the quest.
3. Lumbermill needs flat GRASS adjacent to Forest tiles — scan with ghost to find a green position near the visible forest clusters
4. (Optional, for production) Place road tile(s) from the existing road network to Lumbermill and assign workers

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

### PITFALL 15: Building menu reflows when TH is placed — hardcoded button x breaks
- **Problem**: The menu shows 11 buttons before TH placement. Once TH is placed it disappears, leaving 10 buttons. Phaser reflows with wider `btnW` (78→87 game px). Every button shifts left by ~75 viewport px. Clicking the old Farm x≈232 hits Lumbermill; old Lumbermill hits Quarry, etc.
- **Fix**: Always read button positions from the live game via `ui.buildingMenu._buttons['FARM'].btn.x` (left edge in game px), add `btnW/2` for center, then convert with `/ ds.x + rect.left`. Never hardcode button x after TH placement.

### PITFALL 16: Ghost doesn't update on first mouse.move if you read state immediately
- **Problem**: After clicking the build button, calling `page.mouse.move(x, y)` dispatches a native `mousemove` event, but Phaser's `pointermove` listener runs in the game loop. Reading `ghost.x` via `page.evaluate` immediately after `mouse.move` (with no wait) catches the state before Phaser has processed the event. The ghost appears to be at its previous position or at world `(0,0)`, even though it will update correctly on the next frame.
- **Root cause**: Humans naturally sweep the cursor from the UI button across game tiles to the target, firing many intermediate `pointermove` events before arriving. Automation jumps in one step, so the ghost may not reflect the final tile yet when read immediately.
- **Fix**: Use `page.mouse.move(targetX, targetY, { steps: 15 })` to generate 15 intermediate `mousemove` events along the path (mirroring human movement), then `await page.waitForTimeout(100)` before reading ghost state. Never check ghost tint via screenshot alone — read `ghost.tintTopLeft.toString(16)` via JS evaluate after the wait.

### PITFALL 17: Confusing the two "ds" values in viewport formulas
- **Problem**: The guide uses `const ds = window.__game.scale.displayScale` which gives `ds.x ≈ 0.9353` (= gameWidth/cssWidth). The correct formula is `vp_x = worldX / ds.x`. If instead you compute `const ds = rect.width / 960 ≈ 1.0692` (the reciprocal) and also divide — `vp_x = worldX / 1.0692` — you get the wrong result (off by ~14%). The tile coordinate looks plausible but lands one tile away, producing a red ghost on valid terrain.
- **Fix**: Either use `window.__game.scale.displayScale.x ≈ 0.9353` and divide, OR use `rect.width / 960 ≈ 1.0692` and multiply. The two are reciprocals. Be explicit about which you're using. The guide consistently uses displayScale (divide).

### PITFALL 14: Using +92 worldY for build-mode ghost hover — ghost lands one tile too far
- **Problem**: The guide's `worldY = (col+row)*16+92` formula gives the sprite *anchor* position. Hovering at that viewport coordinate causes `worldToTile(pointer.worldX, pointer.worldY)` — which uses `+60` internally — to resolve to tile `(col+1, row+1)`, one step further in col+row. The ghost appears on the wrong tile and may show orange (invalid) even though the intended tile is valid.
- **Example**: Hovering at the `+92` viewport y for tile (17,17) puts the ghost on tile (18,18). If (18,18) contains ROCKS the ghost is red, even though (17,17) was perfectly valid flat GRASS.
- **Fix**: Use `worldY = (col+row)*16+60` (geometric origin, not sprite anchor) when computing the viewport y to hover over in **build or road mode**. Reserve `+92` for clicking on existing building sprites in **idle mode**. See the two separate formulas in the Coordinate System section above.

### PITFALL 18: Farm field blocks can occupy your planned road tile
- **Problem**: When Farm is placed, it immediately claims up to four 2×2 GRASS blocks in cardinal directions as field blocks. These tiles get `isField=true` and roads **cannot** be placed on them. If your planned road tile falls within a claimed field block, the placement silently fails (ghost shows green but click does nothing, or ghost shows red).
- **Example**: Farm at (15,18) claimed a south field block anchored at (15,20), covering (15,20),(16,20),(15,21),(16,21). The road at (16,20) — adjacent to TH(17,20) — was blocked by the field. Road had to be moved to (17,19) instead (adjacent to TH(17,20) and Farm footprint tile (16,19)).
- **Fix**: After placing Farm, read `building.fieldTiles` via JS to see which block anchors were claimed. Each anchor (col,row) represents a 2×2 block: (col,row),(col+1,row),(col,row+1),(col+1,row+1). Avoid those tiles for road placement. Roads adjacent *to* field tiles (not on them) still count for Farm connectivity.

---

## Efficient Run Checklist

```
[ ] New Game → Pause immediately
[ ] Calibrate scrollX/scrollY via JS: game.cameras.main.scrollX/scrollY
[ ] Read TH button vpX/vpY from live game (buildingMenu._buttons['TOWN_HALL'])
[ ] TH build mode: sweep mouse with {steps:15} to target, wait 100ms, verify ghost.tintTopLeft==='88ff88' via JS
[ ] Verify Farm gap: 3+ tiles from TH anchor in one direction
[ ] Place TH → Pause → confirm via JS: questSystem.isTaskDone('buildTownHall') && villagerManager.total===4
[ ] Read Farm button vpX/vpY from live game (menu reflows after TH — positions shift!)
[ ] Farm build mode: sweep with {steps:15} to anchor, wait 100ms, verify green via JS
[ ] Place Farm → Pause → read building.fieldTiles to know which tiles are now farm fields
[ ] Choose road tile NOT inside any field 2×2 block but adjacent to TH footprint AND farm footprint/field
[ ] Road mode: sweep to road tile → confirm green ghost → place
[ ] Verify Farm connected via JS: farmBuilding.isConnected === true
[ ] Click Farm in idle mode → VillagerPanel → [+] assign workers (need ceil(villagers/3) to break even)
[ ] Wait 2–3s unpaused for villager to arrive, then pause
[ ] Confirm via JS: farmBuilding.assignedVillagers >= 1 (quest task fires on VILLAGERS_CHANGED)
[ ] Lumbermill: scan ghost for green position near forest cluster → place (no road/workers needed for First Quest)
```

---

## Timing Budget (from TH placement)
- 0s: TH placed, 4 villagers, food=80
- 100s: food hits 0 → HUNGRY warning
- 115s: HUNGRY penalty kicks in (×0.5 production)
- 165s: STARVING starts (×0.25, villager departures begin)
- **Farm must be PRODUCING (connected + workers assigned) before 100s**
- With pausing the game: effectively unlimited time — **ALWAYS PAUSE** between steps
