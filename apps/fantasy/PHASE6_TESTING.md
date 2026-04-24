# Phase 6 — Transfer Windows Testing Guide

## What Was Built

| Item | File(s) |
|------|---------|
| Migration 012 — RLS for `transfer_windows` (auth read, admin write) + admin read on all `transfers` | `supabase/migrations/012_transfer_windows_rls.sql` |
| Admin: Transfer Windows section — preset create, custom create form | `src/pages/Admin.jsx` |
| Admin: Open/Close toggle (only one window active at a time) | `src/pages/Admin.jsx` |
| Admin: Delete window | `src/pages/Admin.jsx` |
| Admin: View Activity — all transfers across all teams for a window | `src/pages/Admin.jsx` |
| Transfers: Priority queue panel (inverse standings order, pip indicators) | `src/pages/Transfers.jsx` |
| Transfers: Lineup cleanup on transfer (removes player from active + null lineups) | `src/pages/Transfers.jsx` |

---

## Pre-Test Setup Checklist

- [ ] Migration 012 applied in Supabase SQL Editor
- [ ] Migrations 001–011 previously applied
- [ ] At least 2 teams enrolled (12 for full priority queue test — run `06_dummy_teams_extra.sql`)
- [ ] At least 1 matchday with standings calculated (required for priority queue to show meaningful order)
- [ ] Players in database (run `00_seed_players.sql` if needed)
- [ ] Dev server running: `npm run dev` from `fantasy/`

> **Note:** The transfer interface (making swaps) requires the logged-in user to have a team with players. The priority queue and admin sections work with any number of teams.

---

## Test Scenarios

### 1. Migration 012 — RLS Verification

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Apply migration 012 in Supabase SQL Editor | No errors |
| 1.2 | Open Transfers page as a logged-in non-admin user | Page loads without 401/403 errors |
| 1.3 | Open Admin page as admin | Transfer Windows section visible |
| 1.4 | Check Supabase: query `SELECT * FROM transfer_windows` as the anon/auth role | Returns rows (or empty table) — not a permission error |

---

### 2. Admin — Transfer Windows Section Visibility

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open Admin page as admin | "Transfer Windows" section appears below the Knockout Bracket section |
| 2.2 | Section with no windows created | "No transfer windows created yet." message |
| 2.3 | Quick Create buttons visible | Three buttons: "Window 1 — After R32 (7 transfers)", "Window 2 — After R16 (3 transfers)", "Window 3 — After QF (3 transfers)" |
| 2.4 | Custom form visible | Inputs for Window #, Max Transfers, Opens At, Closes At, and a Create button |

---

### 3. Admin — Creating Transfer Windows

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click "+ Window 1 — After R32 (7 transfers)" | New row appears in the windows table: Window 1, 7 transfers, Status: Closed |
| 3.2 | Click "+ Window 2 — After R16 (3 transfers)" | Row for Window 2 with 3 transfers, Status: Closed |
| 3.3 | Click "+ Window 3 — After QF (3 transfers)" | Row for Window 3 with 3 transfers, Status: Closed |
| 3.4 | Use custom form: set window #1, max 5, optional dates, click Create | New row with custom values appears |
| 3.5 | Leave Max Transfers empty and click Create | Error: "Max transfers must be ≥ 1." |
| 3.6 | Set window # outside 1–3 in custom form and click Create | Error: "Window number must be 1–3." |
| 3.7 | Set opens_at and closes_at datetimes | Row shows formatted open/close datetimes in the table |
| 3.8 | Leave opens_at/closes_at blank | Row shows "—" for those columns |

---

### 4. Admin — Open / Close Windows

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | With Window 1 closed, click "Open" | Status badge changes to "Open" (emerald); button changes to "Close" (red) |
| 4.2 | With Window 1 open, open Window 2 by clicking its "Open" button | Window 2 becomes Open; Window 1 automatically becomes Closed (only one active at a time) |
| 4.3 | With Window 2 open, click "Close" | Window 2 status returns to Closed |
| 4.4 | All windows closed | No windows show "Open" status |
| 4.5 | Open Window 1, then Open Window 3 | Window 1 becomes Closed, Window 3 becomes Open |

---

### 5. Admin — Delete Windows

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Click "Delete" on a closed window | Row disappears from the table |
| 5.2 | Click "Delete" on an open window | Window is deleted; list refreshes |
| 5.3 | Delete all windows | "No transfer windows created yet." message returns |

---

