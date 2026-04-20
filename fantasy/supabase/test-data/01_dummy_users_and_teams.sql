-- ============================================================
-- Phase 4 Test Data — Step 1: Dummy Users & Teams
-- ============================================================
-- Run this in the Supabase SQL Editor.
--
-- What it creates:
--   • 4 dummy users in the `users` table
--   • 1 team per dummy user in the `teams` table
--
-- These users have NO Supabase Auth records — they cannot log in.
-- They exist only so we have multiple teams to test standings,
-- the History page ranking table, and points breakdown.
--
-- Your real users (admin + existing players) are untouched.
-- ============================================================

INSERT INTO users (id, email, display_name)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'dummy1@test.com', 'Alex Torres'),
  ('11111111-0000-0000-0000-000000000002', 'dummy2@test.com', 'Jamie Chen'),
  ('11111111-0000-0000-0000-000000000003', 'dummy3@test.com', 'Sam Rivera'),
  ('11111111-0000-0000-0000-000000000004', 'dummy4@test.com', 'Morgan Lee')
ON CONFLICT (email) DO NOTHING;

-- Creates a team for each dummy user (name = "Alex Torres's FC" etc.)
INSERT INTO teams (user_id, name, budget_remaining)
SELECT
  id,
  display_name || '''s FC',
  105.0
FROM users
WHERE email LIKE 'dummy%@test.com'
ON CONFLICT DO NOTHING;

-- ── Quick check ──────────────────────────────────────────────
-- Run this to confirm everything was created:
--
-- SELECT u.display_name, u.email, t.name AS team_name, t.budget_remaining
-- FROM users u
-- LEFT JOIN teams t ON t.user_id = u.id
-- WHERE u.email LIKE 'dummy%@test.com'
-- ORDER BY u.display_name;
