-- 032_align_matchday_labels.sql
-- Bring existing DBs in line with seed.sql's matchday naming/dates. Migration 031 only
-- deleted the obsolete "Semi-finals" row; it left the surviving rows with their old
-- names ("Matchday 4", "Knockout Round 1/2") and stale start_date/deadline values, which
-- are shown in the UI (sidebar, dashboard, Standings, Admin, History).
--
-- Keyed by wc_stage (the stable column the schedule sync relies on), so it targets the
-- right rows regardless of id. Idempotent. Note: matchday_id-driven transfer/lineup
-- windows derive from match kickoff times, not these dates — these columns are display-only.
-- On a fresh DB this is a no-op (matchdays are inserted later by seed.sql with the
-- correct values already).

UPDATE matchdays SET name = 'Fantasy Quarter-finals', start_date = '2026-06-28', deadline = '2026-06-28T12:00:00Z' WHERE wc_stage = 'Round of 32';
UPDATE matchdays SET name = 'Fantasy Semi-finals',    start_date = '2026-07-04', deadline = '2026-07-04T12:00:00Z' WHERE wc_stage = 'Round of 16';
UPDATE matchdays SET name = 'Fantasy Final',          start_date = '2026-07-09', deadline = '2026-07-09T12:00:00Z' WHERE wc_stage = 'Quarter-finals';
UPDATE matchdays SET start_date = '2026-06-18', deadline = '2026-06-18T12:00:00Z' WHERE wc_stage = 'Group Stage MD2';
UPDATE matchdays SET start_date = '2026-06-24', deadline = '2026-06-24T12:00:00Z' WHERE wc_stage = 'Group Stage MD3';
