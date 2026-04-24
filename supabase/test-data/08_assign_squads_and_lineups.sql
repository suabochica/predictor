-- ============================================================
-- Phase 6 Test Data — Step 8: Assign Squads & Lineups
-- ============================================================
-- Gives every dummy team (dummy1–dummy10) a full 15-player
-- squad drawn from lockable players (price ≤ 8.0M), then
-- stamps null-matchday lineups for all 10 teams.
--
-- Pre-conditions (run these first):
--   1. 01_dummy_users_and_teams.sql  — dummies 1–4
--   2. 06_dummy_teams_extra.sql      — dummies 5–10
--   3. 07_lockable_players.sql       — 64 lockable players
--
-- What this does per team:
--   • Clears any existing team_players + null-matchday lineup
--   • Assigns 2 GK + 5 DEF + 5 MID + 3 FWD (15 total) from the
--     lockable pool using a rotating offset so each team gets a
--     mostly-unique squad
--   • All players: is_locked = true, slot_type = 'locked'
--     (auction-won — triggers the ≤8.0M locked-swap rule)
--   • Updates budget_remaining = 105.0 − squad acquisition cost
--   • Inserts null-matchday_id lineups:
--       Starters: 1 GK · 4 DEF · 3 MID · 3 FWD
--       Bench:    1 GK (order 1) · 1 DEF (order 2) ·
--                 2 MID (orders 3–4)
--   • Captain = highest-priced non-GK starter
--
-- Safe to re-run: deletes team_players + null lineups first.
-- ============================================================

DO $$
DECLARE
  -- Position pools ordered by price DESC (most expensive first)
  -- so team captains will naturally be the better players
  v_gk_ids   INT[];
  v_def_ids  INT[];
  v_mid_ids  INT[];
  v_fwd_ids  INT[];

  v_gk_len   INT;
  v_def_len  INT;
  v_mid_len  INT;
  v_fwd_len  INT;

  v_team       RECORD;
  v_idx        INT := 0;       -- 0..9, one per dummy team
  v_squad      INT[];          -- 15 player ids per team
  v_player_id  INT;
  v_price      DECIMAL(4,1);
  v_total_cost DECIMAL(5,1);
  v_captain_id INT;
  i            INT;