### 6. Transfers Page — No Active Window

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Visit `/transfers` with no active transfer window | "No transfer window is currently open" panel shown |
| 6.2 | Check info cards in closed state | Three cards: "Window 1 / After R32 / 7 transfers", "Window 2 / After R16 / 3 transfers", "Window 3 / After QF / 3 transfers" |
| 6.3 | No transfer controls visible | Player squad panel and available players panel are not shown |

---

### 7. Transfers Page — Window Active (Banner + Stats)

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | In Admin, open Window 1 (7 transfers) | — |
| 7.2 | Visit `/transfers` | Blue "Transfer Window 1 — Open" banner appears |
| 7.3 | Banner counters | "Remaining: 7", "Used: 0", "Max: 7" |
| 7.4 | Make 1 transfer (see Section 9) | Banner updates: "Remaining: 6", "Used: 1" |
| 7.5 | After using all 7 transfers | "Remaining: 0", "Used: 7" |
| 7.6 | Close Window 1 in Admin, reopen page | Returns to "No transfer window is currently open" state |

---

### 8. Transfers Page — Priority Queue Panel

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Open Window 1 in Admin, visit `/transfers` | "Transfer Priority Order" panel appears below the window banner |
| 8.2 | Panel header | "Lowest rank picks first" subtitle |
| 8.3 | With 12 teams in standings | 12 rows shown; team in last place (fewest pts) at position 1, top team at position 12 |
| 8.4 | Current user's row | Highlighted in blue (`bg-blue-900/20`), "(you)" label next to team name |
| 8.5 | Pip indicators | 7 grey dots per team initially (for Window 1) |
| 8.6 | After making 1 transfer | Your team's first pip turns emerald; remaining count shows "6 left" |
| 8.7 | After another team uses all transfers | That team's row shows 7 emerald pips + "Done" label |
| 8.8 | Points column | Each row shows total_points from standings |
| 8.9 | With no standings data | All teams show "0 pts"; order is indeterminate (alphabetical or insert order) |

---

### 9. Making a Transfer — Core Flow

> Pre-condition: active transfer window open, logged-in user has a team with 15 players.

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Click a player in "My Squad" panel | Row highlights with red ring; transfer preview strip appears showing player "Out" |
| 9.2 | Click the same player again | Selection cleared; preview strip disappears |
| 9.3 | Select a player out, then browse available players | Available Players panel becomes interactive; locked-slot player out → "(≤8.5M only — locked swap)" note appears |
| 9.4 | Click an available player | Player highlighted in emerald; "In" preview card populated |
| 9.5 | Preview strip shows budget impact | "Budget impact: +X.XM" or "-X.XM"; "£X.XM after" |
| 9.6 | "Confirm Transfer" button appears | Enabled when both out and in are selected and budget check passes |
| 9.7 | Click "Confirm Transfer" | Button shows "Transferring…" briefly |
| 9.8 | On success | Green "✓ Alex Torres → Jude Bellingham transfer complete!" banner; squad refreshes; player out replaced by player in |
| 9.9 | Window used count | Increments by 1; priority queue pip fills |

---

### 10. Transfer Validation

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Select a free-slot player out, then try to select a player who is already in the squad | Player is greyed out with "Owned" tag; cannot select |
| 10.2 | Select a locked player out, then try to select a player priced >8.5M | Player greyed out with ">8.5M" tag; cannot select |
| 10.3 | Select a free-slot player out, select expensive player in where budget would go negative | "Confirm Transfer" button is disabled (`budgetAfter < 0`) |
| 10.4 | Use all 7 transfers, try to transfer again | Error: "No transfers remaining in this window." |
| 10.5 | Budget impact preview with locked swap: out player cost 8.0M, in player costs 6.5M | Budget impact shows "+1.5M"; budget after = current + 1.5 |
| 10.6 | Budget impact with free-slot swap: out player cost 12.0M, in player costs 9.0M | Budget impact shows "+3.0M" |

---

### 11. Transfers — Lineup Cleanup

> Pre-condition: active matchday exists, transferred-out player is in the active matchday lineup.

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Set up lineup on My Team page (include player X in starters) | Player X visible in lineup |
| 11.2 | Open transfer window, transfer out player X | Transfer succeeds |
| 11.3 | Visit My Team page | Player X is no longer in the lineup (their lineup row deleted) |
| 11.4 | Check Supabase: `SELECT * FROM lineups WHERE player_id = <X's id>` | No rows for the active matchday or null matchday for this team |
| 11.5 | Lineup slot now empty | My Team page shows an empty starter or bench slot where player X was |
| 11.6 | Transfer a player who is NOT in the lineup | Transfer works; no lineup change required; no error |

