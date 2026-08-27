-- 063_competition_scoped_rpcs.sql
-- Phase 2 of "add a second competition (UEFA Champions League) to Fantasy",
-- part 1: the write RPCs whose SIGNATURE does not change.
--
-- Every one of these derives the competition from an argument the caller was
-- already authorized for (a player id, a team id, a matchday id) rather than
-- taking p_competition_id. A client-supplied competition id would be an
-- authorization input that then has to be validated; deriving it is strictly
-- safer and keeps the JS diff at exactly zero for these four functions.
--
-- Three classes of change appear throughout:
--   1. `SELECT ... FROM teams WHERE user_id = <uid>` picks an ARBITRARY row once a
--      user has a team in more than one competition — no error, wrong team. Every
--      such lookup gains `AND competition_id = v_comp`.
--   2. `wc_stage ILIKE '%group%'` -> `phase = 'league'`, and `ORDER BY id` /
--      `id <= x` (tournament order riding on a shared SERIAL) -> `sequence`.
--   3. Config constants (transfer caps, squad size, bid increment) now come from
--      the `competitions` row instead of being frozen in the function body.
--
-- INSERTs into team_players / auction_bids gain an explicit competition_id.
-- They would land correctly today via `DEFAULT 1`, but 067 drops that default as
-- a tripwire, and these are exactly the writers it is meant to catch.
--
-- Behaviour against the World Cup (competition 1) is unchanged: it is the only
-- competition, its config row carries the same numbers the constants held, and
-- `phase`/`sequence` were backfilled in 060 with the exact rules they replace.

-- ── is_competition_writable ───────────────────────────────────────────────────
-- Blocks writes into an archived competition. Applied to the two `teams` write
-- policies below (EDITED, not added — policies are permissive and OR'd, so an
-- extra policy could only widen access) and to execute_transfer.
CREATE OR REPLACE FUNCTION public.is_competition_writable(cid integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM competitions WHERE id = cid AND status <> 'archived');
$$;

GRANT EXECUTE ON FUNCTION public.is_competition_writable(integer) TO authenticated;

-- 002:18 and 002:23 verbatim, plus the writable predicate. Neither policy has a
-- TO clause (they apply to PUBLIC); that is preserved.
DROP POLICY IF EXISTS "Users can insert own team" ON teams;
CREATE POLICY "Users can insert own team"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_competition_writable(competition_id));

DROP POLICY IF EXISTS "Users can update own team" ON teams;
CREATE POLICY "Users can update own team"
  ON teams FOR UPDATE
  USING (auth.uid() = user_id AND public.is_competition_writable(competition_id));

