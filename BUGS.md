# Fantasy App — Known Bugs

Bugs identified but not yet fixed. Each entry has enough context for a new Claude session to locate and fix it without needing prior conversation history.

---

## Bug 4 — `budgetValid` never enforced in Transfers

**File:** `apps/fantasy/src/pages/Transfers.jsx` (~line 186)

**Problem:** `budgetValid` is computed — it checks both that `budgetAfter >= 0` AND that the squad's total player value stays within the 105M `TOTAL_BUDGET` cap. But it is never read again. The only guard that actually runs in `executeTransfer()` is `budgetAfter < 0`, which only catches the simpler "budget goes negative" case.

**Impact:** A team can execute a transfer that pushes their total squad value over 105M with no error or warning.

**Fix needed:** Use `budgetValid` (or its equivalent logic) to gate the Confirm button's `disabled` prop and block the transfer in `executeTransfer()` if the total budget cap would be exceeded.

---

## Bug 5 — `isGameLocked` doesn't auto-refresh when a match starts

**File:** `apps/fantasy/src/pages/MyTeam.jsx`

**Problem:** `isGameLocked(playerId)` checks whether `game_started_at` is in the past by comparing against a `Date.now()` snapshot taken at render time. There is no interval or realtime subscription that re-evaluates this as time passes. A player whose match kicks off while the user has the page open will remain shown as "unlocked" until a manual page refresh.

**Impact:** Users can potentially make lineup changes for players whose matches have already started.

**Fix needed:** Add a `setInterval` (e.g. every 30s) or a Supabase realtime subscription on the matches/game times data to re-trigger the locked check. Alternatively, derive `now` inside a `useState` that ticks via `setInterval`.

---

## Bug 6 — No position validation on transfers

**File:** `apps/fantasy/src/pages/Transfers.jsx`

**Problem:** A user can transfer out any player and bring in any player regardless of position. There is no check preventing, for example, transferring out a GK and bringing in a FWD, which would leave the squad without a goalkeeper.

**Impact:** Squad composition rules (must have at least 1 GK, positional limits) can be violated through transfers.

**Fix needed:** After selecting `playerIn`, validate that the resulting squad still satisfies position constraints — at minimum, that there is still at least 1 GK. The existing `mustBuyGk` pattern in `Market.jsx` can serve as a reference for how to implement this check.
