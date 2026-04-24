# Phase 3 — Build Summary, Known Issues & Testing Guide

## What Was Built

### New Pages

| Page | Route | Description |
|------|-------|-------------|
| My Team | `/my-team` | Squad viewer + lineup builder (formation, captain, bench order) |
| Standings | `/standings` | League table with per-matchday breakdown + bracket split indicator |
| Market | `/market` | Post-auction free slot shopping with confirm modal |
| Transfers | `/transfers` | Transfer window swap UI + history |
| Bracket | `/bracket` | Knockout bracket visualisation (seeded preview + live from DB) |

### New Components

| File | What it does |
|------|-------------|
| `src/components/team/FormationPicker.jsx` | Pill button selector for 7 valid formations |
| `src/components/team/PlayerSlot.jsx` | Player tile: position badge, last name, country code, captain C badge |
| `src/components/team/LineupGrid.jsx` | Football pitch view — FWD→MID→DEF→GK rows, dashed empty slots |
| `src/components/team/BenchList.jsx` | 4 bench slots with ←/→ priority reorder arrows |
| `src/components/market/FilterBar.jsx` | Position pills, name search, max price, affordable-only, hide-owned |
| `src/components/market/PlayerCard.jsx` | Market player card with Buy button and status states |

### Updated Hooks

| Hook | Change |
|------|--------|
| `src/hooks/useStandings.js` | Rebuilt — fetches all teams + all fantasy_standings rows separately, aggregates per-team; falls back to zero-point table when no matchday data exists |
| `src/hooks/useKnockout.js` | Updated FK join aliases (`team_a`, `team_b`, `winner`) to correctly resolve two FKs pointing at `teams` |

### New Migrations

| File | What it does | Status |
|------|-------------|--------|
| `007_standings_public_read.sql` | Adds `"Authenticated users can view all teams"` policy — required for Standings and Bracket to read all participant names | **⚠ Pending — must be applied in Supabase SQL Editor** |

---

## Pre-Test Setup Checklist

Complete all of these before running tests.

- [ ] Migrations `001` → `007` all applied in Supabase SQL Editor
  - **Migration 007 is new this phase** — apply it if not already done
- [ ] `seed.sql` run (creates the single `auction_state` row)
- [ ] Players imported into `players` table (`sample_players.csv` or real data)
- [ ] At least 2 users registered; both enrolled via Admin → League Participants
- [ ] Auction run and completed (or manually set `auction_state.status = 'completed'` in Supabase Table Editor) so the Market opens
- [ ] At least one user has players in `team_players` (from auction or manual insert) — needed to test My Team and Market "owned" states
- [ ] Dev server running: `npm run dev` from `fantasy/`

---

## Test Scenarios

### 1. My Team — Basic Squad View

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Visit `/my-team` while not enrolled (no `teams` row) | "You're not enrolled in the league yet" message |
| 1.2 | Visit `/my-team` enrolled but with 0 players | "No players yet" empty state with tip to use auction/market |
| 1.3 | Visit `/my-team` with players in squad | Pitch loads, default 4-3-3 applied with highest-priced players starting |
| 1.4 | Full squad table at bottom | Each player shows position, name, country code, price, and Starting/Bench N/Captain status |

### 2. My Team — Formation

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Click a different formation pill (e.g. `3-5-2`) | Pitch rows update immediately; empty dashed slots appear if starters don't fill new requirements |
| 2.2 | Observe yellow warning banner | Appears if current starters don't match new formation counts |
| 2.3 | Switch to an identical formation (same GK/DEF/MID/FWD counts) | No warning |

