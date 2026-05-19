-- Price persistence: players have a current_price that ratchets up after auctions
ALTER TABLE players ADD COLUMN current_price NUMERIC NOT NULL DEFAULT 0;
UPDATE players SET current_price = price;
ALTER TABLE players ALTER COLUMN current_price DROP DEFAULT;

-- Drop the lockable_players VIEW (was hardcoded to 8.5, drifted from constants.js)
DROP VIEW IF EXISTS lockable_players;

-- Enforce one lock per player across all teams
CREATE UNIQUE INDEX one_lock_per_player
  ON team_players(player_id)
  WHERE slot_type = 'locked';

-- Atomic lock function. SECURITY DEFINER so it can write across teams.
CREATE OR REPLACE FUNCTION lock_player(
  p_team_id INT,
  p_player_in INT,
  p_player_to_unlock INT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked_count INT;
  v_competing_team INT;
  v_refunded JSON;
BEGIN
  -- Validate MAX_LOCKED
  SELECT COUNT(*) INTO v_locked_count
    FROM team_players WHERE team_id = p_team_id AND slot_type = 'locked';

  IF v_locked_count >= 10 AND p_player_to_unlock IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'max_locked_no_unlock');
  END IF;

  -- Perform swap-out if requested
  IF p_player_to_unlock IS NOT NULL THEN
    UPDATE team_players
      SET slot_type = 'free', is_locked = false
      WHERE team_id = p_team_id AND player_id = p_player_to_unlock AND slot_type = 'locked';
  END IF;

  -- Check for existing lock on target player. FCFS — whichever RPC commits first wins.
  SELECT team_id INTO v_competing_team
    FROM team_players WHERE player_id = p_player_in AND slot_type = 'locked';

  IF v_competing_team IS NOT NULL AND v_competing_team <> p_team_id THEN
    RETURN json_build_object('success', false, 'reason', 'already_locked');
  END IF;

  -- Acquire the lock for caller (insert or update). The partial unique index is the final guard
  -- against any race that slipped past the SELECT above.
  BEGIN
    INSERT INTO team_players (team_id, player_id, slot_type, is_locked, acquisition_price)
      VALUES (p_team_id, p_player_in, 'locked', true,
              (SELECT current_price FROM players WHERE id = p_player_in))
      ON CONFLICT (team_id, player_id) DO UPDATE
        SET slot_type = 'locked', is_locked = true;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'reason', 'already_locked');
  END;

  -- Refund and remove all OTHER teams holding this player as free
  WITH refunded AS (
    DELETE FROM team_players
      WHERE player_id = p_player_in AND slot_type = 'free' AND team_id <> p_team_id
      RETURNING team_id, acquisition_price
  ),
  budget_updates AS (
    UPDATE teams t SET budget_remaining = budget_remaining + r.acquisition_price
      FROM refunded r WHERE t.id = r.team_id
      RETURNING t.id, r.acquisition_price
  )
  SELECT json_agg(json_build_object('team_id', id, 'refunded', acquisition_price))
    INTO v_refunded FROM budget_updates;

  RETURN json_build_object('success', true, 'refunded_teams', COALESCE(v_refunded, '[]'::json));
END;
$$;

CREATE OR REPLACE FUNCTION unlock_player(p_team_id INT, p_player_id INT) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_players SET slot_type = 'free', is_locked = false
    WHERE team_id = p_team_id AND player_id = p_player_id AND slot_type = 'locked';
  RETURN json_build_object('success', true);
END;
$$;
