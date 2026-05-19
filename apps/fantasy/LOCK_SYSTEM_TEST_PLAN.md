# Player Lock System — Test Plan
Branch: `feat/player-lock-system` → merge target: `main`
Migration: `016_lock_system.sql`

Log results in `TEST_RESULTS.md` using the failure template at the bottom of that file.

---

## Deployment Checklist (run before testing)

Run from the project root:

```bash
supabase db push
```

Then confirm all of the following in the Supabase dashboard **SQL Editor**:

```sql
-- 1. current_price column exists on players
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'players' AND column_name = 'current_price';
-- Expected: 1 row, data_type = numeric

-- 2. lockable_players VIEW is gone
SELECT viewname FROM pg_views WHERE viewname = 'lockable_players';
-- Expected: 0 rows

-- 3. Partial unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'one_lock_per_player';
-- Expected: 1 row

-- 4. lock_player RPC exists
SELECT proname FROM pg_proc WHERE proname = 'lock_player';
-- Expected: 1 row

-- 5. unlock_player RPC exists
SELECT proname FROM pg_proc WHERE proname = 'unlock_player';
-- Expected: 1 row

-- 6. current_price backfill (should equal price for all existing players)
SELECT id, price, current_price FROM players WHERE price <> current_price;
-- Expected: 0 rows (backfill was run in the migration)
```

All six checks must pass before proceeding to functional testing.

---

## Scenario 1 — lock_player RPC — Happy Path

Run via Supabase SQL Editor (substitute real team_id and player_id values).

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Call `SELECT lock_player(<team_id>, <player_id>)` on a player that no team holds as 'locked' | Returns `{"success":true,"refunded_teams":[]}` |
| 1.2 | Query `SELECT slot_type, is_locked FROM team_players WHERE team_id=<team_id> AND player_id=<player_id>` | `slot_type = 'locked'`, `is_locked = true` |
| 1.3 | Call `lock_player(<team_id>, <player_id>)` again for the same team/player (idempotent) | Returns `{"success":true,"refunded_teams":[]}` — no duplicate row, no error |
| 1.4 | Call `lock_player` for a player not yet in the team's `team_players` at all | A new `team_players` row is inserted; `acquisition_price` equals the player's `current_price` |

---

## Scenario 2 — lock_player RPC — FCFS Conflict

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Team A calls `lock_player(<team_a_id>, <player_id>)` — succeeds (1.1 above) | `{"success":true,...}` |
| 2.2 | Team B calls `lock_player(<team_b_id>, <player_id>)` for the same player | Returns `{"success":false,"reason":"already_locked"}` |
| 2.3 | Query `team_players` for `player_id` WHERE `slot_type = 'locked'` | Only one row, owned by Team A |

---

## Scenario 3 — lock_player RPC — Max Locks Gate

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Give a test team 10 locked rows (via SQL: `UPDATE team_players SET slot_type='locked', is_locked=true WHERE team_id=<id> LIMIT 10`) | 10 rows with `slot_type='locked'` |
| 3.2 | Call `lock_player(<team_id>, <new_player_id>)` with no swap param | Returns `{"success":false,"reason":"max_locked_no_unlock"}` |
| 3.3 | Call `lock_player(<team_id>, <new_player_id>, <existing_locked_player_id>)` (swap form) | Returns `{"success":true,...}`; swapped-out player has `slot_type='free'`, `is_locked=false`; new player has `slot_type='locked'` |

---

## Scenario 4 — lock_player RPC — Free-Holder Refund

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Two teams (A and B) each hold Player X as `slot_type = 'free'` (simulate post-auction) — note their `budget_remaining` | Note starting budgets |
| 4.2 | Team C calls `lock_player(<team_c_id>, <player_x_id>)` | Returns `{"success":true,"refunded_teams":[{"team_id":<A>,"refunded":<price>},{"team_id":<B>,"refunded":<price>}]}` |
| 4.3 | Query `team_players` for Player X | Only Team C's row remains, with `slot_type='locked'` |
| 4.4 | Query `budget_remaining` for Teams A and B | Each increased by the `acquisition_price` of their deleted row |

---

## Scenario 5 — unlock_player RPC

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Call `SELECT unlock_player(<team_id>, <player_id>)` on a locked player | Returns `{"success":true}` |
| 5.2 | Query `team_players` for that row | `slot_type = 'free'`, `is_locked = false` |
| 5.3 | Call `unlock_player` again on the same (now free) player | Returns `{"success":true}`, no error (idempotent, no row updated — acceptable) |
| 5.4 | After unlock, another team can now call `lock_player` for the same player | Succeeds — partial unique index no longer blocks it |

---

## Scenario 6 — one_lock_per_player Index (DB-level guard)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | With Team A already holding `player_id=X, slot_type='locked'`, attempt raw SQL: `INSERT INTO team_players(team_id, player_id, slot_type, is_locked, acquisition_price) VALUES (<team_b_id>, X, 'locked', true, 9.0)` | Fails with `unique_violation` on `one_lock_per_player` |
| 6.2 | Insert the same player as `slot_type='free'` for Team B | Succeeds — index predicate only covers `slot_type = 'locked'` |

---

## Scenario 7 — usePlayers Lockable Filter

Open the app at `/fantasy/` (dev server: `pnpm dev:fantasy`).

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Navigate to `/auction` | Player grid shows only players with `current_price >= 8.5` (LOCK_PRICE_THRESHOLD) |
| 7.2 | In Supabase, set one player's `current_price = 7.0` (below threshold) | That player disappears from the auction grid on next refresh |
| 7.3 | Set the player's `current_price = 9.0` (above threshold) | Player reappears in the auction grid |

