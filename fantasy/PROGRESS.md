# Fantasy League — Build Progress

> Reference for resuming work across sessions.
> Update this file at the end of each phase.

---

## Current status

**Last updated:** 2026-04-23
**Branch:** `Fantasy`
**Phase:** Phase 6 complete — transfer windows admin, priority queue display, lineup cleanup

---

## Phase completion

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (auth, routing, schema, hooks, layout) | ✅ Complete |
| 2 | Auction system (real-time bidding, round resolution) | ✅ Complete |
| 3 | Squad management (My Team, Standings, Market, Transfers, Bracket) | ✅ Complete |
| 4 | Matchday & Scoring | ✅ Complete |
| 5 | Knockout System | ✅ Complete |
| 6 | Transfer Windows | ✅ Complete |
| 7 | Polish & Testing | ⬜ Not started |
| 8 | Deployment | ⬜ Not started |

---

## Migrations applied (all 11)

| File | Purpose | Status |
|------|---------|--------|
| 001_initial_schema.sql | Core tables | ✅ |
| 002_rls_policies.sql | Base RLS policies | ✅ |
| 003_functions.sql | DB helper functions | ✅ |
| 004_auction_state_rls.sql | Allow users to SELECT auction_state | ✅ |
| 005_fix_auction_state_rls.sql | Fix broken FOR ALL policy on auction_state | ✅ |
| 006_admin_teams_policy.sql | Admin INSERT/UPDATE/DELETE on teams | ✅ |
| 007_standings_public_read.sql | All authenticated users can SELECT teams | ✅ |
| 008_team_players_admin_policy.sql | Admin INSERT/UPDATE/DELETE on team_players | ✅ |
| 009_lineups_admin_read.sql | Admin SELECT on all lineups (required for Calculate Standings) | ✅ |
| 010_fantasy_standings_admin_write.sql | Admin INSERT/UPDATE/DELETE on fantasy_standings | ✅ |
| 011_lineups_admin_write.sql | Admin INSERT/UPDATE/DELETE on lineups (required for lineup stamps) | ✅ |

---

## What Phase 4 built

| Item | File(s) |
|------|---------|
| Matchday creation form (name, stage, deadline, activate/complete toggles) | `src/pages/Admin.jsx` |
| Stats CSV upload — parses §11.2 format, auto-calculates `total_points` | `src/pages/Admin.jsx` |
| Calculate Standings button — scores all teams with auto-subs, writes to `fantasy_standings` | `src/pages/Admin.jsx` |
| Rolling lockout on My Team — locks players once `game_started_at` has passed | `src/pages/MyTeam.jsx` |
| Captain warning banner — shown if captain's game has kicked off | `src/pages/MyTeam.jsx` |
| Matchday results view — per-team points table per matchday | `src/pages/History.jsx` |
| Points breakdown modal — per-player stats, auto-sub indicators, captain multiplier | `src/pages/History.jsx` |
| Auto-sub + team scoring engine | `src/lib/matchday.js` |

---

## Phase 4 testing — ✅ Complete

Calculate Standings working end-to-end. Confirmed:
- Standings calculated for 5 teams with lineups
- `/history` breakdown modal loads
- `/my-team` rolling lockout active

---

## Phase 4 re-test bug fixes (2026-04-23)

| Fix | Detail | Files |
|-----|--------|-------|
| **Auction carry-over** | Players with multiple bidders are no longer awarded — they carry over to the next round with the highest bid as the floor. `resolveRound()` returns `{ resolved, contested, errors }`. Admin panel shows "Awarded" (green) and "Contested → next round" (yellow) separately. Auction player cards show a "⚡ Contested — min bid £X" badge. `placeBid()` enforces the floor bid server-side. | `AuctionContext.jsx`, `Admin.jsx`, `Auction.jsx` |
| **GK guard in lineup** | Swapping the starting GK to bench (with a non-GK) is now blocked in all three paths: `doSwap()` starter↔bench, `doSwap()` bench↔starter, and `handleEmptyBenchSlotClick()`. Error: "Can't move the GK to bench — swap with a bench GK instead." | `MyTeam.jsx` |
| **Matchday auto-activation** | "Complete Auction" now auto-activates the first available matchday (with lineup stamp). "Mark Complete" on a matchday auto-activates the next matchday by ID. No more empty timeframes. | `Admin.jsx` |
| **Lock icon fix** | 🔒 in squad table now shows when `minutes_played > 0` (player has actually played), not when `game_started_at` has merely passed. Swap-blocking logic unchanged (still uses `game_started_at`). | `MyTeam.jsx` |
| **Market GK requirement** | When buying the last squad slot, the player must be a GK if the squad has none. Red hard-block banner + all non-GK cards disabled ("GK required"). Orange early-warning banner when ≤3 slots left and no GK. Final guard in `confirmBuy()`. | `Market.jsx`, `PlayerCard.jsx` |

**Previous Phase 4 fixes (2026-04-22):**

