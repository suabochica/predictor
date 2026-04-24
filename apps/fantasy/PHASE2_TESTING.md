# Phase 2 — Build Summary, Known Issues & Testing Guide

## What Was Built

### Database
| Migration | What it adds |
|---|---|
| `004_auction_state_rls.sql` | RLS on `auction_state` — all authenticated users can SELECT; only admins can INSERT/UPDATE/DELETE |

### AuctionContext additions (`src/context/AuctionContext.jsx`)
| Function | Detail |
|---|---|
| `getHighestBid(playerId)` | Filters bids to current round, sorts by amount desc then `created_at` asc — first bidder wins ties |
| `placeBid(playerId, amount, userId)` | Inserts bid into Supabase; blocks if user already has 10 active bids this round |
| `startAuction()` | Sets `status='active'`, `current_round=1`, `round_started_at=NOW()` |
| `pauseAuction()` | Sets `status='paused'` |
| `resumeAuction()` | Sets `status='active'`, resets `round_started_at=NOW()` |
| `completeAuction()` | Sets `status='completed'` |
| `nextRound()` | Increments `current_round`, resets `round_started_at=NOW()` |
| `resolveRound()` | Marks `is_winning=true` on each winner, upserts into `team_players`, deducts `acquisition_price` from `budget_remaining`; returns `{ resolved, errors }` |

All `auction_state` writes propagate to every connected client via Supabase Realtime immediately.

### Components & Pages
| File | What it does |
|---|---|
| `src/components/auction/AuctionTimer.jsx` | Derives remaining time from `round_started_at` on a 1s interval (never drifts); colour-shifts emerald → yellow (≤30s) → red (≤10s) with a progress bar |
| `src/pages/Admin.jsx` | Auction controls (start/pause/resume/complete), two-step "Resolve & Next Round" with winner preview table, live bids table, full player pool reference |
| `src/pages/Auction.jsx` | Timer + bid counter header, My Bids live panel (leading/outbid per player), position filter tabs (All/GK/DEF/MID/FWD), player card grid with per-card bid input and min-bid enforcement |

---

## Known Issues

### 1. Real-time bids lose joined data
Bids arriving via Supabase Realtime are raw rows — the `users(display_name)` and `players(name, position, price)` join is only present on the initial fetch.

**Affected surfaces:**
- Admin live bids table: player name shows as `Player #ID` for bids received after page load
- Auction Room: top bid leader name shows as `?` for real-time bids

**Not affected:** My Bids panel (resolves player info from `usePlayers()` directly).

**Fix path:** After each Realtime INSERT, do a targeted re-fetch of that single bid with the join, then merge into state.

---

### 2. Budget deduction is client-side (race condition risk)
`resolveRound()` reads `team.budget_remaining` from Supabase then subtracts in JavaScript. If two resolution calls ran concurrently the second read could be stale, producing the wrong balance.

Safe for now (manual, single-admin). Before any multi-admin or automated scenario, move the deduction into a Postgres function in `003_functions.sql`.

---

### 3. Max-10-bids has no database constraint
The 10-bid-per-round limit is enforced in `placeBid()` using local state. A user with direct Supabase access (e.g. via the API) could bypass it.

Acceptable for a private league. To harden: add a `CHECK` constraint or Postgres trigger on `auction_bids`.

---

### 4. `resolveRound()` skips winners with no team row
If a winning user has no row in the `teams` table, their player is skipped and an error is shown to the admin. The round still does not advance (admin must fix and retry).

**Guard needed:** Ensure all participants create their team before the auction starts. There is currently no UI enforcement of this.

---

### 5. Re-running `resolveRound()` double-deducts budget
`team_players` upsert uses `ignoreDuplicates: true` so roster entries won't duplicate. However `budget_remaining` is deducted again on every run. Do not confirm resolution twice on the same round.

---

