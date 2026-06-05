-- Allow all authenticated users to read teams and team_players.
-- This enables ownership labels ("Owned: TeamX") for all users in the auction
-- and lets realtime deliver team_players INSERTs to every client.

CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can view team players"
  ON team_players FOR SELECT
  TO authenticated
  USING (true);

-- Ensure auction_bids is in the realtime publication so all clients
-- receive bid INSERT events in real time.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE auction_bids;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Server-authoritative bid placement with advisory lock for race safety.
-- Serializes concurrent bids on the same (player, round) pair and enforces
-- ascending bids: a later bid must strictly exceed the current-round high
-- by MIN_BID_INCREMENT (0.3).
-- Returns the inserted row as JSON on success, or { "error": "..." } on rejection.
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
BEGIN
  -- Serialize concurrent bids on the same (player, round) pair.
  PERFORM pg_advisory_xact_lock(p_player_id, p_round);

  -- Reject if user already has a bid on this player this round.
  IF EXISTS (
    SELECT 1 FROM auction_bids
    WHERE user_id = auth.uid()
      AND player_id = p_player_id
      AND round_number = p_round
  ) THEN
    RETURN json_build_object('error', 'You already have a bid on this player this round.');
  END IF;

  -- Reject if user already has 10 active bids this round.
  SELECT COUNT(*) INTO active_bid_count
  FROM auction_bids
  WHERE user_id = auth.uid()
    AND round_number = p_round;
  IF active_bid_count >= 10 THEN
    RETURN json_build_object('error', 'You already have 10 active bids this round.');
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
