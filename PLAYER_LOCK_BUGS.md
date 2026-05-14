# Player Lock System — Bug Tracker

Branch: `feat/player-lock-system`

---

## Bug Index

| # | Title | Area | Status |
|---|-------|------|--------|
| 1 | `usePlayers.js` hardcodes `8.5` instead of constant | Hook | 🔴 Open |
| 2 | `MAX_LOCKED_PLAYERS` / `MIN_LOCKED_PLAYERS` never enforced | Business logic | 🔴 Open |
| 3 | Auction doesn't restrict to lockable players (≤8.5M) | Acquisition lock | 🔴 Open |
| 4 | `budgetValid` in Transfers is miscalculated and inconsistently used | Transfers | 🔴 Open |
| 5 | `isGameLocked` doesn't auto-refresh when a match starts | Game lock | 🔴 Open |
| 6 | No position validation on transfers | Transfers | 🔴 Open |
| 7 | DB VIEW threshold (`8.5`) hardcoded separately from `constants.js` | DB / Constants | 🔴 Open |

---

## Detail

### Bug 1 — `usePlayers.js` hardcodes `8.5`
- **File**: `apps/fantasy/src/hooks/usePlayers.js:16`
- **Code**: `if (filters.lockable) query = query.lte('price', 8.5);`
- **Problem**: `LOCK_PRICE_THRESHOLD` is imported nowhere in this file. The value is duplicated manually. If the threshold changes in `constants.js`, this filter stays wrong silently.
- **Fix**: Import `LOCK_PRICE_THRESHOLD` from `constants.js` and use it here.
- **Status**: 🔴 Open

---

### Bug 2 — `MAX_LOCKED_PLAYERS` / `MIN_LOCKED_PLAYERS` never enforced
- **File**: `apps/fantasy/src/config/constants.js:2-3`
- **Constants**: `MAX_LOCKED_PLAYERS = 10`, `MIN_LOCKED_PLAYERS = 8`
- **Problem**: These constraints are not checked anywhere — not in auction resolution (`AuctionContext.jsx`), not in market purchases (`Market.jsx`), not in transfers (`Transfers.jsx`). A team could end up with more than 10 locked players (e.g., all 15 won at auction).
- **Fix**: Add enforcement at acquisition points (auction + market) and optionally in transfer validation.
- **Status**: 🔴 Open

---

### Bug 3 — Auction assigns `is_locked: true` to all winners regardless of player price
- **File**: `apps/fantasy/src/context/AuctionContext.jsx:190-198`
- **Code**:
  ```js
  is_locked: true,
  slot_type: 'locked',
  ```
- **Problem**: Every auction-won player gets a locked slot regardless of their price. The design intent (lockable_players VIEW + LOCK_PRICE_THRESHOLD) implies locked slots are for ≤8.5M players. An expensive player won at auction incorrectly occupies a locked slot, then their transfer replacement is unfairly restricted to ≤8.5M.
- **Note**: The `lockable_players` DB VIEW and `filters.lockable` hook exist but are never used to restrict the auction player pool.
- **Fix**: To be defined — user will explain intended acquisition lock behavior.
- **Status**: 🔴 Open — **Tackling first**

---

### Bug 4 — `budgetValid` in Transfers is miscalculated and inconsistently used
- **File**: `apps/fantasy/src/pages/Transfers.jsx:208`
- **Code**:
  ```js
  const budgetValid = budgetAfter !== null && budgetAfter >= 0 &&
    budgetAfter + Number((squad.reduce((s, p) => s + p.price, 0) - playerOut?.price + playerIn?.price || 0).toFixed(1)) <= TOTAL_BUDGET;
  ```
- **Problem**: The formula adds `budgetAfter` (remaining cash) to the squad's total value post-transfer and compares it against `TOTAL_BUDGET`. This double-counts because `budget_remaining` already reflects money spent. The actual block in `executeTransfer()` (line 257) only checks `budgetAfter < 0`, making `budgetValid` effectively unused as a hard gate — it only affects a UI button.
- **Fix**: Simplify `budgetValid` to `budgetAfter !== null && budgetAfter >= 0`, removing the incorrect total-value check.
- **Status**: 🔴 Open

---

### Bug 5 — `isGameLocked` in MyTeam doesn't auto-refresh
- **File**: `apps/fantasy/src/pages/MyTeam.jsx:77-81`
- **Code**:
  ```js
  const now = Date.now(); // captured at render time
  function isGameLocked(playerId) {
    const gt = playerGameTimes[playerId];
    return gt ? new Date(gt).getTime() <= now : false;
  }
  ```
- **Problem**: `now` is captured once per render cycle. If the user has the page open when a game kicks off, the game lock won't activate until something else triggers a re-render. No `setInterval` or reactive polling keeps `now` current.
- **Fix**: Use a `useState` clock that ticks every minute via `setInterval` inside a `useEffect`, so the lock check stays live.
- **Status**: 🔴 Open

---

### Bug 6 — No position validation on transfers
- **File**: `apps/fantasy/src/pages/Transfers.jsx:241-338` (`executeTransfer`)
- **Problem**: `executeTransfer()` never checks `playerIn.position === playerOut.position`. A GK can be swapped for a FWD, breaking squad composition requirements. The `posFilter` UI filter only changes what's displayed — it does not enforce position matching as a constraint.
- **Fix**: Add validation in `executeTransfer()` that blocks transfers where positions don't match, and enforce same position in the available players filter when a player is selected to go out.
- **Status**: 🔴 Open

---

### Bug 7 — DB VIEW threshold hardcoded separately from `constants.js`
- **File**: `supabase/migrations/001_initial_schema.sql:28`
- **Code**: `SELECT *, (price <= 8.5) AS is_lockable FROM players;`
- **Problem**: The `8.5` in the VIEW is separate from `LOCK_PRICE_THRESHOLD = 8.5` in `constants.js`. They match today, but a future change to one won't automatically update the other, causing silent divergence between what the DB considers lockable and what the frontend enforces.
- **Fix**: Document this coupling explicitly; consider a DB constant/config table or a migration convention note. This can only be kept in sync manually.
- **Status**: 🔴 Open

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| 🔴 Open | Not yet started |
| 🟡 In Progress | Currently being worked on |
| 🟢 Fixed | Resolved and verified |
| ⚪ Won't Fix | Decided not to address |
