# Test Results

Log failures here as you find them. Passing tests do not need to be recorded.
One block per failure. Leave the template at the bottom for reference.

---

## Phase 1 Test Run — 2026-04-04

### Scenario 1 — Registration
PASS

### Scenario 2 — Login & Session
PASS

### Scenario 3 — Route Guards
PASS

### Scenario 4 — Header
PASS

### Scenario 5 — Sidebar
### FAIL — Phase 1 / Scenario 5.4
**Step:** 5.4
**Action:** In Supabase, set a transfer window with `open_at <= NOW() <= close_at`
**Expected:** "Transfers open" badge appears in sidebar
**Actual:** Badge did not appear when updating `opens_at`/`closes_at` to straddle NOW(). App queries transfer windows using `&is_active=eq.true` — it checks the `is_active` boolean column, not the time range columns. Badge only appears when `is_active` is set to `true` directly.
**Console errors:**
  None
**Network response (if relevant):**
  GET `.../transfer_windows?select=*&is_active=eq.true` — returns empty when is_active=false, even if time range is current
**Notes:**
  The test guide assumes time-based logic but the implementation uses a boolean flag. Either the test guide or the implementation needs to be aligned. Workaround: set `is_active = true` directly in the Table Editor.

### Scenario 6 — MobileNav
PASS

### Scenario 7 — Dashboard
PASS

### Scenario 8 — LeagueContext

### FAIL — Phase 1 / Scenario 8.3
**Step:** 8.3
**Action:** Log in with a user who has no `teams` row
**Expected:** App does not crash; budget shows blank or zero
**Actual:** App does not crash, but dashboard shows `105.0M` budget remaining — a hardcoded default value is displayed instead of blank or zero
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  The app appears to fall back to a hardcoded default of 105.0 when no `teams` row exists for the logged-in user. This could mislead users into thinking they have a budget when no team has been set up.

Steps 8.1, 8.2, and 8.4 — IN PROGRESS

### Scenario 9 — usePlayers Filters
PASS (step 9.5 deferred to Phase 3 as documented)

### Scenario 10 — RLS Policies
PASS

- 10.1 — logged-in user can only read their own team ✅
- 10.2 — querying another user's team returns empty array ✅
- 10.3 — inserting into team_players with another user's team_id returns 403 RLS error ✅
- 10.4 — any authenticated user can read all players (25 returned) ✅
- 10.5 — non-admin insert into players returns 403 RLS error ✅
- 10.6 — admin insert verified via CSV import earlier in setup ✅
- 10.7 — fantasy_standings readable by authenticated user (empty table, no error) ✅
- 10.8 — matchdays readable by authenticated user (7 rows returned) ✅

### Scenario 11 — Database Functions
PASS

- 11.1 — FWD with 90 min, 1 goal, 1 assist, clean sheet = 9 pts ✅
- 11.2 — GK with 60 min, 4 saves, clean sheet = 7 pts ✅
- 11.3 — refresh_player_points updates total_points for all players in matchday ✅
- 11.4 — yellow card deducts 1 point (9 → 8) ✅
- 11.5 — red card deducts 3 points (9 → 6) ✅

### Scenario 12 — Lib Utilities

PASS with one bug and two test guide mismatches noted below.

#### scoring.js — calculatePlayerPoints
- GK, 90 min, clean sheet, 3 saves = 7 ✅
- FWD, 60 min, 2 goals, 1 assist = 13 ✅
- DEF, 45 min, 1 own goal = -1 ✅
- MID, 90 min, yellow card = 1 ✅
- Captain multiplier (10) = 20 ✅

### FAIL — Phase 1 / Scenario 12 — scoring.js
**Step:** 12 (scoring.js)
**Action:** Call `calculatePlayerPoints` with partial stats object (missing penalty_saves, penalty_misses etc.)
**Expected:** Function handles missing fields gracefully, defaults to 0
**Actual:** Returns `NaN` when optional fields like `penalty_saves`, `penalty_misses`, `own_goals` etc. are not provided
**Console errors:**
  None — silent NaN
**Network response (if relevant):**
  N/A
**Notes:**
  Function requires all stat fields to be present. Should use default values (e.g. `stats.penalty_saves ?? 0`) for optional fields to prevent NaN results.

#### formations.js
- `isValidFormation('4-3-3')` = true ✅
- `isValidFormation('5-5-0')` = false ✅
- `parseFormation('4-3-3')` = `{ GK: 1, DEF: 4, MID: 3, FWD: 3 }` ✅ (includes GK: 1 which is correct)

#### validation.js
- `validateBid(9.0, 8.5, null)` = `{ valid: true }` ✅
- `validateBid(8.0, 8.5, null)` = `{ valid: false }` with correct error ✅
- `validateBudget(110.0, 105.0)` = `{ valid: true }` ✅
- `validateBudget(50.0, 105.0)` = `{ valid: false }` with correct error ✅
- Note: test guide had incorrect parameter order for validateBid — third param is currentHighBid not budget. Function itself is correct.

