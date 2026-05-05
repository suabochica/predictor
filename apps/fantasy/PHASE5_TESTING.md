# Phase 5 — Knockout Bracket Testing Guide

## What Was Built

| Item | File(s) |
|------|---------|
| Admin: Knockout Bracket section (seed + calculate rounds) | `src/pages/Admin.jsx` |
| Bracket seeding from live standings (1v8, 4v5, 2v7, 3v6 / 9v12, 10v11) | `src/pages/Admin.jsx`, `src/lib/brackets.js` |
| H2H resolution: matchday pts → captain pts → goals → league rank | `src/lib/brackets.js` |
| Auto-creation of next-round matches + placement assignment | `src/pages/Admin.jsx` |
| Bracket visualization: preview mode + actual match mode | `src/pages/Bracket.jsx` |
| MatchCard winner highlight for placement-only rows (no score) | `src/pages/Bracket.jsx` |

---

## Pre-Test Setup Checklist

- [ ] Migrations 001–011 all applied in Supabase SQL Editor
- [ ] Auction completed (`auction_state.status = 'completed'`)
- [ ] At least 8 teams enrolled with players in squad and saved lineups
- [ ] At least 1 matchday created, completed, and standings calculated via Admin → Calculate Standings
- [ ] Dev server running: `npm run dev` from `fantasy/`

> **Minimum viable test:** 8 teams with standings data (any matchday_points values). Relegation bracket tests require 12 teams.

---

## Test Scenarios

### 1. Admin — Knockout Bracket Section Visibility

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open Admin page while auction is `pending` or `active` | Knockout Bracket section is **not visible** |
| 1.2 | Open Admin page while auction is `completed` | Knockout Bracket section appears below Calculate Standings |
| 1.3 | Section with no standings data | Yellow warning: "Need standings for at least 8 teams. Run Calculate Standings first." Seed Bracket button is disabled. |

---

### 2. Admin — Seed Bracket (Pre-conditions: 8+ teams with standings)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open Admin with 8+ teams in standings | Knockout Bracket section shows seeding preview under "Championship (Top 8)" heading |
| 2.2 | Verify championship preview | 4 preview cards: 1st vs 8th, 4th vs 5th, 2nd vs 7th, 3rd vs 6th (by standings order) |
| 2.3 | With 12 teams: check relegation preview | "Relegation (Bottom 4)" section shows 9th vs 12th, 10th vs 11th |
| 2.4 | With 8–11 teams | Relegation preview section does not appear |
| 2.5 | Click "Seed Bracket" | Button shows "Seeding…", then green success: "✓ Bracket seeded — N matches created." |
| 2.6 | Check `knockout_matches` table in Supabase | 4 championship rows (round=1, bracket='championship', labels Match A–D) + 2 relegation rows if 12 teams |
| 2.7 | Verify team assignments | Match A: team_a_id = standings rank 1, team_b_id = standings rank 8 |
| 2.8 | Click "Seed Bracket" again (already seeded) | Should error or the button is no longer visible (bracket now has matches) |

---

### 3. Admin — Round 1 State Display

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | After seeding, reload Admin | Knockout Bracket section now shows "Bracket exists" view |
| 3.2 | Round status pills at top | Round 1 shows yellow "Pending", Round 2 and Round 3 show grey "Not started" |
| 3.3 | Unresolved match table | Shows all Round 1 matches with team names and bracket labels |
| 3.4 | Matchday selector | Lists all available matchdays from the matchdays table |

---

### 4. Admin — Calculate Round 1

