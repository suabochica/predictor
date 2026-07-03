-- 054_negotiation_windows.sql
-- Closed-door negotiations (elimination Phase B), part 2: schema + sealed offer RPCs.
--
-- Rules locked with the user (see plan: closed-door-negotiations):
-- - Admin-optional window, one open at a time, closes MIN(kickoff) - 1h of the
--   admin-chosen upcoming matchday.
-- - Pool = players owned by eliminated teams whose country is still alive.
-- - Offer = exactly one of the bidder's own players + cash; total >= target price.
-- - Sealed: negotiation_offers RLS only lets a team see its own rows, never an
--   admin clause, never a write policy — every mutation goes through a
--   SECURITY DEFINER RPC. Offer counts (not amounts/bidders) are exposed via a
--   separate SECURITY DEFINER function.
-- - Per-bidder constraints: one active offer per target, each owned player
--   committed to at most one active offer, committed cash <= budget, and
--   active offers + transfers used share the knockout cap (5) for the window's
--   matchday.

CREATE TABLE negotiation_windows (
  id SERIAL PRIMARY KEY,
  fantasy_round INTEGER NOT NULL,
  matchday_id INTEGER NOT NULL REFERENCES matchdays(id),
  opens_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one open window at a time (functional unique index on a constant).
CREATE UNIQUE INDEX one_open_negotiation_window ON negotiation_windows ((1)) WHERE status = 'open';

CREATE TABLE negotiation_offers (
  id SERIAL PRIMARY KEY,
  window_id INTEGER NOT NULL REFERENCES negotiation_windows(id),
  bidder_team_id INTEGER NOT NULL REFERENCES teams(id),
  target_player_id INTEGER NOT NULL REFERENCES players(id),
  offered_player_id INTEGER NOT NULL REFERENCES players(id),
  cash NUMERIC(5,1) NOT NULL CHECK (cash >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'withdrawn', 'won', 'lost', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique indexes (status = 'active' only) so a withdraw-then-re-offer
-- cycle is always possible even though the historical rows stick around.
CREATE UNIQUE INDEX one_active_offer_per_target
  ON negotiation_offers (window_id, bidder_team_id, target_player_id) WHERE status = 'active';
CREATE UNIQUE INDEX one_active_offer_per_offered_player
  ON negotiation_offers (window_id, bidder_team_id, offered_player_id) WHERE status = 'active';
CREATE INDEX idx_negotiation_offers_target_active
  ON negotiation_offers (window_id, target_player_id) WHERE status = 'active';

ALTER TABLE negotiation_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_offers ENABLE ROW LEVEL SECURITY;

-- Windows are world-readable (everyone needs to see the countdown / pool availability);
-- all writes go through open_negotiation_window / resolve_negotiation_window.
CREATE POLICY negotiation_windows_select_all ON negotiation_windows
  FOR SELECT TO authenticated USING (true);

-- Offers are sealed: a team can only see its own rows. No admin clause on
-- purpose (per the locked rule "nobody, not even admin, sees amounts/bidders").
-- No write policies at all — submit/withdraw only via SECURITY DEFINER RPCs.
CREATE POLICY negotiation_offers_select_own ON negotiation_offers
  FOR SELECT TO authenticated
  USING (bidder_team_id IN (SELECT id FROM teams WHERE user_id = auth.uid()));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE negotiation_windows;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ── open_negotiation_window ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION open_negotiation_window(p_fantasy_round integer, p_matchday_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_kickoff timestamptz;
  v_closes        timestamptz;
  v_row           negotiation_windows%ROWTYPE;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  PERFORM pg_advisory_xact_lock(7001);

  IF EXISTS (SELECT 1 FROM negotiation_windows WHERE status = 'open') THEN
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

  IF NOT EXISTS (SELECT 1 FROM teams WHERE status = 'eliminated') THEN
    RETURN json_build_object('error', 'No hay equipos eliminados para negociar.');
  END IF;

  INSERT INTO negotiation_windows (fantasy_round, matchday_id, closes_at)
  VALUES (p_fantasy_round, p_matchday_id, v_closes)
  RETURNING * INTO v_row;

  RETURN json_build_object('success', true, 'window', row_to_json(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION open_negotiation_window(integer, integer) TO authenticated;

-- ── submit_negotiation_offer ────────────────────────────────────────────────
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
  TRANSFER_CAP_KO constant integer := 5;
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

  SELECT id, status, budget_remaining INTO v_team_id, v_team_status, v_budget
  FROM teams WHERE user_id = v_caller_uid;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado.');
  END IF;
  IF v_team_status = 'eliminated' THEN
    RETURN json_build_object('error', 'Tu equipo fue eliminado y no puede negociar.');
  END IF;

  PERFORM pg_advisory_xact_lock(v_team_id);

  SELECT * INTO v_window FROM negotiation_windows WHERE id = p_window_id;
  IF v_window IS NULL OR v_window.status <> 'open' OR now() >= v_window.closes_at THEN
    RETURN json_build_object('error', 'La ventana de negociación no está abierta.');
  END IF;

  p_cash := round(p_cash, 1);
  IF p_cash < 0 THEN
    RETURN json_build_object('error', 'El efectivo ofrecido no puede ser negativo.');
  END IF;

  -- Pool check: target must belong to an eliminated team AND its country still alive.
  IF NOT EXISTS (
    SELECT 1 FROM team_players tp
    JOIN teams t ON t.id = tp.team_id
    JOIN players p ON p.id = tp.player_id
    WHERE tp.player_id = p_target_player_id AND t.status = 'eliminated' AND NOT p.is_eliminated
  ) THEN
    RETURN json_build_object('error', 'Ese jugador ya no está disponible para negociar.');
  END IF;

  -- Bidder must own the offered player.
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
  IF v_used + 1 > TRANSFER_CAP_KO THEN
    RETURN json_build_object('error', 'Sin fichajes restantes en esta ventana.');
  END IF;

  -- GK invariant: offering away the squad's only goalkeeper for a non-GK
  -- target would leave the bidder with 0 GK (mirrors execute_transfer, 050:152-161).
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

  SELECT id INTO v_team_id FROM teams WHERE user_id = v_caller_uid;
  IF v_team_id IS NULL THEN
    RETURN json_build_object('error', 'Debes tener un equipo registrado.');
  END IF;

  PERFORM pg_advisory_xact_lock(v_team_id);

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

-- ── get_negotiation_offer_counts ────────────────────────────────────────────
-- Counts of active offers only — never amounts, never bidder identity.
CREATE OR REPLACE FUNCTION get_negotiation_offer_counts(p_window_id integer)
RETURNS TABLE(target_player_id integer, offer_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT target_player_id, COUNT(*) AS offer_count
  FROM negotiation_offers
  WHERE window_id = p_window_id AND status = 'active'
  GROUP BY target_player_id;
$$;

GRANT EXECUTE ON FUNCTION get_negotiation_offer_counts(integer) TO authenticated;
