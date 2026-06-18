-- 048_save_lineup_gk_guard.sql
-- Extends save_lineup (045) with a server-side formation guard: a saved lineup
-- must have exactly 11 starters and exactly 1 GK among them. This makes the
-- invariant authoritative instead of client-only (MyTeam.jsx canSave).

CREATE OR REPLACE FUNCTION save_lineup(
  p_team_id     integer,
  p_matchday_id integer,
  p_rows        jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  LOCK_LEAD_SECS constant integer := 600;  -- 10 minutes

  v_prev_captain  integer;
  v_new_captain   integer;
  v_prev_code     text;
  v_new_code      text;
  v_prev_name     text;
  v_new_name      text;
  v_row           jsonb;
  v_starters      integer;
  v_starting_gk   integer;
BEGIN
  -- Authorize: the team must belong to the caller
  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = p_team_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- Skip lock checks for preseason (null matchday)
  IF p_matchday_id IS NOT NULL THEN
    -- Extract incoming captain from p_rows
    SELECT (r->>'player_id')::integer INTO v_new_captain
    FROM jsonb_array_elements(p_rows) r
    WHERE (r->>'is_captain')::boolean = true
    LIMIT 1;

    -- Read previously saved captain for this team + matchday
    SELECT player_id INTO v_prev_captain
    FROM lineups
    WHERE team_id = p_team_id AND matchday_id = p_matchday_id AND is_captain = true
    LIMIT 1;

    -- Rule 1: if the previous captain's match has started, armband cannot move
    IF v_prev_captain IS NOT NULL
      AND v_new_captain IS DISTINCT FROM v_prev_captain
    THEN
      SELECT country_code, name INTO v_prev_code, v_prev_name
      FROM players WHERE id = v_prev_captain;

      IF EXISTS (
        SELECT 1 FROM matches
        WHERE matchday_id = p_matchday_id
          AND (team_a = v_prev_code OR team_b = v_prev_code)
          AND now() >= match_date - make_interval(secs => LOCK_LEAD_SECS)
      ) THEN
        RETURN json_build_object(
          'error', 'No puedes cambiar el capitán; su partido ya inició.'
        );
      END IF;
    END IF;

    -- Rule 2: cannot name a new captain whose match has already started
    IF v_new_captain IS NOT NULL
      AND v_new_captain IS DISTINCT FROM v_prev_captain
    THEN
      SELECT country_code, name INTO v_new_code, v_new_name
      FROM players WHERE id = v_new_captain;

      IF EXISTS (
        SELECT 1 FROM matches
        WHERE matchday_id = p_matchday_id
          AND (team_a = v_new_code OR team_b = v_new_code)
          AND now() >= match_date - make_interval(secs => LOCK_LEAD_SECS)
      ) THEN
        RETURN json_build_object(
          'error', 'No puedes nombrar capitán a un jugador cuyo partido ya inició.'
        );
      END IF;
    END IF;
  END IF;

  -- ── Formation guard: exactly 11 starters, exactly 1 GK among them ─────────
  SELECT count(*) INTO v_starters
  FROM jsonb_array_elements(p_rows) r
  WHERE (r->>'is_starting')::boolean = true;

  IF v_starters <> 11 THEN
    RETURN json_build_object(
      'error', 'La alineación debe tener exactamente 11 titulares.'
    );
  END IF;

  SELECT count(*) INTO v_starting_gk
  FROM jsonb_array_elements(p_rows) r
  JOIN players p ON p.id = (r->>'player_id')::integer
  WHERE (r->>'is_starting')::boolean = true
    AND p.position = 'GK';

  IF v_starting_gk <> 1 THEN
    RETURN json_build_object(
      'error', 'La alineación debe tener exactamente 1 portero titular.'
    );
  END IF;

  -- ── Mutations (single transaction) ──────────────────────────────────────

  IF p_matchday_id IS NOT NULL THEN
    DELETE FROM lineups WHERE team_id = p_team_id AND matchday_id = p_matchday_id;
  ELSE
    DELETE FROM lineups WHERE team_id = p_team_id AND matchday_id IS NULL;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (
      p_team_id,
      p_matchday_id,
      (v_row->>'player_id')::integer,
      (v_row->>'is_starting')::boolean,
      coalesce((v_row->>'is_captain')::boolean, false),
      CASE WHEN v_row->>'bench_order' IS NULL THEN NULL
           ELSE (v_row->>'bench_order')::integer END
    );
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION save_lineup(integer, integer, jsonb) TO authenticated;
