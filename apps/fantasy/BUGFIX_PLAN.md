# Plan — Fix Auction & Market Bugs (1–7)

## How To Use This Plan Across Sessions

This plan is designed to be executed **one bug per session**. Each bug below ends with a **STOP** marker — after finishing that bug, commit the work and start a fresh session. The new session reads this plan from the repo (see Step 0) and resumes at the next un-checked bug.

**Step 0 — Persist this plan into the repo (do this first, in this session, right after plan approval):**
- Copy this file to `apps/fantasy/BUGFIX_PLAN.md` so any future session can read it without depending on `~/.claude/plans/`.
- Add an entry in `MEMORY.md` (auto-memory index) pointing at `apps/fantasy/BUGFIX_PLAN.md` and noting "execute one bug per session, commit between each".
- Commit `apps/fantasy/BUGFIX_PLAN.md` so it travels with the branch.

**Per-session protocol:**
1. Read `apps/fantasy/BUGFIX_PLAN.md`.
2. Find the next un-checked `[ ]` bug heading.
3. Execute only that bug — do not touch later bugs.
4. Run the verification checklist for that bug.
5. Check the box (`[x]`) in `apps/fantasy/BUGFIX_PLAN.md`.
6. Commit (one bug = one commit) with message `fix(fantasy): bug N — <short title>`.
7. **STOP.** Do not start the next bug. End the session.

---

## Context

Seven bugs in the fantasy app's auction and market flows:
- Auction never enforces budget/slot constraints when placing a bid (`placeBid` only blocks ≥10 bids per round and same-player dupes within state).
- Won players leak back into auction view as "Contested" because realtime UPDATE payloads may not propagate `is_winning`.
- Round-to-round carry-over has no mechanism to preserve a leading bid; `getContestFloor` returns a minimum only, never re-inserts the leader.
- Market hides owned players entirely (no transparency) and has no swap flow.
- No default lineup is persisted when auction ends.

Bug 8 (lineup redesign) is explicitly out of scope; leave a TODO when touching MyTeam.

User-confirmed design choices:
- **Bug 2** — auto-INSERT a real bid in the new round on behalf of the previous leader.
- **Bug 6** — swap UI appears only when squad is full (15/15); buy-flow stays for free slots.
- **Bug 4** — DB-level UNIQUE constraint + UI guard for duplicate bids.

---

## Migration 021 (executed as part of Bug 4/5 session, NOT separately)

`supabase/migrations/021_auction_constraints.sql`:
```sql
ALTER TABLE auction_bids
  ADD COLUMN is_carryover BOOLEAN DEFAULT false;

ALTER TABLE auction_bids
  ADD CONSTRAINT auction_bids_unique_user_player_round
  UNIQUE (user_id, player_id, round_number);
```
Note: a hard CHECK on `team_players` row count per team would need a trigger; we rely on `placeBid` + `resolveRound` validation instead.

---

## Recommended Execution Order

The order matters: foundation pieces (DB constraints, extracted utility) come before features that use them.