### 3. My Team — Swap & Captain

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click a starter on the pitch | Player card gets emerald ring, action panel appears below pitch |
| 3.2 | Click the same player again | Deselects (ring disappears, action panel clears) |
| 3.3 | Click starter A, then bench player B (compatible position) | A moves to bench, B moves to starting XI; no warning |
| 3.4 | Click starter A (DEF), then bench player B (GK) with 4-3-3 (needs exactly 1 GK) | Red swap error: "formation would be broken" — no swap executed |
| 3.5 | Click a starter, click "Make Captain" in action panel | Gold C badge appears on that player's slot |
| 3.6 | Click a bench player when a starter is selected | Action panel shows "Click another player to swap" hint |
| 3.7 | Click two bench players | They swap bench priority order |

### 4. My Team — Bench Reorder

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Click `←` on bench player #1 | Disabled (already first) |
| 4.2 | Click `→` on bench player #1 | Player moves to position #2; numbers update |
| 4.3 | Click `←` on bench player #4 | Player moves to position #3 |

### 5. My Team — Save Lineup

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Attempt to save with valid formation + captain + 11 starters + 4 bench | "Save Lineup" button enabled; on click shows "Saving…" then "Lineup saved!" |
| 5.2 | Check `lineups` table in Supabase | 15 rows for this team (11 `is_starting=true`, 4 `is_starting=false` with `bench_order` 1-4, 1 `is_captain=true`) |
| 5.3 | Reload `/my-team` | Saved lineup is restored correctly |
| 5.4 | Save with no captain selected | "Select a captain." hint; button disabled |
| 5.5 | Save with only 10 starters (lineup not valid) | "Need 11 starters (10/11)." hint; button disabled |

### 6. Standings — Pre-tournament

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Visit `/standings` with no `fantasy_standings` rows | Table shows all enrolled participants with `0` pts; "No scores yet" notice visible |
| 6.2 | Check rank badges | All show grey numbered circles |
| 6.3 | Check MD1-MD4 columns | All show `—` |

### 7. Standings — With Scores

Manually insert test rows into `fantasy_standings` for two teams and one matchday:
```sql
INSERT INTO fantasy_standings (team_id, matchday_id, matchday_points, total_points, goals_scored)
VALUES (1, 1, 42, 42, 3), (2, 1, 35, 35, 2);
```

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Reload `/standings` | Leader card shows the team with 42 pts |
| 7.2 | Check sort order | Higher points team first, tiebreaker by goals_scored |
| 7.3 | With 8+ participants: check bracket split | Ranks 1-8 show emerald left border + "Champ" badge; bottom 4 show red left border + "Releg" badge |
| 7.4 | Top-3 rank badges | Rank 1 = yellow, 2 = grey, 3 = orange |

### 8. Market — Guards

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Visit `/market` with auction status `pending` or `active` | "Market is closed" panel with explanation |
| 8.2 | Set `auction_state.status = 'completed'` in Supabase | Market opens, player grid loads |
| 8.3 | Visit `/market` not enrolled | "You're not enrolled" message |

### 9. Market — Browsing & Filtering

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Default view (auction completed) | All players shown sorted by price desc; owned players hidden (hide-owned checked by default) |
| 9.2 | Click `GK` position filter | Grid filters to goalkeepers only; result count updates |
| 9.3 | Type name in search box | Grid filters live to matching players |
| 9.4 | Set max price to `7` | Players >7.0M hidden |
| 9.5 | Check "Affordable only" | Players costing more than budget_remaining are hidden |
| 9.6 | Uncheck "Hide owned" | Owned players appear with "✓ In Squad" green button, no Buy action |
| 9.7 | Players >8.5M | Show "Market only" purple badge |

### 10. Market — Purchase Flow

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Click "Buy X.XM" on an affordable player | Confirmation modal appears with player info, budget before/after, squad size impact |
| 10.2 | Click "Cancel" in modal | Modal closes, no DB change |
| 10.3 | Click "Confirm" | Modal closes; green success toast appears ("Player added for X.XM"); player now in squad |
| 10.4 | Check `team_players` in Supabase | New row with `slot_type='free'`, `is_locked=false`, `acquisition_price` = player's price |
| 10.5 | Check `teams.budget_remaining` in Supabase | Reduced by player's price |
| 10.6 | Try to buy same player again | "Buy" button no longer appears for that player (owned) |
| 10.7 | Fill squad to 15 players | "Squad Full" banner appears; all remaining Buy buttons show "Squad Full" (disabled) |
| 10.8 | Click "Buy" on a player costing more than budget | Button shows "Over Budget" (disabled) |

