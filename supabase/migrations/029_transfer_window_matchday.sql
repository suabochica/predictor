-- Stage 3: auto matchday + transfer-window timing
-- Link transfer_windows to matchdays and add matchday_id to transfers for per-window counting.

ALTER TABLE transfer_windows ADD COLUMN IF NOT EXISTS matchday_id INTEGER REFERENCES matchdays(id);

-- New transfers log matchday_id instead of relying solely on window_number.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS matchday_id INTEGER REFERENCES matchdays(id);
CREATE INDEX IF NOT EXISTS idx_transfers_matchday ON transfers(matchday_id);