- [x] **Bug 1** — Won players still show as "Contested"
- [x] **Bug 4 + Bug 5** — Effective budget + slot enforcement + dedup (includes migration 021)
- [ ] **Bug 2** — Auction carry-over between rounds (depends on migration 021's `is_carryover` column)
- [ ] **Bug 3** — Missing auction summary header (depends on Bug 4's effective-budget computation)
- [ ] **Bug 7** — Default lineup auto-created at auction end
- [ ] **Bug 6** — Market screen ownership + swap flow

Bugs 4+5 are bundled because they share `placeBid` validation logic and the same migration.

---

## [x] Bug 1 — Won players still show as "Contested"

**Files:** `apps/fantasy/src/context/AuctionContext.jsx`, `apps/fantasy/src/pages/Auction.jsx`

**Root cause:** `Auction.jsx:72` builds `wonPlayerIds` from `bids.filter(b => b.is_winning)`. Realtime UPDATE merge at `AuctionContext.jsx:33–36` replaces the bid row with `payload.new` — sparse payloads can drop `is_winning`.

**Fix:** Switch source of truth from `auction_bids.is_winning` to `team_players` (post-migration 019 has `UNIQUE(player_id)`, authoritative).

- In `AuctionContext.jsx`:
  - Add state `ownedPlayerIds: Set<number>`.
  - On mount, fetch `team_players(player_id)` (global, all teams).
  - Subscribe to realtime INSERT on `team_players` and add to the set.
  - Expose `ownedPlayerIds` in `value`.
  - At the end of `resolveRound()` (after the loop, line 226), call `refreshBids()` as a belt-and-suspenders sync.
- In `Auction.jsx`:
  - Replace `wonPlayerIds` (line 72) with `ownedPlayerIds` from context.
  - Filter logic at line 80 becomes `if (ownedPlayerIds.has(p.id)) return false;`.

**Verification:**
- Run `pnpm dev:fantasy`. Place two bids on a player, resolve a round with a single winner.
- Player must disappear from auction grid the same tick the resolve completes.
- "Contested" badge must NOT show for the awarded player.

**Commit message:** `fix(fantasy): bug 1 — hide won players from auction using team_players as source of truth`

**STOP — commit and end session.**

---

## [x] Bug 4 + Bug 5 — Effective budget + slot enforcement + dedup (bundled)

**Files:** `apps/fantasy/src/context/AuctionContext.jsx`, `apps/fantasy/src/pages/Auction.jsx`, new `supabase/migrations/021_auction_constraints.sql`

**Root cause:**
- `placeBid` (`AuctionContext.jsx:233`) — no budget math, no slot math.
- `resolveRound` deducts budget on award but never validates squad ≤ 15.
- Schema has no DB-level dedup.

**Fix — apply migration 021** (see top of plan). Run `supabase db push` (or apply manually) before code changes.

**Fix — bid-time validation in `placeBid`:**
- Change signature: `placeBid(playerId, amount, userId, teamSnapshot)` where `teamSnapshot = { budgetRemaining, squadSize }`.
- Logic to add (before the existing insert):
  ```
  const myActiveBidsThisRound = bids.filter(b =>
    b.user_id === userId && b.round_number === currentRound
  );
  const sumOfActive = myActiveBidsThisRound.reduce((s, b) => s + b.bid_amount, 0);
  const effectiveBudget = teamSnapshot.budgetRemaining - sumOfActive;
  const projectedSquad = teamSnapshot.squadSize + myActiveBidsThisRound.length + 1;

  if (projectedSquad > MAX_SQUAD_SIZE)
    return { error: 'No squad slots remain for new bids.' };
  if (amount > effectiveBudget)
    return { error: `Effective budget left: £${effectiveBudget.toFixed(1)}M.` };
  ```
- Wrap the insert in a try/catch — duplicate-key error (Postgres `23505`) → friendly message "Bid already placed for this round."

**Fix — caller side (`Auction.jsx:handleBid`):**
- Import `useTeam`; pass `{ budgetRemaining: team.budget_remaining, squadSize: teamPlayers.length }` into `placeBid`.
- Disable the bid button via existing `submitting: Set` (line 109) the moment click fires — already disables but verify wiring.

**Fix — resolveRound award-time safety net:**
- In `AuctionContext.jsx:resolveRound`, before the `team_players.upsert` (line 190), fetch the team's current `team_players` count. If ≥ 15, push an error into `errors[]` and skip the award. Protects against carry-over races.

**Verification:**
- Set up: squad 13/15, budget 15M.
  - Bid 5 on A → allowed (effective → 10M).
  - Bid 11 on B → blocked, error mentions effective budget.
  - Bid 8 on B → allowed (effective → 2M, slots → 0).
  - Bid 2 on C → blocked, error mentions slots.
- Spam-click bid button twice quickly → only one bid registered, second shows "Bid already placed" (DB rejected).
- Squad at 14, place 2 winning bids in same round → second is skipped at resolve with error in admin UI.

**Commit message:** `fix(fantasy): bugs 4+5 — enforce effective budget, slot limits, and dedup on bids`

**STOP — commit and end session.**

---

## [ ] Bug 2 — Auction carry-over between rounds (auto-insert leader's bid)

**Depends on:** Bug 4+5 (migration 021 adds `is_carryover` column).

**Files:** `apps/fantasy/src/context/AuctionContext.jsx`, `apps/fantasy/src/pages/Auction.jsx`

**Root cause:** `resolveRound` (`AuctionContext.jsx:153–161`) just records a contested player and continues — no bid propagates forward.

**Fix — in `resolveRound`, contested branch:**
- Compute leader using existing `getHighestBid(playerId)` (highest amount; earliest timestamp ties).
- INSERT into `auction_bids`:
  ```
  user_id: leader.user_id,
  player_id,
  bid_amount: leader.bid_amount,
  round_number: round + 1,
  is_carryover: true
  ```
- This INSERT must run BEFORE `nextRound()` advances `current_round` (do this inside `resolveRound`; `Admin.jsx:handleResolveAndAdvance` already calls `resolveRound` then `nextRound`).

**Fix — UI in `Auction.jsx`:**
- "My Bids" block (line 174): if a bid has `is_carryover === true`, render a small badge "Carried over from Round {round - 1}" next to the bid.
- The existing `placeBid` floor check (line 244) already enforces `amount > floor`, so subsequent bids in the new round behave correctly.

**Verification:**
- Two users (A, B). Round 1: A bids 8, B bids 8.5 on same player. Resolve round.
- Round 2 begins. UI shows B as the leading bidder with 8.5 already counted, "Carried over from Round 1" badge visible.
- No one bids in Round 2. Resolve Round 2 → player awarded to B at 8.5M; budget deducted; player disappears from auction.

**Commit message:** `fix(fantasy): bug 2 — auto carry-over leader's bid into next round`

**STOP — commit and end session.**

---

## [ ] Bug 3 — Missing auction summary header

**Depends on:** Bug 4+5 (shares effective-budget computation).

**Files:** `apps/fantasy/src/pages/Auction.jsx`

**Root cause:** `Auction.jsx` has no team-state panel between header and filters.

**Fix:** Add a summary section between page header (line 158) and "My Bids" (line 174). Data already available via `useTeam()` and `SQUAD_REQUIREMENTS` (`config/constants.js`).

Single panel, three columns desktop / stacked mobile:
- **Budget:** show both `team.budget_remaining` and `effectiveBudget` (from Bug 4 computation: `budget_remaining - sum(active bids this round)`).
- **Squad progress:** `{acquired}/15` acquired, `{15 - acquired}` free slots.
- **By position:** for each GK/DEF/MID/FWD render `{acquired}/{SQUAD_REQUIREMENTS[pos].squad}`; highlight in red if `acquired < required` AND `freeSlots < required - acquired` (can't satisfy).
- **Acquired list:** collapsible `<details>` with each owned player (position, name, acquisition price).

No new component needed unless it grows past ~80 lines; otherwise extract `components/auction/TeamSummary.jsx`.

**Verification:**
- With 13/15 players (1 GK, 4 DEF, 5 MID, 3 FWD): panel shows 2 free slots; "GK 1/2 ⚠", "DEF 4/5 ⚠", "MID 5/5 ✓", "FWD 3/3 ✓".
- Place a bid → effective budget updates in real time.
- Expand acquired list → all 13 players listed with prices.

**Commit message:** `fix(fantasy): bug 3 — add team summary panel to auction screen`

**STOP — commit and end session.**

---

## [ ] Bug 7 — Default lineup auto-created at auction end

**Files:** new `apps/fantasy/src/lib/defaultLineup.js`, `apps/fantasy/src/pages/MyTeam.jsx`, `apps/fantasy/src/pages/Admin.jsx`

**Root cause:** `completeAuction` only sets status. Default lineup logic (`buildDefault`) is buried inside `MyTeam.jsx:25–45`.

**Fix:**
1. **Extract** `buildDefault` from `MyTeam.jsx:25–45` to new file `apps/fantasy/src/lib/defaultLineup.js`. Export `buildDefaultLineup(squad)` returning `{ starters, bench, captainId }`. Keep the exact same logic (sort by price desc; force 2nd GK to bench; captain = most expensive starter).
2. **Update** `MyTeam.jsx` to import and use the extracted function. Delete the local copy.
3. **In `Admin.jsx:handleCompleteAuction`** (lines 50–63), after `completeAuction()` succeeds and BEFORE matchday activation:
   - Fetch all teams with their `team_players` joined to `players(*)`.
   - For each team:
     - If squad size < 15 → push warning to admin error state, skip.
     - If a lineup row already exists for `(team_id, matchday_id IS NULL)` → skip (idempotent).
     - Otherwise run `buildDefaultLineup(squad)` and INSERT 15 rows into `lineups`:
       - 11 starters: `is_starting: true, is_captain: (id === captainId), bench_order: null, matchday_id: null`
       - 4 bench: `is_starting: false, is_captain: false, bench_order: 1..4, matchday_id: null`
4. Existing `handleToggleActive` (`Admin.jsx:175–200`) will stamp these rows with the matchday id when first matchday activates — no change needed there.

Also add a TODO comment near `MyTeam.jsx:saveLineup` flagging Bug 8 (future lineup redesign).

**Verification:**
- Seed two test teams, one with 15 players, one with 14. Complete the auction via Admin.
- Check `lineups` table in Supabase:
  - Full-squad team: 15 rows with `matchday_id IS NULL`; 11 with `is_starting=true`, 4 with `is_starting=false` and `bench_order` 1–4; exactly 1 `is_captain=true`.
  - Short-squad team: 0 lineup rows; admin sees the warning.
- Activate first matchday → rows stamped with that `matchday_id`.
- Visit MyTeam as the full-squad user → lineup loads from DB (not via fallback).

**Commit message:** `fix(fantasy): bug 7 — auto-create default lineups when auction completes`

**STOP — commit and end session.**

---

## [ ] Bug 6 — Market screen ownership + swap flow

**Files:** `apps/fantasy/src/pages/Market.jsx`, `apps/fantasy/src/hooks/usePlayers.js`, `apps/fantasy/src/components/market/PlayerCard.jsx`, `apps/fantasy/src/components/market/FilterBar.jsx`

### Part A — show all players with owner labels

1. **`usePlayers.js`:** in `available: true` branch (lines 17–23), replace the exclusion with a LEFT JOIN:
   ```js
   query = supabase
     .from('players')
     .select('*, team_players(team_id, teams(id, name, user_id))');
   ```
   Map each player to attach `owner = team_players[0]?.teams ? { teamId, teamName, isMine: userId === ownerUserId } : null`.

2. **`Market.jsx`:** remove redundant `ownedIds` set (lines 25–28). Use `player.owner` directly.

3. **`PlayerCard.jsx`:** add prop `owner`. Render badge if `owner && !owner.isMine` → "Owned: {teamName}" + disabled button. If `owner.isMine` → keep existing "In Squad" label.

4. **`FilterBar.jsx`:** add boolean filter `freeAgentsOnly` (checkbox). In `Market.jsx`, if checked, filter out any player with `owner !== null`.

### Part B — swap flow (active only when squad is full)

Add at top of `Market.jsx` (above filter bar), visible only when `squadSize === MAX_SQUAD_SIZE`:

- "My Squad — pick one to offer" grid (mirror `Transfers.jsx:32–56`). Click sets `offerOut` state and highlights the card.
- When `offerOut` is set, PlayerCard buttons in the main grid change from "Buy" to "Swap with {offerOut.name}". Disabled for non-free-agents.
- Click → confirmation modal (reuse `Market.jsx:249–326`) showing budget-after preview: `budgetAfter = team.budget_remaining + offerOut.acquisition_price - incomingPlayer.price`.
- Confirm executes (mirror `Transfers.jsx:215–313`):
  1. DELETE `team_players` row for `offerOut`.
  2. INSERT `team_players` row for incoming player.
  3. UPDATE `teams.budget_remaining` to `budgetAfter`.
  4. Refresh squad + market.

No `transfers` log row, no transfer-counter — this is a pre-tournament free-agent swap.

**Verification:**
- Squad < 15: Only "Buy" buttons. Owned players (mine and others') visible. Other teams' players show team label + disabled button.
- Toggle "Free Agents Only": only un-owned players remain.
- Squad = 15: "Buy" buttons disabled. "My Squad" picker appears at top. Pick a player → main grid shows swap buttons. Pick a free agent → modal shows budget-after preview. Confirm → `team_players` updated, `teams.budget_remaining` updated, swap reflected immediately.

**Commit message:** `fix(fantasy): bug 6 — show all players with owner labels and add free-agent swap`

**STOP — commit and end session.**

---

## After All Bugs Done

- All 6 boxes (1, 4+5, 2, 3, 7, 6) checked in `apps/fantasy/BUGFIX_PLAN.md`.
- Run `pnpm dev:fantasy` and walk through the end-to-end scenarios in each bug's verification checklist.
- Update `apps/fantasy/MASTER_DOCUMENT.md` if any behavior diverged from spec.
- Update auto-memory (`MEMORY.md` entry) to mark this plan complete.
- Open PR with summary linking all 6 commits.

Bug 8 remains explicitly out of scope.