### 6. Won players have no visual distinction in the Auction Room
Players already won in a previous round continue to appear in the grid with no indication. There is no "available / won" state on player cards yet.

**Decision needed before Phase 3:** Hide won players, grey them out, or badge them with the winner's name and acquisition price.

---

## Pre-Test Setup Checklist

Complete all of these before running any test scenarios.

- [ ] Supabase project created and `.env` filled in (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] All 4 migrations run in order (`001` → `002` → `003` → `004`) via Supabase SQL editor
- [ ] `seed.sql` run (creates the single `auction_state` row with `status='pending'`)
- [ ] Players imported — paste `sample_players.csv` contents into the `players` table or run the insert manually
- [ ] Realtime enabled on `auction_bids` and `auction_state` tables in Supabase dashboard (Database → Replication)
- [ ] **Admin user created:** register normally, then in Supabase Table Editor set `users.is_admin = true` for that account
- [ ] **Regular test user created:** register a second account (leave `is_admin = false`)
- [ ] Both users must have a row in the `teams` table — either via a "Create Team" UI (not built yet) or insert manually:
  ```sql
  INSERT INTO teams (user_id, name, budget_remaining)
  VALUES ('<user-uuid>', 'Team Name', 105.0);
  ```
- [ ] Dev server running: `npm run dev` from `fantasy/`

---

## Test Scenarios

### 1. Authentication & Route Guards

| Step | Action | Expected |
|---|---|---|
| 1.1 | Visit `/auction` while logged out | Redirected to `/login` |
| 1.2 | Visit `/admin` while logged out | Redirected to `/login` |
| 1.3 | Log in as regular user, visit `/admin` | Redirected to `/dashboard` |
| 1.4 | Log in as admin user, visit `/admin` | Admin panel loads |
| 1.5 | Log out | Redirected to home, all protected routes inaccessible |

---

### 2. Auction Controls (Admin)

Log in as admin and navigate to `/admin`.

| Step | Action | Expected |
|---|---|---|
| 2.1 | Observe initial state | Status badge shows `pending`, round shows `—`, only "Start Auction" button visible |
| 2.2 | Click "Start Auction" | Status → `active`, Round → `1`, `round_started_at` shows current time, buttons change to Pause / Resolve & Next Round / Complete |
| 2.3 | Click "Pause" | Status → `paused`, buttons change to Resume / Complete |
| 2.4 | Click "Resume" | Status → `active`, `round_started_at` resets to now (timer restarts) |
| 2.5 | Open `/auction` in a second browser tab (same admin or another user) | Status changes from step 2.2–2.4 appear in the second tab without refreshing |

---

### 3. AuctionTimer

With auction active, observe the timer on `/auction`.

| Step | Action | Expected |
|---|---|---|
| 3.1 | Watch timer immediately after start | Counts down from `round_duration_seconds` (default 180 = 3:00), colour is emerald |
| 3.2 | Wait or set `round_duration_seconds` to a small value (e.g. 45s) via Supabase editor | At ≤30s remaining, timer turns yellow |
| 3.3 | Continue watching | At ≤10s remaining, timer turns red |
| 3.4 | Admin clicks Resume (resets `round_started_at`) | Timer jumps back to full duration immediately in both tabs |

---

### 4. Placing Bids

Log in as the regular user and navigate to `/auction` with the auction active.

| Step | Action | Expected |
|---|---|---|
| 4.1 | Observe player cards | Each shows listed price, "No bids yet", and an input field with min-bid placeholder |
| 4.2 | Enter a value **below** the listed price and click Bid | Inline error: `Min bid: £X.X` |
| 4.3 | Enter a valid amount (≥ listed price) and click Bid | Bid button shows `…` while submitting, then clears input on success |
| 4.4 | Observe the card after bid placed | Card shows "✓ Leading — Your bid: £X.X" badge; bid input disappears |
| 4.5 | Observe My Bids panel | Panel appears with the player row showing "Leading" in emerald and `1/10 slots` |
| 4.6 | Bid on 9 more players (total 10) | 10th bid accepted, bid counter shows `10/10` |
| 4.7 | Attempt to bid on an 11th player | Bid input is hidden; "Max bids reached for this round." message shown |

