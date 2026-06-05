# Auction Realtime State Propagation — Fix Notes

**Branch:** `enhancements`  **Date:** 2026-06-01
**Status:** Implemented. Improved but not perfect (see "Known remaining gaps").

## The problem

After contested carry-over started working, auction **state** changes stopped
propagating to clients. When the admin started the auction or started/ended a round:

- Other users' pages did **not** update — manual refresh required.
- The **admin's own page** did not update either.
- A user who hadn't refreshed kept seeing the round timer tick and could keep
  bidding after the admin ended the round early.

Net effect: different clients operated in different states at the same time.

## Root cause

Supabase only streams Postgres change events for tables that are members of the
`supabase_realtime` **publication**. Migration `022_auction_visibility.sql` added
**only `auction_bids`** to the publication. The client subscriptions were wired
correctly but **silently dead** because their tables were never published:

| Subscription (client) | Table | In publication before fix? |
|---|---|---|
| Bid INSERT/UPDATE (`AuctionContext.jsx`) | `auction_bids` | ✅ yes — worked |
| `auction_state` UPDATE — start/round/end (`AuctionContext.jsx`) | `auction_state` | ❌ no — dead |
| `team_players` INSERT — live squad (`AuctionContext.jsx`) | `team_players` | ❌ no — dead |
| `teams` UPDATE — live budget (`LeagueContext.jsx`) | `teams` | ❌ no — dead |
| `team_players` `*` filtered by `team_id` (`useTeam.js`) | `team_players` | ❌ no — dead |

The publication is **database-level config**, identical locally and in production —
so this was broken in both; deploying would not have fixed it.

Secondary issue: `endRound()` only pushes `round_started_at` into the past to zero
out the **client** timer. The server-side `place_bid` RPC had no concept of round
timing or status, so a stale/disconnected client (one that missed the realtime
`auction_state` update) could still place a bid the server would accept.

## What we did

### 1. `supabase/migrations/026_realtime_publication.sql` — root-cause fix
- Adds `auction_state`, `teams`, `team_players` to the `supabase_realtime`
  publication. Idempotent `DO`/`EXCEPTION WHEN duplicate_object` blocks (same
  pattern as migration 022).
- `ALTER TABLE team_players REPLICA IDENTITY FULL` — `useTeam.js` filters its
  subscription by `team_id`; under the default replica identity a DELETE (a transfer
  removing a player) carries only the primary key, so the filter can't match and
  live squad-removal wouldn't fire. `FULL` includes the old row.

### 2. `supabase/migrations/027_place_bid_round_guard.sql` — server-side round guard
- `CREATE OR REPLACE place_bid` (supersedes migration 025's version). Same body,
  plus a guard immediately after the advisory lock and before any insert. Reads the
  auction row and rejects when:
  - `status <> 'active'` → "The auction is not currently active."
  - `p_round <> current_round` → "This round is no longer accepting bids."
  - `now() > round_started_at + duration` → "This round has ended."
- Uses DB `now()` as the authoritative clock (immune to client clock skew).
- **Per-round bid cap raised from 10 → 15** (one per squad slot; matches
  `MAX_SQUAD_SIZE`). Note: `15` is hardcoded in the RPC — update the SQL if
  `MAX_SQUAD_SIZE` ever changes.
- Carry-over upserts in `resolveRound()` do **not** go through `place_bid`, so they
  are unaffected.

### 3. `apps/fantasy/src/context/AuctionContext.jsx` — admin optimistic refresh
- `updateAuctionState()` now calls `fetchAuctionState()` after a successful write, so
  the admin's own page updates instantly without waiting for the realtime echo (the
  echo then re-sets the same value — idempotent). Applies to all admin actions
  (`startAuction`, `pauseAuction`, `resumeAuction`, `completeAuction`, `nextRound`,
  `endRound`) since they all funnel through it.

## How to apply

```bash
supabase db push      # applies 026 + 027
# or paste 026 then 027 into the Supabase SQL editor
```

The fix has no effect until the migrations are applied — the React build alone
changes nothing about realtime delivery.

## Verification (multi-tab: two users + admin)

1. Admin Start Auction → user tabs **and** admin tab go live without refresh.
2. Admin End Round early → all timers hit 0 and bidding disables without refresh.
3. On a user tab whose timer is still ticking after an early End Round, attempt a
   bid → rejected "This round has ended." During a paused auction → "The auction is
   not currently active."
4. Normal bid during a genuinely live round still succeeds (guard not too strict).
5. On round resolve, winners' budgets (`teams`) and squads (`team_players`) update on
   all tabs without refresh.
6. Contested carry-over still works (regression check on `resolveRound`).
7. `cd apps/fantasy && pnpm build` passes.

## Known remaining gaps

- Realtime delivery is still best-effort: if a client is offline/backgrounded at the
  moment of an `auction_state` change, its UI stays stale until it reconnects. The
  server-side `place_bid` guard (027) prevents that stale client from doing damage
  (it can't bid on an ended/paused round), but the *display* still needs reconnection
  or a manual refresh to catch up. There is no periodic poll/heartbeat fallback for
  `auction_state` — that would be the next hardening step if needed.

## Related docs / history

- `apps/fantasy/AUCTION_BUGS_ROUND2.md`
- Plan: `~/.claude/plans/i-have-applied-all-cuddly-crystal.md`
- Prior migrations: 022 (visibility + place_bid + auction_bids publication),
  024 (auction_bids admin policy), 025 (place_bid validation — superseded by 027).
