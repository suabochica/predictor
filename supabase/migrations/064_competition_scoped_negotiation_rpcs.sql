-- 064_competition_scoped_negotiation_rpcs.sql
-- Phase 2, part 2: the four closed-door-negotiation RPCs (054, 055).
-- Signatures unchanged — every one derives the competition from the matchday or
-- window it was already given.
--
-- Three things matter more here than elsewhere:
--
--   * `pg_advisory_xact_lock(7001)` was a GLOBAL mutex on "the negotiation
--     window". With two competitions it would serialize UCL's admin behind the
--     WC's for no reason, so both open_ and resolve_ move to the two-int form
--     `pg_advisory_xact_lock(7001, competition_id)`. Both must change together:
--     the one-arg (bigint) and two-arg (int, int) forms occupy DIFFERENT lock
--     spaces and do not block each other.
--
--   * `withdraw_negotiation_offer` looked up `teams WHERE user_id = auth.uid()`
--     BEFORE reading the offer, so it had nothing to scope by. It is reordered:
--     offer -> window -> competition -> team. The offer is re-read under the
--     advisory lock so the status check still happens after serialization.
--
--   * The eliminated-team scans in open_ and resolve_ were competition-wide.
--     `resolve_negotiation_window`'s is the dangerous one: it drives
--     `DELETE FROM team_players WHERE team_id = ANY(v_elim_ids)`, which would
--     wipe the squads of eliminated teams in every other competition.