---

### 5. Real-time Bid Updates

Run two browser sessions simultaneously — one as admin (at `/admin`), one as regular user (at `/auction`).

| Step | Action | Expected |
|---|---|---|
| 5.1 | Regular user places a bid on Player A | Admin's Live Bids table updates immediately without refresh — Player A appears with top bid and `1 bid` |
| 5.2 | Admin places a higher bid on the same player (via direct Supabase insert or second user account) | Regular user's card for Player A updates: My Bids panel shows "✗ Outbid £X.X" |
| 5.3 | Regular user out-bids back | My Bids panel flips back to "Leading" |

---

### 6. Tie-break Behaviour

Two users bid the exact same amount on the same player.

| Step | Action | Expected |
|---|---|---|
| 6.1 | User A bids £10.0 on Player B | User A is leading |
| 6.2 | User B bids £10.0 on Player B (same amount, later timestamp) | User A remains leading (first bidder wins); User B's card shows "✗ Outbid £10.0" |

---

### 7. Round Resolution

With at least 2 players having bids, log in as admin at `/admin`.

| Step | Action | Expected |
|---|---|---|
| 7.1 | Click "Resolve & Next Round →" | Confirmation panel opens below controls |
| 7.2 | Review winner preview table | Each player shows correct top bid and winner name |
| 7.3 | Click "Cancel" | Panel closes, no data changed |
| 7.4 | Click "Resolve & Next Round →" again, then "Confirm & Advance to Round 2" | Button shows "Resolving…", then panel closes |
| 7.5 | Check `auction_state` in Supabase | `current_round = 2`, `round_started_at` updated |
| 7.6 | Check `auction_bids` in Supabase | Winning bids have `is_winning = true` |
| 7.7 | Check `team_players` in Supabase | Won players appear with correct `team_id`, `acquisition_price`, `is_locked = false`, `slot_type = 'free'` |
| 7.8 | Check `teams` in Supabase | `budget_remaining` reduced by the acquisition price for each winner |
| 7.9 | Observe `/auction` | Round counter updates to Round 2, timer resets |

---

### 8. Resolution — Error Cases

| Step | Action | Expected |
|---|---|---|
| 8.1 | Delete a winner's `teams` row in Supabase, then trigger resolution for a round they won | Error panel appears: "Winner has no team registered." Round does NOT advance |
| 8.2 | Restore the team row, click Confirm again | Resolves cleanly (winning bid already marked, `upsert` skips duplicate team_players row, budget deducted once more — known issue #5) |
| 8.3 | Resolve a round where no bids were placed | Confirmation panel shows "No bids were placed this round." Confirm advances round cleanly with no DB writes |

---

### 9. RLS Policies

| Step | Action | Expected |
|---|---|---|
| 9.1 | As regular user, attempt to update `auction_state` directly via Supabase JS client in browser console: `supabase.from('auction_state').update({ status: 'completed' }).eq('id', 1)` | Returns RLS error, no change made |
| 9.2 | As regular user, attempt to insert a bid with another user's `user_id` | Returns RLS error (`Users can insert own bids` policy blocks it) |
| 9.3 | As admin, perform the same update | Succeeds |

---

## Decisions Required Before Phase 3

| Decision | Options | Impact |
|---|---|---|
| Won players in Auction Room | Hide / grey out / badge with winner info | Affects Auction.jsx and `team_players` query |
| Team creation flow | On registration automatically / separate setup page | Blocks resolution if users have no team row |
| Scoring system | Define points per matchday result | Required before Standings page is meaningful |
| Knockout bracket seeding | Admin tool / manual SQL / auto-generate from standings | Required before `/bracket` is useful |
