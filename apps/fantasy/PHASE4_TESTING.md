# Phase 4 Testing Guide

> Test each section in order — each one depends on the previous.

---

## Prerequisites

- Logged in as **admin** for Admin panel tests
- Logged in as a **regular user** (with a team) for My Team / History tests
- Auction must be **completed** (players assigned to teams)

---

## 1. Matchday Creation

**Route:** `/admin` → Matchday Management section

### Create a matchday

1. Fill in Name: `Matchday 1`
2. WC Stage: `Group Stage MD1`
3. Start Date: any upcoming date
4. Lineup Deadline: any future datetime
5. Click **Create Matchday**

**Expected:** Row appears in the matchday list below the form. No page reload needed.

### Activate a matchday

1. Click the **Inactive** toggle on the new matchday
2. **Expected:** Button turns green and shows **Active**

### Mark complete

1. Click **Mark Complete** on an active matchday
2. **Expected:** Button turns blue and shows **Completed**; Active toggle becomes disabled (greyed out)

### Edge cases

- Submit with empty Name → should show "Name is required." error
- Submit with no Deadline → should show "Deadline is required." error

---

## 2. Stats CSV Upload

**Route:** `/admin` → Stats CSV Upload section

### Prepare a test CSV

Save as `test_stats.csv`:

```csv
player_name,minutes,goals,assists,clean_sheet,saves,penalty_saves,penalty_misses,yellow,red,own_goals,goals_conceded,game_time
```

Replace `player_name` with exact names from your players table. Example rows:

```
Kylian Mbappé,90,2,1,0,0,0,0,0,0,0,0,2026-06-11T18:00:00Z
Manuel Neuer,90,0,0,1,5,0,0,0,0,0,0,2026-06-11T15:00:00Z
Harry Kane,0,0,0,0,0,0,0,0,0,0,0,2026-06-11T18:00:00Z
```

### Upload test

1. Select a matchday from the dropdown
2. Choose `test_stats.csv`
3. Click **Upload Stats**

**Expected:** Green confirmation: "X player stat rows saved."

### Error cases

- Player name that doesn't match DB → shown in yellow error list but other rows still save
- No matchday selected → "Select a matchday first."
- No file selected → "Select a CSV file."
- Empty CSV (header only) → "CSV is empty or has no data rows."

### Verify in Supabase

Run in SQL Editor:
```sql
SELECT p.name, ps.minutes_played, ps.goals, ps.total_points
FROM player_stats ps
JOIN players p ON p.id = ps.player_id
WHERE ps.matchday_id = <your matchday id>;
```

Confirm `total_points` matches expected scoring (see §6 in MASTER_DOCUMENT).

### Scoring spot-checks

| Scenario | Expected pts |
|----------|-------------|
| GK, 90 min, clean sheet, 3 saves | 2 + 4 + 1 = 7 |
| FWD, 90 min, 2 goals, 1 assist | 2 + 8 + 3 = 13 |
| DEF, 90 min, clean sheet, 1 yellow | 2 + 4 - 1 = 5 |
| MID, 30 min, 0 stats | 1 |
| Any, 0 min | 0 |

---

## 3. Rolling Lockout (My Team)

**Route:** `/my-team`

### Setup

Upload stats CSV with `game_time` set to a **past** timestamp for some players and a **future** timestamp for others.

### Test

1. Open My Team — players with past `game_time` should show a 🔒 in their row
2. Try clicking a locked player and then another player to swap
3. **Expected:** Red swap error: "X's game has already started — they cannot be moved."
4. Swapping two unlocked players should still work normally

### Captain warning

1. Set a player as captain whose `game_time` is in the past
2. **Expected:** Orange warning banner: "Your captain's game has already kicked off..."

### Rolling lockout notice

When any game times exist for the active matchday:
- **Expected:** Grey info bar: "Rolling lockout active — players whose game has kicked off cannot be moved."

---

## 4. Calculate Standings

**Route:** `/admin` → Calculate Standings section

### Setup

- At least one matchday with stats uploaded
- At least one team with a saved lineup for that matchday

### Test

1. Select the matchday
2. Click **Calculate Standings**
3. **Expected:** Green confirmation: "Standings calculated for X teams."

### Warnings (not errors)

- Teams with no lineup saved → yellow warning: "TeamName: no lineup found for this matchday — skipped."

### Verify in Supabase

```sql
SELECT t.name, fs.matchday_points, fs.total_points, fs.goals_scored
FROM fantasy_standings fs
JOIN teams t ON t.id = fs.team_id
WHERE fs.matchday_id = <your matchday id>
ORDER BY fs.matchday_points DESC;
```

### Re-run idempotency

Run Calculate Standings again on the same matchday.
**Expected:** No duplicate rows — upsert on `(team_id, matchday_id)` replaces existing.

---

## 5. Auto-Substitution

### Setup

Upload stats with at least one starter having `minutes_played = 0`. Ensure that team has a bench player of a compatible position.

### Verify via History modal (see §6 below)

In the breakdown modal, the subbed-out player should appear with strikethrough + "Subbed out (0 min)", and the bench player who replaced them should show "Sub" badge.

### Captain is never auto-subbed

Upload stats where the captain has `minutes_played = 0`.
**Expected:**
- Captain stays in lineup (no auto-sub)
- Captain scores 0 × 2 = 0 pts
- No "Sub" badge appears for captain

---

## 6. Matchday History & Points Breakdown

**Route:** `/history`

### After standings are calculated

1. Navigate to History
2. **Expected:** Completed matchday appears with a table of all teams, sorted by matchday points
3. Your team row highlighted in green
4. Click a points number to open the breakdown modal

### Breakdown modal

**Expected:**
- Per-player rows with position badge, name, stat line, and points
- Captain row shows "C" badge and `base × 2` notation
- Auto-subbed-out player shows strikethrough
- Auto-subbed-in player shows "Sub" badge
- Bench players not used show as greyed out "Bench (unused)"
- Total at the bottom matches `matchday_points` in the standings table

### Edge cases

- Team with no lineup → modal shows "No lineup found for this matchday."
- Matchday not yet completed → does not appear in history list

---

## Known limitations (not bugs)

- Rolling lockout check uses `Date.now()` at page load — a player whose game kicks off while the page is open won't auto-lock until page refresh
- Standings calculation is additive: total_points adds the new matchday's points to whatever was previously in the DB. Run once per matchday only (re-running is idempotent due to upsert, but the total_points field accumulates from the previous DB value — so don't delete and re-insert manually between runs)
