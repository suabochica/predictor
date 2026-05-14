# Player Lock System — Implementation Plan

Branch: `feat/player-lock-system`
Execute this plan in the next session.

---

## Full System Design

### Two lock states for `team_players`

| `slot_type` | `is_locked` | Meaning |
|---|---|---|
| `'locked'` | `true` | Player exclusively bound to this team. Max 10 per team. Only ONE team can lock a given player. |
| `'free'` | `false` | Player loosely held. Multiple teams CAN hold the same player as free simultaneously. |

Player "lockability" is a property of the **player's base price** (≤8.5M = lockable), NOT their final bid price.

### Price persistence rule

A player has a `players.current_price` that ratchets upward and never reverts:
- Initial value: `current_price = price` (the base price from the seed data).
- After an auction sale: `current_price` is set to the winning bid for that player. Permanent.
- All future market transactions (purchases, refunds, displayed price) use `current_price`.
- Example: base price 8M → won at auction for 10M → `current_price = 10M`. If that team unlocks the player and another team buys him as free, the buyer pays 10M. He never returns to 8M.

The original `price` column is preserved as the base/seed value but is no longer used for pricing decisions after auction.

---

## Phase-by-Phase Flow

### Phase 1 — Auction
- **Only lockable players (≤8.5M base price)** appear in the bidding pool
- Users bid freely; final bid price does not affect lock status
- All auction winners → `slot_type: 'locked'`, `is_locked: true`
- **Auction MAX gate**: once a team holds 10 locked acquisitions, the auction UI prevents that team from bidding on additional players. The resolution RPC also enforces this server-side as a safety net.
- At resolution, for each sold player: `UPDATE players SET current_price = winning_bid` (price persistence).
- After auction: each user has **up to 10 locked players** (gating prevents overflow; a user may end with fewer if they chose to bid on fewer).

### Phase 2 — Open Market (filling the remaining squad spots)

All players appear. Buyers pay `players.current_price` for any acquisition.

**Pricing**
- Each market purchase costs the buyer the player's `current_price` at purchase time, debited from `team.budget_remaining`. The price paid is stored on the new `team_players` row as `acquisition_price`.
- When multiple teams hold a player as `free`, each paid `current_price` independently at the moment of their own purchase — their `acquisition_price` records reflect what they personally paid.
- Refunds (Phase 3, lock side effect) use the holder's stored `acquisition_price`, not the current price. This protects historical holders who paid less.

**A. Buying a free/market-only player (price > 8.5M)**
- Simple purchase → `slot_type: 'free'`, `is_locked: false`
- No lock decision prompt, done

**B. Buying a lockable player (base price ≤ 8.5M)**
- User is shown a "Lock this player?" prompt after purchase
  - **User has < 10 locked** → lock directly, no swap needed
  - **User has 10 locked (MAX)** → must choose one of their locked players to unlock first (that player stays in squad as `free`, reappears in market for others)
  - **User says No** → buy as `free/lockable`, player still visible in market for others

### Phase 3 — Post-market Lock/Unlock Actions
Users can also lock/unlock players they already own at any time:

**Locking a free/lockable player you own:**
- If below MAX_LOCKED (10): lock directly
- If at MAX_LOCKED: must pick one locked player to unlock (stays in squad as free)
- Atomic operation: handled by the `lock_player` RPC (see Conflict Resolution)
- Side effect: ALL other teams that hold this player as `free` lose it from their squad and get refunded **their own** `acquisition_price` (what they personally paid)

**Unlocking a locked player you own:**
- Player stays in your squad but changes to `free`
- Player reappears in market (available for others to buy/lock)
- Your locked count drops by 1

---

## Conflict Resolution (Simultaneous Locks)

**Core rule: a locked player cannot be taken.** There is no "kicking" of established locks under any circumstance. The only way another team can lock a player who is currently locked by team A is if team A unlocks them first, at which point the player becomes free and is open to anyone.

**v1 strategy: First-Come-First-Served (FCFS).** All lock attempts go through a single Postgres RPC (`lock_player`). Postgres serializes the transactions naturally — whichever RPC reaches the lock acquisition step first wins. The second RPC finds the player already locked and is rejected with `{success: false, reason: 'already_locked'}`. No priority queue is needed.