#### utils.js
- `formatPrice(9.5)` = `9.5M` ✅ (test guide expected `£9.5` — implementation uses M suffix, no £ sign, intentional)
- `formatPoints(123)` = `+123` ✅ (test guide expected `123 pts` — format is intentionally different)
- `sortByTotalPoints` — function correct, sorts by `total_points` field descending ✅

### Scenario 13 — Hooks Deferred to Phase 3
No testing required yet — skip

---

## Phase 2 Test Run — 2026-04-05

### Scenario 1 — Authentication & Route Guards
PASS

### Scenario 2 — Auction Controls (Admin)
PASS

### Scenario 3 — AuctionTimer

### FAIL — Phase 2 / Scenario 3.1 (AuctionTimer — stuck at 00:00)
**Step:** 3.1
**Action:** With auction active, observe timer on `/auction`
**Expected:** Timer counts down from full duration (3:00), colour is emerald
**Actual:** Timer displays `00:00` and does not count down. `auction_state` confirmed correct in Supabase: `status=active`, `round_duration_seconds=180`, `round_started_at=2026-04-05 07:54:11.339`.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  Likely cause: timezone mismatch. Supabase returns `round_started_at` as a UTC timestamp without a `Z` suffix. If the timer component parses it with `new Date(round_started_at)`, JavaScript may treat it as local time, making the elapsed time calculation produce a value larger than `round_duration_seconds`, clamping remaining time to 0. Fix: ensure `round_started_at` is parsed as UTC (e.g. append `Z` if not present before passing to `new Date()`).

Steps 3.2, 3.3, 3.4 — NOT TESTED. Skipped due to timer being stuck at 00:00 (blocked by 3.1 bug above). Re-test once timer fix is applied.

### Scenario 4 — Placing Bids
PASS

**UX note:** "My Bids" panel title text is black on a dark background — hard to read. Should be white.

### Scenario 5 — Real-time Bid Updates

Steps 5.1 and 5.2 — PASS

### FAIL — Phase 2 / Scenario 5.3 (Real-time Bid Updates — cannot out-bid back)
**Step:** 5.3
**Action:** Regular user attempts to out-bid back after being outbid on a player
**Expected:** Regular user can place a higher bid; My Bids panel flips back to "Leading"
**Actual:** Once a user has been outbid, the bid input is no longer shown on the player card — only an "✗ Outbid — Your bid: £X.X" message is displayed. There is no way to place a follow-up bid on the same player in the same round. Tested with both admin and a second regular user doing the outbidding — same result in both cases.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  May be intentional design (one bid per player per round — commit and wait). The test guide expects out-bidding back to be possible. Needs a design decision: if one-bid-per-player-per-round is intentional, the test guide should be updated; if re-bidding should be allowed, the card needs to re-show the input when the user is outbid.

### FAIL — Phase 2 / Scenario 5 (Security — user with no team can place bids)
**Step:** N/A — discovered during Scenario 5 testing
**Action:** Logged in as a user with no row in the `teams` table and navigated to `/auction`
**Expected:** User without a team should not be able to participate in the auction
**Actual:** User can access the auction page and place bids successfully. No guard or error prevents participation.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  This is related to Known Issue #4 in the build summary ("resolveRound() skips winners with no team row"). A user with no team winning a bid will cause resolution to fail. A pre-auction guard should prevent teamless users from bidding. Fix: check for a valid `teams` row before allowing bid submission, or block access to `/auction` entirely if no team exists.

### Scenario 6 — Tie-break Behaviour

**Test guide mismatch — tie-break scenario not reachable by design.**
The UI enforces a minimum bid increment of £0.3 above the current top bid. Once any user places a bid, the next user's input is floored at `top_bid + 0.3`, making identical bids impossible through normal UI interaction. The tie-break logic in `getHighestBid()` (first bidder wins on equal amounts) is therefore untestable via the front-end and may never trigger in practice. Test guide should be updated to reflect this.

### FAIL — Phase 2 / Scenario 6 (Duplicate bid on same player by same user)
**Step:** N/A — discovered during Scenario 6 testing
**Action:** Due to a brief UI update delay, the same user was able to place two bids on the same player (Theo Hernández) in the same round
**Expected:** A user should only be able to hold one active bid per player per round
**Actual:** Both bids were accepted and both appear in My Bids as "Leading" for the same player, consuming 2 of the 10 available slots
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  The 10-bid limit is enforced in `placeBid()` using local state, but there is no check preventing a second bid on a player the user has already bid on. A race condition during UI update allows a second submission before the first bid is reflected in state. Fix: add a per-player-per-user uniqueness check in `placeBid()` before inserting, or add a unique constraint on `(user_id, player_id, round_number)` in the `auction_bids` table.

### Scenario 7 — Round Resolution

Steps 7.1, 7.2, 7.3, 7.4 — PASS