---

## Scenario 8 — Auction — Locked-Count Bid Gate

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Log in as a user whose team has fewer than 10 locked players | Bid inputs on player cards are active |
| 8.2 | With team at exactly 10 locked players (update via SQL), attempt to place a bid | UI shows: "Your squad already has 10 locked players — the maximum allowed." Bid is not submitted |

---

## Scenario 9 — Auction — current_price Persists After Resolution

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Complete a round resolution in which a player is won at bid £X | `players.current_price` for that player is updated to £X |
| 9.2 | Re-check the auction grid | Winning player's price reflects the new `current_price` |
| 9.3 | Start a new round; lockable filter still works | Players re-evaluated against LOCK_PRICE_THRESHOLD using the updated `current_price` |

---

## Scenario 10 — Market.jsx — Lock Decision Prompt (Post-Buy)

Navigate to `/market` after acquiring a lockable player (current_price >= 8.5).

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Buy a lockable player (price >= 8.5M) | Lock decision modal appears: "Lock this player?" with player name and explanation |
| 10.2 | Click "Lock" in the modal | `lock_player` RPC is called; player appears with lock icon in MyTeam; success toast shown |
| 10.3 | Buy a second lockable player; click "Don't lock" | Player acquired as free (`slot_type='free'`); no lock icon in MyTeam |
| 10.4 | Buy a non-lockable player (price < 8.5M) | No lock decision modal; player added as free directly |
| 10.5 | With team at MAX_LOCKED (10), buy a lockable player and open the modal | Swap picker appears showing existing locked players; lock button is disabled until one is selected |
| 10.6 | Select a swap target and click "Lock (swap)" | Previously locked player becomes free; new player becomes locked; UI updates |
| 10.7 | With team at MAX_LOCKED and no swap selected, observe modal | Inline message "At max locks — pick one to unlock first." is visible; Lock button is disabled |

---

## Scenario 11 — MyTeam.jsx — Lock / Unlock Buttons

Navigate to `/my-team`.

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Locked player row | "Unlock" button visible; no "Lock" button |
| 11.2 | Click "Unlock" | Confirm dialog appears; confirm → `unlock_player` called; player row updates to free; toast: "[Name] unlocked — now free." |
| 11.3 | Free lockable player row (price <= 8.5M displayed) | "Lock" button visible |
| 11.4 | Click "Lock" | Lock modal opens; confirm → `lock_player` called; toast: "[Name] locked." |
| 11.5 | Free non-lockable player (price > 8.5M) | No lock/unlock button shown |
| 11.6 | At MAX_LOCKED: click "Lock" on a free lockable player | Swap picker appears inside the modal; gate message shown |
| 11.7 | `lock_player` returns `already_locked` (another team beat us) | Error toast: "Another team just locked [Name]." Modal closes. Row stays free. |
| 11.8 | Lock count display | Footer of squad table shows "X / 10 locked" with correct count |

---

## Scenario 12 — Nudge Banner

| Step | Action | Expected |
|------|--------|----------|
| 12.1 | Log in; team has 0–7 locked players | Yellow nudge banner appears: "You have X locked players — consider locking more…" |
| 12.2 | Click the dismiss button (×) on the banner | Banner disappears for the session |
| 12.3 | Lock players until count reaches 8 | Banner does not appear (threshold is `lockedCount < 8`) |
| 12.4 | Refresh page with < 8 locked players | Banner reappears (not persisted across refreshes — dismissed state is in-memory) |

---

## Scenario 13 — Realtime Subscription

| Step | Action | Expected |
|------|--------|----------|
| 13.1 | Open `/my-team` in Browser A (User A) and `/my-team` in Browser B (User B) | Both pages load with their respective squads |
| 13.2 | In Supabase, directly update a `team_players` row belonging to User A's team | User A's MyTeam page updates without a manual refresh |
| 13.3 | User B locks a player that User A also holds as free | User A's row for that player updates automatically (free → freed/removed depending on refund logic) |

---

## Known Pre-existing Bugs (out of scope for this branch)

These bugs exist in the codebase but are not addressed by the lock system. Do not fail these scenarios — note them as blocked by open bugs.

| Bug | Affects | Detail |
|-----|---------|--------|
| Bug 4 | Transfers.jsx | `budgetValid` miscalculated |
| Bug 5 | MyTeam.jsx / Transfers.jsx | `isGameLocked` does not auto-refresh when a match starts |
| Bug 6 | Transfers.jsx | No position validation on transfers |

---

## Security Note — lock_player Auth Scope

The `lock_player` function is `SECURITY DEFINER` and does not validate that the calling user owns `p_team_id`. A malicious user could theoretically call `supabase.rpc('lock_player', { p_team_id: <someone_elses_id>, ... })` and lock/refund on behalf of another team. Verify whether this is exploitable in the current RLS setup, and consider adding `PERFORM ... FROM teams WHERE id = p_team_id AND user_id = auth.uid()` as an ownership check inside the function.

---

## Post-Test Steps

1. Log all failures in `TEST_RESULTS.md` using the template at the bottom of that file.
2. If all scenarios pass (or failures are pre-existing bugs only): merge `feat/player-lock-system` → `main`.
3. Open a new branch (`fix/bugs-4-5-6`) to address the remaining open bugs.
