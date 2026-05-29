# Auction Live-Test Bugs — Round 2

Observed during live multi-user auction testing on 2026-05-29.

---

## [x] Bug A — Won players still appear in auction grid next round (partial fix)

### Symptom
After a round resolves and a player is awarded, the player re-appeared in the next round's
auction grid as "Contested" and could be bid on, causing a DB constraint error at resolve time:
> "Team assignment failed: duplicate key value violates unique constraint 'one_player_one_team'"

### Root cause
`resolveRound()` called `fetchBids()` but not `fetchOwnedPlayerIds()`. Realtime INSERT on
`team_players` was unreliable.

### Fix applied (partial)
- Added `fetchOwnedPlayerIds()` alongside `fetchBids()` at end of `resolveRound()`.
- Added a `useEffect` in AuctionContext watching `auctionState.current_round` that calls
  `fetchBids()` + `fetchOwnedPlayerIds()` whenever the round counter changes.
- Switched `Auction.jsx` to `usePlayers({ withOwner: true })` so each player carries
  `owner: { teamName, userId } | null` from a DB join, removing the need to filter by Set.
- Added `ownerLabel` to `AuctionPlayerRow`: "★ In your squad" (gold) or "Owned: [team]" (grey).
- `canBid` set to false for owned players.

### Still broken after fix (observed 2026-05-29)
Screenshots confirm two remaining failures:

**C1 — `withOwner` join not returning data:**
Kylian Mbappé is in Benja's acquired list (1/15 squad) but appears in the auction grid
**without** any "★ In your squad" label and with an active Bid button. The `player.owner`
field is null even though `team_players` has an entry for this player.
Likely cause: Supabase RLS on `team_players` or `teams` blocks the nested join when called
from the `players` table context, OR the FK relationship `team_players.player_id → players.id`
is not registered in Supabase schema, so the reverse join doesn't work.

**C2 — `useEffect` on `current_round` not triggering `fetchBids()`:**
In round 2, Bellingham/Haaland/Vinicius Jr all show "⚡ Contested" (correctly — round 1 bids
exist in state) but **"No bids"** in the Top Bid column (round 2 carry-over bids are missing).
"My Bids — Round 2" shows 0/10 for every user including the round-1 leader (Sergio 10.8M on
Bellingham). This means `bids` state was never refreshed after the round advanced on non-admin
clients. The `useEffect([current_round])` either isn't firing or `fetchBids()` is being called
but the carry-over bids aren't being returned.

---

## [x] Bug B — Bid state doesn't refresh after placing a bid

### Fix applied
- Added `refreshBids` to `useAuction()` destructure in `Auction.jsx`.
- Call `refreshBids()` in the success branch of `handleBid`.

### Status
Appeared to help based on prior test. Not re-tested after round 2 changes.

---

## [ ] Bug C — Owned-player labels not working (root cause investigation needed)

### Issues (from 2026-05-29 screenshots)

#### C1 — `withOwner` join produces null owner for all players
`usePlayers({ withOwner: true })` query: `players.select('*, team_players(team_id, teams(id, name, user_id))')`.
The `p.team_players` array is empty or not populated even for players definitely in `team_players`.
Result: `player.owner` is always null → no "In your squad" / "Owned by" labels shown.

**Fix to try:**
Instead of embedding the join in the `players` query (which requires a recognized FK from
`team_players → players` in Supabase), do a **separate fetch** in `AuctionContext`:

```js
// New state in AuctionContext:
const [playerOwners, setPlayerOwners] = useState(new Map());
// Map<playerId, { teamName: string, userId: string }>

async function fetchPlayerOwners() {
  const { data } = await supabase
    .from('team_players')
    .select('player_id, teams(id, name, user_id)');
  const map = new Map();
  for (const row of data ?? []) {
    if (row.teams) {
      map.set(row.player_id, { teamName: row.teams.name, userId: row.teams.user_id });
    }
  }
  setPlayerOwners(map);
}
```

Expose `playerOwners` in context. Call `fetchPlayerOwners()` on mount and at end of
`resolveRound()` and in the `current_round` useEffect.

In `Auction.jsx`, replace `player.owner` lookup with `playerOwners.get(player.id)`.
Revert `usePlayers` back to `usePlayers()` (no `withOwner` needed).

#### C2 — Carry-over bids not in `bids` state on non-admin clients after round advance
The `useEffect([current_round])` added in AuctionContext isn't producing the carry-over bids
in the `bids` state. Need to investigate whether:
- The realtime `auction_state` UPDATE fires and sets `current_round` to 2 on non-admin clients
- The useEffect dep array sees the change
- `fetchBids()` is actually called and returns the round-2 carry-over bids

**Fix to try:**
Change the realtime `auction_state` UPDATE handler to call `fetchBids()` directly, rather
than relying on the useEffect chain:

```js
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'auction_state' },
  (payload) => {
    setAuctionState(payload.new);
    // Immediately re-fetch bids on any auction state change (round advance, etc.)
    fetchBids();
    fetchPlayerOwners();
  }
)
```

This is more direct and avoids any possible useEffect batching or closure issue.

Also: **change the realtime `auction_bids` INSERT handler** to call `fetchBids()` (full re-fetch)
instead of appending a single row. The async single-row re-fetch pattern is fragile:

```js
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_bids' },
  () => {
    fetchBids();  // full re-fetch, not single-row append
  }
)
```

---

## Execution plan for Bug C (next session)

1. **Revert** `usePlayers({ withOwner: true })` back to `usePlayers()` in `Auction.jsx` —
   remove the `player.owner` approach entirely.

2. **Add `playerOwners`** state + `fetchPlayerOwners()` to `AuctionContext`. Expose in value.
   Call on mount, in `resolveRound()` end, and in realtime `auction_state` UPDATE handler.

3. **Fix realtime handlers** in `AuctionContext`:
   - `auction_state` UPDATE → call `fetchBids()` + `fetchPlayerOwners()` directly (not via useEffect).
   - `auction_bids` INSERT → call `fetchBids()` (full re-fetch, drop single-row append).

4. **Use `playerOwners`** in `Auction.jsx` to compute `ownerLabel` per player.

5. **Keep `ownedPlayerIds`** for `getContestFloor()` — still needed.

**Commit message:** `fix(fantasy): reliable owned-player labels and carry-over bid display`
