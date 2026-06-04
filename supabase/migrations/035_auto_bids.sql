-- 035_auto_bids.sql
-- Admin-only RPCs for the proxy bidding system.
--
-- run_auto_bids(p_round)      — fires one proxy-bid pass for the given round.
--   Called automatically by the admin's browser at the 90s mark, plus a manual
--   fallback button. Idempotent: UNIQUE(user,player,round) + "skip if already bid"
--   make re-runs no-ops.
--
-- auto_complete_squads()      — at auction end, fills every squad under 15 with
--   random affordable players (GK guaranteed first if missing). Called by the admin
--   before the existing default-lineup builder in handleCompleteAuction().

CREATE OR REPLACE FUNCTION run_auto_bids(p_round integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  MIN_INCREMENT    constant numeric := 0.3;
  MAX_SQUAD        constant integer := 15;
  a_status         text;
  a_round          integer;
  a_started_at     timestamptz;
  a_duration       integer;
  bids_placed      integer := 0;
  users_processed  integer := 0;
  skipped_users    jsonb   := '[]'::jsonb;

  r_team           record;
  r_target         record;
  v_owned_count    integer;
  v_round_bid_count integer;
  v_committed      numeric;
  v_remaining_slots integer;
  v_eff_budget     numeric;
  v_has_gk         boolean;
  v_carry_floor    numeric;
  v_current_high   numeric;
  v_min_winning    numeric;
  v_bid_result     json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT status, current_round, round_started_at, round_duration_seconds
    INTO a_status, a_round, a_started_at, a_duration
  FROM auction_state ORDER BY id LIMIT 1;

  IF a_status IS DISTINCT FROM 'active' THEN
    RETURN json_build_object('note', 'Auction is not active — no auto-bids placed.', 'bids_placed', 0);
  END IF;
  IF p_round IS DISTINCT FROM a_round THEN
    RETURN json_build_object('note', 'Round mismatch — no auto-bids placed.', 'bids_placed', 0);
  END IF;
  -- Safe late/refresh click: round already expired, skip silently.
  IF a_started_at IS NOT NULL
     AND now() > a_started_at + make_interval(secs => COALESCE(a_duration, 0)) THEN
    RETURN json_build_object('note', 'Round has expired — no auto-bids placed.', 'bids_placed', 0);
  END IF;

  FOR r_team IN
    SELECT t.id AS team_id, t.user_id, t.budget_remaining
    FROM teams t
    WHERE t.auto_bid_enabled = true
  LOOP
    users_processed := users_processed + 1;

    SELECT COUNT(*) INTO v_owned_count
    FROM team_players WHERE team_id = r_team.team_id;

    SELECT COUNT(*), COALESCE(SUM(bid_amount), 0)
      INTO v_round_bid_count, v_committed
    FROM auction_bids
    WHERE user_id = r_team.user_id AND round_number = p_round;

    v_remaining_slots := MAX_SQUAD - v_owned_count - v_round_bid_count;
    v_eff_budget := r_team.budget_remaining - v_committed;

    IF v_remaining_slots <= 0 THEN
      skipped_users := skipped_users || jsonb_build_object('user_id', r_team.user_id, 'reason', 'squad full');
      CONTINUE;
    END IF;

    -- Check if team has a GK (owned or bid this round)
    SELECT EXISTS (
      SELECT 1 FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = r_team.team_id AND p.position = 'GK'
      UNION ALL
      SELECT 1 FROM auction_bids ab
      JOIN players p ON p.id = ab.player_id
      WHERE ab.user_id = r_team.user_id AND ab.round_number = p_round AND p.position = 'GK'
    ) INTO v_has_gk;

    FOR r_target IN
      SELECT pt.player_id, pt.max_price, p.position, p.current_price
      FROM proxy_targets pt
      JOIN players p ON p.id = pt.player_id
      WHERE pt.user_id = r_team.user_id
      ORDER BY pt.priority ASC
    LOOP
      EXIT WHEN v_remaining_slots <= 0;

      -- Skip if player already owned by anyone
      CONTINUE WHEN EXISTS (SELECT 1 FROM team_players WHERE player_id = r_target.player_id);

      -- Skip if user already has a bid on this player this round (leading or not — can't rebid)
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM auction_bids
        WHERE user_id = r_team.user_id
          AND player_id = r_target.player_id
          AND round_number = p_round
      );

      -- Compute minimum winning amount
      SELECT MAX(bid_amount) INTO v_carry_floor
      FROM auction_bids
      WHERE player_id = r_target.player_id AND round_number < p_round;

      SELECT MAX(bid_amount) INTO v_current_high
      FROM auction_bids
      WHERE player_id = r_target.player_id AND round_number = p_round;

      v_min_winning := round(GREATEST(
        COALESCE(v_carry_floor, 0) + MIN_INCREMENT,
        COALESCE(v_current_high, 0) + MIN_INCREMENT,
        r_target.current_price
      )::numeric, 1);

      -- Decline to chase past max_price cap
      CONTINUE WHEN v_min_winning > r_target.max_price;

      -- GK reserve: if only one slot left and no GK, only bid on a GK
      CONTINUE WHEN v_remaining_slots = 1 AND NOT v_has_gk AND r_target.position <> 'GK';

      -- Skip if bid would exceed effective budget
      CONTINUE WHEN v_min_winning > v_eff_budget;

      SELECT place_bid_internal(r_team.user_id, r_target.player_id, v_min_winning, p_round)
        INTO v_bid_result;

      IF (v_bid_result->>'error') IS NULL THEN
        bids_placed      := bids_placed + 1;
        v_remaining_slots := v_remaining_slots - 1;
        v_eff_budget     := round((v_eff_budget - v_min_winning)::numeric, 1);
        IF r_target.position = 'GK' THEN
          v_has_gk := true;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'bids_placed',      bids_placed,
    'users_processed',  users_processed,
    'skipped',          skipped_users
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_auto_bids(integer) TO authenticated;


CREATE OR REPLACE FUNCTION auto_complete_squads()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  MAX_SQUAD   constant integer := 15;
  r_team      record;
  r_player    record;
  v_owned     integer;
  v_needed    integer;
  v_budget    numeric;
  v_has_gk    boolean;
  v_gk_id     integer;
  v_gk_name   text;
  v_gk_price  numeric;
  filled      jsonb := '[]'::jsonb;
  warnings    jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOR r_team IN
    SELECT t.id AS team_id, t.name, t.budget_remaining
    FROM teams t
    WHERE (SELECT COUNT(*) FROM team_players WHERE team_id = t.id) < MAX_SQUAD
  LOOP
    SELECT COUNT(*) INTO v_owned FROM team_players WHERE team_id = r_team.team_id;
    v_needed := MAX_SQUAD - v_owned;
    v_budget := r_team.budget_remaining;

    SELECT EXISTS (
      SELECT 1 FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = r_team.team_id AND p.position = 'GK'
    ) INTO v_has_gk;

    -- GK-first: secure a goalkeeper before filling other slots
    IF NOT v_has_gk AND v_needed > 0 THEN
      SELECT p.id, p.name, p.current_price
        INTO v_gk_id, v_gk_name, v_gk_price
      FROM players p
      WHERE p.position = 'GK'
        AND p.current_price <= v_budget
        AND NOT EXISTS (SELECT 1 FROM team_players WHERE player_id = p.id)
      ORDER BY random()
      LIMIT 1;

      IF v_gk_id IS NOT NULL THEN
        INSERT INTO team_players (team_id, player_id, acquisition_price)
        VALUES (r_team.team_id, v_gk_id, v_gk_price)
        ON CONFLICT (team_id, player_id) DO NOTHING;

        UPDATE teams
        SET budget_remaining = round((budget_remaining - v_gk_price)::numeric, 1)
        WHERE id = r_team.team_id;

        v_budget  := round((v_budget - v_gk_price)::numeric, 1);
        v_needed  := v_needed - 1;
        v_has_gk  := true;
        v_gk_id   := NULL;

        filled := filled || jsonb_build_object('team', r_team.name, 'player', v_gk_name, 'position', 'GK');
      ELSE
        warnings := warnings || jsonb_build_object('team', r_team.name, 'reason', 'No affordable GK available');
      END IF;
    END IF;

    -- Fill remaining slots from a random pool of affordable unowned players
    FOR r_player IN
      SELECT p.id, p.name, p.current_price, p.position
      FROM players p
      WHERE NOT EXISTS (SELECT 1 FROM team_players WHERE player_id = p.id)
      ORDER BY random()
    LOOP
      EXIT WHEN v_needed <= 0;
      CONTINUE WHEN r_player.current_price > v_budget;
      -- Keep the last slot open for a GK if still needed
      CONTINUE WHEN v_needed = 1 AND NOT v_has_gk AND r_player.position <> 'GK';

      INSERT INTO team_players (team_id, player_id, acquisition_price)
      VALUES (r_team.team_id, r_player.id, r_player.current_price)
      ON CONFLICT (team_id, player_id) DO NOTHING;

      UPDATE teams
      SET budget_remaining = round((budget_remaining - r_player.current_price)::numeric, 1)
      WHERE id = r_team.team_id;

      v_budget := round((v_budget - r_player.current_price)::numeric, 1);
      v_needed := v_needed - 1;

      IF r_player.position = 'GK' THEN
        v_has_gk := true;
      END IF;

      filled := filled || jsonb_build_object('team', r_team.name, 'player', r_player.name, 'position', r_player.position);
    END LOOP;
  END LOOP;

  RETURN json_build_object('filled', filled, 'warnings', warnings);
END;
$$;

GRANT EXECUTE ON FUNCTION auto_complete_squads() TO authenticated;
