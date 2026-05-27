-- Migration 020: Opta Stats columns, match_metadata table, and scoring_system toggle
-- Phase 1 of the Opta Stats Upload & Dual Scoring plan

-- ============================================================
-- 1. Add Opta-specific stat columns to player_stats
-- ============================================================
ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS shots_on_target  INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_off_target INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_shots    INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tackles          INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interceptions    INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fouls_won        INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fouls_conceded   INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offsides         INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passes           NUMERIC(8,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crosses          NUMERIC(8,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalties_won    INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opta_points      NUMERIC(8,2) DEFAULT NULL;

-- ============================================================
-- 2. Create match_metadata table
--    matchdays.id is SERIAL (integer), so FK is INTEGER
-- ============================================================
CREATE TABLE IF NOT EXISTS match_metadata (
  id          SERIAL PRIMARY KEY,
  matchday_id INTEGER REFERENCES matchdays(id) ON DELETE CASCADE,
  competition TEXT,
  match_date  DATE,
  home_team   TEXT NOT NULL,
  away_team   TEXT NOT NULL,
  score_home  INTEGER,
  score_away  INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(matchday_id, home_team, away_team)
);

ALTER TABLE match_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match metadata"
  ON match_metadata FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage match metadata"
  ON match_metadata FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- ============================================================
-- 3. Add scoring_system toggle to auction_state
-- ============================================================
ALTER TABLE auction_state
  ADD COLUMN IF NOT EXISTS scoring_system TEXT
    DEFAULT 'current'
    CHECK (scoring_system IN ('current', 'opta'));

-- Back-fill existing row (singleton)
UPDATE auction_state
  SET scoring_system = 'current'
  WHERE scoring_system IS NULL;
