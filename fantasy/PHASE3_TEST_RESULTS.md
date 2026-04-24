# Test Results — Phase 3

Log failures here as you find them. Passing tests do not need to be recorded.
One block per failure. Leave the template at the bottom for reference.

---

## Phase 1 Failures (carried forward for reference)

### FAIL — Phase 1 / Scenario 5.4 (Sidebar — Transfer window badge)
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

---

### FAIL — Phase 1 / Scenario 8.3 (LeagueContext — hardcoded budget for teamless user)
**Step:** 8.3
**Action:** Log in with a user who has no `teams` row
**Expected:** App does not crash; budget shows blank or zero
**Actual:** App does not crash, but dashboard shows `105.0M` budget remaining — a hardcoded default value is displayed instead of blank or zero
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  The app falls back to a hardcoded default of 105.0 when no `teams` row exists for the logged-in user. This could mislead users into thinking they have a budget when no team has been set up.

---

### FAIL — Phase 1 / Scenario 12 (scoring.js — NaN on partial stats)
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

---

## Phase 2 Failures (carried forward for reference)

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
  Steps 3.2, 3.3, 3.4 — NOT TESTED. Blocked by this bug. Re-test once timer fix is applied.

---

### FAIL — Phase 2 / Scenario 5.3 (Real-time Bid Updates — cannot out-bid back)
**Step:** 5.3
**Action:** Regular user attempts to out-bid back after being outbid on a player
**Expected:** Regular user can place a higher bid; My Bids panel flips back to "Leading"
**Actual:** Once a user has been outbid, the bid input is no longer shown on the player card — only an "✗ Outbid — Your bid: £X.X" message is displayed. There is no way to place a follow-up bid on the same player in the same round.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  May be intentional design (one bid per player per round — commit and wait). The test guide expects out-bidding back to be possible. Needs a design decision: if one-bid-per-player-per-round is intentional, the test guide should be updated; if re-bidding should be allowed, the card needs to re-show the input when the user is outbid.

---

### FAIL — Phase 2 / Scenario 5 (Security — teamless user can place bids)
**Step:** N/A — discovered during Scenario 5 testing
**Action:** Logged in as a user with no row in the `teams` table and navigated to `/auction`
**Expected:** User without a team should not be able to participate in the auction
**Actual:** User can access the auction page and place bids successfully. No guard or error prevents participation.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  Related to Known Issue #4 in the Phase 2 build summary ("resolveRound() skips winners with no team row"). A user with no team winning a bid will cause resolution to fail. Fix: check for a valid `teams` row before allowing bid submission, or block access to `/auction` entirely if no team exists.

---

### FAIL — Phase 2 / Scenario 6 (Duplicate bid on same player by same user)
**Step:** N/A — discovered during Scenario 6 testing
**Action:** Due to a brief UI update delay, the same user placed two bids on the same player (Theo Hernández) in the same round
**Expected:** A user should only be able to hold one active bid per player per round
**Actual:** Both bids were accepted and both appear in My Bids as "Leading" for the same player, consuming 2 of the 10 available slots
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  The 10-bid limit is enforced in `placeBid()` using local state, but there is no check preventing a second bid on a player the user has already bid on. A race condition during UI update allows a second submission before the first bid is reflected in state. Fix: add a per-player-per-user uniqueness check in `placeBid()` before inserting, or add a unique constraint on `(user_id, player_id, round_number)` in `auction_bids`.

---

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
  Matches Known Issue #5 in the Phase 2 build summary: `resolveRound()` was triggered twice — first attempt failed due to teamless user errors, second attempt succeeded, but budget was deducted on both runs. The `team_players` upsert uses `ignoreDuplicates: true` so roster entries were not duplicated, but `budget_remaining` was deducted again on the retry. Do not trigger resolution twice on the same round until this is fixed.

---

