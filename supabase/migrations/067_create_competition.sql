-- 067_create_competition.sql
-- Phase 4: creating a competition from the admin panel.
--
-- Two RPCs, both admin-gated and SECURITY DEFINER:
--
--   create_competition(...)   inserts the competitions row AND seeds its
--                             auction_state row in the SAME transaction.
--   set_default_competition(id)  flips is_default atomically.
--
-- Why the auction_state seed has to be here (trap 2 in the plan): several client
-- reads used to do `.single()` on auction_state with no filter and no limit, so a
-- second row anywhere in the table threw. Phase 3 scoped and limited all of them,
-- but the inverse is now true — a competition with NO auction_state row makes
-- Admin bail out at "No se encontró estado de subasta" and AuctionContext hand
-- every consumer a null state. Creating the competition and its auction state in
-- one statement means that can never be observed as two separate states.
--
-- Why set_default_competition is an RPC rather than two client UPDATEs: 060's
-- `one_default_competition` is a partial UNIQUE index over a constant, so the old
-- default must be cleared before the new one is set. Doing that as two PostgREST
-- calls leaves a window with no default at all (and fails outright if ordered the
-- other way).

-- ── create_competition ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_competition(
  p_slug                   text,
  p_name                   text,
  p_short_label            text,
  p_stage_labels           text[]  DEFAULT '{}',
  p_budget                 numeric DEFAULT 105.0,
  p_max_squad_size         integer DEFAULT 15,
  p_max_participants       integer DEFAULT 12,
  p_transfer_cap_league    integer DEFAULT 2,
  p_transfer_cap_knockout  integer DEFAULT 5,
  p_min_bid_increment      numeric DEFAULT 0.3,
  p_round_duration_seconds integer DEFAULT 180
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug        text;
  v_name        text;
  v_short_label text;
  v_labels      text[];
  v_row         competitions;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_slug        := lower(btrim(COALESCE(p_slug, '')));
  v_name        := btrim(COALESCE(p_name, ''));
  v_short_label := btrim(COALESCE(p_short_label, ''));

  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'El identificador (slug) debe ser minúsculas, números y guiones: "%".', p_slug;
  END IF;
  IF v_name = '' OR v_short_label = '' THEN
    RAISE EXCEPTION 'El nombre y la etiqueta corta son obligatorios.';
  END IF;
  IF EXISTS (SELECT 1 FROM competitions WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Ya existe una competencia con el identificador "%".', v_slug;
  END IF;

  IF p_budget IS NULL OR p_budget <= 0 THEN
    RAISE EXCEPTION 'El presupuesto debe ser mayor que 0.';
  END IF;
  IF p_max_squad_size IS NULL OR p_max_squad_size < 1 THEN
    RAISE EXCEPTION 'El tamaño de plantilla debe ser al menos 1.';
  END IF;
  IF p_max_participants IS NULL OR p_max_participants < 1 THEN
    RAISE EXCEPTION 'El número de participantes debe ser al menos 1.';
  END IF;
  IF p_transfer_cap_league IS NULL OR p_transfer_cap_league < 0
     OR p_transfer_cap_knockout IS NULL OR p_transfer_cap_knockout < 0 THEN
    RAISE EXCEPTION 'Los cupos de fichajes no pueden ser negativos.';
  END IF;
  IF p_min_bid_increment IS NULL OR p_min_bid_increment <= 0 THEN
    RAISE EXCEPTION 'El incremento mínimo de puja debe ser mayor que 0.';
  END IF;
  IF p_round_duration_seconds IS NULL OR p_round_duration_seconds < 1 THEN
    RAISE EXCEPTION 'La duración de ronda debe ser al menos 1 segundo.';
  END IF;

  -- NULL stage_labels is the same as "none"; the array is display copy only.
  v_labels := COALESCE(p_stage_labels, '{}');

  -- Always 'setup': a competition with no players, no matchdays and no teams has
  -- nothing to show a user, so it stays out of their switcher until an admin
  -- promotes it. is_default is never claimed here — that is set_default_competition's
  -- job, and it must not be taken from the World Cup as a side effect of creation.
  INSERT INTO competitions (
    slug, name, short_label, status, is_default, sort_order, stage_labels,
    budget, max_squad_size, max_participants,
    transfer_cap_league, transfer_cap_knockout, min_bid_increment
  )
  VALUES (
    v_slug, v_name, v_short_label, 'setup', false,
    (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM competitions),
    v_labels,
    p_budget, p_max_squad_size, p_max_participants,
    p_transfer_cap_league, p_transfer_cap_knockout, p_min_bid_increment
  )
  RETURNING * INTO v_row;

  INSERT INTO auction_state (status, current_round, round_duration_seconds, competition_id)
  VALUES ('pending', 0, p_round_duration_seconds, v_row.id);

  RETURN to_jsonb(v_row)::json;
END;
$$;

GRANT EXECUTE ON FUNCTION create_competition(
  text, text, text, text[], numeric, integer, integer, integer, integer, numeric, integer
) TO authenticated;


-- ── set_default_competition ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_default_competition(p_competition_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM competitions WHERE id = p_competition_id) THEN
    RAISE EXCEPTION 'Unknown competition %.', p_competition_id;
  END IF;

  -- Clear first, then set: `one_default_competition` is a partial unique index on
  -- a constant, so the two statements cannot be reordered.
  UPDATE competitions SET is_default = false
   WHERE is_default AND id <> p_competition_id;

  UPDATE competitions SET is_default = true
   WHERE id = p_competition_id AND NOT is_default;
END;
$$;

GRANT EXECUTE ON FUNCTION set_default_competition(integer) TO authenticated;
