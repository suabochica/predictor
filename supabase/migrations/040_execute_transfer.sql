-- 040_execute_transfer.sql
-- Atomic server-side transfer execution: enforces cap, locks, budget, GK rule,
-- and repoints lineup rows — all in one transaction. Replaces the 5-step client
-- write sequence in Market.jsx.

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
      v_max_transfers := TRANSFER_CAP_GROUP;
    ELSE
      v_max_transfers := TRANSFER_CAP_KO;
    END IF;
    SELECT COUNT(*) INTO v_used
    FROM transfers WHERE team_id = v_team_id AND matchday_id = v_active_md.id;
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

  RETURN json_build_object(
    'success',      true,
    'new_budget',   v_new_budget,
    'matchday_id',  v_active_md.id,
    'is_preseason', v_is_preseason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer(integer, integer) TO authenticated;