### 11. Transfers — No Active Window

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Visit `/transfers` with no `transfer_windows` row where `is_active=true` | "No transfer window is currently open" panel with all 3 window info cards |

### 12. Transfers — Window Open

Manually insert a transfer window:
```sql
INSERT INTO transfer_windows (window_number, max_transfers, is_active, opens_at, closes_at)
VALUES (1, 7, true, now(), now() + interval '1 day');
```

| Step | Action | Expected |
|------|--------|----------|
| 12.1 | Reload `/transfers` | Window banner shows "Transfer Window 1 — Open", transfers used 0/7 |
| 12.2 | Click a player in "My Squad" panel | Row highlights red; Available Players panel activates |
| 12.3 | Click same player again | Deselects |
| 12.4 | Click a locked player in squad | Available Players header shows "(≤8.5M only — locked swap)" constraint |
| 12.5 | Select a locked player out, observe Available Players | Players >8.5M are dimmed/disabled |
| 12.6 | Select a free slot player out | No ≤8.5M restriction on available players |

### 13. Transfers — Executing a Swap

| Step | Action | Expected |
|------|--------|----------|
| 13.1 | Select player out + player in (compatible) | Transfer Preview strip appears: out card, → arrow, in card, budget impact, "Confirm Transfer" button |
| 13.2 | Budget impact for cheaper-in player | Shows `+X.XM` in emerald |
| 13.3 | Budget impact for pricier-in player | Shows `-X.XM` in red |
| 13.4 | Click "Confirm Transfer" | "Transferring…" state; on success: success toast, preview resets, transfer count increments |
| 13.5 | Check `team_players` in Supabase | Old player row gone, new player row present with correct `slot_type` and `acquisition_price` |
| 13.6 | Check `teams.budget_remaining` | Updated correctly |
| 13.7 | Check `transfers` table | New row with correct `window_number`, `player_out_id`, `player_in_id`, `price_difference` |
| 13.8 | Transfer history section | New row visible at bottom with window badge, player names, price diff |
| 13.9 | Use all 7 transfers | Confirm button becomes disabled; error "No transfers remaining" if attempted |

### 14. Bracket — Pre-league

| Step | Action | Expected |
|------|--------|----------|
| 14.1 | Visit `/bracket` with no `knockout_matches` rows and fewer than 8 standings entries | "Bracket not seeded yet" panel |
| 14.2 | Visit `/bracket` with 8+ teams in standings | Seeded preview: dashed cards, yellow notice, seed numbers (1v8, 4v5, 2v7, 3v6) in Championship R1 |
| 14.3 | With 12 teams | Relegation bracket preview also shown (9v12, 10v11) |
| 14.4 | Round 2 and Round 3 preview columns | Show "TBD" style cards with winner/loser labels |

### 15. Bracket — Live Data

Manually insert knockout_matches rows to simulate:
```sql
INSERT INTO knockout_matches (round, bracket, match_label, team_a_id, team_b_id, team_a_points, team_b_points, winner_id)
VALUES (1, 'championship', 'Match A', 1, 2, 45, 38, 1);
```

| Step | Action | Expected |
|------|--------|----------|
| 15.1 | Reload `/bracket` | Live layout replaces preview; Match A shows team names and scores |
| 15.2 | Winner row | Shows "W" badge in emerald, score in emerald; loser is greyed out |
| 15.3 | Match without result | Shows team names, no scores, no winner badge |
| 15.4 | Match with `placement` set | Placement label (e.g. "Final") shown on card |
| 15.5 | When all finals have `winner_id` and `placement` | Final standings grid appears at top with trophy for 1st |