-- ── execute_transfer ──────────────────────────────────────────────────────────
-- Verbatim from 056 with the competition scoping marked "-- [COMPETITION]".
CREATE OR REPLACE FUNCTION execute_transfer(
  p_player_out_id integer,
  p_player_in_id  integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  LOCK_LEAD_SECS constant integer := 600;  -- 10 minutes (LOCK_LEAD_MINUTES)

  v_comp          integer;                 -- [COMPETITION]
  v_comp_status   text;                    -- [COMPETITION]
  v_cap_league    integer;                 -- [COMPETITION] was TRANSFER_CAP_GROUP
  v_cap_ko        integer;                 -- [COMPETITION] was TRANSFER_CAP_KO
  v_caller_uid    uuid;
  v_team_id       integer;
  v_team_status   text;
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
  v_neg_window_id       integer;
  v_neg_matchday_id     integer;
  v_neg_committed_cash  numeric;
BEGIN
  v_caller_uid := auth.uid();

  -- [COMPETITION] Derive the competition from the outgoing player, then require
  -- the incoming player to live in the same one. Both ids come from the caller,
  -- so a cross-competition pair is the one thing that has to be rejected here.
  SELECT competition_id INTO v_comp FROM players WHERE id = p_player_out_id;
  IF v_comp IS NULL THEN
    RETURN json_build_object('error', 'Jugador no encontrado.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_in_id AND competition_id = v_comp) THEN
    RETURN json_build_object('error', 'Los dos jugadores deben ser de la misma competencia.');
  END IF;

  -- [COMPETITION] Config + archived guard.
  SELECT status, transfer_cap_league, transfer_cap_knockout
    INTO v_comp_status, v_cap_league, v_cap_ko
  FROM competitions WHERE id = v_comp;
  IF v_comp_status = 'archived' THEN
    RETURN json_build_object('error', 'Esta competencia está archivada; ya no admite fichajes.');
  END IF;

  -- Resolve caller's team; acquire advisory lock to serialize concurrent calls.
  -- [NEGOTIATION GUARD 1] also fetch status; eliminated teams can't transfer.
  -- [COMPETITION] without the competition filter this picks an arbitrary team.
  SELECT id, budget_remaining, status INTO v_team_id, v_budget, v_team_status
  FROM teams WHERE user_id = v_caller_uid AND competition_id = v_comp;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado para fichar.');
  END IF;
  IF v_team_status = 'eliminated' THEN
    RETURN json_build_object('error', 'Tu equipo fue eliminado y no puede fichar.');
  END IF;
  PERFORM pg_advisory_xact_lock(v_team_id);

  -- [NEGOTIATION GUARD 2] Is there a currently open negotiation window?
  -- [COMPETITION] one open window PER COMPETITION now (062).
  SELECT id, matchday_id INTO v_neg_window_id, v_neg_matchday_id
  FROM negotiation_windows
  WHERE status = 'open' AND now() < closes_at AND competition_id = v_comp
  LIMIT 1;

  -- First tournament kickoff across all matchday-linked matches.
  SELECT MIN(match_date) INTO v_first_kickoff
  FROM matches
  WHERE competition_id = v_comp                                   -- [COMPETITION]
    AND matchday_id IS NOT NULL AND match_date IS NOT NULL;

  -- Active matchday: first matchday IN TOURNAMENT ORDER whose last game window is
  -- still open. A matchday with no scheduled matches is always considered open.
  -- [COMPETITION] `ORDER BY id` was tournament order by accident of insertion
  -- order; `sequence` (060) makes it explicit and per-competition.
  SELECT md.* INTO v_active_md
  FROM matchdays md
  WHERE md.competition_id = v_comp                                -- [COMPETITION]
    AND (
      NOT EXISTS (SELECT 1 FROM matches m WHERE m.matchday_id = md.id AND m.match_date IS NOT NULL)
      OR (SELECT MAX(m.match_date) FROM matches m WHERE m.matchday_id = md.id)
         - make_interval(secs => LOCK_LEAD_SECS) > now()
    )
  ORDER BY md.sequence ASC
  LIMIT 1;

  IF v_active_md IS NULL THEN
    RETURN json_build_object('error', 'Temporada finalizada.');
  END IF;

  -- Preseason: before the very first tournament kickoff (minus lead).
  v_is_preseason := v_first_kickoff IS NULL
    OR now() < v_first_kickoff - make_interval(secs => LOCK_LEAD_SECS);

  -- Transfer cap (unlimited in preseason).
  IF NOT v_is_preseason THEN
    -- [COMPETITION] `wc_stage ILIKE '%group%'` -> `phase`. UCL's Swiss league
    -- phase has no "group" in its name and would have fallen through to the
    -- knockout cap of 5 instead of the league cap of 2.
    IF v_active_md.phase = 'league' THEN
      -- Pool the cap across all league matchdays up to and including the active one.
      SELECT v_cap_league * COUNT(*) INTO v_max_transfers
      FROM matchdays
      WHERE competition_id = v_comp
        AND phase = 'league'
        AND sequence <= v_active_md.sequence;

      SELECT COUNT(*) INTO v_used
      FROM transfers t JOIN matchdays md ON md.id = t.matchday_id
      WHERE t.team_id = v_team_id
        AND md.competition_id = v_comp
        AND md.phase = 'league'
        AND md.sequence <= v_active_md.sequence;
    ELSE
      v_max_transfers := v_cap_ko;
      SELECT COUNT(*) INTO v_used
      FROM transfers WHERE team_id = v_team_id AND matchday_id = v_active_md.id;

      -- [NEGOTIATION GUARD 5] Active negotiation offers share this same cap.
      IF v_neg_window_id IS NOT NULL AND v_neg_matchday_id = v_active_md.id THEN
        SELECT v_used + COUNT(*) INTO v_used
        FROM negotiation_offers
        WHERE window_id = v_neg_window_id AND bidder_team_id = v_team_id AND status = 'active';
      END IF;
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
  -- Player ids already partition by competition, so no filter is needed here.
  IF EXISTS (SELECT 1 FROM team_players WHERE player_id = p_player_in_id) THEN
    RETURN json_build_object('error', 'Este jugador ya tiene dueño.');
  END IF;

  -- [NEGOTIATION GUARD 3] Player already staked as the offered leg of an
  -- active sealed offer can't also be transferred away.
  IF v_neg_window_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM negotiation_offers
    WHERE window_id = v_neg_window_id AND bidder_team_id = v_team_id
      AND offered_player_id = p_player_out_id AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'Ese jugador está comprometido en una oferta de negociación activa.');
  END IF;

  -- Fetch player details.
  SELECT current_price, name, country_code, position
  INTO v_out_price, v_out_name, v_out_code, v_out_pos
  FROM players WHERE id = p_player_out_id;

  SELECT current_price, name, country_code, position
  INTO v_in_price, v_in_name, v_in_code, v_in_pos
  FROM players WHERE id = p_player_in_id;

  -- Lock checks (skip in preseason — window closes before any kickoff).
  -- Keyed on matchday_id, which is already competition-scoped.
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
  -- [NEGOTIATION GUARD 4] Budget must stay above cash committed to active
  -- sealed offers, not just >= 0 — otherwise a transfer could spend budget
  -- an offer is counting on at resolution time.
  v_neg_committed_cash := 0;
  IF v_neg_window_id IS NOT NULL THEN
    SELECT COALESCE(SUM(cash), 0) INTO v_neg_committed_cash
    FROM negotiation_offers
    WHERE window_id = v_neg_window_id AND bidder_team_id = v_team_id AND status = 'active';
  END IF;
  IF v_new_budget < v_neg_committed_cash THEN
    RETURN json_build_object('error', 'Presupuesto insuficiente para este cambio (tienes efectivo comprometido en negociaciones).');
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

  -- 2. Add incoming player. [COMPETITION] explicit competition_id — 067 drops the
  --    DEFAULT 1 that would otherwise carry this write.
  INSERT INTO team_players (team_id, player_id, acquisition_price, competition_id)
  VALUES (v_team_id, p_player_in_id, v_in_price, v_comp);

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

-- ── save_lineup ───────────────────────────────────────────────────────────────
-- Verbatim from 048 plus: the authorization lookup now yields the team's
-- competition, and both the matchday and every submitted player must belong to
-- it. Without this a crafted call could stamp UCL players into a WC lineup —
-- lineups has no competition_id of its own (deliberately: it is always reached
-- through an already-scoped team_id/matchday_id).
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

  v_comp          integer;                 -- [COMPETITION]
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
  -- Authorize: the team must belong to the caller.
  -- [COMPETITION] the same lookup now yields the competition to validate against.
  SELECT competition_id INTO v_comp
  FROM teams WHERE id = p_team_id AND user_id = auth.uid();
  IF v_comp IS NULL THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- [COMPETITION] the matchday must be one of this competition's.
  IF p_matchday_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM matchdays WHERE id = p_matchday_id AND competition_id = v_comp
  ) THEN
    RETURN json_build_object('error', 'Esa jornada no pertenece a tu competencia.');
  END IF;

  -- [COMPETITION] every submitted player must exist and belong to it too.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) r
    LEFT JOIN players p ON p.id = (r->>'player_id')::integer
    WHERE p.id IS NULL OR p.competition_id <> v_comp
  ) THEN
    RETURN json_build_object('error', 'La alineación incluye jugadores de otra competencia.');
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