Inside the RPC, in one transaction:
1. Validate: caller is below MAX_LOCKED, or provided a valid `playerToUnlockId`.
2. If the target player is already locked by someone else → reject with `{success: false, reason: 'already_locked'}`.
3. Perform the unlock-of-old (if any), lock-of-new, and refund/delete every other team's `free` holding of that player.
4. Return `{success: true, refunded_teams: [...]}` so the client can show toasts.

> **v2 (future, only if needed):** if sub-second simultaneity becomes a real complaint, add an intent queue — lock attempts INSERT into a short-lived `intent_to_lock` table, a batching window collects intents, and a function resolves the batch sorted by a priority queue. v1 ships without this. The `locking_priority` table is deferred until then.

---

## Implementation Steps

### Step 1 — Database Migration (new file: `016_lock_system.sql`)

Includes the schema, the partial unique index, and the RPC functions. The RPCs are the authoritative business logic — the client only calls them. No priority queue in v1.

```sql
-- Price persistence: players have a current_price that ratchets up after auctions
ALTER TABLE players ADD COLUMN current_price NUMERIC NOT NULL DEFAULT 0;
UPDATE players SET current_price = price;
ALTER TABLE players ALTER COLUMN current_price DROP DEFAULT;

-- Drop the lockable_players VIEW (Bug 7 fix — was hardcoded to 8.5, drifted from constants.js)
DROP VIEW IF EXISTS lockable_players;

-- Enforce one lock per player across all teams
CREATE UNIQUE INDEX one_lock_per_player
  ON team_players(player_id)
  WHERE slot_type = 'locked';

-- Atomic lock function. SECURITY DEFINER so it can write across teams.
CREATE OR REPLACE FUNCTION lock_player(
  p_team_id INT,
  p_player_in INT,
  p_player_to_unlock INT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked_count INT;
  v_competing_team INT;
  v_refunded JSON;
BEGIN
  -- Validate MAX_LOCKED
  SELECT COUNT(*) INTO v_locked_count
    FROM team_players WHERE team_id = p_team_id AND slot_type = 'locked';

  IF v_locked_count >= 10 AND p_player_to_unlock IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'max_locked_no_unlock');
  END IF;

  -- Perform swap-out if requested
  IF p_player_to_unlock IS NOT NULL THEN
    UPDATE team_players
      SET slot_type = 'free', is_locked = false
      WHERE team_id = p_team_id AND player_id = p_player_to_unlock AND slot_type = 'locked';
  END IF;

  -- Check for existing lock on target player. Locked = untouchable; FCFS — whichever RPC commits first wins.
  SELECT team_id INTO v_competing_team
    FROM team_players WHERE player_id = p_player_in AND slot_type = 'locked';

  IF v_competing_team IS NOT NULL AND v_competing_team <> p_team_id THEN
    RETURN json_build_object('success', false, 'reason', 'already_locked');
  END IF;

  -- Acquire the lock for caller (insert or update). The partial unique index is the final guard
  -- against any race that slipped past the SELECT above — the second RPC will get a unique violation
  -- and we surface it as 'already_locked'.
  BEGIN
    INSERT INTO team_players (team_id, player_id, slot_type, is_locked, acquisition_price)
      VALUES (p_team_id, p_player_in, 'locked', true,
              (SELECT current_price FROM players WHERE id = p_player_in))
      ON CONFLICT (team_id, player_id) DO UPDATE
        SET slot_type = 'locked', is_locked = true;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'reason', 'already_locked');
  END;

  -- Refund and remove all OTHER teams holding this player as free
  WITH refunded AS (
    DELETE FROM team_players
      WHERE player_id = p_player_in AND slot_type = 'free' AND team_id <> p_team_id
      RETURNING team_id, acquisition_price
  ),
  budget_updates AS (
    UPDATE teams t SET budget_remaining = budget_remaining + r.acquisition_price
      FROM refunded r WHERE t.id = r.team_id
      RETURNING t.id, r.acquisition_price
  )
  SELECT json_agg(json_build_object('team_id', id, 'refunded', acquisition_price))
    INTO v_refunded FROM budget_updates;

  RETURN json_build_object('success', true, 'refunded_teams', COALESCE(v_refunded, '[]'::json));
END;
$$;

CREATE OR REPLACE FUNCTION unlock_player(p_team_id INT, p_player_id INT) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_players SET slot_type = 'free', is_locked = false
    WHERE team_id = p_team_id AND player_id = p_player_id AND slot_type = 'locked';
  RETURN json_build_object('success', true);
END;
$$;
```

