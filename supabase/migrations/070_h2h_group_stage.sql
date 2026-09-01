-- Phase A1 of the H2H group stage (UCL format): schema only.
-- See plan /home/lucas/.claude/plans/we-have-been-doing-eventual-hejlsberg.md

-- ── 1. Format config on competitions ────────────────────────────────────────
-- Defaults keep the World Cup on today's cumulative behaviour.
ALTER TABLE competitions
  ADD COLUMN group_format TEXT NOT NULL DEFAULT 'cumulative'
    CHECK (group_format IN ('cumulative', 'h2h')),
  ADD COLUMN h2h_win_points         NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  ADD COLUMN h2h_draw_points        NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  ADD COLUMN h2h_narrow_loss_points NUMERIC(3,1) NOT NULL DEFAULT 0.5,
  ADD COLUMN h2h_narrow_loss_margin NUMERIC(4,1) NOT NULL DEFAULT 5.0;

UPDATE competitions SET group_format = 'h2h' WHERE slug = 'ucl-2026-27';

-- ── 2. group_fixtures ────────────────────────────────────────────────────────
-- Stores only the pairings. Results are derived at read time from
-- fantasy_standings.matchday_points, so a late .ods upload or a standings
-- recompute automatically corrects the table (see project_ods_upload_skips_recompute).
CREATE TABLE group_fixtures (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  matchday_id    INTEGER NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  team_a_id      INTEGER NOT NULL,
  team_b_id      INTEGER NOT NULL,
  slot           INTEGER NOT NULL,   -- 1..N/2, display order in the matchday
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_fixtures_team_a_fkey FOREIGN KEY (team_a_id, competition_id)
    REFERENCES teams(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT group_fixtures_team_b_fkey FOREIGN KEY (team_b_id, competition_id)
    REFERENCES teams(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT group_fixtures_distinct CHECK (team_a_id <> team_b_id),
  CONSTRAINT group_fixtures_md_slot_key UNIQUE (matchday_id, slot)
);

-- No rival is ever repeated across the whole league phase.
CREATE UNIQUE INDEX group_fixtures_unique_pairing ON group_fixtures
  (competition_id, LEAST(team_a_id, team_b_id), GREATEST(team_a_id, team_b_id));
CREATE INDEX idx_group_fixtures_competition ON group_fixtures (competition_id);
CREATE INDEX idx_group_fixtures_matchday    ON group_fixtures (matchday_id);

-- RLS mirroring knockout_matches / competitions: everyone reads, admins write.
-- Any embed from this table must use the constraint-qualified hint
-- (teams!group_fixtures_team_a_fkey(...)) — there are already two FK paths to
-- teams (a and b), so a bare teams(...) embed is ambiguous (HTTP 300).
ALTER TABLE group_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_fixtures_select_all ON group_fixtures
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY group_fixtures_admin_write ON group_fixtures
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── 3. Captain points per matchday ──────────────────────────────────────────
-- Nullable, no backfill — NULL on historic WC rows means "unknown", not zero.
-- Needed as the 4th table tiebreaker (league points → total fantasy points →
-- goals scored → captain points).
ALTER TABLE fantasy_standings
  ADD COLUMN captain_points NUMERIC(8,1);