> Pre-condition: at least one matchday has player_stats uploaded and standings calculated.

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Leave matchday selector empty and click "Calculate Round 1" | Button is disabled when no matchday selected |
| 4.2 | Select a matchday and click "Calculate Round 1" | Button shows "Calculating…" |
| 4.3 | On success | Green result: "✓ N matches resolved." |
| 4.4 | Check `knockout_matches` Round 1 rows in Supabase | All have `winner_id`, `team_a_points`, `team_b_points`, `team_a_captain_points`, `team_b_captain_points`, `team_a_goals`, `team_b_goals`, `matchday_id` populated |
| 4.5 | Verify winner logic | Winner = team with higher `matchday_points` for the selected matchday |
| 4.6 | Verify tiebreaker (manually create a tie) | If points equal, winner = team with higher captain score (base × 2); then goals; then lower league rank |
| 4.7 | Round 2 matches created | Check `knockout_matches` for round=2 rows: championship Semi A, Semi B; losers 5/6 Match, 7/8 Match; relegation 9th Place, 11th Place |
| 4.8 | Semi A teams | team_a_id = winner of Match A, team_b_id = winner of Match B |
| 4.9 | 5/6 Match teams | team_a_id = loser of Match A, team_b_id = loser of Match B |
| 4.10 | After reload: Round status pills | Round 1 shows emerald "Complete", Round 2 shows yellow "Pending" |
| 4.11 | Unresolved match table | Now shows Round 2 matches |

---

### 5. Admin — Calculate Round 2

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Select a matchday (can be same or different from Round 1) and click "Calculate Round 2" | All Round 2 championship + losers + relegation matches resolved |
| 5.2 | Check relegation matches have placements | `knockout_matches` rows for `match_label='9th Place'` and `match_label='11th Place'` (bracket='relegation', round=2) have `placement` and `winner_id` set |
| 5.3 | Check Round 3 matches created | championship: Final, 3rd Place; losers: 5th Place, 7th Place |
| 5.4 | 5th Place row | `winner_id` pre-set to winner of 5/6 Match; `team_a_points` and `team_b_points` are null (no match played) |
| 5.5 | 7th Place row | Same pattern as 5th Place |
| 5.6 | Final teams | winner of Semi A vs winner of Semi B |
| 5.7 | 3rd Place teams | loser of Semi A vs loser of Semi B |
| 5.8 | Round 3 status pill | Yellow "Pending" |

---

### 6. Admin — Calculate Round 3 (Finals)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Select a matchday and click "Calculate Round 3" | Only championship Final and 3rd Place rows are resolved (losers 5th/7th are skipped — already pre-set) |
| 6.2 | Final row in Supabase | `winner_id` set, `placement = '1st Place'` |
| 6.3 | 3rd Place row in Supabase | `winner_id` set, `placement = '3rd Place'` |
| 6.4 | Round 3 status pill | Emerald "Complete" |
| 6.5 | Success banner | "✓ All rounds complete. View final standings on the Bracket page." |

---

### 7. Bracket Page — Pre-Seeded State

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Visit `/bracket` with no knockout_matches rows, fewer than 8 standings | "Bracket not seeded yet" panel |
| 7.2 | Visit `/bracket` with 8+ standings but no DB matches | Yellow banner: "Preview based on current standings — bracket locks when league stage is finalised." |
| 7.3 | Championship preview | Dashed cards with seed numbers: (1) vs (8), (4) vs (5), (2) vs (7), (3) vs (6) |
| 7.4 | Round 2 preview | TBD placeholders (WA, WB, LC, LD etc.) |
| 7.5 | With 12 teams: relegation preview | 9th vs 12th, 10th vs 11th dashed cards |

---

### 8. Bracket Page — Round 1 Active (no winners yet)

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Visit `/bracket` after seeding but before calculating Round 1 | Live bracket replaces preview; Match A–D show team names but no scores |
| 8.2 | MatchCard appearance | Both teams shown in neutral grey (text-gray-300), no "W" badge, no score numbers |
| 8.3 | Relegation section | Match X and Match Y visible with team names |

---

### 9. Bracket Page — After Round 1 Resolved

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Reload `/bracket` after calculating Round 1 | Match A–D show scores for both teams |
| 9.2 | Winner row | White text, "W" badge in emerald, score in emerald |
| 9.3 | Loser row | Greyed out (text-gray-500) |
| 9.4 | Round 2 column appears | Semi A, Semi B, 5/6 Match, 7/8 Match visible with team names (no scores yet) |
| 9.5 | Relegation column | 9th Place and 11th Place matches visible |

