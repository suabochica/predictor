# Pre-Phase 4 Briefing

> Review this together before starting Phase 4.
> Complete Phase 3 testing first (see `PHASE3_TESTING.md`).

---

## Blockers — must be done before Phase 4 build starts

### 1. Apply migration 007
Copy from `supabase/migrations/007_standings_public_read.sql` and run in Supabase SQL Editor.

```sql
CREATE POLICY "Authenticated users can view all teams"
  ON teams FOR SELECT TO authenticated USING (true);
```

**Without this:** Standings page can't read participant names, Bracket preview won't work.

### 2. Verify migration 005 is applied
From Phase 2 notes this was still pending. It fixes a broken `FOR ALL` RLS policy on `auction_state`.

Run in Supabase SQL Editor and confirm no errors:
```sql
-- Check: supabase/migrations/005_fix_auction_state_rls.sql
```

### 3. Import real player data
`sample_players.csv` is placeholder data. Phase 4 scoring needs real WC2026 squads.

- Source player names, countries, positions, and prices from a reliable dataset
- Import via the Admin page CSV upload (already built in Phase 1) or direct SQL
- Do this before testing Market, My Team, or any scoring — placeholder data makes those pages meaningless

---

## Decisions needed — agree before Phase 4 build starts

| # | Decision | Detail | Impact |
|---|----------|--------|--------|
| 1 | **Stats CSV format** | MASTER_DOCUMENT §11.2 defines columns. Confirm `game_started_at` is an ISO timestamp per player (not per match) — one row per player per matchday | Phase 4 CSV uploader + rolling lockout |
| 2 | **Auto-sub trigger** | Spec says sub in if starter "scores 0 points (did not play)". Confirm the trigger is `minutes_played = 0` only — NOT `total_points = 0` (a player can play and still score 0 pts) | Auto-sub logic in scoring engine |
| 3 | **Captain 0-point rule** | If captain doesn't play: 0 × 2 = 0. Captain is NOT auto-subbed. Confirm this is intentional and whether a warning should be shown on My Team | Scoring engine + My Team UI |
| 4 | **Matchday creation flow** | Does admin create matchdays via a form on the Admin page, or via direct SQL for now? Phase 4 builds the UI either way — agree scope first | Admin page scope for Phase 4 |
| 5 | **Stats entry flow** | CSV file upload vs. manual per-player form? CSV is more practical for 30+ players per matchday | Admin stats upload UI scope |

---

## Phase 4 scope (from MASTER_DOCUMENT §13)

1. Admin: Matchday creation (name, wc_stage, start_date, deadline, activate/complete toggles)
2. Admin: Player stats upload — CSV import into `player_stats` table
3. Scoring engine: calculate `total_points` from stats + `scoring.json` config
4. Auto-substitution: if starter `minutes_played = 0` → sub in first valid bench player
5. Rolling lockout: players become uneditable once `player_stats.game_started_at` has passed
6. Fantasy standings: compute + write to `fantasy_standings` after matchday completes
7. Matchday results view: show each team's points for the matchday
8. Points breakdown: per-player stat contribution modal

## Good news for Phase 4

No new DB migrations needed — `matchdays`, `player_stats`, and `fantasy_standings` tables
plus all their RLS policies already exist in migrations 001–002.
Phase 4 is entirely frontend + business logic work.

---

## Current migration status (reference)

| File | Status |
|------|--------|
| 001_initial_schema.sql | ✓ Applied |
| 002_rls_policies.sql | ✓ Applied |
| 003_functions.sql | ✓ Applied |
| 004_auction_state_rls.sql | ✓ Applied |
| 005_fix_auction_state_rls.sql | ⚠ Verify applied |
| 006_admin_teams_policy.sql | ✓ Applied |
| 007_standings_public_read.sql | ⚠ **Pending — apply now** |