> Notes:
> - The existing `UNIQUE(team_id, player_id)` constraint stays — it correctly prevents a team from having the same player twice.
> - The RPC body above is a draft; refine signatures, error codes, and edge-case handling during execution.
> - FCFS is enforced by both the SELECT-then-INSERT check and the partial unique index as a fallback. The race window between the two is tiny and the index guarantees correctness.

---

### Step 2 — Auction: Filter to lockable players only

**File**: `apps/fantasy/src/context/AuctionContext.jsx` (verified: it calls `usePlayers()` with no filter at line 47)

- Change `usePlayers()` → `usePlayers({ lockable: true })`. With Step 3 fixed, this correctly filters to `price <= LOCK_PRICE_THRESHOLD`.
- The DB already stores lock status correctly for auction winners.
- Also in AuctionContext: at resolution, add the `current_price = winning_bid` write.
- Also in AuctionContext: enforce the 10-locked bid gate (refuse to register a bid from a team already at 10 locked acquisitions).

---

### Step 3 — Fix `usePlayers.js` hardcoded threshold (Bug 1)

**File**: `apps/fantasy/src/hooks/usePlayers.js:16`

```js
// Before
if (filters.lockable) query = query.lte('price', 8.5);

// After
import { LOCK_PRICE_THRESHOLD } from '../config/constants';
if (filters.lockable) query = query.lte('price', LOCK_PRICE_THRESHOLD);
```

---

### Step 4 — Client wrapper: `lockActions.js`

**New file**: `apps/fantasy/src/lib/lockActions.js`

Thin client wrappers around the RPCs. No business logic on the client.

```js
import { supabase } from '@predictor/supabase';

export async function lockPlayer(teamId, playerInId, playerToUnlockId = null) {
  const { data, error } = await supabase.rpc('lock_player', {
    p_team_id: teamId,
    p_player_in: playerInId,
    p_player_to_unlock: playerToUnlockId,
  });
  if (error) throw error;
  return data; // {success, reason?, refunded_teams?}
}

export async function unlockPlayer(teamId, playerId) {
  const { data, error } = await supabase.rpc('unlock_player', {
    p_team_id: teamId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return data;
}
```

UI surfaces success/failure based on the returned JSON. No client-side priority resolution. No client-side refund math. No optimistic-locking retries.

---

### Step 5 — Market page: Lock decision prompt

**File**: `apps/fantasy/src/pages/Market.jsx`

After a successful purchase of a **lockable player** (base price ≤ LOCK_PRICE_THRESHOLD):
- Show modal: "Do you want to lock [Player Name]?"
- If user has < 10 locked: show "Lock" / "Keep as Free" buttons
- If user has 10 locked: show "Lock (choose a player to unlock)" — opens a picker of their current locked players
- On confirm: call `lockPlayer(teamId, playerInId, playerToUnlockId?)`. Handle the RPC result:
  - `success: true` → toast confirmation, close modal
  - `success: false, reason: 'already_locked'` → toast "Another team locked this player first; you still hold them as free"
  - `success: false, reason: 'max_locked_no_unlock'` → re-prompt the unlock picker
- On skip: close modal, player remains free

**Realtime**: subscribe to `team_players` changes via `useRealtime` for any player visible in the market. On change, refetch lock status so users see fresh state before attempting a lock.

---

### Step 6 — MyTeam / Squad view: Lock/Unlock buttons + nudge

**File**: `apps/fantasy/src/pages/MyTeam.jsx`

For each player in the squad:
- If `slot_type === 'free'` AND `price <= LOCK_PRICE_THRESHOLD`: show **"Lock"** button
  - Click → same lock flow as Step 5 (prompt unlock picker if at MAX)