BEGIN

  -- ── Build position pools ───────────────────────────────────────
  -- Includes all lockable players (price ≤ 8.0) across both the
  -- original seed and the new 07_lockable_players.sql additions.

  SELECT ARRAY(
    SELECT id FROM players WHERE position = 'GK'  AND price <= 8.0
    ORDER BY price DESC, id
  ) INTO v_gk_ids;

  SELECT ARRAY(
    SELECT id FROM players WHERE position = 'DEF' AND price <= 8.0
    ORDER BY price DESC, id
  ) INTO v_def_ids;

  SELECT ARRAY(
    SELECT id FROM players WHERE position = 'MID' AND price <= 8.0
    ORDER BY price DESC, id
  ) INTO v_mid_ids;

  SELECT ARRAY(
    SELECT id FROM players WHERE position = 'FWD' AND price <= 8.0
    ORDER BY price DESC, id
  ) INTO v_fwd_ids;

  v_gk_len  := array_length(v_gk_ids,  1);
  v_def_len := array_length(v_def_ids, 1);
  v_mid_len := array_length(v_mid_ids, 1);
  v_fwd_len := array_length(v_fwd_ids, 1);

  RAISE NOTICE 'Pool sizes — GK: %, DEF: %, MID: %, FWD: %',
    v_gk_len, v_def_len, v_mid_len, v_fwd_len;

  -- ── Loop over all 10 dummy teams ──────────────────────────────
  FOR v_team IN
    SELECT t.id AS team_id, u.email
    FROM teams t
    JOIN users u ON u.id = t.user_id
    WHERE u.email LIKE 'dummy%@test.com'
    ORDER BY u.email   -- dummy1 first → consistent v_idx
  LOOP

    -- Clear existing squad and null-matchday lineup for this team
    DELETE FROM team_players WHERE team_id = v_team.team_id;
    DELETE FROM lineups     WHERE team_id = v_team.team_id AND matchday_id IS NULL;

    v_squad      := ARRAY[]::INT[];
    v_total_cost := 0.0;

    -- ── Select 2 GKs (step=2, offset = v_idx*2) ─────────────────
    -- 10 teams × step 2 = full cycle with one wrap at team 5+
    FOR i IN 0..1 LOOP
      v_squad := array_append(
        v_squad,
        v_gk_ids[ ((v_idx * 2 + i) % v_gk_len) + 1 ]
      );
    END LOOP;

    -- ── Select 5 DEFs (step=5, offset = v_idx*5) ─────────────────
    -- Step equals K so consecutive teams take non-overlapping chunks
    -- until the pool wraps (after floor(23/5) = 4 full chunks)
    FOR i IN 0..4 LOOP
      v_squad := array_append(
        v_squad,
        v_def_ids[ ((v_idx * 5 + i) % v_def_len) + 1 ]
      );
    END LOOP;

    -- ── Select 5 MIDs (step=5, offset = v_idx*5) ─────────────────
    FOR i IN 0..4 LOOP
      v_squad := array_append(
        v_squad,
        v_mid_ids[ ((v_idx * 5 + i) % v_mid_len) + 1 ]
      );
    END LOOP;

    -- ── Select 3 FWDs (step=3, offset = v_idx*3) ─────────────────
    FOR i IN 0..2 LOOP
      v_squad := array_append(
        v_squad,
        v_fwd_ids[ ((v_idx * 3 + i) % v_fwd_len) + 1 ]
      );
    END LOOP;

    -- squad layout (1-indexed):
    --   [1]      = GK starter
    --   [2]      = GK bench
    --   [3..6]   = DEF starters (4)
    --   [7]      = DEF bench
    --   [8..10]  = MID starters (3)
    --   [11..12] = MID bench (2)
    --   [13..15] = FWD starters (3)

    -- ── Insert team_players ───────────────────────────────────────
    FOREACH v_player_id IN ARRAY v_squad LOOP
      SELECT price INTO v_price FROM players WHERE id = v_player_id;
      v_total_cost := v_total_cost + v_price;

      INSERT INTO team_players (team_id, player_id, is_locked, acquisition_price, slot_type)
      VALUES (v_team.team_id, v_player_id, true, v_price, 'locked')
      ON CONFLICT (team_id, player_id) DO UPDATE
        SET is_locked = true, slot_type = 'locked', acquisition_price = EXCLUDED.acquisition_price;
    END LOOP;

    -- ── Update budget ─────────────────────────────────────────────
    UPDATE teams
    SET budget_remaining = 105.0 - v_total_cost
    WHERE id = v_team.team_id;

    -- ── Insert null-matchday lineup ───────────────────────────────
    -- GK starter
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.team_id, NULL, v_squad[1], true, false, NULL);

    -- 4 DEF starters (squad indices 3..6)
    FOR i IN 3..6 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.team_id, NULL, v_squad[i], true, false, NULL);
    END LOOP;

    -- 3 MID starters (squad indices 8..10)
    FOR i IN 8..10 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.team_id, NULL, v_squad[i], true, false, NULL);
    END LOOP;

    -- 3 FWD starters (squad indices 13..15)
    FOR i IN 13..15 LOOP
      INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
      VALUES (v_team.team_id, NULL, v_squad[i], true, false, NULL);
    END LOOP;

    -- GK bench (bench_order 1) — squad index 2
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.team_id, NULL, v_squad[2], false, false, 1);

    -- DEF bench (bench_order 2) — squad index 7
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.team_id, NULL, v_squad[7], false, false, 2);

    -- MID bench (bench_order 3 & 4) — squad indices 11..12
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.team_id, NULL, v_squad[11], false, false, 3);

    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team.team_id, NULL, v_squad[12], false, false, 4);

    -- ── Set captain = highest-priced outfield starter ─────────────
    SELECT l.player_id INTO v_captain_id
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = v_team.team_id
      AND l.matchday_id IS NULL
      AND l.is_starting = true
      AND p.position != 'GK'
    ORDER BY p.price DESC, p.id
    LIMIT 1;

    UPDATE lineups
    SET is_captain = true
    WHERE team_id = v_team.team_id
      AND matchday_id IS NULL
      AND player_id = v_captain_id;

    RAISE NOTICE 'Team % (idx %) — cost: £%M, budget left: £%M',
      v_team.email, v_idx, v_total_cost, 105.0 - v_total_cost;

    v_idx := v_idx + 1;

  END LOOP;

  RAISE NOTICE 'Done. % dummy teams assigned.', v_idx;

