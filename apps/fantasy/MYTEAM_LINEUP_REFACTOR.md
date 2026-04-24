# My Team — Lineup System Refactor Plan

> Read this before touching any code. Execute in order.

---

## Problem summary

1. **Empty slots are not clickable** — `EmptySlot` (pitch) and `EmptyBenchSlot` (bench) are plain `<div>`s with no `onClick`. Selecting a player and clicking an empty slot does nothing.
2. **Formation enforcement blocks valid actions** — `doSwap` and `canSave` check that the XI exactly matches the chosen formation. This prevents saving any lineup that doesn't perfectly fit a pre-selected formation string.
3. **Formation picker is disconnected from reality** — the user sets a formation string separately from who's actually in the XI, creating a mismatch state.

---

## Desired behaviour

### Buying players → auto-placement
- Player won at auction or bought on market → added to **starters** if starters < 11
- **GK exception**: if a GK is already in starters, any new GK goes to **bench** instead
- Once starters = 11, all new buys go to **bench**
- This means a user mid-auction sees their bought players already in the XI, no manual assignment needed

### Formation — derived, not picked
- **Remove `FormationPicker` entirely**
- Formation is calculated live from the actual starters: count DEF / MID / FWD → label is `"${def}-${mid}-${fwd}"`
- Pitch rows (FWD row, MID row, DEF row, GK row) always reflect actual starter positions
- No mismatch warning ever needed — formation always matches reality

### Swapping
- Click player A (starter, bench, or unassigned) → selected (highlighted)
- Click player B → swap their positions (starter↔starter, starter↔bench, bench↔bench all work)
- Click an **empty pitch slot** with a player selected → move selected player into starters
- Click an **empty bench slot** with a player selected → move selected player into bench
- Deselect button / click same player again → cancel selection

### Save constraints (the only hard rules)
1. Exactly **1 GK** in starting XI
2. A **captain** is set
3. Captain must be a starter

Partial lineups (fewer than 11 starters, fewer than 4 bench) **can be saved** — a user mid-auction needs to be able to save their current state.

---

## Files to change

| File | What changes |
|------|-------------|
| `src/pages/MyTeam.jsx` | Main logic overhaul (see below) |
| `src/components/team/LineupGrid.jsx` | EmptySlot → clickable button; remove formation prop; derive rows from starters |
| `src/components/team/BenchList.jsx` | EmptyBenchSlot → clickable button |
| `src/components/team/FormationPicker.jsx` | **Delete** (or leave file but stop importing it) |
| `src/lib/formations.js` | Keep `parseFormation` (used for display label); `validateLineup` / `canSubstitute` no longer called |

---

## Detailed changes

### `MyTeam.jsx`

#### State — remove
```js
const [formation, setFormation] = useState('4-3-3');  // REMOVE — derived now
```

#### Derive formation from starters (replaces state)
```js
const derivedFormation = (() => {
  const def = starters.filter(p => p.position === 'DEF').length;
  const mid = starters.filter(p => p.position === 'MID').length;
  const fwd = starters.filter(p => p.position === 'FWD').length;
  return `${def}-${mid}-${fwd}`;
})();
```

#### `buildDefault()` — new logic
Replace the current 4-3-3 hard-coded build with:
```js
function buildDefault(squad) {
  const sorted = [...squad].sort((a, b) => b.price - a.price);
  const starters = [];
  const bench = [];
  let hasGkInXI = false;

  for (const player of sorted) {
    if (starters.length >= 11) {
      bench.push(player);
      continue;
    }
    if (player.position === 'GK') {
      if (hasGkInXI) { bench.push(player); continue; }
      hasGkInXI = true;
    }
    starters.push(player);
  }

  const captain = starters[0] ?? null;
  return { starters, bench, captainId: captain?.id ?? null };
}
```
Note: **no `formation` returned** — it's derived.

#### `loadLineup()` — formation inference
Currently infers formation from saved starters — this block can be removed entirely since formation is now always derived.

#### `handleFormationChange` — **delete**

#### `doSwap()` — remove ALL formation validity checks
Remove the two blocks:
```js
if (newStarters.length === 11 && !isLineupValidForFormation(newStarters)) { ... }
```
Swaps are always allowed. The only thing `doSwap` should check is the rolling lockout (game started).

#### New handlers for empty slots
```js
function handleEmptySlotClick() {
  // Empty pitch slot clicked — move selected player into starters
  if (!selectedPlayer) return;
  if (starters.some(s => s.id === selectedPlayer.id)) {
    setSelectedPlayer(null);
    return; // already a starter
  }
  setStarters([...starters, selectedPlayer]);
  setBench(bench.filter(b => b.id !== selectedPlayer.id));
  setSelectedPlayer(null);
  setSwapError(null);
}

function handleEmptyBenchSlotClick() {
  // Empty bench slot clicked — move selected player into bench
  if (!selectedPlayer) return;
  if (bench.some(b => b.id === selectedPlayer.id)) {
    setSelectedPlayer(null);
    return; // already on bench
  }
  if (starters.some(s => s.id === selectedPlayer.id)) {
    setStarters(starters.filter(s => s.id !== selectedPlayer.id));
    if (captainId === selectedPlayer.id) setCaptainId(null);
  }
  setBench([...bench, selectedPlayer]);
  setSelectedPlayer(null);
  setSwapError(null);
}
```