- If `slot_type === 'locked'`: show **"Unlock"** button
  - Click → confirm with user → call `unlockPlayer(teamId, playerId)`
- If `slot_type === 'free'` AND `price > LOCK_PRICE_THRESHOLD`: no lock/unlock button (market-only player)

**Realtime**: subscribe to `team_players` for squad players (especially `free`-held ones) so users see immediately when someone else locks a free player they hold. On such a change, surface a refund toast.

**Non-blocking nudge**: if the user has fewer than 8 locked players, show a dismissible banner: "Consider locking more players to protect them from being claimed by other teams." This is a UX hint only — no gating. Users may have intentionally chosen a free-heavy squad and the banner should not block any action.

---

### Step 7 — MAX_LOCKED_PLAYERS UX gate (Bug 2)

Server-side enforcement lives in the `lock_player` RPC (Step 1). On the client:
- In Market.jsx and MyTeam.jsx, count the user's current locked players and disable the "Lock" button if the count is at MAX and no unlock candidate has been picked.
- Show a clear inline message: "At max locks — pick one to unlock first."
- The RPC remains the authoritative gate; the client check is purely UX.

---

### Step 8 — Remove `MIN_LOCKED_PLAYERS` constant

**File**: `apps/fantasy/src/config/constants.js:3`

- Delete the `MIN_LOCKED_PLAYERS = 8` line.
- Grep the repo for any usage (expected: zero — the constant was unused) and clean up if found.
- The minimum-lock concept is intentionally not a rule. Users may end up with as few as 0 locked players. Step 6's nudge replaces it as a soft UX hint.

---

### Step 9 — Update PLAYER_LOCK_BUGS.md

Mark as fixed after implementation:
- Bug 1 (`usePlayers.js` hardcoded 8.5) → 🟢 Fixed (Step 3)
- Bug 2 (`MAX_LOCKED_PLAYERS` unenforced) → 🟢 Fixed (Steps 1 + 7)
- Bug 3 (Auction shows all players) → 🟢 Fixed (Step 2)
- Bug 7 (DB VIEW threshold drift) → 🟢 Fixed (Step 1, VIEW dropped)

---

## Files to Touch

| File | Change |
|---|---|
| `supabase/migrations/016_lock_system.sql` | New — `current_price` column, DROP VIEW, partial unique index, `lock_player`/`unlock_player` RPCs |
| `apps/fantasy/src/hooks/usePlayers.js` | Use `LOCK_PRICE_THRESHOLD` constant |
| `apps/fantasy/src/context/AuctionContext.jsx` | Filter pool to lockable; gate bidding at 10 locked; write `current_price` at resolution |
| `apps/fantasy/src/lib/lockActions.js` | New — thin RPC wrappers |
| `apps/fantasy/src/pages/Market.jsx` | Lock decision prompt + Realtime subscription |
| `apps/fantasy/src/pages/MyTeam.jsx` | Lock/Unlock buttons + Realtime + soft nudge banner |
| `apps/fantasy/src/config/constants.js` | Remove `MIN_LOCKED_PLAYERS` |
| `PLAYER_LOCK_BUGS.md` | Update bug statuses (1, 2, 3, 7 → 🟢) |

---

## Pre-execution Checklist

Before deploying the frontend changes:

1. **Apply migration 016** by running `supabase db push` (or whatever migration command the project uses). This:
   - Adds `players.current_price` column (initialized to `price`)
   - Drops the `lockable_players` VIEW
   - Adds the `one_lock_per_player` partial unique index
   - Creates the `lock_player` and `unlock_player` RPCs
2. **Confirm data is fresh** — the user is wiping existing auction/team_players data before testing, so no backfill of `current_price` from historical `acquisition_price` is needed.

---

## Open Questions / Notes for Next Session

- **Realtime channel scope**: confirm whether one shared `team_players` Realtime channel per page is acceptable, or whether subscriptions should be scoped per player_id. Existing `useRealtime.js` usage in AuctionContext is a reference.
- **Future v2 — priority queue / intent batching**: if sub-second simultaneity becomes a real complaint in v1, revisit by adding an `intent_to_lock` table, a short batching window (~500ms), and a `locking_priority` table sorted by total auction spend ascending. v1 ships FCFS without this.
