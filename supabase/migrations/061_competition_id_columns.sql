-- 061_competition_id_columns.sql
-- Adds `competition_id` to every table that needs scoping and backfills it to 1
-- (the World Cup archive).
--
-- `DEFAULT 1` is what makes Phase 1 a true no-op: every existing INSERT
-- (Admin.jsx, seed.sql, import-matches.mjs, the SQL emitted by sync-schedule.mjs)
-- keeps working and lands in the WC. The default is DROPPED in the final phase as
-- a tripwire — any writer that was missed then fails loudly on NOT NULL instead of
-- silently writing into the archive.
--
-- `scoring_rules` is deliberately excluded: zero references under apps/fantasy/src,
-- it is a pure polla table read by polla_calculate_points.

-- ── Root tables ───────────────────────────────────────────────────────────────
ALTER TABLE players ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE players SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE players ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE players ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_players_competition ON players (competition_id);

ALTER TABLE teams ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE teams SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE teams ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE teams ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_teams_competition ON teams (competition_id);

ALTER TABLE matchdays ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE matchdays SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE matchdays ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE matchdays ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_matchdays_competition ON matchdays (competition_id);

ALTER TABLE matches ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE matches SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE matches ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_matches_competition ON matches (competition_id);

ALTER TABLE auction_state ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE auction_state SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE auction_state ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE auction_state ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_auction_state_competition ON auction_state (competition_id);

ALTER TABLE transfer_windows ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE transfer_windows SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE transfer_windows ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE transfer_windows ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_transfer_windows_competition ON transfer_windows (competition_id);

ALTER TABLE knockout_matches ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE knockout_matches SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE knockout_matches ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE knockout_matches ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_knockout_matches_competition ON knockout_matches (competition_id);

ALTER TABLE negotiation_windows ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE negotiation_windows SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE negotiation_windows ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE negotiation_windows ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_negotiation_windows_competition ON negotiation_windows (competition_id);

ALTER TABLE proxy_targets ADD COLUMN competition_id INTEGER REFERENCES competitions(id);
UPDATE proxy_targets SET competition_id = 1 WHERE competition_id IS NULL;
ALTER TABLE proxy_targets ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE proxy_targets ALTER COLUMN competition_id SET DEFAULT 1;
CREATE INDEX idx_proxy_targets_competition ON proxy_targets (competition_id);

-- ── matchdays.phase / .sequence backfill trigger ──────────────────────────────
-- 060 made both columns NOT NULL, but every current writer (seed.sql:7,
-- Admin.jsx's handleCreateMatchday) only sends name/wc_stage/start_date/deadline.
-- This trigger keeps those writers working unchanged and makes Phase 1 a true
-- no-op, while still letting Phase 5's Admin phase selector send both explicitly.
--
--   phase    → derived from wc_stage with the EXACT legacy rule when not supplied
--   sequence → next free slot within the competition when not supplied
--
-- The phase fallback is deliberately restricted to competition 1. Outside the
-- World Cup the `wc_stage ILIKE '%group%'` rule is exactly the bug this whole
-- change exists to kill: UCL's Swiss league phase has no "group" in its name, so
-- a silent fallback would classify every league matchday as 'knockout' and hand
-- out the knockout transfer cap. Any writer creating a matchday in another
-- competition must send `phase` explicitly (Phase 5's Admin selector does) — and
-- fails loudly here until it does.
--
-- Concurrent inserts could in principle race on the sequence and collide with
-- 062's UNIQUE(competition_id, sequence); matchday creation is a single-admin
-- action, so the loser just retries.
CREATE FUNCTION public.matchdays_fill_taxonomy() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phase IS NULL THEN
    IF NEW.competition_id = 1 THEN
      NEW.phase := CASE WHEN NEW.wc_stage ILIKE '%group%' THEN 'league' ELSE 'knockout' END;
    ELSE
      RAISE EXCEPTION
        'matchdays.phase must be set explicitly for competition % (only the World Cup '
        'archive may fall back to the legacy wc_stage rule)', NEW.competition_id
        USING HINT = 'Pass phase = ''league'' or ''knockout''.';
    END IF;
  END IF;

  IF NEW.sequence IS NULL THEN
    SELECT COALESCE(MAX(m.sequence), 0) + 1 INTO NEW.sequence
      FROM matchdays m WHERE m.competition_id = NEW.competition_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER matchdays_fill_taxonomy
  BEFORE INSERT ON matchdays
  FOR EACH ROW EXECUTE FUNCTION public.matchdays_fill_taxonomy();

-- ── Three deliberate denormalizations ─────────────────────────────────────────
-- team_players, fantasy_standings and auction_bids are transitively scoped in
-- theory, but the client queries all three globally with no parent filter, and
-- Supabase realtime `filter:` accepts only columns OF THE SUBSCRIBED TABLE — so
-- the auction_bids and team_players subscriptions cannot be scoped without it.
--
-- Composite FKs make the denormalization provably consistent: no trigger, no drift.
ALTER TABLE teams   ADD CONSTRAINT teams_id_competition_key   UNIQUE (id, competition_id);
ALTER TABLE players ADD CONSTRAINT players_id_competition_key UNIQUE (id, competition_id);

ALTER TABLE team_players      ADD COLUMN competition_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fantasy_standings ADD COLUMN competition_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE auction_bids      ADD COLUMN competition_id INTEGER NOT NULL DEFAULT 1;

ALTER TABLE team_players
  ADD CONSTRAINT team_players_team_competition_fkey
  FOREIGN KEY (team_id, competition_id) REFERENCES teams(id, competition_id) ON DELETE CASCADE;

ALTER TABLE fantasy_standings
  ADD CONSTRAINT fantasy_standings_team_competition_fkey
  FOREIGN KEY (team_id, competition_id) REFERENCES teams(id, competition_id);

ALTER TABLE auction_bids
  ADD CONSTRAINT auction_bids_player_competition_fkey
  FOREIGN KEY (player_id, competition_id) REFERENCES players(id, competition_id);

CREATE INDEX idx_team_players_competition      ON team_players (competition_id);
CREATE INDEX idx_fantasy_standings_competition ON fantasy_standings (competition_id);
CREATE INDEX idx_auction_bids_competition      ON auction_bids (competition_id);

-- lineups, transfers, player_stats, negotiation_offers and match_metadata
-- deliberately get nothing — they are always queried with an already-scoped
-- team_id / matchday_id / player_id / window_id.
