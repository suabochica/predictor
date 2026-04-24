-- ============================================================
-- Phase 6 Test Data — Extra Dummy Users & Teams (6 more)
-- ============================================================
-- Run this in the Supabase SQL Editor.
--
-- Pre-condition: 01_dummy_users_and_teams.sql already run
--   (creates dummies 1–4). This script adds dummies 5–10,
--   bringing the total to 10 dummy teams. Combined with your
--   2 real user teams = 12 teams for full bracket testing.
--
-- What it creates:
--   • 6 dummy users in the `users` table (dummies 5–10)
--   • 1 team per dummy user
--
-- These users have NO Supabase Auth records — cannot log in.
-- ============================================================

INSERT INTO users (id, email, display_name)
VALUES
  ('11111111-0000-0000-0000-000000000005', 'dummy5@test.com',  'Taylor Kim'),
  ('11111111-0000-0000-0000-000000000006', 'dummy6@test.com',  'Jordan Walsh'),
  ('11111111-0000-0000-0000-000000000007', 'dummy7@test.com',  'Casey Patel'),
  ('11111111-0000-0000-0000-000000000008', 'dummy8@test.com',  'Riley Okafor'),
  ('11111111-0000-0000-0000-000000000009', 'dummy9@test.com',  'Avery Müller'),
  ('11111111-0000-0000-0000-000000000010', 'dummy10@test.com', 'Quinn Santos')
ON CONFLICT (email) DO NOTHING;

INSERT INTO teams (user_id, name, budget_remaining)
SELECT
  id,
  display_name || '''s FC',
  105.0
FROM users
WHERE email IN (
  'dummy5@test.com',
  'dummy6@test.com',
  'dummy7@test.com',
  'dummy8@test.com',
  'dummy9@test.com',
  'dummy10@test.com'
)
ON CONFLICT DO NOTHING;

-- ── Quick check ──────────────────────────────────────────────
-- Verify all 10 dummies exist (plus your real users = 12 total):
--
-- SELECT u.display_name, u.email, t.name AS team_name
-- FROM users u
-- LEFT JOIN teams t ON t.user_id = u.id
-- WHERE u.email LIKE 'dummy%@test.com'
-- ORDER BY u.email;
--
-- SELECT COUNT(*) AS total_teams FROM teams;


-- ============================================================
-- Optional: seed standings for the 6 new teams so the bracket
-- seeder has standings for all 12 teams.
--
-- Replace v_matchday_id with your matchday id before running.
-- This inserts fictional matchday_points (deliberately varied
-- so each team ends up with a different rank).
-- ============================================================

-- DO $$
-- DECLARE
--   v_matchday_id INT := 1;  -- ⚠️ CHANGE THIS
--   v_team        RECORD;
--   v_pts         INT;
--   v_goals       INT;
--   v_prev_total  INT;
-- BEGIN
--   FOR v_team IN
--     SELECT t.id
--     FROM teams t
--     JOIN users u ON u.id = t.user_id
--     WHERE u.email IN (
--       'dummy5@test.com', 'dummy6@test.com', 'dummy7@test.com',
--       'dummy8@test.com', 'dummy9@test.com', 'dummy10@test.com'
--     )
--   LOOP
--     v_pts   := (RANDOM() * 40 + 10)::INT;  -- random 10–50 pts
--     v_goals := (RANDOM() * 5)::INT;
--
--     SELECT COALESCE(MAX(total_points), 0) INTO v_prev_total
--     FROM fantasy_standings WHERE team_id = v_team.id;
--
--     INSERT INTO fantasy_standings
--       (team_id, matchday_id, matchday_points, total_points, goals_scored)
--     VALUES
--       (v_team.id, v_matchday_id, v_pts, v_prev_total + v_pts, v_goals)
--     ON CONFLICT (team_id, matchday_id) DO UPDATE
--       SET matchday_points = EXCLUDED.matchday_points,
--           total_points    = EXCLUDED.total_points,
--           goals_scored    = EXCLUDED.goals_scored;
--   END LOOP;
--   RAISE NOTICE 'Standings seeded for 6 new dummy teams on matchday %', v_matchday_id;
-- END $$;
