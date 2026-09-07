-- 072_auto_bid_scheduling.sql
-- Fixes the auto-bid ("Pista de Subasta") pass, which placed nothing in the
-- UCL 2026-27 round 1 draft despite five teams having auto_bid_enabled and 95
-- pista rows between them.
--
-- Two independent defects had been masking each other since the feature
-- shipped:
--
--   1. `Admin.jsx:227` parsed `auction_state.round_started_at` with a bare
--      `new Date()`. The column is a naked TIMESTAMP (001:84) so PostgREST
--      returns it without a `Z` and the browser read it as local time. At a
--      positive UTC offset the resulting `elapsed` is always >= 90, so the pass
--      fired at t≈0 instead of the 90s mark. (Client-side fix; see
--      `src/lib/utils.js` parseDbTimestamp.)
--
--   2. `run_auto_bids` was invoked from exactly one place — a useEffect on the
--      Admin page. If the admin started a round and closed the tab, no pass
--      ever ran. Defect 1 made the pass fire at round start, the one moment the
--      admin is certainly still watching, which hid this for three months.
--
-- This migration addresses defect 2 (and the missing audit trail that made the
-- diagnosis `created_at` archaeology) by splitting the pass into:
--
--   run_auto_bids_internal(p_round, p_competition_id)  -- the work, no auth
--   run_auto_bids(p_round, p_competition_id)           -- admin override button
--   run_due_auto_bids(p_competition_id)                -- self-guarding, any
--                                                         authenticated caller
--
-- `run_due_auto_bids` is what makes the pass survive the admin closing their
-- browser: every participant's Auction page calls it on a ticker, an advisory
-- lock serialises the stampede, and a once-per-round stamp means only the first
-- caller through does any work.
--
-- Residual limitation, stated plainly: if every participant AND the admin are
-- away, nothing triggers the pass. The trigger is distributed across browsers,
-- not scheduled. That is strictly better than depending on one specific
-- browser, but it is not a scheduler. pg_cron is the hardening step if this
-- ever bites; this project does not use it anywhere today.

-- ── Audit columns ─────────────────────────────────────────────────────────────
-- The record that a pass ran at all. Without these, "did the auto-bid pass
-- fire?" can only be answered by inferring from auction_bids.created_at
-- clustering, which cannot distinguish "ran and placed nothing" from "never
-- ran" — exactly the ambiguity that made the UCL diagnosis take hours.
ALTER TABLE auction_state
  ADD COLUMN IF NOT EXISTS auto_bids_ran_for_round integer,
  ADD COLUMN IF NOT EXISTS auto_bids_ran_at        timestamptz;


-- ── run_auto_bids_internal ────────────────────────────────────────────────────
-- The body of 065's run_auto_bids, moved verbatim except for two changes:
--
--   * no admin check — both callers own their own authorization;
--   * the place_bid_internal rejection at 065:177-184 is COLLECTED into a
--     `failed` array instead of discarded. A pass that processes five users and
--     places zero bids used to be indistinguishable from a pass that never ran;
--     now it says which target was refused and why.
CREATE OR REPLACE FUNCTION run_auto_bids_internal(p_round integer, p_competition_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_min_increment  numeric;
  v_max_squad      integer;
  a_status         text;
  a_round          integer;
  a_started_at     timestamptz;
  a_duration       integer;
  bids_placed      integer := 0;
  users_processed  integer := 0;
  skipped_users    jsonb   := '[]'::jsonb;
  failed_bids      jsonb   := '[]'::jsonb;

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
  SELECT min_bid_increment, max_squad_size INTO v_min_increment, v_max_squad
  FROM competitions WHERE id = p_competition_id;
  IF v_min_increment IS NULL THEN
    RAISE EXCEPTION 'Unknown competition %.', p_competition_id;
  END IF;

  SELECT status, current_round, round_started_at, round_duration_seconds
    INTO a_status, a_round, a_started_at, a_duration
  FROM auction_state
  WHERE competition_id = p_competition_id
  ORDER BY id LIMIT 1;

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
      AND t.competition_id = p_competition_id
  LOOP
    users_processed := users_processed + 1;

    SELECT COUNT(*) INTO v_owned_count
    FROM team_players WHERE team_id = r_team.team_id;

    SELECT COUNT(*), COALESCE(SUM(bid_amount), 0)
      INTO v_round_bid_count, v_committed
    FROM auction_bids
    WHERE user_id = r_team.user_id AND round_number = p_round
      AND competition_id = p_competition_id;

    v_remaining_slots := v_max_squad - v_owned_count - v_round_bid_count;
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
      WHERE ab.user_id = r_team.user_id AND ab.round_number = p_round
        AND ab.competition_id = p_competition_id
        AND p.position = 'GK'
    ) INTO v_has_gk;

    FOR r_target IN
      SELECT pt.player_id, pt.max_price, p.position, p.current_price
      FROM proxy_targets pt
      JOIN players p ON p.id = pt.player_id
      WHERE pt.user_id = r_team.user_id
        AND pt.competition_id = p_competition_id
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
        COALESCE(v_carry_floor, 0) + v_min_increment,
        COALESCE(v_current_high, 0) + v_min_increment,
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
      ELSE
        -- [OBSERVABILITY] 065 discarded this. A silent rejection here is the
        -- difference between "the pass ran and everything was capped out" and
        -- "the pass ran and place_bid_internal refused every single write".
        failed_bids := failed_bids || jsonb_build_object(
          'user_id',   r_team.user_id,
          'player_id', r_target.player_id,
          'amount',    v_min_winning,
          'error',     v_bid_result->>'error'
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'bids_placed',      bids_placed,
    'users_processed',  users_processed,
    'skipped',          skipped_users,
    'failed',           failed_bids
  );
