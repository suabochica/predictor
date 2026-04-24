-- Seed data for development
-- Creates an admin user profile (run after auth user creation via Supabase dashboard)

-- Sample matchdays
INSERT INTO matchdays (name, wc_stage, start_date, deadline, is_active, is_completed) VALUES
  ('Matchday 1', 'Group Stage MD1', '2026-06-11', '2026-06-11T12:00:00Z', false, false),
  ('Matchday 2', 'Group Stage MD2', '2026-06-15', '2026-06-15T12:00:00Z', false, false),
  ('Matchday 3', 'Group Stage MD3', '2026-06-19', '2026-06-19T12:00:00Z', false, false),
  ('Matchday 4', 'Round of 32',     '2026-06-28', '2026-06-28T12:00:00Z', false, false),
  ('Knockout Round 1', 'Round of 16',  '2026-07-01', '2026-07-01T12:00:00Z', false, false),
  ('Knockout Round 2', 'Quarter-finals','2026-07-05', '2026-07-05T12:00:00Z', false, false),
  ('Knockout Round 3', 'Semi-finals',   '2026-07-09', '2026-07-09T12:00:00Z', false, false);

-- Auction state (starts pending)
INSERT INTO auction_state (status, current_round, round_duration_seconds) VALUES
  ('pending', 0, 180);

-- Transfer windows
INSERT INTO transfer_windows (window_number, max_transfers, is_active, opens_at, closes_at) VALUES
  (1, 7, false, '2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z'),
  (2, 3, false, '2026-07-03T00:00:00Z', '2026-07-04T00:00:00Z'),
  (3, 3, false, '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z');