---

### 12. Transfer History

| Step | Action | Expected |
|------|--------|----------|
| 12.1 | After making transfers, scroll to bottom of `/transfers` | "Transfer History" section appears |
| 12.2 | Each transfer row shows | Window badge (W1), red player name (out), arrow, green player name (in), budget delta, date |
| 12.3 | Locked swap row | Budget delta shown in red if negative, green if positive |
| 12.4 | History persists across windows | After Window 1 closes and Window 2 opens, Window 1 transfers still visible |
| 12.5 | History is user-scoped | User only sees their own transfers (not other teams') |

---

### 13. Admin — View Transfer Activity

| Step | Action | Expected |
|------|--------|----------|
| 13.1 | Open a transfer window in Admin | "View Activity" button appears next to the open window |
| 13.2 | Click "View Activity" before any transfers made | Activity table appears empty (or shows nothing) |
| 13.3 | After various users make transfers, click "View Activity" | Activity table shows all transfers across all teams |
| 13.4 | Activity table columns | Manager (display_name), Out (player name + position badge), In (player name + position badge), Type (Locked/Free badge), Δ Budget, Time |
| 13.5 | Locked swap row | Purple "Locked" badge |
| 13.6 | Free slot swap row | Blue "Free" badge |
| 13.7 | Δ Budget column | Green for positive (budget gained), red for negative (budget spent) |
| 13.8 | Activity sorted by time | Most recent transfer at top |

---

### 14. Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 14.1 | Open two browser tabs as the same user; transfer same player out in both tabs | Second transfer fails (player already removed from team_players) — error displayed |
| 14.2 | Close transfer window mid-transfer | Transfer already in progress completes; window check happens before transfer starts |
| 14.3 | User has no team | Transfers page shows "Loading transfers…" briefly then falls back gracefully |
| 14.4 | User has a team but 0 players | My Squad panel shows "No players in squad"; no transfers possible |
| 14.5 | Open Window 1, make transfers, close it, re-open Window 1 | Used count reads transfers already logged for window 1 — shows correct "X remaining" |
| 14.6 | Create two Window 1 rows (custom form + preset) | Both exist in DB; opening one closes the other — UI handles gracefully |

---

## Data Verification Queries

Run these in the Supabase SQL Editor to verify data after testing.

```sql
-- All transfer windows and their status
SELECT id, window_number, max_transfers, is_active, opens_at, closes_at
FROM transfer_windows
ORDER BY window_number;

-- All transfers logged (admin view — all teams)
SELECT
  t.window_number,
  teams.name  AS team,
  p_out.name  AS player_out,
  p_in.name   AS player_in,
  t.transfer_type,
  t.price_difference,
  t.created_at
FROM transfers t
JOIN teams      ON teams.id  = t.team_id
JOIN players p_out ON p_out.id = t.player_out_id
JOIN players p_in  ON p_in.id  = t.player_in_id
ORDER BY t.created_at DESC;

-- Transfers used per team for window 1
SELECT
  teams.name,
  COUNT(*) AS transfers_used
FROM transfers t
JOIN teams ON teams.id = t.team_id
WHERE t.window_number = 1
GROUP BY teams.name
ORDER BY transfers_used DESC;

-- Verify lineup cleanup: check player no longer in lineups after transfer
-- (Replace team_id and player_id with actual values)
SELECT * FROM lineups
WHERE team_id = <team_id>
  AND player_id = <transferred_out_player_id>;
-- Expected: 0 rows
```

---

## Known Limitations (not blocking Phase 7)

| Issue | Detail |
|-------|--------|
| No real-time window status | If admin opens/closes a window while a user has `/transfers` open, they won't see the change until they refresh |
| No confirmation on delete | Deleting a window with existing transfers logged to it leaves orphaned `transfers` rows in the DB (window_number still matches) |
| Queue is informational only | The priority order panel shows inverse standings, but there is no enforcement — any team can transfer at any time when the window is open |
| Budget validation doesn't enforce total squad cost ≤ 105M | The check verifies `budget_remaining ≥ 0` but doesn't recompute full squad value; edge cases possible if acquisition prices diverge from current prices |
| Transfer doesn't update null-matchday team_players | After a transfer, MyTeam still reads from `team_players`; the squad panel updates correctly because it re-fetches from `team_players` |