---

## Known Issues & Limitations

### 1. Transfer history player names may show as IDs
The `useTransfers` hook query `players!player_out_id(name)` uses PostgREST disambiguation syntax that may not resolve correctly in all Supabase versions. If history shows "Player #5" instead of names, the fix is to use aliased FK syntax in the hook:
```js
.select('*, player_out:players!transfers_player_out_id_fkey(name), player_in:players!transfers_player_in_id_fkey(name)')
```

### 2. My Team saves to `matchday_id = null` pre-tournament
When no active matchday exists, lineup rows are saved with `matchday_id = NULL`. The UNIQUE constraint `(team_id, matchday_id, player_id)` does not enforce uniqueness on NULLs in PostgreSQL, but the DELETE + INSERT pattern in `saveLineup()` handles this safely at the application level. When Phase 4 activates real matchdays, the page will load from the active matchday's rows correctly.

### 3. Market purchase is two separate DB writes (not atomic)
`team_players` INSERT and `teams` budget UPDATE are separate operations. If one fails and the other succeeds, data can be inconsistent. Fix: wrap in a Postgres function or use Supabase Edge Function for atomic transactions. Acceptable for Phase 3.

### 4. Lineup captain can become stale after a swap
If you swap out the captain to the bench and save, `captainId` is cleared locally. But if the page is reloaded before saving, the old captain persists in the DB until overwritten. Mitigation: always save after any swap that affects the captain.

### 5. Bracket preview seeding uses live standings (not locked)
The bracket preview re-runs `generateChampionshipBracket(standings)` on every render. If standings change between preview and actual lock-in, the preview may not match the final bracket. This is expected behaviour — the preview is informational only.

### 6. Standings page: own-team highlight not implemented
The standings table has a comment about highlighting the current user's row. It was left unimplemented in Phase 3 because `teams.user_id` is not returned in the standings data model. Can be added in a later pass.

---

## Decisions Required Before Phase 4

| Decision | Detail | Impact |
|----------|--------|--------|
| **Real player data** | `sample_players.csv` is placeholder data. Real WC2026 squads need to be imported before any matchday scoring is meaningful. | All scoring, standings, and market pages |
| **Matchday deadlines** | Phase 4 will use `matchdays.deadline` to enforce the rolling lockout. Admin must set a realistic deadline when creating each matchday. | `MyTeam` lineup lock, auto-sub logic |
| **Lineup matchday linkage** | Currently lineups can be saved with `matchday_id = null`. Phase 4 needs lineups tied to specific matchdays. Test the transition: create a matchday, mark it active, verify My Team saves to the correct `matchday_id`. | Scoring engine reads lineup by matchday |
| **Stats upload format** | Phase 4 introduces a CSV stats upload. Column names must exactly match the MASTER_DOCUMENT spec (see Section 11.2). Agree on format before building the upload UI. | Admin stats import |
| **Auto-sub rule for 0-point players** | Spec: sub in if starter scores 0 points (did not play). This means `minutes_played = 0`. Confirm this is the only trigger (not low points, not injuries). | Auto-sub logic in scoring engine |
| **captain 0-point edge case** | If captain doesn't play (0 pts), captain is NOT auto-subbed — earns 0×2 = 0. Verify this is intentional and add a warning in the My Team UI for this edge case. | UI + scoring engine |

---

## Phase 4 Readiness Checklist

- [ ] Migration 007 applied in Supabase SQL Editor
- [ ] All Phase 3 pages tested manually against real data
- [ ] Auction completed (or simulated) so market is accessible
- [ ] At least 2 teams enrolled with players in squad
- [ ] Confirm `matchdays` table has the correct `wc_stage` values for standings column labels
- [ ] Confirm `player_stats.game_started_at` will be populated per-player (not per-match) — required for rolling lockout
- [ ] Decide on admin matchday creation UI (form or direct SQL)
- [ ] Decide on stats import: CSV file upload or manual per-player entry form
