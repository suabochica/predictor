-- ============================================================
-- Phase 4 Test Data — Step 2: Lineups for a Test Matchday
-- ============================================================
-- Run this AFTER:
--   1. Running 01_dummy_users_and_teams.sql
--   2. Creating a matchday on the Admin page (or directly in DB)
--   3. Uploading stats for that matchday (so scoring can run)
--
-- ⚠️  CHANGE THIS before running:
--     Set v_matchday_id to the ID of the matchday you created.
--     You can find it by running:
--       SELECT id, name FROM matchdays ORDER BY id;
--
-- What it creates:
--   • A full 11-starter + 4-bench lineup for each dummy team
--   • All 4 dummy teams get the same players (same top-15 by price)
--     — that's fine for testing, standings/scoring works off lineups
--   • The most expensive player is set as captain for each team
--   • Formation: 1 GK · 4 DEF · 3 MID · 3 FWD  (4-3-3)
-- ============================================================

DO $$
DECLARE
  v_matchday_id  INT := 1;   -- ⚠️ CHANGE THIS to your matchday id

  v_team         RECORD;
  v_gk_ids       INT[];
  v_def_ids      INT[];
  v_mid_ids      INT[];
  v_fwd_ids      INT[];
  v_captain_id   INT;
  v_player_id    INT;
  v_order        INT;
BEGIN

  -- Pick the top players by price for each position
  -- Starters: 1 GK, 4 DEF, 3 MID, 3 FWD
  -- Bench:    1 GK, 1 DEF, 1 MID, 1 FWD  (bench order: GK first)

  SELECT ARRAY(SELECT id FROM players WHERE position = 'GK'  ORDER BY price DESC LIMIT 2) INTO v_gk_ids;
  SELECT ARRAY(SELECT id FROM players WHERE position = 'DEF' ORDER BY price DESC LIMIT 5) INTO v_def_ids;
  SELECT ARRAY(SELECT id FROM players WHERE position = 'MID' ORDER BY price DESC LIMIT 5) INTO v_mid_ids;
  SELECT ARRAY(SELECT id FROM players WHERE position = 'FWD' ORDER BY price DESC LIMIT 3) INTO v_fwd_ids;

  -- Most expensive outfield player becomes captain
  SELECT id INTO v_captain_id
  FROM players
  WHERE position != 'GK'
  ORDER BY price DESC
  LIMIT 1;

  -- Loop over all dummy teams
  FOR v_team IN
    SELECT t.id
    FROM teams t
    JOIN users u ON u.id = t.user_id
    WHERE u.email LIKE 'dummy%@test.com'
  LOOP

    -- Remove any existing lineup for this team + matchday (safe to re-run)
    DELETE FROM lineups
    WHERE team_id = v_team.id
      AND matchday_id = v_matchday_id;

    -- ── Starters ──────────────────────────────────────────────

    -- GK (starter)
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.id, v_matchday_id, v_gk_ids[1], true, (v_gk_ids[1] = v_captain_id), null);

    -- 4 DEF (starters)
    FOR v_order IN 1..4 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.id, v_matchday_id, v_def_ids[v_order], true, (v_def_ids[v_order] = v_captain_id), null);
    END LOOP;

    -- 3 MID (starters)
    FOR v_order IN 1..3 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.id, v_matchday_id, v_mid_ids[v_order], true, (v_mid_ids[v_order] = v_captain_id), null);
    END LOOP;

    -- 3 FWD (starters)
    FOR v_order IN 1..3 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.id, v_matchday_id, v_fwd_ids[v_order], true, (v_fwd_ids[v_order] = v_captain_id), null);
    END LOOP;

    -- ── Bench (bench_order 1–4) ────────────────────────────────

    -- Bench GK (bench order 1)
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.id, v_matchday_id, v_gk_ids[2], false, false, 1);

    -- Bench DEF (bench order 2)
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.id, v_matchday_id, v_def_ids[5], false, false, 2);

    -- Bench MID (bench order 3)
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.id, v_matchday_id, v_mid_ids[4], false, false, 3);

    -- Bench FWD — use mid[5] if no 4th FWD exists
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (
      v_team.id,
      v_matchday_id,
      COALESCE(
        (SELECT id FROM players WHERE position = 'FWD' ORDER BY price DESC OFFSET 3 LIMIT 1),
        v_mid_ids[5]
      ),
      false, false, 4
    );

  END LOOP;

  RAISE NOTICE 'Lineups inserted for matchday %', v_matchday_id;

END $$;

-- ── Quick check ──────────────────────────────────────────────
-- Confirm lineups were created (replace 1 with your matchday id):
--
-- SELECT
--   t.name AS team,
--   COUNT(*)                                                   AS total_players,
--   SUM(CASE WHEN l.is_starting   THEN 1 ELSE 0 END)          AS starters,
--   SUM(CASE WHEN NOT l.is_starting THEN 1 ELSE 0 END)        AS bench,
--   MAX(CASE WHEN l.is_captain    THEN p.name ELSE null END)   AS captain
-- FROM lineups l
-- JOIN teams t  ON t.id  = l.team_id
-- JOIN players p ON p.id = l.player_id
-- WHERE l.matchday_id = 1
-- GROUP BY t.name
-- ORDER BY t.name;