-- ── open_negotiation_window ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION open_negotiation_window(p_fantasy_round integer, p_matchday_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp          integer;   -- [COMPETITION]
  v_first_kickoff timestamptz;
  v_closes        timestamptz;
  v_row           negotiation_windows%ROWTYPE;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- [COMPETITION] Derive from the admin-chosen matchday.
  SELECT competition_id INTO v_comp FROM matchdays WHERE id = p_matchday_id;
  IF v_comp IS NULL THEN
    RETURN json_build_object('error', 'La jornada seleccionada no existe.');
  END IF;

  PERFORM pg_advisory_xact_lock(7001, v_comp);        -- [COMPETITION]

  -- 062 made one_open_negotiation_window unique per competition.
  IF EXISTS (SELECT 1 FROM negotiation_windows WHERE status = 'open' AND competition_id = v_comp) THEN
    RETURN json_build_object('error', 'Ya hay una ventana de negociación abierta.');
  END IF;

  SELECT MIN(match_date) INTO v_first_kickoff
  FROM matches WHERE matchday_id = p_matchday_id AND match_date IS NOT NULL;

  IF v_first_kickoff IS NULL THEN
    RETURN json_build_object('error', 'La jornada seleccionada no tiene partidos programados.');
  END IF;

  v_closes := v_first_kickoff - interval '1 hour';
  IF v_closes <= now() THEN
    RETURN json_build_object('error', 'Esa jornada ya está por comenzar; elige una jornada más adelante.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE status = 'eliminated' AND competition_id = v_comp   -- [COMPETITION]
  ) THEN
    RETURN json_build_object('error', 'No hay equipos eliminados para negociar.');
  END IF;

  INSERT INTO negotiation_windows (fantasy_round, matchday_id, closes_at, competition_id)
  VALUES (p_fantasy_round, p_matchday_id, v_closes, v_comp)
  RETURNING * INTO v_row;

  RETURN json_build_object('success', true, 'window', row_to_json(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION open_negotiation_window(integer, integer) TO authenticated;

-- ── submit_negotiation_offer ────────────────────────────────────────────────
-- Reordered: the window is read FIRST so the caller's team can be resolved
-- within the right competition. The knockout cap now comes from the
-- competitions row instead of a frozen constant.
CREATE OR REPLACE FUNCTION submit_negotiation_offer(
  p_window_id         integer,
  p_target_player_id  integer,
  p_offered_player_id integer,
  p_cash              numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp          integer;   -- [COMPETITION]
  v_cap_ko        integer;   -- [COMPETITION] was TRANSFER_CAP_KO constant
  v_caller_uid    uuid;
  v_team_id       integer;
  v_team_status   text;
  v_budget        numeric;
  v_window        negotiation_windows%ROWTYPE;
  v_target_pos    text;
  v_target_price  numeric;
  v_offered_pos   text;
  v_offered_price numeric;
  v_total         numeric;
  v_committed_cash numeric;
  v_used          integer;
  v_gks_after     integer;
  v_row           negotiation_offers%ROWTYPE;
BEGIN
  v_caller_uid := auth.uid();

  -- [COMPETITION] Window first — it carries the competition.
  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window IS NULL OR v_window.status <> 'open' OR now() >= v_window.closes_at THEN
    RETURN json_build_object('error', 'La ventana de negociación no está abierta.');
  END IF;
  v_comp := v_window.competition_id;

  SELECT transfer_cap_knockout INTO v_cap_ko FROM competitions WHERE id = v_comp;

  SELECT id, status, budget_remaining INTO v_team_id, v_team_status, v_budget
  FROM teams WHERE user_id = v_caller_uid AND competition_id = v_comp;   -- [COMPETITION]
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado.');
  END IF;
  IF v_team_status = 'eliminated' THEN
    RETURN json_build_object('error', 'Tu equipo fue eliminado y no puede negociar.');
  END IF;

  PERFORM pg_advisory_xact_lock(v_team_id);

  -- Re-check the window under the lock (it may have closed in between).
  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window.status <> 'open' OR now() >= v_window.closes_at THEN
    RETURN json_build_object('error', 'La ventana de negociación no está abierta.');
  END IF;

  p_cash := round(p_cash, 1);
  IF p_cash < 0 THEN
    RETURN json_build_object('error', 'El efectivo ofrecido no puede ser negativo.');
  END IF;

  -- Pool check: target must belong to an eliminated team of THIS competition
  -- AND its country must still be alive.
  IF NOT EXISTS (
    SELECT 1 FROM team_players tp
    JOIN teams t ON t.id = tp.team_id
    JOIN players p ON p.id = tp.player_id
    WHERE tp.player_id = p_target_player_id
      AND t.status = 'eliminated'
      AND t.competition_id = v_comp                                    -- [COMPETITION]
      AND NOT p.is_eliminated
  ) THEN
    RETURN json_build_object('error', 'Ese jugador ya no está disponible para negociar.');
  END IF;

  -- Bidder must own the offered player (team_id is already competition-scoped).
  IF NOT EXISTS (
    SELECT 1 FROM team_players WHERE team_id = v_team_id AND player_id = p_offered_player_id
  ) THEN
    RETURN json_build_object('error', 'No tienes ese jugador en tu plantilla.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM negotiation_offers
    WHERE window_id = p_window_id AND bidder_team_id = v_team_id
      AND target_player_id = p_target_player_id AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'Ya tienes una oferta activa por este jugador.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM negotiation_offers
    WHERE window_id = p_window_id AND bidder_team_id = v_team_id
      AND offered_player_id = p_offered_player_id AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'Ese jugador ya está comprometido en otra oferta activa.');
  END IF;

  SELECT position, current_price INTO v_target_pos, v_target_price FROM players WHERE id = p_target_player_id;
  SELECT position, current_price INTO v_offered_pos, v_offered_price FROM players WHERE id = p_offered_player_id;

  v_total := round(v_offered_price + p_cash, 1);
  IF v_total < v_target_price THEN
    RETURN json_build_object('error', 'La oferta total debe ser al menos el precio del jugador objetivo.');
  END IF;

  SELECT COALESCE(SUM(cash), 0) INTO v_committed_cash
  FROM negotiation_offers WHERE window_id = p_window_id AND bidder_team_id = v_team_id AND status = 'active';
  IF v_committed_cash + p_cash > v_budget THEN
    RETURN json_build_object('error', 'Presupuesto insuficiente para comprometer ese efectivo.');
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM transfers WHERE team_id = v_team_id AND matchday_id = v_window.matchday_id;
  SELECT v_used + COUNT(*) INTO v_used
  FROM negotiation_offers WHERE window_id = p_window_id AND bidder_team_id = v_team_id AND status = 'active';
  IF v_used + 1 > v_cap_ko THEN
    RETURN json_build_object('error', 'Sin fichajes restantes en esta ventana.');
  END IF;

  -- GK invariant: offering away the squad's only goalkeeper for a non-GK
  -- target would leave the bidder with 0 GK (mirrors execute_transfer).
  SELECT COUNT(*) INTO v_gks_after
  FROM team_players tp JOIN players p ON p.id = tp.player_id
  WHERE tp.team_id = v_team_id AND p.position = 'GK' AND tp.player_id <> p_offered_player_id;
  IF v_target_pos = 'GK' THEN
    v_gks_after := v_gks_after + 1;
  END IF;
  IF v_gks_after < 1 THEN
    RETURN json_build_object('error', 'Esa oferta dejaría tu plantilla sin porteros.');
  END IF;

  INSERT INTO negotiation_offers (window_id, bidder_team_id, target_player_id, offered_player_id, cash)
  VALUES (p_window_id, v_team_id, p_target_player_id, p_offered_player_id, p_cash)
  RETURNING * INTO v_row;

  RETURN json_build_object('success', true, 'offer', row_to_json(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION submit_negotiation_offer(integer, integer, integer, numeric) TO authenticated;

-- ── withdraw_negotiation_offer ──────────────────────────────────────────────
-- Reordered so the team lookup can be scoped: offer -> window -> competition ->
-- team. The offer is re-read under the advisory lock before its status is
-- trusted, preserving 054's serialization.
CREATE OR REPLACE FUNCTION withdraw_negotiation_offer(p_offer_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_uid uuid;
  v_team_id    integer;
  v_offer      negotiation_offers%ROWTYPE;
  v_window     negotiation_windows%ROWTYPE;
BEGIN
  v_caller_uid := auth.uid();

  SELECT * INTO v_offer FROM negotiation_offers WHERE id = p_offer_id;
  IF v_offer IS NULL THEN
    RETURN json_build_object('error', 'Esa oferta no existe o no está activa.');
  END IF;

  SELECT * INTO v_window FROM negotiation_windows WHERE id = v_offer.window_id;

  -- [COMPETITION] Resolve the caller's team inside the offer's competition —
  -- the old `teams WHERE user_id = …` picked an arbitrary row.
  SELECT id INTO v_team_id
  FROM teams WHERE user_id = v_caller_uid AND competition_id = v_window.competition_id;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado.');
  END IF;

  PERFORM pg_advisory_xact_lock(v_team_id);

  -- Re-read under the lock before trusting the status.
  SELECT * INTO v_offer FROM negotiation_offers WHERE id = p_offer_id;
  IF v_offer IS NULL OR v_offer.bidder_team_id <> v_team_id OR v_offer.status <> 'active' THEN
    RETURN json_build_object('error', 'Esa oferta no existe o no está activa.');
  END IF;

  SELECT * INTO v_window FROM negotiation_windows WHERE id = v_offer.window_id;
  IF v_window.status <> 'open' OR now() >= v_window.closes_at THEN
    RETURN json_build_object('error', 'La ventana de negociación no está abierta.');
  END IF;

  UPDATE negotiation_offers SET status = 'withdrawn' WHERE id = p_offer_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_negotiation_offer(integer) TO authenticated;

-- ── resolve_negotiation_window ──────────────────────────────────────────────
-- 055 verbatim plus: competition derived from the window, the eliminated-team
-- scan scoped to it (it drives a bulk DELETE FROM team_players), the two-int
-- advisory lock, and an explicit competition_id on the team_players INSERT.
CREATE OR REPLACE FUNCTION resolve_negotiation_window(p_window_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp           integer;   -- [COMPETITION]
  v_window         negotiation_windows%ROWTYPE;
  v_elim_ids       integer[];
  v_target_id      integer;
  v_offer          negotiation_offers%ROWTYPE;
  v_target_pos     text;
  v_target_price   numeric;
  v_offered_pos    text;
  v_offered_price  numeric;
  v_winner_budget  numeric;
  v_total          numeric;
  v_gks_after      integer;
  v_won_this_target boolean;
  v_sales          jsonb := '[]'::jsonb;
  v_lost_count     integer := 0;
  v_void_count     integer := 0;
  v_released_count integer;
  v_tmp            integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- [COMPETITION] Read the window before locking so the lock can be per-competition.
  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window IS NULL THEN
    RETURN json_build_object('error', 'La ventana ya fue resuelta o no existe.');
  END IF;
  v_comp := v_window.competition_id;

  PERFORM pg_advisory_xact_lock(7001, v_comp);        -- [COMPETITION]

  -- Re-read under the lock.
  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window IS NULL OR v_window.status <> 'open' THEN
    RETURN json_build_object('error', 'La ventana ya fue resuelta o no existe.');
  END IF;

  -- [COMPETITION] This array drives the bulk release DELETE below. Unscoped it
  -- would empty the squads of eliminated teams in every other competition.
  SELECT COALESCE(array_agg(id), '{}') INTO v_elim_ids
  FROM teams WHERE status = 'eliminated' AND competition_id = v_comp;

  -- Re-derive the pool now: void any active offer whose target left it
  -- (its country got marked eliminated mid-window — never checked on the
  -- offered leg, only the target).
  UPDATE negotiation_offers o
  SET status = 'void'
  WHERE o.window_id = p_window_id AND o.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      JOIN players p ON p.id = tp.player_id
      WHERE tp.player_id = o.target_player_id
        AND t.status = 'eliminated'
        AND t.competition_id = v_comp                 -- [COMPETITION]
        AND NOT p.is_eliminated
    );
  GET DIAGNOSTICS v_void_count = ROW_COUNT;

  -- Per target, try candidates highest-total-first until one re-validates.
  FOR v_target_id IN (
    SELECT DISTINCT target_player_id FROM negotiation_offers
    WHERE window_id = p_window_id AND status = 'active'
    ORDER BY target_player_id
  ) LOOP
    SELECT position, current_price INTO v_target_pos, v_target_price FROM players WHERE id = v_target_id;
    v_won_this_target := false;

    FOR v_offer IN (
      SELECT o.* FROM negotiation_offers o
      JOIN players op ON op.id = o.offered_player_id
      WHERE o.window_id = p_window_id AND o.target_player_id = v_target_id AND o.status = 'active'
      ORDER BY (op.current_price + o.cash) DESC, o.created_at ASC
    ) LOOP
      SELECT current_price, position INTO v_offered_price, v_offered_pos
      FROM players WHERE id = v_offer.offered_player_id;
      SELECT budget_remaining INTO v_winner_budget FROM teams WHERE id = v_offer.bidder_team_id;

      -- Re-validate: offered player may have been consumed by an earlier win
      -- this run; cash checked against the bidder's live (already-decremented) budget.
      IF NOT EXISTS (
        SELECT 1 FROM team_players WHERE team_id = v_offer.bidder_team_id AND player_id = v_offer.offered_player_id
      ) OR v_offer.cash > v_winner_budget THEN
        UPDATE negotiation_offers SET status = 'void' WHERE id = v_offer.id;
        v_void_count := v_void_count + 1;
        CONTINUE;
      END IF;

      SELECT COUNT(*) INTO v_gks_after
      FROM team_players tp JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = v_offer.bidder_team_id AND p.position = 'GK' AND tp.player_id <> v_offer.offered_player_id;
      IF v_target_pos = 'GK' THEN
        v_gks_after := v_gks_after + 1;
      END IF;
      IF v_gks_after < 1 THEN
        UPDATE negotiation_offers SET status = 'void' WHERE id = v_offer.id;
        v_void_count := v_void_count + 1;
        CONTINUE;
      END IF;

      -- Winner: full release of target to bidder, offered player becomes a
      -- free agent (NOT back-filled to the eliminated team), cash deducted.
      v_total := round(v_offered_price + v_offer.cash, 1);

      DELETE FROM team_players WHERE team_id = ANY(v_elim_ids) AND player_id = v_target_id;
      INSERT INTO team_players (team_id, player_id, acquisition_price, competition_id)
      VALUES (v_offer.bidder_team_id, v_target_id, v_total, v_comp);   -- [COMPETITION]
      DELETE FROM team_players WHERE team_id = v_offer.bidder_team_id AND player_id = v_offer.offered_player_id;
      UPDATE teams SET budget_remaining = round(v_winner_budget - v_offer.cash, 1) WHERE id = v_offer.bidder_team_id;

      INSERT INTO transfers (team_id, window_number, matchday_id, player_out_id, player_in_id, price_difference)
      VALUES (v_offer.bidder_team_id, v_window.matchday_id, v_window.matchday_id,
              v_offer.offered_player_id, v_target_id, round(v_offered_price - v_target_price, 1));

      PERFORM negotiation_lineup_swap(v_offer.bidder_team_id, v_window.matchday_id, v_offer.offered_player_id, v_target_id);

      UPDATE negotiation_offers SET status = 'won' WHERE id = v_offer.id;

      UPDATE negotiation_offers SET status = 'lost'
      WHERE window_id = p_window_id AND target_player_id = v_target_id AND status = 'active' AND id <> v_offer.id;
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_lost_count := v_lost_count + v_tmp;

      v_sales := v_sales || jsonb_build_array(jsonb_build_object(
        'target', v_target_id, 'winner', v_offer.bidder_team_id, 'cash', v_offer.cash, 'total', v_total
      ));

      v_won_this_target := true;
      EXIT;
    END LOOP;

    IF NOT v_won_this_target THEN
      -- Every candidate for this target was invalid; it falls through to the
      -- bulk release below (still owned by its eliminated team).
      UPDATE negotiation_offers SET status = 'void'
      WHERE window_id = p_window_id AND target_player_id = v_target_id AND status = 'active';
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_void_count := v_void_count + v_tmp;
    END IF;
  END LOOP;

  -- Full release: every remaining player of every eliminated team IN THIS
  -- COMPETITION (unsold + eliminated-country) becomes a free agent. Historical
  -- lineups/standings reference players, not team_players, so they're untouched.
  DELETE FROM team_players WHERE team_id = ANY(v_elim_ids);
  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  -- Sweep any offer left active (targets that never made it into the loop
  -- above shouldn't exist, but this keeps the invariant airtight).
  UPDATE negotiation_offers SET status = 'void' WHERE window_id = p_window_id AND status = 'active';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_void_count := v_void_count + v_tmp;

  UPDATE negotiation_windows SET status = 'resolved', resolved_at = now() WHERE id = p_window_id;

  RETURN jsonb_build_object(
    'success', true,
    'sales', v_sales,
    'released_count', v_released_count,
    'lost_count', v_lost_count,
    'void_count', v_void_count
  )::json;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_negotiation_window(integer) TO authenticated;
