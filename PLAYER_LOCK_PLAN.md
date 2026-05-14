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

---

## Phase-by-Phase Flow

### Phase 1 — Auction
- **Only lockable players (≤8.5M)** appear in the bidding pool
- Users bid freely; final bid price does not affect lock status
- All auction winners → `slot_type: 'locked'`, `is_locked: true`
- Max 10 acquisitions enforced per user (MAX_LOCKED_PLAYERS)
- After auction: each user has exactly **10 locked players**, 5 squad spots empty

### Phase 2 — Open Market (filling the 5 remaining spots)
All players appear. Two sub-cases:

**A. Buying a free/market-only player (price > 8.5M)**
- Simple purchase → `slot_type: 'free'`, `is_locked: false`
- No lock decision prompt, done

**B. Buying a lockable player (price ≤ 8.5M)**
- User is shown a "Lock this player?" prompt after purchase
  - **User has < 10 locked** → lock directly, no swap needed
  - **User has 10 locked (MAX)** → must choose one of their locked players to unlock first (that player stays in squad as `free`, reappears in market)
  - **User says No** → buy as `free/lockable`, player still visible in market for others

### Phase 3 — Post-market Lock/Unlock Actions
Users can also lock/unlock players they already own at any time:

**Locking a free/lockable player you own:**
- If below MAX_LOCKED (10): lock directly
- If at MAX_LOCKED: must pick one locked player to unlock (stays in squad as free)
- Atomic operation: the DB partial unique index guarantees only one team can lock a player
- Side effect: ALL other teams that hold this player as `free` lose it from their squad and get a full refund of their acquisition price

**Unlocking a locked player you own:**
- Player stays in your squad but changes to `free`
- Player reappears in market (available for others to buy/lock)
- Your locked count drops by 1

---

## Conflict Resolution (Simultaneous Locks)

When two users try to lock the same player at the same time:
- The DB partial unique index (`WHERE slot_type = 'locked'`) rejects the second attempt atomically
- True simultaneous requests: **priority queue** determines winner
- Winner gets the lock; their priority rank drops to **last place**
- Loser's request fails gracefully; they still hold the player as free and can try again

### Priority Queue Rules
- Stored in a new `locking_priority` table
- **Initial ranking (post-auction)**: sorted by total auction spend ascending (lowest spender = rank 1); random shuffle for ties
- **After winning a conflict**: winner moves to last rank
- In non-conflict scenarios (no simultaneous attempt): first DB write wins, no priority needed

---

## Implementation Steps

### Step 1 — Database Migration (new file: `016_lock_system.sql`)

```sql
-- Enforce one lock per player across all teams
CREATE UNIQUE INDEX one_lock_per_player
  ON team_players(player_id)
  WHERE slot_type = 'locked';

-- Priority queue for locking conflict resolution
CREATE TABLE locking_priority (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  priority_rank INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id)
);
```

> Note: The existing `UNIQUE(team_id, player_id)` constraint stays — it correctly prevents a team from having the same player twice. Multiple teams having the same player as `free` is allowed and correct.

---

### Step 2 — Auction: Filter to lockable players only