-- ── place_bid_internal ────────────────────────────────────────────────────────
-- Verbatim from 034 plus competition derivation from the bid player. The two
-- worst unscoped reads here were `auction_state ORDER BY id LIMIT 1` (which
-- would pick whichever competition's auction row sorted first) and the
-- per-round `auction_bids` aggregates, which pooled a bidder's squad slots and
-- committed budget across every competition at once.
CREATE OR REPLACE FUNCTION place_bid_internal(
  p_user_id   uuid,
  p_player_id integer,
  p_amount    numeric,
  p_round     integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp           integer;   -- [COMPETITION]
  v_min_increment  numeric;   -- [COMPETITION] was MIN_INCREMENT constant
  v_max_squad      integer;   -- [COMPETITION] was MAX_SQUAD constant
  current_high     numeric;
  carry_floor      numeric;
  active_sum       numeric;
  active_count     integer;
  owned_count      integer;
  projected        integer;
  effective_budget numeric;
  v_team_id        integer;
  v_budget         numeric;
  v_position       text;
  gk_owned         integer;
  gk_in_bids       integer;
  a_status         text;
  a_round          integer;
  a_started_at     timestamptz;
  a_duration       integer;
  new_bid          auction_bids;
BEGIN
  -- Serialize concurrent bids on the same (player, round) pair.
  PERFORM pg_advisory_xact_lock(p_player_id, p_round);

  -- [COMPETITION] Derive from the bid player, then read that competition's config.
  SELECT competition_id, position INTO v_comp, v_position
  FROM players WHERE id = p_player_id;
  IF v_comp IS NULL THEN
    RETURN json_build_object('error', 'Player not found.');
  END IF;

  SELECT min_bid_increment, max_squad_size INTO v_min_increment, v_max_squad
  FROM competitions WHERE id = v_comp;

  -- Round guard: auction must be active, bid must target the current round, round must not have ended.
  SELECT status, current_round, round_started_at, round_duration_seconds
    INTO a_status, a_round, a_started_at, a_duration
  FROM auction_state
  WHERE competition_id = v_comp                                   -- [COMPETITION]
  ORDER BY id
  LIMIT 1;

  IF a_status IS DISTINCT FROM 'active' THEN
    RETURN json_build_object('error', 'The auction is not currently active.');
  END IF;
  IF p_round IS DISTINCT FROM a_round THEN
    RETURN json_build_object('error', 'This round is no longer accepting bids.');
  END IF;
  IF a_started_at IS NOT NULL
     AND now() > a_started_at + make_interval(secs => COALESCE(a_duration, 0)) THEN
    RETURN json_build_object('error', 'This round has ended.');
  END IF;

  -- Caller must have a registered team IN THIS COMPETITION.
  SELECT id, budget_remaining INTO v_team_id, v_budget
  FROM teams WHERE user_id = p_user_id AND competition_id = v_comp;   -- [COMPETITION]
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'You must have a registered team to bid.');
  END IF;

  -- Reject if user already has a bid on this player this round.
  -- (player_id already partitions by competition.)
  IF EXISTS (
    SELECT 1 FROM auction_bids
    WHERE user_id = p_user_id AND player_id = p_player_id AND round_number = p_round
  ) THEN
    RETURN json_build_object('error', 'You already have a bid on this player this round.');
  END IF;

  -- Active bids this round (count + sum). [COMPETITION] round numbers repeat
  -- across competitions, so this aggregate MUST be scoped.
  SELECT COUNT(*), COALESCE(SUM(bid_amount), 0) INTO active_count, active_sum
  FROM auction_bids
  WHERE user_id = p_user_id AND round_number = p_round AND competition_id = v_comp;

  -- Players already owned by this team.
  SELECT COUNT(*) INTO owned_count FROM team_players WHERE team_id = v_team_id;

  -- Squad cap (owned + other active bids + this one).
  projected := owned_count + active_count + 1;
  IF projected > v_max_squad THEN
    RETURN json_build_object('error', 'No squad slots remain for new bids.');
  END IF;

  -- Effective budget = budget minus what is already committed to active bids.
  effective_budget := v_budget - active_sum;
  IF p_amount > effective_budget THEN
    RETURN json_build_object(
      'error', format('Effective budget left: £%s.', to_char(effective_budget, 'FM999990.0'))
    );
  END IF;

  -- GK reserve: keep the final squad slot open for a goalkeeper unless the team
  -- already owns one or has one in its active bids this round.
  IF v_position <> 'GK' THEN
    SELECT COUNT(*) INTO gk_owned
    FROM team_players tp JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = v_team_id AND p.position = 'GK';

    SELECT COUNT(*) INTO gk_in_bids
    FROM auction_bids ab JOIN players p ON p.id = ab.player_id
    WHERE ab.user_id = p_user_id AND ab.round_number = p_round
      AND ab.competition_id = v_comp                              -- [COMPETITION]
      AND p.position = 'GK';

    IF gk_owned = 0 AND gk_in_bids = 0 AND projected >= v_max_squad THEN
      RETURN json_build_object('error', 'Last squad slot must stay open for a goalkeeper.');
    END IF;
  END IF;

  -- Carry-over floor: bid must strictly exceed the highest bid from any previous round.
  SELECT MAX(bid_amount) INTO carry_floor
  FROM auction_bids
  WHERE player_id = p_player_id AND round_number < p_round;
  IF carry_floor IS NOT NULL AND p_amount <= carry_floor THEN
    RETURN json_build_object(
      'error', format(
        'This player carries over — minimum bid is £%s (must exceed previous high of £%s).',
        to_char(carry_floor + v_min_increment, 'FM999990.0'),
        to_char(carry_floor, 'FM999990.0')
      )
    );
  END IF;

  -- Ascending bid: must meet or exceed current-round high + the increment.
  SELECT MAX(bid_amount) INTO current_high
  FROM auction_bids
  WHERE player_id = p_player_id AND round_number = p_round;
  IF current_high IS NOT NULL AND p_amount < current_high + v_min_increment THEN
    RETURN json_build_object(
      'error', format(
        'Someone bid £%s — outbid at £%s or more.',
        to_char(current_high, 'FM999990.0'),
        to_char(current_high + v_min_increment, 'FM999990.0')
      )
    );
  END IF;

  INSERT INTO auction_bids (user_id, player_id, bid_amount, round_number, competition_id)
  VALUES (p_user_id, p_player_id, p_amount, p_round, v_comp)
  RETURNING * INTO new_bid;

  RETURN row_to_json(new_bid);
END;
$$;

-- place_bid stays a thin auth.uid() wrapper — signature and GRANT unchanged.
-- place_bid_internal intentionally still NOT granted to authenticated.

-- ── seed_matchday_lineups ─────────────────────────────────────────────────────
-- Only the guard changes: both matchdays must exist and share a competition.
-- The body below is 049 verbatim.
CREATE OR REPLACE FUNCTION seed_matchday_lineups(
  p_source_md integer,
  p_target_md integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src_comp integer;   -- [COMPETITION]
  v_tgt_comp integer;   -- [COMPETITION]
BEGIN
  -- Allow service role (auth.uid() NULL, e.g. SQL editor); otherwise admin-only.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- [COMPETITION] Carrying lineups from one competition's matchday into
  -- another's would insert foreign players into every team's XI.
  SELECT competition_id INTO v_src_comp FROM matchdays WHERE id = p_source_md;
  SELECT competition_id INTO v_tgt_comp FROM matchdays WHERE id = p_target_md;
  IF v_src_comp IS NULL OR v_tgt_comp IS NULL OR v_src_comp <> v_tgt_comp THEN
    RETURN json_build_object('error', 'Las jornadas deben existir y pertenecer a la misma competencia.');
  END IF;

  -- Full rebuild of the target matchday from the source + target-window transfers.
  DELETE FROM lineups WHERE matchday_id = p_target_md;

  WITH RECURSIVE tx AS (
    SELECT team_id, player_out_id, player_in_id, created_at
    FROM transfers
    WHERE matchday_id = p_target_md
  ),
  resolve AS (
    -- Depth 0: every source-MD slot, original player still in place.
    SELECT l.team_id, l.player_id AS orig, l.player_id AS cur,
           l.is_starting, l.is_captain, l.bench_order, 0 AS depth
    FROM lineups l
    WHERE l.matchday_id = p_source_md
    UNION ALL
    -- Follow each target-window transfer that swaps out the current holder.
    SELECT r.team_id, r.orig, t.player_in_id,
           r.is_starting, r.is_captain, r.bench_order, r.depth + 1
    FROM resolve r
    JOIN tx t ON t.team_id = r.team_id AND t.player_out_id = r.cur
    WHERE r.depth < 20                          -- cycle / runaway guard
  ),
  final AS (                                     -- deepest resolution per slot
    SELECT DISTINCT ON (team_id, orig)
           team_id, cur AS player_id, is_starting, is_captain, bench_order
    FROM resolve
    ORDER BY team_id, orig, depth DESC
  )
  INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
  SELECT team_id, p_target_md, player_id, is_starting, is_captain, bench_order
  FROM final;

  -- ── GK rebalance (scoped to the freshly inserted target rows) ──────────────
  -- 2a. Demote cheapest outfield starter into the bench GK's old bench slot.
  WITH md_lineups AS (
    SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.matchday_id = p_target_md
  ),
  broken_teams AS (
    SELECT team_id
    FROM md_lineups
    GROUP BY team_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id, ml.bench_order
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE NOT ml.is_starting AND ml.position = 'GK'
    ORDER BY ml.team_id, ml.price DESC NULLS LAST, ml.id
  ),
  demote AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE ml.is_starting AND ml.position <> 'GK'
    ORDER BY ml.team_id, ml.price ASC NULLS LAST, ml.id
  )
  UPDATE lineups l
  SET is_starting = false,
      bench_order = bg.bench_order
  FROM demote d
  JOIN bench_gk bg ON bg.team_id = d.team_id
  WHERE l.id = d.id;

  -- 2b. Promote the bench GK into the XI.
  WITH md_lineups AS (
    SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.matchday_id = p_target_md
  ),
  broken_teams AS (
    SELECT team_id
    FROM md_lineups
    GROUP BY team_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE NOT ml.is_starting AND ml.position = 'GK'
    ORDER BY ml.team_id, ml.price DESC NULLS LAST, ml.id
  )
  UPDATE lineups l
  SET is_starting = true,
      bench_order = NULL
  FROM bench_gk bg
  WHERE l.id = bg.id;

  RETURN json_build_object('success', true, 'target_md', p_target_md);
END;
$$;

GRANT EXECUTE ON FUNCTION seed_matchday_lineups(integer, integer) TO authenticated;
