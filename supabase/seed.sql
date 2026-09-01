-- Seed data for development
-- Creates an admin user profile (run after auth user creation via Supabase dashboard)

-- Fantasy matchdays: 3 group round-robin + WC R32/R16/QF (fantasy QF/SF/Final).
-- The fantasy tournament ends at the WC Quarter-finals; WC semis/3rd/final are off-season.
-- wc_stage labels MUST stay exactly as below — sync-schedule.mjs keys matchday_id off them.
-- competition_id = 1 (World Cup): 068 dropped the column default, so it must be explicit.
INSERT INTO matchdays (competition_id, name, wc_stage, start_date, deadline, is_active, is_completed) VALUES
  (1, 'Matchday 1', 'Group Stage MD1', '2026-06-11', '2026-06-11T12:00:00Z', false, false),
  (1, 'Matchday 2', 'Group Stage MD2', '2026-06-18', '2026-06-18T12:00:00Z', false, false),
  (1, 'Matchday 3', 'Group Stage MD3', '2026-06-24', '2026-06-24T12:00:00Z', false, false),
  (1, 'Fantasy Quarter-finals', 'Round of 32',    '2026-06-28', '2026-06-28T12:00:00Z', false, false),
  (1, 'Fantasy Semi-finals',    'Round of 16',     '2026-07-04', '2026-07-04T12:00:00Z', false, false),
  (1, 'Fantasy Final',          'Quarter-finals',  '2026-07-09', '2026-07-09T12:00:00Z', false, false);

-- Auction state (starts pending)
INSERT INTO auction_state (competition_id, status, current_round, round_duration_seconds) VALUES
  (1, 'pending', 0, 180);

-- Transfer windows (display-only rows; authoritative caps come from apps/fantasy/src/config/constants.js:
--   group = TRANSFER_CAP_ROUND_ROBIN (2), knockout = TRANSFER_CAP_KNOCKOUT (5)).
INSERT INTO transfer_windows (competition_id, window_number, max_transfers, is_active, opens_at, closes_at) VALUES
  (1, 1, 5, false, '2026-06-27T00:00:00Z', '2026-06-28T00:00:00Z'),
  (1, 2, 5, false, '2026-07-03T00:00:00Z', '2026-07-04T00:00:00Z'),
  (1, 3, 5, false, '2026-07-08T00:00:00Z', '2026-07-09T00:00:00Z');
