ALTER TABLE auction_bids
  ADD COLUMN is_carryover BOOLEAN DEFAULT false;

ALTER TABLE auction_bids
  ADD CONSTRAINT auction_bids_unique_user_player_round
  UNIQUE (user_id, player_id, round_number);