**File**: Where the Auction page fetches its player list (likely `AuctionContext.jsx` or the Auction page's player query)

- Add filter: `price <= LOCK_PRICE_THRESHOLD` to the auction player pool query
- Use `lockable_players` VIEW or add `.lte('price', LOCK_PRICE_THRESHOLD)` to the Supabase query
- This is a UI + data filter; the DB already stores lock status correctly for auction winners

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

### Step 4 — New utility: `lockPlayer` / `unlockPlayer` atomic functions

**New file**: `apps/fantasy/src/lib/lockActions.js`

#### `lockPlayer(teamId, playerInId, playerToUnlockId = null)`
1. If `playerToUnlockId` provided: update that player's row to `slot_type: 'free', is_locked: false` first
2. Update the target player's row for this team: `slot_type: 'locked', is_locked: true`
   - If DB unique index rejects → conflict detected → check priority queue
3. Find all OTHER `team_players` rows where `player_id = playerInId` AND `slot_type = 'free'`
4. For each: refund `acquisition_price` to that team's `budget_remaining`, then delete the row
5. If conflict (two simultaneous): query `locking_priority`, highest rank wins; loser gets a clear error message
6. After winning a conflict: update winner's `priority_rank` to `MAX + 1` (last place)

#### `unlockPlayer(teamId, playerId)`
1. Update player row: `slot_type: 'free', is_locked: false`
2. No other side effects (player stays in squad, market now shows them as available)

---

### Step 5 — Market page: Lock decision prompt

**File**: `apps/fantasy/src/pages/Market.jsx`

After a successful purchase of a **lockable player** (price ≤ LOCK_PRICE_THRESHOLD):
- Show modal: "Do you want to lock [Player Name]?"
- If user has < 10 locked: show "Lock" / "Keep as Free" buttons
- If user has 10 locked: show "Lock (choose a player to unlock)" — opens a picker of their current locked players
- On confirm: call `lockPlayer(teamId, playerInId, playerToUnlockId?)`
- On skip: close modal, player remains free

---

### Step 6 — MyTeam / Squad view: Lock/Unlock buttons

**File**: `apps/fantasy/src/pages/MyTeam.jsx` (or a squad component)

For each player in the squad:
- If `slot_type === 'free'` AND `price <= LOCK_PRICE_THRESHOLD`: show **"Lock"** button
  - Click → same lock flow as Step 5 (prompt unlock picker if at MAX)
- If `slot_type === 'locked'`: show **"Unlock"** button
  - Click → call `unlockPlayer(teamId, playerId)`, confirm with user first
- If `slot_type === 'free'` AND `price > LOCK_PRICE_THRESHOLD`: no lock/unlock button (market-only player)

---

### Step 7 — Enforce MAX_LOCKED_PLAYERS in lock gate (Bug 2)

In `lockPlayer` utility and the lock decision UI:
- Count current locked players for the team before allowing a lock without an unlock
- If `lockedCount >= MAX_LOCKED_PLAYERS` and no `playerToUnlockId` provided → reject with clear message

---

### Step 8 — Priority queue initialization (post-auction)

**File**: Admin panel or `AuctionContext.jsx` — add a "Finalize Auction" action

After the admin marks the auction as complete:
1. Query all teams with their total auction spend (sum of `acquisition_price` WHERE `slot_type = 'locked'` at auction end)
2. Sort ascending (lowest spender = rank 1)
3. For ties: apply random shuffle within the tied group
4. Insert into `locking_priority` table

---

### Step 9 — Update PLAYER_LOCK_BUGS.md

Mark as fixed after implementation:
- Bug 1 (`usePlayers.js` hardcoded 8.5) → 🟢 Fixed (Step 3)
- Bug 2 (`MAX_LOCKED_PLAYERS` unenforced) → 🟢 Fixed (Step 7)
- Bug 3 (Auction shows all players) → 🟢 Fixed (Step 2)

---

## Files to Touch

| File | Change |
|---|---|
| `supabase/migrations/016_lock_system.sql` | New — partial unique index + locking_priority table |
| `apps/fantasy/src/hooks/usePlayers.js` | Use LOCK_PRICE_THRESHOLD constant |
| `apps/fantasy/src/context/AuctionContext.jsx` or Auction page | Filter player pool to lockable only |
| `apps/fantasy/src/lib/lockActions.js` | New — lockPlayer / unlockPlayer functions |
| `apps/fantasy/src/pages/Market.jsx` | Lock decision prompt after buying lockable player |
| `apps/fantasy/src/pages/MyTeam.jsx` | Lock/Unlock buttons per player |
| `apps/fantasy/src/pages/Admin.jsx` | "Finalize Auction" → seed locking_priority |
| `PLAYER_LOCK_BUGS.md` | Update bug statuses |

---

## Open Questions / Notes for Next Session

- Confirm where the Auction page fetches its player list (AuctionContext or a separate hook) before touching Step 2
- The priority conflict resolution (Step 4, conflict branch) requires careful optimistic-locking logic — may need a Supabase DB function (RPC) to handle atomically instead of client-side
- Consider Realtime subscription in Market/MyTeam so users see player lock status changes live (when someone else locks a player you hold as free)