END;
$$;

-- Not granted to `authenticated`: the internal has no authorization of its own.
-- Only the two wrappers below may call it.
REVOKE ALL ON FUNCTION run_auto_bids_internal(integer, integer) FROM PUBLIC;


-- ── run_auto_bids ─────────────────────────────────────────────────────────────
-- The explicit admin override behind the "Ejecutar auto-pujas" button. Keeps
-- 065's admin check and grant, delegates the work, and stamps the audit
-- columns.
--
-- It deliberately does NOT consult the once-per-round guard: an admin pressing
-- the button a second time is asking for a second pass, and a re-run is
-- idempotent in practice anyway (a target already bid on this round is skipped
-- by the loop's own CONTINUE WHEN).
CREATE OR REPLACE FUNCTION run_auto_bids(p_round integer, p_competition_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result  json;
  v_state_id integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_result := run_auto_bids_internal(p_round, p_competition_id);

  -- Stamp the same row the internal read: `ORDER BY id LIMIT 1`, not every row
  -- sharing the competition id.
  SELECT id INTO v_state_id
  FROM auction_state WHERE competition_id = p_competition_id ORDER BY id LIMIT 1;

  UPDATE auction_state
  SET auto_bids_ran_for_round = p_round,
      auto_bids_ran_at        = now()
  WHERE id = v_state_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION run_auto_bids(integer, integer) TO authenticated;


-- ── run_due_auto_bids ─────────────────────────────────────────────────────────
-- Callable by any authenticated participant. This is the fix for defect 2: the
-- pass no longer depends on one specific browser being open.
--
-- Exposure is bounded by construction rather than by trust. The RPC takes no
-- amount, no player and no user: it can only place bids from users' own pistas,
-- under their own budgets, at the algorithmically-derived minimum, and only
-- inside the half-point→expiry window. A participant calling it early gets
-- guard 5; calling it repeatedly gets guard 7.
--
-- Every rejected guard returns a `note` rather than raising, because the normal
-- case is dozens of browsers calling this every second and being told "not
-- yet". Callers stay quiet on a note and only surface an actual error.
CREATE OR REPLACE FUNCTION run_due_auto_bids(p_competition_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_id    integer;
  a_status      text;
  a_round       integer;
  a_started_at  timestamptz;
  a_duration    integer;
  a_ran_for     integer;
  v_threshold   integer;
  v_result      json;
BEGIN
  -- Guard 1 — authenticated only. SECURITY DEFINER means anon would otherwise
  -- reach the whole pass.
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('note', 'Not authenticated.', 'bids_placed', 0);
  END IF;

  -- Guard 2 — serialise the stampede. Every participant's browser calls this on
  -- a 1s ticker, so a whole league can arrive inside the same second. Without
  -- this, N sessions all read auto_bids_ran_for_round as NULL and all run the
  -- pass. Transaction-scoped: released on commit or rollback, no cleanup path
  -- to get wrong.
  PERFORM pg_advisory_xact_lock(7002, p_competition_id);

  -- Guard 3 — re-read AFTER the lock. Reading before it would reintroduce
  -- exactly the race the lock exists to close.
  SELECT id, status, current_round, round_started_at, round_duration_seconds,
         auto_bids_ran_for_round
    INTO v_state_id, a_status, a_round, a_started_at, a_duration, a_ran_for
  FROM auction_state
  WHERE competition_id = p_competition_id
  ORDER BY id LIMIT 1;

  -- Guard 4 — there is a live round at all.
  IF a_status IS DISTINCT FROM 'active' THEN
    RETURN json_build_object('note', 'Auction is not active.', 'bids_placed', 0);
  END IF;
  IF a_started_at IS NULL THEN
    RETURN json_build_object('note', 'Round has no start time.', 'bids_placed', 0);
  END IF;

  -- Guard 5 — the half-point, and not before. min(90s, duration/2) is identical
  -- to the old 90s constant at UCL's 180s rounds but never overshoots a shorter
  -- round, which would let the pass fire after expiry (or never).
  --
  -- NOTE this is a deliberate behaviour change from what the World Cup actually
  -- did. Defect 1 meant WC passes fired at t≈0, before any human could react.
  -- Firing at the half-point is what the design always intended: humans get
  -- first crack, auto-bids fill in for absent managers.
  v_threshold := LEAST(90, COALESCE(a_duration, 0) / 2);
  IF now() < a_started_at + make_interval(secs => v_threshold) THEN
    RETURN json_build_object('note', 'Too early for auto-bids.', 'bids_placed', 0);
  END IF;

  -- Guard 6 — the round is still live. place_bid_internal would refuse anyway,
  -- but failing here keeps the audit stamp honest.
  IF now() > a_started_at + make_interval(secs => COALESCE(a_duration, 0)) THEN
    RETURN json_build_object('note', 'Round has expired.', 'bids_placed', 0);
  END IF;

  -- Guard 7 — once per round. This, not the client's ref, is the source of
  -- truth: a client ref resets on every page load and cannot dedupe across
  -- browsers.
  IF a_ran_for IS NOT DISTINCT FROM a_round THEN
    RETURN json_build_object('note', 'Auto-bids already ran for this round.', 'bids_placed', 0);
  END IF;

  v_result := run_auto_bids_internal(a_round, p_competition_id);

  UPDATE auction_state
  SET auto_bids_ran_for_round = a_round,
      auto_bids_ran_at        = now()
  WHERE id = v_state_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION run_due_auto_bids(integer) TO authenticated;
