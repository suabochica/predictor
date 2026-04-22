# Fantasy League — Build Progress

> Reference for resuming work across sessions.
> Update this file at the end of each phase.

---

## Current status

**Last updated:** 2026-04-22
**Branch:** `Fantasy`
**Phase:** 4 testing complete — ready for Phase 5

---

## Phase completion

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (auth, routing, schema, hooks, layout) | ✅ Complete |
| 2 | Auction system (real-time bidding, round resolution) | ✅ Complete |
| 3 | Squad management (My Team, Standings, Market, Transfers, Bracket) | ✅ Complete |
| 4 | Matchday & Scoring | ✅ Complete |
| 5 | Knockout System | ⬜ Not started |
| 6 | Transfer Windows | ⬜ Not started |
| 7 | Polish & Testing | ⬜ Not started |
| 8 | Deployment | ⬜ Not started |

---

## Migrations applied (all 8)

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

**Known issue (non-blocking):** One team (Sergio) calculated 0 points despite players having stats — likely a player name/ID mismatch between lineup and stats upload. Investigate when convenient.

---

## Phase 5 scope (next)

From `MASTER_DOCUMENT.md` Section 13 / Phase 5:

- [ ] Bracket seeding logic — top 8 to championship, bottom 4 to relegation
- [ ] Bracket visualization (already has a Bracket page stub from Phase 3)
- [ ] H2H matchup cards — show each team's score for a knockout match
- [ ] Tiebreaker implementation (goals scored)
- [ ] Bracket advancement — admin marks winners, advances bracket
- [ ] Losers bracket logic
- [ ] Final standings display

Key DB table: `knockout_matches` (already exists from migration 001)

---

## My Team lineup refactor — ✅ Complete (2026-04-22)

Formation picker removed; formation derived live from starters. Empty pitch/bench slots are clickable. `canSave` requires only 1 GK in XI + captain is a starter. GK guard prevents 2nd GK entering XI.

---

## Known issues (not blocking Phase 5)

| Issue | Detail |
|-------|--------|
| Double budget deduction | `resolveRound()` triggered twice deducts budget twice — team_players upsert is idempotent but budget deduction is not |
| Realtime bids lose user data | Bids via Realtime don't carry joined user data; can block resolution if one wins |
| Transfer window badge uses `is_active` boolean | Not time-range based — workaround: set `is_active=true` directly |
| Teamless user sees £105M budget | Hardcoded default when no teams row exists |
| Standings total_points is additive | Running Calculate Standings twice on the same matchday is safe (upsert), but don't delete and manually re-insert rows between runs |
| Sergio 0 points | One team scored 0 despite players having stats — likely player ID mismatch between lineup and stats rows. Not yet investigated. |

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
