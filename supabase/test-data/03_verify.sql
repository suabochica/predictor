-- ============================================================
-- Phase 4 Test Data — Step 3: Verify Everything
-- ============================================================
-- Run any of these queries individually in the Supabase SQL
-- Editor to confirm your test data is in the right shape.
-- ============================================================


-- ── 1. All users and their teams ─────────────────────────────
SELECT
  u.display_name,
  u.email,
  u.is_admin,
  t.name      AS team_name,
  t.budget_remaining
FROM users u
LEFT JOIN teams t ON t.user_id = u.id
ORDER BY u.is_admin DESC, u.display_name;


-- ── 2. Matchdays (check ids before running 02_test_lineups) ──
SELECT id, name, wc_stage, is_active, is_completed, deadline
FROM matchdays
ORDER BY id;


-- ── 3. Lineups per team per matchday ─────────────────────────
-- Shows starters, bench count, and captain for each team.
-- Change matchday_id = 1 if needed.
SELECT
  md.name                                                        AS matchday,
  t.name                                                         AS team,
  COUNT(*)                                                       AS total_players,
  SUM(CASE WHEN l.is_starting   THEN 1 ELSE 0 END)              AS starters,
  SUM(CASE WHEN NOT l.is_starting THEN 1 ELSE 0 END)            AS bench,
  MAX(CASE WHEN l.is_captain THEN p.name ELSE NULL END)         AS captain
FROM lineups l
JOIN teams    t  ON t.id  = l.team_id
JOIN players  p  ON p.id  = l.player_id
JOIN matchdays md ON md.id = l.matchday_id
GROUP BY md.name, t.name
ORDER BY md.name, t.name;


-- ── 4. Player stats for a matchday ───────────────────────────
-- Confirm points were calculated correctly after CSV upload.
-- Change matchday_id = 1 if needed.
SELECT
  p.name,
  p.position,
  ps.minutes_played,
  ps.goals,
  ps.assists,
  ps.clean_sheet,
  ps.saves,
  ps.yellow_cards,
  ps.red_cards,
  ps.total_points,
  ps.game_started_at
FROM player_stats ps
JOIN players p ON p.id = ps.player_id
WHERE ps.matchday_id = 1
ORDER BY ps.total_points DESC;


-- ── 5. Fantasy standings after Calculate Standings runs ──────
SELECT
  t.name               AS team,
  fs.matchday_id,
  fs.matchday_points,
  fs.total_points,
  fs.goals_scored
FROM fantasy_standings fs
JOIN teams t ON t.id = fs.team_id
ORDER BY fs.total_points DESC;