#### `isLineupValidForFormation` — **delete**

#### `canSave` — new check
```js
const gkCount = starters.filter(p => p.position === 'GK').length;
const canSave = gkCount === 1 && captainId !== null;
// (partial lineups are saveable — no requirement for exactly 11/4)
```

#### Render — remove
- `<FormationPicker>` component
- Formation mismatch warning block
- Pass `derivedFormation` (not `formation`) to `LineupGrid`
- Pass `onEmptySlotClick={handleEmptySlotClick}` to `LineupGrid`
- Pass `onEmptyBenchSlotClick={handleEmptyBenchSlotClick}` to `BenchList`
- Pass `hasSelected={!!selectedPlayer}` to both (for highlighting empty slots)

#### Save button hint text — update
```
{gkCount !== 1 && 'Need exactly 1 GK in starting XI. '}
{!hasCaptain && 'Select a captain. '}
```

---

### `LineupGrid.jsx`

#### `EmptySlot` — make clickable
```jsx
function EmptySlot({ label, onClick, isTargetable }) {
  return (
    <button
      onClick={onClick}
      disabled={!isTargetable}
      className={`w-[68px] min-h-[68px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
        isTargetable
          ? 'border-emerald-400/60 bg-emerald-900/20 hover:bg-emerald-900/40 cursor-pointer'
          : 'border-emerald-700/40 cursor-default'
      }`}
    >
      <span className={`text-[10px] font-semibold ${isTargetable ? 'text-emerald-400' : 'text-emerald-700'}`}>
        {isTargetable ? '+ here' : label}
      </span>
    </button>
  );
}
```

#### `PositionRow` — receive and pass down new props
Add `onEmptyClick` and `hasSelected` props, pass to each `EmptySlot`.

#### `LineupGrid` — receive new props
- Add `onEmptySlotClick` and `hasSelected` props
- Remove `formation` prop — derive rows from starters directly:
```js
const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
for (const p of starters) byPos[p.position]?.push(p);
// required counts come from actual starters + 1 empty slot if incomplete
```
- For empty slot count: show 1 empty slot per position row if that position has 0 players (so there's always somewhere to drop a player). Don't try to show formation-expected empty slots.

Actually, simpler rule for empty slots in a row:
```js
// Show empty slots = max(0, expected - actual) where expected comes from
// the derived formation of current starters (not a picker)
// OR just: always show 1 empty slot at the bottom of any row if starters < 11
```

Simplest approach: show **one** empty slot at the end of the row with the fewest players (or just always show a catch-all empty zone at the bottom). Actually even simpler: show empty slots only when `starters.length < 11`, one per row that has fewer than its "natural" count. Given formation is derived, just show actual players grouped by position — no empty slots in position rows. Instead, show a single "+ Add to XI" empty slot at the bottom of the pitch when `starters.length < 11`.

**Revised approach for empty slots on pitch**: rather than per-row empty slots (which are confusing when formation is fluid), show a single empty slot row at the bottom labelled "Add to XI" when starters < 11. This is cleaner.

---

### `BenchList.jsx`

#### `EmptyBenchSlot` — make clickable
```jsx
function EmptyBenchSlot({ order, onClick, isTargetable }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold text-gray-600">{order}</span>
      <button
        onClick={onClick}
        disabled={!isTargetable}
        className={`w-[68px] min-h-[68px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
          isTargetable
            ? 'border-blue-400/60 bg-blue-900/20 hover:bg-blue-900/40 cursor-pointer'
            : 'border-gray-700 cursor-default'
        }`}
      >
        <span className={`text-[10px] ${isTargetable ? 'text-blue-400 font-semibold' : 'text-gray-600'}`}>
          {isTargetable ? '+ here' : 'Empty'}
        </span>
      </button>
    </div>
  );
}
```

Add `onEmptyBenchSlotClick` and `hasSelected` props to `BenchList`, pass to each `EmptyBenchSlot`.

---

## What does NOT change

- `saveLineup()` — DB write logic is unchanged (starters, bench, captain rows)
- `loadLineup()` — DB read logic unchanged; just remove the formation-inference block
- Rolling lockout logic — unchanged
- Captain warning — unchanged
- `BenchList` reorder arrows — unchanged
- Unassigned players panel — unchanged (still shows players not in XI or bench)
- `PlayerSlot.jsx` — unchanged
- All hooks (`useTeam`, `useLeague`) — unchanged

---

## Testing after the change

1. Win/buy players → navigate to My Team → confirm they appear in XI automatically (not all on bench)
2. Select a player → click an empty pitch slot → player moves to XI
3. Select a player → click an empty bench slot → player moves to bench
4. Swap starter ↔ bench → still works
5. Try to save with 0 GKs → blocked with "Need exactly 1 GK" message
6. Try to save with 2 GKs in XI → blocked
7. Try to save with 1 GK, no captain → blocked with "Select a captain"
8. Formation label on pitch updates live as you swap positions in/out
9. Then resume Phase 4 testing (calculate standings) — lineups saved here are what standings calc reads

---

## After this is done

Return to Phase 4 testing at step 4 (run `02_test_lineups.sql` with correct matchday ID, or save lineup via UI, then calculate standings).