| Fix | Files |
|-----|-------|
| Double-counting on recalculate — now uses `matchday_points` from other matchdays, never reads cumulative `total_points` | `Admin.jsx` |
| `goals_scored` stored per-matchday (not cumulative); `useStandings` sums it across rows | `Admin.jsx`, `useStandings.js` |
| History shows active (Live) matchdays, not just completed | `History.jsx` |
| History breakdown falls back to null-matchday lineup if no matchday-specific one exists | `History.jsx` |
| Auto-sub names in breakdown modal showed IDs — now shows player names | `History.jsx` |
| MyTeam loads null-matchday lineup as fallback when active matchday has no saved lineup yet | `MyTeam.jsx` |
| MyTeam: live stats panel (Live Pts / Played / Yet to Play) during active matchday | `MyTeam.jsx` |
| MyTeam: pts column per player in squad table during active matchday | `MyTeam.jsx` |
| MyTeam: Player History table — per-player × per-matchday base points grid | `MyTeam.jsx` |
| Admin activation stamp — toggling a matchday active now copies all null-matchday lineups to the new matchday_id | `Admin.jsx` |
| Calculate Standings stamp — also stamps null lineups after scoring (secondary safety net) | `Admin.jsx` |
| Migration 011 — admin INSERT/UPDATE/DELETE on lineups (stamps were silently blocked by RLS) | `supabase/migrations/011_lineups_admin_write.sql` |

---

## Phase 5 — ✅ Complete (2026-04-23)

| Item | File(s) |
|------|---------|
| Bracket seeding — top 8 championship, bottom 4 relegation | `Admin.jsx`, `brackets.js` |
| Admin: Seed Bracket button with seeding preview | `Admin.jsx` |
| Admin: Calculate Round — resolves H2H matches, creates next round | `Admin.jsx` |
| H2H tiebreaker: matchday pts → captain pts → goals → league rank | `brackets.js`, `Admin.jsx` |
| Captain points fetched from lineups + player_stats and doubled | `Admin.jsx` |
| Losers bracket: 5/6 Match, 7/8 Match (Round 2) → 5th/7th Place placards (Round 3) | `Admin.jsx` |
| Relegation bracket advancement + placement assignment | `Admin.jsx` |
| Bracket visualization — preview mode + actual mode with winner highlights | `Bracket.jsx` |
| Final standings display (placement rows with winner highlight) | `Bracket.jsx` |
| MatchCard fix: shows winner highlight even for placement-only rows (no score) | `Bracket.jsx` |

Key DB table: `knockout_matches` (existed from migration 001, RLS already correct)

## Phase 6 — ✅ Complete (2026-04-23)

| Item | File(s) |
|------|---------|
| Migration 012 — RLS for `transfer_windows` (auth read, admin write) + admin read on all `transfers` | `supabase/migrations/012_transfer_windows_rls.sql` |
| Admin: Transfer Windows section — create (presets + custom form), open/close, delete | `Admin.jsx` |
| Admin: View transfer activity across all teams for active window | `Admin.jsx` |
| Transfers: Priority queue display — inverse standings order with pip indicators | `Transfers.jsx` |
| Transfers: Lineup cleanup — transferred-out player removed from active + null matchday lineups | `Transfers.jsx` |
| All existing transfer logic already present: budget check, locked swap validation, history | `Transfers.jsx` (Phase 3) |

Key DB tables: `transfer_windows`, `transfers` (both existed from migration 001)

---

## Phase 7 scope (next)

From `MASTER_DOCUMENT.md` Section 13 / Phase 7:

- [ ] Mobile responsiveness audit
- [ ] Error handling & validation
- [ ] Loading states & skeletons
- [ ] Empty states
- [ ] Toast notifications
- [ ] End-to-end testing
- [ ] Performance optimization

---

## My Team lineup refactor — ✅ Complete (2026-04-22)

Formation picker removed; formation derived live from starters. Empty pitch/bench slots are clickable. `canSave` requires only 1 GK in XI + captain is a starter. GK guard prevents 2nd GK entering XI.

---

## Known issues (not blocking Phase 5)

| Issue | Detail |
|-------|--------|
| Double budget deduction | `resolveRound()` triggered twice deducts budget twice — team_players upsert is idempotent but budget deduction is not. Don't click Resolve twice on the same round. |
| Realtime bids lose user data | Bids via Realtime don't carry joined user data; can block resolution if one wins |
| Transfer window badge uses `is_active` boolean | Not time-range based — workaround: set `is_active=true` directly |
| Teamless user sees £105M budget | Hardcoded default when no teams row exists |
| Market purchase not atomic | Two-write purchase (insert team_player + update budget) — if the second write fails, player is added but budget not deducted |

---

## Key files to know

| File | Purpose |
|------|---------|
| `MASTER_DOCUMENT.md` | Full spec — read before implementing any feature |
| `MYTEAM_LINEUP_REFACTOR.md` | Lineup overhaul plan — read before touching MyTeam |
| `PHASE4_TESTING.md` | Phase 4 test guide |
| `supabase/test-data/` | SQL files for dummy test data and cleanup |
| `data/test_matchday1_stats.csv` | Test stats CSV (25 players, varied scoring scenarios) |
| `src/config/scoring.json` | Scoring config (admin-editable values) |
| `src/lib/matchday.js` | Auto-sub + team points calculation |
| `src/lib/scoring.js` | Per-player point calculation |
| `src/lib/formations.js` | Formation parsing + validation |
| `src/context/AuctionContext.jsx` | Auction state + all auction actions |
| `src/context/LeagueContext.jsx` | Active matchday, transfer window state |