---

### 10. Bracket Page — After Round 2 Resolved

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Reload `/bracket` after calculating Round 2 | Semi A and Semi B show scores + winners |
| 10.2 | 5/6 Match and 7/8 Match | Show scores + winners |
| 10.3 | Round 3 column | Final and 3rd Place show team names (no scores); 5th Place and 7th Place show team names, winner highlighted in white (no scores — placement-only rows) |
| 10.4 | 5th Place card | Winner team shows "W" in emerald and white text; runner-up in neutral grey (no score numbers since no match played) |
| 10.5 | Relegation Round 2 | 9th Place and 11th Place show scores; winners highlighted |

---

### 11. Bracket Page — All Rounds Complete (Final Standings)

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Reload `/bracket` after calculating Round 3 | All match columns show complete results |
| 11.2 | Final and 3rd Place cards | Scores + winners highlighted |
| 11.3 | Final standings grid appears | Section "Final Standings" shows cards for each placement row (1st, 3rd, 5th, 7th, 9th, 11th) |
| 11.4 | 1st place card | Shows 🏆 trophy icon and champion's name |
| 11.5 | 3rd, 5th, 7th place cards | Show rank number and team name |
| 11.6 | 9th, 11th place cards | Show relegation bracket placements |
| 11.7 | H2H scoring rules footnote | Always visible at bottom of bracket page |

---

### 12. Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 12.1 | Calculate Round 1 with no fantasy_standings for selected matchday | All teams get 0 matchday_points; winner determined by captain/goals/rank tiebreakers |
| 12.2 | Team has no lineup saved for the matchday (no captain) | Captain points = 0; match still resolves using matchday_points and goals |
| 12.3 | Perfect tie on all tiebreakers | Higher league seed (lower rank number) wins |
| 12.4 | Click "Calculate Round 1" after it's already resolved | "No unresolved matches for this round." error message |
| 12.5 | Reload Admin mid-calculation | State reloads cleanly; no duplicate rows created (idempotent `exists()` checks on next-round creation) |

---

## Data Verification Queries

Run these in the Supabase SQL Editor to verify data integrity after each calculate step.

```sql
-- Round 1: all 4 championship matches resolved
SELECT match_label, team_a_points, team_b_points, winner_id
FROM knockout_matches
WHERE round = 1 AND bracket = 'championship'
ORDER BY match_label;

-- Round 2: Semi matches + losers bracket exist
SELECT bracket, match_label, team_a_id, team_b_id, winner_id
FROM knockout_matches
WHERE round = 2
ORDER BY bracket, match_label;

-- Round 3: Final and 3rd Place created, 5th/7th have winner_id pre-set
SELECT bracket, match_label, team_a_points, team_b_points, winner_id, placement
FROM knockout_matches
WHERE round = 3
ORDER BY bracket, match_label;

-- Final standings: all placements assigned
SELECT match_label, placement, winner_id
FROM knockout_matches
WHERE placement IS NOT NULL
ORDER BY placement;
```

---

## Known Limitations (not blocking Phase 6)

| Issue | Detail |
|-------|--------|
| 2nd/4th/6th/8th/10th/12th not in final standings grid | Final Standings only shows winners of each placement match. Runner-up placements are implied but not shown as separate cards. Phase 7 polish. |
| Relegation teams shown in Round 3 column header | The bracket page shows 4 columns (R1, R2, Final) for the championship; relegation bracket has 2 columns and no Round 3 column (placements determined in Round 2). |
| No confirmation before seeding | Seeding is one-click with no "are you sure?" modal. Don't click if standings aren't final. |
| Re-seeding blocked implicitly | Once any knockout_matches rows exist, the seeding UI disappears. To re-seed: delete all rows from `knockout_matches` in Supabase and reload Admin. |