Steps 7.5, 7.6, 7.7 — PASS
- `auction_state`: round did not advance (stayed on Round 2) due to resolution errors from teamless user winning bids ✅
- `auction_bids`: winning bids correctly marked `is_winning = true` ✅
- `team_players`: 2 rows inserted with correct `team_id`, `acquisition_price`, `is_locked = false`, `slot_type = 'free'` ✅

### FAIL — Phase 2 / Scenario 7.8 (Round Resolution — double budget deduction)
**Step:** 7.8
**Action:** Check `teams.budget_remaining` after resolution
**Expected:** Budget reduced by £23.9 (£12.1 + £11.8), leaving £81.1 remaining from £105.0
**Actual:** Budget shows £57.2 — a reduction of £47.8, exactly double the correct amount
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  Matches Known Issue #5 in the build summary: `resolveRound()` was triggered twice — first attempt failed due to teamless user errors, second attempt succeeded, but budget was deducted on both runs. The `team_players` upsert uses `ignoreDuplicates: true` so roster entries were not duplicated, but `budget_remaining` was deducted again on the retry. Do not confirm resolution twice on the same round until this is fixed.

Step 7.9 — NOT TESTED. Timer stuck at 00:00 (blocked by Scenario 3.1 bug) — cannot verify timer resets on round advance.

### Scenario 8 — Resolution Error Cases

**Step 8.1 — PASS** (confirmed during Scenario 7 testing — error panel correctly shows "Winner has no team registered" and round does not advance)

**Step 8.2 — FAIL (blocked)** — Adding a `teams` row for the winning teamless user did not unblock resolution. Root cause: the winning bids were placed via Realtime after page load and lost their joined user data (Known Issue #1). `resolveRound()` receives these bids with winner = `?`, so it cannot match them to any team row regardless of whether one exists. The only workaround during testing was to manually delete the affected bids from Supabase. This is a compounding of Known Issues #1 and #4 — until real-time bids re-fetch their joined data, any bid placed after page load that wins a round will permanently block resolution.

**Step 8.3 — PASS** — Advancing a round with no bids placed works cleanly. Confirmation panel shows no winner rows, round advances with no DB writes.

### FAIL — Phase 2 / Scenario 8 (Won players still appear as biddable in next round)
**Step:** N/A — discovered during Scenario 8 testing
**Action:** Players won by the admin team in a previous round continued to appear in the player grid in the following round with active bid inputs
**Expected:** Won players should be visually distinguished or removed from the grid (noted as a pending decision in Known Issue #6)
**Actual:** Won players appear identically to available players. Attempting to bid on them returns a `TypeError: Failed to fetch` error with no user-friendly message.
**Console errors:**
  TypeError: Failed to fetch
**Network response (if relevant):**
  N/A
**Notes:**
  Two issues here: (1) Known Issue #6 — no visual distinction for won players, decision still pending. (2) The `Failed to fetch` error on bid submission for an already-won player is unhandled — the app should show a meaningful error message rather than a raw TypeError. Fix: catch fetch errors in `placeBid()` and display a user-friendly message; separately, resolve Known Issue #6 by hiding, greying out, or badging won players.

### UX Note — Auction one-bid-per-round mechanic
One-bid-per-player-per-round means a user who is outbid has no recourse until the next round. This may be intentional but has a significant gameplay implication: a user only loses a player if someone outbids them AND that higher bid goes unchallenged for a full round. Consider communicating this mechanic clearly in the UI (e.g. a tooltip or round summary explaining that leading bids at round end win the player).

### Scenario 9 — RLS Policies

Step 9.2 — PASS ✅ Regular user insert with another user's `user_id` blocked with RLS error: "new row violates row-level security policy for table auction_bids"

Step 9.3 — PASS ✅ Admin update of `auction_state` succeeds as expected

### FAIL — Phase 2 / Scenario 9.1 (RLS — regular user can update auction_state)
**Step:** 9.1
**Action:** As regular user, run `supabase.from('auction_state').update({ status: 'completed' }).eq('id', 1)` via Dashboard.jsx console test
**Expected:** Returns RLS error, no change made
**Actual:** Returns `ALLOWED - data:null` — update succeeds. Regular user can modify auction state directly.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  The RLS policy on `auction_state` (migration 004_auction_state_rls.sql) should restrict INSERT/UPDATE/DELETE to admins only. Either the policy was not applied correctly, or the anon key bypasses it. Verify in Supabase dashboard under Authentication → Policies that the UPDATE policy on `auction_state` has a `is_admin = true` check on the `users` table. Also check that RLS is enabled on the table (not just policies defined).

---

## Failure Template

Copy this block for each failure and fill it in:

```
### FAIL — Phase [1 or 2] / Scenario [number and name]
**Step:** [e.g. 7.4]
**Action:** [copy from the test table]
**Expected:** [copy from the test table]
**Actual:** [describe what actually happened]
**Console errors:**
  [paste verbatim — red errors from DevTools Console]
**Network response (if relevant):**
  [paste response body from DevTools Network tab]
**Notes:**
  [anything else that might help]
```