### FAIL — Phase 2 / Scenario 8.2 (Resolution Error — winning bid with no joined user data)
**Step:** 8.2
**Action:** Add a `teams` row for a user who won a bid placed via Realtime (after page load), then attempt resolution again
**Expected:** Resolution unblocked once winner has a team row
**Actual:** Adding a `teams` row did not unblock resolution. Bids placed via Realtime after page load lose their joined user data (Known Issue #1). `resolveRound()` receives these bids with winner = `?` and cannot match to any team row. Only workaround was to manually delete the affected bids from Supabase.
**Console errors:**
  N/A
**Network response (if relevant):**
  N/A
**Notes:**
  Compounding of Known Issues #1 and #4. Until real-time bids re-fetch their joined data, any bid placed after page load that wins a round will permanently block resolution.

---

### FAIL — Phase 2 / Scenario 8 (Won players still appear as biddable in next round)
**Step:** N/A — discovered during Scenario 8 testing
**Action:** Players won by admin team in a previous round continued to appear in the player grid in the following round with active bid inputs
**Expected:** Won players should be visually distinguished or removed from the grid (Known Issue #6)
**Actual:** Won players appear identically to available players. Attempting to bid on them returns a `TypeError: Failed to fetch` error with no user-friendly message.
**Console errors:**
  TypeError: Failed to fetch
**Network response (if relevant):**
  N/A
**Notes:**
  Two issues: (1) Known Issue #6 — no visual distinction for won players. (2) The `Failed to fetch` error on bid submission for an already-won player is unhandled — the app should show a meaningful error. Fix: catch fetch errors in `placeBid()` and display a user-friendly message; separately, hide, grey out, or badge won players.

---

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
  The RLS policy on `auction_state` (migration 004_auction_state_rls.sql) should restrict UPDATE to admins only. Either the policy was not applied correctly, or the anon key bypasses it. Verify in Supabase dashboard under Authentication → Policies that the UPDATE policy has a `is_admin = true` check. Also verify that RLS is enabled on the table (not just policies defined).

---

## Phase 3 Test Run — 2026-04-14

### Scenario 1 — My Team Basic Squad View

PASS

| Step | Result |
|------|--------|
| 1.1 — Visit `/my-team` while not enrolled | ✅ |
| 1.2 — Visit `/my-team` enrolled, 0 players | ✅ |
| 1.3 — Visit `/my-team` with players in squad | ✅ |
| 1.4 — Full squad table at bottom | ✅ |

---

### Scenario 2 — My Team Formation

FAIL — see failure blocks below

| Step | Result |
|------|--------|
| 2.1 — Click different formation pill | ✅ |
| 2.2 — Yellow warning banner | ❌ Warning fires even when players match formation; blocks same-position swaps and adding to empty slots |
| 2.3 — Switch to identical formation | ❌ Warning always present |

---

### Scenario 3 — My Team Swap & Captain

FAIL — see failure blocks below

| Step | Result |
|------|--------|
| 3.1 — Click a starter | ✅ |
| 3.2 — Click same player again | ✅ |
| 3.3 — Swap compatible starter/bench | ❌ Bench-to-bench works; field↔bench not possible |
| 3.4 — Swap incompatible position (formation break) | ⚠️ Blocks swap but fires too broadly — blocks valid swaps too |
| 3.5 — Make Captain | ✅ |
| 3.6 — Click bench when starter selected | ⚠️ Hint text appears but swap not executed |
| 3.7 — Click two bench players | ✅ |

---

### Scenario 4 — My Team Bench Reorder

PASS

| Step | Result |
|------|--------|
| 4.1 — ← on bench player #1 (disabled) | ✅ |
| 4.2 — → on bench player #1 | ✅ |
| 4.3 — ← on bench player #4 | ✅ |

---

### Scenario 5 — My Team Save Lineup

FAIL — blocked by Scenario 3 swap bug (cannot populate starting XI)

| Step | Result |
|------|--------|
| 5.1 — Save valid lineup | ❌ Blocked — cannot fill starting XI via swaps |
| 5.2 — Check `lineups` table in Supabase | ❌ Blocked |
| 5.3 — Reload `/my-team` | ❌ Blocked |
| 5.4 — Save with no captain | ❌ Blocked |
| 5.5 — Save with only 10 starters | ❌ Blocked |

---

### Scenario 6 — Standings Pre-tournament

PARTIAL PASS — see failure block below

| Step | Result |
|------|--------|
| 6.1 — Visit `/standings` with no standings rows | ⚠️ "No scores yet" text present; regular users only see their own row, not all participants |
| 6.2 — Rank badges | ⚠️ All show gold for regular user (only sees themselves at rank 1); admin sees gold + grey correctly |
| 6.3 — MD1-MD4 columns | ✅ |

---

### Scenario 7 — Standings With Scores

PARTIAL PASS — 7.3 and 7.4 deferred (only 2 teams enrolled); see failure block below

| Step | Result |
|------|--------|
| 7.1 — Reload after inserting test rows | ⚠️ Works for admin; regular users still only see their own row |
| 7.2 — Sort order | ✅ |
| 7.3 — Bracket split (8+ participants) | ⏭ Deferred — only 2 teams enrolled |
| 7.4 — Top-3 rank badge colours | ⏭ Deferred — only 2 teams enrolled |

---

### Scenario 8 — Market Guards

PASS

| Step | Result |
|------|--------|
| 8.1 — Visit `/market` with auction not completed | ✅ |
| 8.2 — Visit `/market` with auction completed | ✅ |

---

### Scenario 9 — Market Filters

PASS

| Step | Result |
|------|--------|
| 9.1 — Default grid (Hide owned on, all positions) | ✅ |
| 9.2 — GK position filter | ✅ |
| 9.3 — Name search | ✅ |
| 9.4 — Max price filter | ✅ |
| 9.5 — Affordable only | ✅ |
| 9.6 — Uncheck Hide owned | ✅ |
| 9.7 — Players >8.5M badge | ✅ |
---

### Scenario 10 — Market Purchase Flow

PASS

| Step | Result |
|------|--------|
| 10.1 — Click Buy | ✅ |
| 10.2 — Click Cancel in modal | ✅ |
| 10.3 — Click Confirm | ✅ |
| 10.4 — Check `team_players` in Supabase | ✅ |
| 10.5 — Check `teams.budget_remaining` | ✅ |
| 10.6 — Try to buy same player again | ✅ Shows "In Squad" |
| 10.7 — Fill squad to 15 | ✅ |
| 10.8 — Buy player over budget | ✅ |

---

### Scenario 11 — Transfers No Active Window

PASS

| Step | Result |
|------|--------|
| 11.1 — Visit `/transfers` with no active window | ✅ |

---

### Scenario 12 — Transfers Window Open

PARTIAL PASS — locked player functionality not yet implemented (12.4–12.6 deferred)

| Step | Result |
|------|--------|
| 12.1 — Reload after inserting window | ✅ |
| 12.2 — Click player in My Squad | ✅ |
| 12.3 — Click same player again | ✅ |
| 12.4 — Click a locked player | ⏭ Not implemented yet |
| 12.5 — Observe Available Players for locked player | ⏭ Not implemented yet |
| 12.6 — Select free slot player out | ⏭ Not implemented yet |

---

### Scenario 13 — Transfers Executing a Swap

PARTIAL PASS — see failure blocks below

| Step | Result |
|------|--------|
| 13.1 — Select player out + player in | ✅ |
| 13.2 — Budget impact (cheaper in) | ✅ |
| 13.3 — Budget impact (pricier in) | ✅ |
| 13.4 — Click Confirm Transfer | ⚠️ Transfer executes but counter does not increment |
| 13.5 — Check `team_players` | ✅ |
| 13.6 — Check `teams.budget_remaining` | ✅ |
| 13.7 — Check `transfers` table | ✅ |
| 13.8 — Transfer history section | ❌ Not showing |
| 13.9 — Use all 7 transfers | ❌ Blocked — counter not incrementing, limit not enforced |

---

### Scenario 14 — Bracket Pre-league

PARTIAL PASS — 14.2–14.4 deferred (only 2 teams enrolled)

| Step | Result |
|------|--------|
| 14.1 — Visit `/bracket` with no rows, <8 teams | ✅ "Bracket not seeded yet" message shown |
| 14.2 — Visit `/bracket` with 8+ teams | ⏭ Deferred — only 2 teams enrolled |
| 14.3 — With 12 teams (relegation bracket) | ⏭ Deferred — only 2 teams enrolled |
| 14.4 — Round 2 and 3 preview columns | ⏭ Deferred — only 2 teams enrolled |

---

### Scenario 15 — Bracket Live Data

| Step | Result |
|------|--------|
| 15.1 — Reload after inserting knockout_matches rows | |
| 15.2 — Winner row styling | |
| 15.3 — Match without result | |
| 15.4 — Match with `placement` set | |
| 15.5 — All finals with winner_id + placement | |

---

<!-- ============================================================
     FAILURE BLOCKS — add one per failure found in Phase 3
     ============================================================ -->

### FAIL — Phase 3 / Scenario 15.1 (Bracket — one team name resolves as TBD)
**Step:** 15.1
**Action:** Insert a `knockout_matches` row with `team_a_id` and `team_b_id` set, reload `/bracket`
**Expected:** Both team names shown in the match card (e.g. "Benja" vs "Sergio")
**Actual:** One team name displays correctly; the other shows "TBD". Visible in screenshot: Match A shows "(1) TBD — 45" and "(8) Sergio — 38", indicating `team_a` resolved as TBD despite a valid `team_a_id` being set.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  The `useKnockout` hook uses aliased FK joins (`team_a`, `team_b`, `winner`) to resolve two FKs pointing at the `teams` table. One of the aliases is likely still misconfigured or the query is not returning the joined name for `team_a`. Check the PostgREST select string in `useKnockout.js` — both aliases must use the correct FK constraint name, e.g. `team_a:teams!knockout_matches_team_a_id_fkey(id, name)`.

---

### FAIL — Phase 3 / Scenario 15.2 (Bracket — winner styling not applied)
**Step:** 15.2
**Action:** Insert a `knockout_matches` row with `winner_id` set, reload `/bracket`
**Expected:** Winner row shows "W" badge in emerald and score in emerald; loser row is greyed out
**Actual:** No winner styling applied — both rows appear identical regardless of `winner_id` being set. Screenshot confirms Match A has a winner_id (Sergio, 38pts lost; TBD/Benja, 45pts won) but no visual distinction is rendered.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  Likely related to the 15.1 name resolution bug — if `team_a` resolves as null/TBD, the winner comparison (`winner_id === team_a.id`) will fail silently and no styling is applied. Fix 15.1 first, then re-test winner styling. If styling still doesn't apply after the name fix, check that `winner_id` is included in the `useKnockout` select query and that the component reads it correctly.

---

### FAIL — Phase 3 / Scenario 13.4 (Transfers — counter does not increment after successful transfer)
**Step:** 13.4
**Action:** Click "Confirm Transfer" with a valid player-out / player-in selection
**Expected:** Transfer executes; "transfers used" counter increments (e.g. 0/7 → 1/7)
**Actual:** Transfer executes correctly (team_players, budget_remaining, and transfers table all update) but the counter displayed in the window banner does not increment. It stays at 0/7 regardless of how many transfers have been made.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  The counter likely reads from local state that is not refreshed after a successful transfer, rather than re-querying the `transfers` table. Fix: after a successful confirm, re-fetch the transfer count for the current window from the `transfers` table and update the displayed count. This bug also blocks 13.9 (7-transfer limit enforcement) since the limit check is presumably driven by the same counter.

---

### FAIL — Phase 3 / Scenario 13.8 (Transfers — history section not showing)
**Step:** 13.8
**Action:** After completing a transfer, check the transfer history section on `/transfers`
**Expected:** New row visible showing window badge, player out, player in, price difference
**Actual:** Transfer history section does not show any rows, even after a confirmed transfer that correctly wrote to the `transfers` table in Supabase.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  Data is being written to the `transfers` table correctly (13.7 passes), so this is a read/display issue. Known Issue #1 in the Phase 3 build summary flags that `useTransfers` may not resolve player names correctly due to PostgREST FK disambiguation — the query `players!player_out_id(name)` may be returning no data, causing the history rows to fail to render. Fix: update `useTransfers` to use aliased FK syntax: `.select('*, player_out:players!transfers_player_out_id_fkey(name), player_in:players!transfers_player_in_id_fkey(name)')`.

---

### FAIL — Phase 3 / Scenario 2.2 & 2.3 (My Team Formation — warning banner misfires)
**Step:** 2.2 / 2.3
**Action:** Switch to a formation where current players already satisfy the position counts; also switch back to the original formation
**Expected:** No warning when players match the formation; warning only when starters don't fill the new requirements
**Actual:** Warning appears regardless — even when the current squad fully satisfies the selected formation. Warning never clears. Same-position swaps are also blocked (e.g. swapping one DEF starter for another DEF on the bench), and players cannot be moved into empty slots.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  The formation validation logic appears to check raw player counts against formation requirements incorrectly — likely counting all squad players rather than only assigned starters, or failing to account for same-position equivalence. The warning should re-evaluate after every swap and clear when the lineup is valid. Same-position swaps (DEF↔DEF, MID↔MID) must always be permitted without triggering a warning.

---

### FAIL — Phase 3 / Scenario 3.3 & 3.6 (My Team Swap — field↔bench swaps not working)
**Step:** 3.3 / 3.6
**Action:** Select a starter, then click a bench player (compatible position) to swap them
**Expected:** Starter moves to bench, bench player moves to starting XI; no warning if formation remains valid
**Actual:** Bench-to-bench reordering works, but field↔bench swaps in either direction do not execute. Clicking a bench player when a starter is selected shows the "Click another player to swap" hint but no swap is performed.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  The swap handler appears to handle bench↔bench correctly but does not cover the starter↔bench case. Expected behaviour per design: when two players are selected, the system should check whether a valid lineup exists after the swap (i.e. all position counts still satisfy the active formation). If valid — execute the swap. If not (e.g. swapping in a second GK) — show the formation-break error and block. Currently the check appears to always block field↔bench swaps regardless of validity.

---

### FAIL — Phase 3 / Scenario 6.1 & 7.1 (Standings — regular users only see their own row)
**Step:** 6.1 / 7.1
**Action:** Log in as a regular (non-admin) user and visit `/standings`
**Expected:** Full league table visible to all authenticated users; all enrolled participants shown
**Actual:** Regular users only see their own row. Admin sees all participants correctly.
**Console errors:**
  None observed
**Network response (if relevant):**
  GET `.../teams?select=*` — likely returns only the current user's team due to RLS
**Notes:**
  Migration 007 (`007_standings_public_read.sql`) adds an "Authenticated users can view all teams" policy. This migration may not have been applied, or the policy is not broad enough. Verify in Supabase → Authentication → Policies that the `teams` table has a SELECT policy allowing any authenticated user to read all rows (not just their own). Once fixed, re-test 6.2 rank badges with a regular user — they currently all show gold because only one row (rank 1) is visible.

---

### FAIL — Phase 3 / Auction — Round resolution blocked by RLS on team_players
**Step:** N/A — occurs on "Confirm & Advance to Round 2"
**Action:** Admin clicks "Confirm & Advance to Round 2" after Round 1 bidding
**Expected:** Winners assigned their players, budget deducted, round advances to Round 2
**Actual:** Resolution errors panel appears — round does not advance. Every winning player triggers: "Team assignment failed: new row violates row-level security policy for table `team_players`". Affected players: #5, #9, #11, #12, #14, #15, #17, #18, #22, #23, #25 (all 11 players in the round).
**Console errors:**
  new row violates row-level security policy for table "team_players" (repeated for each player)
**Network response (if relevant):**
  N/A
**Notes:**
  This is a persistent regression — auction resolve has never successfully completed. The RLS policy on `team_players` is blocking the INSERT that `resolveRound()` performs. Possible causes: (1) `resolveRound()` runs under the anon/user key rather than a service role key, so it is subject to RLS and the policy does not permit cross-user inserts by the calling identity; (2) the RLS policy on `team_players` only allows a user to insert rows where `team_id` matches their own team, but `resolveRound()` inserts on behalf of multiple winners; (3) migration for the correct admin-bypass policy was not applied or is misconfigured. Recommended fix: `resolveRound()` should use a Supabase service role key (bypasses RLS entirely) or be moved to a Postgres function with `SECURITY DEFINER`. Consider resetting and re-seeding the DB after fixing the policy before re-testing.

---

### FAIL — Phase 3 / Auction — Bidding not blocked when round timer reaches zero
**Step:** N/A — observed during Round 1 testing
**Action:** Round timer counts down to 00:00
**Expected:** Bid inputs are disabled/hidden for all users; no new bids accepted until admin starts next round
**Actual:** Users can continue placing bids after the timer reaches zero. No lockout is applied to the bid UI or the `placeBid()` function when the round has expired.
**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  Two layers of fix needed: (1) UI layer — when `timeRemaining === 0`, disable all bid inputs and show a "Round ended — waiting for admin" message on the player cards; (2) backend/DB layer — `placeBid()` should check `auction_state.round_started_at + round_duration_seconds` before inserting and reject bids placed after the round has expired, to prevent race conditions even if the UI is bypassed.

---

## Failure Template

Copy this block for each failure and fill it in:

```
### FAIL — Phase 3 / Scenario [number and name]
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