END $$;


-- ── Quick verify ──────────────────────────────────────────────────
-- 1. Squad counts (expect 15 per team):
--
-- SELECT t.name AS team, COUNT(*) AS squad_size,
--        SUM(tp.acquisition_price) AS squad_cost,
--        t.budget_remaining
-- FROM team_players tp
-- JOIN teams t ON t.id = tp.team_id
-- JOIN users u ON u.id = t.user_id
-- WHERE u.email LIKE 'dummy%@test.com'
-- GROUP BY t.name, t.budget_remaining
-- ORDER BY t.name;
--
-- 2. All players locked (expect is_locked=true, slot_type='locked'):
--
-- SELECT DISTINCT is_locked, slot_type
-- FROM team_players tp
-- JOIN teams t ON t.id = tp.team_id
-- JOIN users u ON u.id = t.user_id
-- WHERE u.email LIKE 'dummy%@test.com';
--
-- 3. Lineup counts (expect 15 rows: 11 starters + 4 bench):
--
-- SELECT t.name AS team,
--        COUNT(*) AS total,
--        SUM(CASE WHEN l.is_starting THEN 1 ELSE 0 END) AS starters,
--        SUM(CASE WHEN NOT l.is_starting THEN 1 ELSE 0 END) AS bench,
--        MAX(CASE WHEN l.is_captain THEN p.name ELSE NULL END) AS captain
-- FROM lineups l
-- JOIN teams t ON t.id = l.team_id
-- JOIN players p ON p.id = l.player_id
-- JOIN users u ON u.id = t.user_id
-- WHERE l.matchday_id IS NULL AND u.email LIKE 'dummy%@test.com'
-- GROUP BY t.name ORDER BY t.name;
--
-- 4. Position breakdown per team (expect 2 GK, 5 DEF, 5 MID, 3 FWD):
--
-- SELECT t.name AS team, p.position, COUNT(*) AS n
-- FROM team_players tp
-- JOIN teams t ON t.id = tp.team_id
-- JOIN players p ON p.id = tp.player_id
-- JOIN users u ON u.id = t.user_id
-- WHERE u.email LIKE 'dummy%@test.com'
-- GROUP BY t.name, p.position
-- ORDER BY t.name, p.position;


-- ── Cleanup (run to reset squads/lineups only) ────────────────────
-- This leaves users + teams intact; just wipes assignments.
-- Uncomment and run as a block when you want to re-assign:
--
-- DO $$
-- BEGIN
--   DELETE FROM lineups
--   WHERE matchday_id IS NULL
--     AND team_id IN (
--       SELECT t.id FROM teams t JOIN users u ON u.id = t.user_id
--       WHERE u.email LIKE 'dummy%@test.com'
--     );
--   DELETE FROM team_players
--   WHERE team_id IN (
--     SELECT t.id FROM teams t JOIN users u ON u.id = t.user_id
--     WHERE u.email LIKE 'dummy%@test.com'
--   );
--   UPDATE teams SET budget_remaining = 105.0
--   WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'dummy%@test.com');
--   RAISE NOTICE 'Squad + lineup reset complete.';
-- END $$;
