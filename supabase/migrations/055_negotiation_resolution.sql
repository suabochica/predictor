-- 055_negotiation_resolution.sql
-- Closed-door negotiations (elimination Phase B), part 3: server-side
-- resolution. Clients can't see each other's sealed offers (RLS in 054), so
-- picking winners and moving ownership/cash has to happen entirely inside a
-- SECURITY DEFINER RPC — there is no safe way to do this from a client, unlike
-- the auction's client-side resolveRound.

-- Verbatim port of execute_transfer's (050) steps 5+6 — lineup repoint +
-- GK rebalance — parameterized on matchday so negotiation wins can target the
-- window's upcoming matchday instead of "the active matchday". NOT granted to
-- authenticated: internal helper only, called from resolve_negotiation_window
-- (same convention as place_bid_internal, 034).
CREATE OR REPLACE FUNCTION negotiation_lineup_swap(
  p_team_id    integer,
  p_matchday_id integer,
  p_out        integer,
  p_in         integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lineup_row lineups%ROWTYPE;
BEGIN
  -- Repoint lineup rows: window matchday and null (default lineup).
  FOR v_lineup_row IN (
    SELECT * FROM lineups
    WHERE team_id = p_team_id
      AND player_id = p_out
      AND (matchday_id = p_matchday_id OR matchday_id IS NULL)
  ) LOOP
    DELETE FROM lineups WHERE id = v_lineup_row.id;
    INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
    VALUES (p_team_id, v_lineup_row.matchday_id, p_in,
            v_lineup_row.is_starting, v_lineup_row.is_captain, v_lineup_row.bench_order);
  END LOOP;

  -- GK rebalance (mirrors 050 6a/6b): if the swap emptied the starting XI of
  -- goalkeepers but a bench GK exists, demote the cheapest outfield starter
  -- and promote the bench GK.
  WITH scope AS (
    SELECT l.id, l.matchday_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = p_team_id
      AND (l.matchday_id = p_matchday_id OR l.matchday_id IS NULL)
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

  WITH scope AS (
    SELECT l.id, l.matchday_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = p_team_id
      AND (l.matchday_id = p_matchday_id OR l.matchday_id IS NULL)
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
END;
$$;

-- ── resolve_negotiation_window ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_negotiation_window(p_window_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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

  PERFORM pg_advisory_xact_lock(7001);

  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window IS NULL OR v_window.status <> 'open' THEN
    RETURN json_build_object('error', 'La ventana ya fue resuelta o no existe.');
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_elim_ids FROM teams WHERE status = 'eliminated';

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
      WHERE tp.player_id = o.target_player_id AND t.status = 'eliminated' AND NOT p.is_eliminated
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
      INSERT INTO team_players (team_id, player_id, acquisition_price)
      VALUES (v_offer.bidder_team_id, v_target_id, v_total);
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

  -- Full release: every remaining player of every eliminated team (unsold +
  -- eliminated-country) becomes a free agent. Historical lineups/standings
  -- reference players, not team_players, so they're untouched.
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
