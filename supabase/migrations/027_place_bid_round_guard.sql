-- Server-side round guard for place_bid.
-- `endRound()` only pushes round_started_at into the past to zero out the CLIENT
-- timer; the RPC itself had no concept of round timing or auction status, so a stale
-- or disconnected client (one that missed the realtime auction_state update) could
-- still place a bid the server would accept. This makes round-end/pause authoritative
-- at the database using now() as the clock (immune to client skew).
--
-- Same body as migration 022's place_bid, with a status/round/deadline guard added
-- immediately after the advisory lock, before any read or insert of bids.
CREATE OR REPLACE FUNCTION place_bid(
  p_player_id  integer,
  p_amount     numeric,
  p_round      integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  MIN_INCREMENT   constant numeric := 0.3;
  current_high    numeric;
  carry_floor     numeric;
  active_bid_count integer;
  new_bid         auction_bids;
  a_status        text;
  a_round         integer;
  a_started_at    timestamptz;
  a_duration      integer;
BEGIN
  -- Serialize concurrent bids on the same (player, round) pair.
  PERFORM pg_advisory_xact_lock(p_player_id, p_round);

  -- Round guard: the auction must be active, the bid must target the current round,
  -- and the round must not have ended. now() is the authoritative clock.
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

  -- Reject if user already has a bid on this player this round.
  IF EXISTS (
    SELECT 1 FROM auction_bids
    WHERE user_id = auth.uid()
      AND player_id = p_player_id
      AND round_number = p_round
  ) THEN
    RETURN json_build_object('error', 'You already have a bid on this player this round.');
  END IF;

  -- Reject if user already has 15 active bids this round (one per squad slot).
  SELECT COUNT(*) INTO active_bid_count
  FROM auction_bids
  WHERE user_id = auth.uid()
    AND round_number = p_round;
  IF active_bid_count >= 15 THEN
    RETURN json_build_object('error', 'You already have 15 active bids this round.');
  END IF;

  -- Carry-over floor check: bid must strictly exceed the highest bid from any previous round.
  SELECT MAX(bid_amount) INTO carry_floor
  FROM auction_bids
  WHERE player_id = p_player_id
    AND round_number < p_round;
  IF carry_floor IS NOT NULL AND p_amount <= carry_floor THEN
    RETURN json_build_object(
      'error', format(
        'This player carries over — minimum bid is £%s (must exceed previous high of £%s).',
        to_char(carry_floor + MIN_INCREMENT, 'FM999990.0'),
        to_char(carry_floor, 'FM999990.0')
      )
    );
  END IF;

  -- Ascending bid check: bid must meet or exceed current-round high + MIN_INCREMENT.
  SELECT MAX(bid_amount) INTO current_high
  FROM auction_bids
  WHERE player_id = p_player_id
    AND round_number = p_round;
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
  VALUES (auth.uid(), p_player_id, p_amount, p_round)
  RETURNING * INTO new_bid;

  RETURN row_to_json(new_bid);
END;
$$;

GRANT EXECUTE ON FUNCTION place_bid(integer, numeric, integer) TO authenticated;
