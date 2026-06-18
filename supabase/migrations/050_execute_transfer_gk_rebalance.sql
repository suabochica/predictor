-- 050_execute_transfer_gk_rebalance.sql
-- Fix the GK-invariant hole in execute_transfer (047): step 5 repoints a
-- transferred-out player's lineup slot to the incoming player, copying
-- is_starting verbatim with NO position check. Swapping a STARTING goalkeeper
-- for an outfielder therefore leaves the starting XI with 0 GK until the next
-- matchday-boundary re-seed (seed_matchday_lineups, 049).
--
-- This redefines execute_transfer identically to 047 and adds a step 6 GK
-- rebalance — the same demote-cheapest-outfielder / promote-bench-GK logic as
-- 049's 2a/2b — scoped to THIS team's active-MD and null (default) lineup rows,
-- so the invariant holds at transfer time, not just at the boundary.
--
-- Safe because the squad GK guard (below, "al menos 1 portero") already rejects
-- any swap that would leave the squad with 0 GK; whenever step 5 empties the XI
-- of keepers there is therefore always a bench GK available to promote.

CREATE OR REPLACE FUNCTION execute_transfer(
  p_player_out_id integer,
  p_player_in_id  integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  LOCK_LEAD_SECS     constant integer := 600;  -- 10 minutes (LOCK_LEAD_MINUTES)
  TRANSFER_CAP_GROUP constant integer := 2;    -- TRANSFER_CAP_ROUND_ROBIN
  TRANSFER_CAP_KO    constant integer := 5;    -- TRANSFER_CAP_KNOCKOUT

  v_caller_uid    uuid;
  v_team_id       integer;
  v_budget        numeric;
  v_active_md     matchdays%ROWTYPE;
  v_is_preseason  boolean;
  v_max_transfers integer;
  v_used          integer;
  v_out_price     numeric;
  v_out_name      text;
  v_out_code      text;
  v_out_pos       text;
  v_in_price      numeric;
  v_in_name       text;
  v_in_code       text;
  v_in_pos        text;
  v_new_budget    numeric;
  v_gks_after     integer;
  v_first_kickoff timestamptz;
  v_lineup_row    lineups%ROWTYPE;
BEGIN
  v_caller_uid := auth.uid();

  -- Resolve caller's team; acquire advisory lock to serialize concurrent calls.
  SELECT id, budget_remaining INTO v_team_id, v_budget
  FROM teams WHERE user_id = v_caller_uid;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado para fichar.');
  END IF;
  PERFORM pg_advisory_xact_lock(v_team_id);

  -- First tournament kickoff across all matchday-linked matches.
  SELECT MIN(match_date) INTO v_first_kickoff
  FROM matches WHERE matchday_id IS NOT NULL AND match_date IS NOT NULL;

  -- Active matchday: lowest-id matchday whose last game window is still open.
  -- A matchday with no scheduled matches is always considered open.
  SELECT md.* INTO v_active_md
  FROM matchdays md
  WHERE (
    NOT EXISTS (SELECT 1 FROM matches m WHERE m.matchday_id = md.id AND m.match_date IS NOT NULL)
    OR (SELECT MAX(m.match_date) FROM matches m WHERE m.matchday_id = md.id)
       - make_interval(secs => LOCK_LEAD_SECS) > now()
  )
  ORDER BY md.id ASC
  LIMIT 1;

  IF v_active_md IS NULL THEN
    RETURN json_build_object('error', 'Temporada finalizada.');
  END IF;

  -- Preseason: before the very first tournament kickoff (minus lead).
  v_is_preseason := v_first_kickoff IS NULL
    OR now() < v_first_kickoff - make_interval(secs => LOCK_LEAD_SECS);

  -- Transfer cap (unlimited in preseason).
  IF NOT v_is_preseason THEN
    IF v_active_md.wc_stage ILIKE '%group%' THEN
      -- Pool the cap across all group matchdays up to and including the active one.
      SELECT TRANSFER_CAP_GROUP * COUNT(*) INTO v_max_transfers
      FROM matchdays WHERE wc_stage ILIKE '%group%' AND id <= v_active_md.id;

      SELECT COUNT(*) INTO v_used
      FROM transfers t JOIN matchdays md ON md.id = t.matchday_id
      WHERE t.team_id = v_team_id
        AND md.wc_stage ILIKE '%group%'
        AND md.id <= v_active_md.id;
    ELSE
      v_max_transfers := TRANSFER_CAP_KO;
      SELECT COUNT(*) INTO v_used
      FROM transfers WHERE team_id = v_team_id AND matchday_id = v_active_md.id;
    END IF;

    IF v_used >= v_max_transfers THEN
      RETURN json_build_object('error', 'Sin fichajes restantes en esta ventana.');
    END IF;
  END IF;

  -- Ownership: caller must own player_out.
  IF NOT EXISTS (SELECT 1 FROM team_players WHERE team_id = v_team_id AND player_id = p_player_out_id) THEN
    RETURN json_build_object('error', 'No tienes este jugador en tu plantilla.');
  END IF;

  -- Ownership: player_in must be unowned (one_player_one_team unique constraint).
  IF EXISTS (SELECT 1 FROM team_players WHERE player_id = p_player_in_id) THEN
    RETURN json_build_object('error', 'Este jugador ya tiene dueño.');
  END IF;

  -- Fetch player details.
  SELECT current_price, name, country_code, position
  INTO v_out_price, v_out_name, v_out_code, v_out_pos
  FROM players WHERE id = p_player_out_id;

  SELECT current_price, name, country_code, position
  INTO v_in_price, v_in_name, v_in_code, v_in_pos
  FROM players WHERE id = p_player_in_id;

  -- Lock checks (skip in preseason — window closes before any kickoff).
  IF NOT v_is_preseason THEN
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE matchday_id = v_active_md.id
        AND (team_a = v_out_code OR team_b = v_out_code)
        AND now() >= match_date - make_interval(secs => LOCK_LEAD_SECS)
    ) THEN
      RETURN json_build_object('error', v_out_name || ' está bloqueado — su partido ya inició.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE matchday_id = v_active_md.id
        AND (team_a = v_in_code OR team_b = v_in_code)
        AND now() >= match_date - make_interval(secs => LOCK_LEAD_SECS)
    ) THEN
      RETURN json_build_object('error', v_in_name || ' está bloqueado — su partido ya inició.');
    END IF;
  END IF;

  -- Budget check.
  v_new_budget := round(v_budget + v_out_price - v_in_price, 1);
  IF v_new_budget < 0 THEN
    RETURN json_build_object('error', 'Presupuesto insuficiente para este cambio.');
  END IF;

  -- GK rule: squad must keep at least one goalkeeper after the swap.
  SELECT COUNT(*) INTO v_gks_after
  FROM team_players tp JOIN players p ON p.id = tp.player_id
  WHERE tp.team_id = v_team_id AND p.position = 'GK' AND tp.player_id != p_player_out_id;
  IF v_in_pos = 'GK' THEN
    v_gks_after := v_gks_after + 1;
  END IF;
  IF v_gks_after < 1 THEN
    RETURN json_build_object('error', 'Cambio rechazado: tu plantilla debe tener siempre al menos 1 portero.');
  END IF;

  -- ── Mutations (single transaction) ──────────────────────────────────────

  -- 1. Remove outgoing player.
  DELETE FROM team_players WHERE team_id = v_team_id AND player_id = p_player_out_id;

  -- 2. Add incoming player.
  INSERT INTO team_players (team_id, player_id, acquisition_price)
  VALUES (v_team_id, p_player_in_id, v_in_price);

  -- 3. Update budget.
  UPDATE teams SET budget_remaining = v_new_budget WHERE id = v_team_id;

  -- 4. Log transfer.
  INSERT INTO transfers (team_id, window_number, matchday_id, player_out_id, player_in_id, price_difference)
  VALUES (
    v_team_id,
    v_active_md.id,
    CASE WHEN v_is_preseason THEN NULL ELSE v_active_md.id END,
    p_player_out_id,
    p_player_in_id,
    round(v_out_price - v_in_price, 1)
  );

  -- 5. Repoint lineup rows: active matchday and null (default lineup).
  FOR v_lineup_row IN (
    SELECT * FROM lineups
    WHERE team_id = v_team_id
      AND player_id = p_player_out_id
      AND (matchday_id = v_active_md.id OR matchday_id IS NULL)
  ) LOOP
    DELETE FROM lineups WHERE id = v_lineup_row.id;
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (v_team_id, v_lineup_row.matchday_id, p_player_in_id,
            v_lineup_row.is_starting, v_lineup_row.is_captain, v_lineup_row.bench_order);
  END LOOP;

  -- 6. GK rebalance: step 5 copies is_starting onto the incoming player blindly,
  --    so swapping out a starting GK for an outfielder leaves the XI with 0 GK.
  --    For each affected lineup set (the active matchday and/or the null default)
  --    that now has 0 starting GK but a bench GK, demote the cheapest outfield
  --    starter into the bench GK's old slot, then promote the bench GK. Mirrors
  --    seed_matchday_lineups (049) 2a/2b, keyed on players.price, but grouped by
  --    matchday_id and scoped to this team. (matchday_id IS NULL is its own group;
  --    IS NOT DISTINCT FROM keeps the null group joinable.)

  -- 6a. Demote cheapest outfield starter into the bench GK's old bench slot.
  WITH scope AS (
    SELECT l.id, l.matchday_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = v_team_id
      AND (l.matchday_id = v_active_md.id OR l.matchday_id IS NULL)
  ),
  broken AS (
    SELECT matchday_id
    FROM scope
    GROUP BY matchday_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (s.matchday_id) s.matchday_id, s.id, s.bench_order
    FROM scope s
    JOIN broken b ON b.matchday_id IS NOT DISTINCT FROM s.matchday_id
    WHERE NOT s.is_starting AND s.position = 'GK'
    ORDER BY s.matchday_id, s.price DESC NULLS LAST, s.id
  ),
  demote AS (
    SELECT DISTINCT ON (s.matchday_id) s.matchday_id, s.id
    FROM scope s
    JOIN broken b ON b.matchday_id IS NOT DISTINCT FROM s.matchday_id
    WHERE s.is_starting AND s.position <> 'GK'
    ORDER BY s.matchday_id, s.price ASC NULLS LAST, s.id
  )
  UPDATE lineups l
  SET is_starting = false,
      bench_order = bg.bench_order
  FROM demote d
  JOIN bench_gk bg ON bg.matchday_id IS NOT DISTINCT FROM d.matchday_id
  WHERE l.id = d.id;

  -- 6b. Promote the bench GK into the XI.
  WITH scope AS (
    SELECT l.id, l.matchday_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = v_team_id
      AND (l.matchday_id = v_active_md.id OR l.matchday_id IS NULL)
  ),
  broken AS (
    SELECT matchday_id
    FROM scope
    GROUP BY matchday_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (s.matchday_id) s.matchday_id, s.id
    FROM scope s
    JOIN broken b ON b.matchday_id IS NOT DISTINCT FROM s.matchday_id
    WHERE NOT s.is_starting AND s.position = 'GK'
    ORDER BY s.matchday_id, s.price DESC NULLS LAST, s.id
  )
  UPDATE lineups l
  SET is_starting = true,
      bench_order = NULL
  FROM bench_gk bg
  WHERE l.id = bg.id;

  RETURN json_build_object(
    'success',      true,
    'new_budget',   v_new_budget,
    'matchday_id',  v_active_md.id,
    'is_preseason', v_is_preseason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer(integer, integer) TO authenticated;
