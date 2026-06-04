-- 034_place_bid_helper.sql
-- Extracts place_bid_internal(p_user_id, …) from the place_bid body so that both
-- human bids and the auto-bid RPC share the same server-side validation rules.
--
-- Key change vs migration 027: re-adds the effective-budget check and GK-reserve check
-- that 027 had dropped (those currently live only in the client). This deliberately
-- makes human bidding stricter — the client-side guards were always just fast-UX copies
-- of these rules.
--
-- place_bid(p_player_id, p_amount, p_round) → thin wrapper calling place_bid_internal
--   with auth.uid(). Signature and GRANT unchanged, so existing callers are unaffected.
-- place_bid_internal is NOT granted to authenticated — only internal/SECURITY DEFINER
--   callers (run_auto_bids) may invoke it.

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
  MIN_INCREMENT    constant numeric := 0.3;
  MAX_SQUAD        constant integer := 15;
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

  -- Round guard: auction must be active, bid must target the current round, round must not have ended.
  SELECT status, current_round, round_started_at, round_duration_seconds
    INTO a_status, a_round, a_started_at, a_duration
  FROM auction_state
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

  -- Caller must have a registered team.
  SELECT id, budget_remaining INTO v_team_id, v_budget
  FROM teams WHERE user_id = p_user_id;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'You must have a registered team to bid.');
  END IF;

  -- Reject if user already has a bid on this player this round.
  IF EXISTS (
    SELECT 1 FROM auction_bids
    WHERE user_id = p_user_id AND player_id = p_player_id AND round_number = p_round
  ) THEN
    RETURN json_build_object('error', 'You already have a bid on this player this round.');
  END IF;

  -- The bid player's position (needed for GK reserve).
  SELECT position INTO v_position FROM players WHERE id = p_player_id;

  -- Active bids this round (count + sum).
  SELECT COUNT(*), COALESCE(SUM(bid_amount), 0) INTO active_count, active_sum
  FROM auction_bids
  WHERE user_id = p_user_id AND round_number = p_round;

  -- Players already owned by this team.
  SELECT COUNT(*) INTO owned_count FROM team_players WHERE team_id = v_team_id;

  -- 15-player squad cap (owned + other active bids + this one).
  projected := owned_count + active_count + 1;
  IF projected > MAX_SQUAD THEN
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
    WHERE ab.user_id = p_user_id AND ab.round_number = p_round AND p.position = 'GK';

    IF gk_owned = 0 AND gk_in_bids = 0 AND projected >= MAX_SQUAD THEN
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
        to_char(carry_floor + MIN_INCREMENT, 'FM999990.0'),
        to_char(carry_floor, 'FM999990.0')
      )
    );
  END IF;

  -- Ascending bid: must meet or exceed current-round high + MIN_INCREMENT.
  SELECT MAX(bid_amount) INTO current_high
  FROM auction_bids
  WHERE player_id = p_player_id AND round_number = p_round;
  IF current_high IS NOT NULL AND p_amount < current_high + MIN_INCREMENT THEN
    RETURN json_build_object(
      'error', format(
        'Someone bid £%s — outbid at £%s or more.',
        to_char(current_high, 'FM999990.0'),
        to_char(current_high + MIN_INCREMENT, 'FM999990.0')
      )
    );
  END IF;

  INSERT INTO auction_bids (user_id, player_id, bid_amount, round_number)
  VALUES (p_user_id, p_player_id, p_amount, p_round)
  RETURNING * INTO new_bid;

  RETURN row_to_json(new_bid);
END;
$$;

-- Rewrap the public-facing place_bid as a thin auth.uid() wrapper.
CREATE OR REPLACE FUNCTION place_bid(
  p_player_id integer,
  p_amount    numeric,
  p_round     integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN place_bid_internal(auth.uid(), p_player_id, p_amount, p_round);
END;
$$;

GRANT EXECUTE ON FUNCTION place_bid(integer, numeric, integer) TO authenticated;
-- place_bid_internal intentionally NOT granted to authenticated.
