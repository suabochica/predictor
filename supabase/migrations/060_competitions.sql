-- 060_competitions.sql
-- Phase 1 of "add a second competition (UEFA Champions League) to Fantasy".
--
-- Introduces the `competitions` table and the stage taxonomy (`matchdays.phase`,
-- `matchdays.sequence`) that replaces the `wc_stage ILIKE '%group%'` string matching.
--
-- ZERO behaviour change: the FIFA World Cup 2026 is inserted as competition 1 and
-- flagged `is_default`, and `phase` is backfilled with EXACTLY the rule it replaces,
-- so the classification is provably identical.

-- ── Competitions ──────────────────────────────────────────────────────────────
CREATE TABLE competitions (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,   -- 'world-cup-2026' | 'ucl-2026-27'
  name         TEXT NOT NULL,          -- 'FIFA World Cup 2026'  (page copy)
  short_label  TEXT NOT NULL,          -- 'Mundial 2026'         (switcher)
  status       TEXT NOT NULL DEFAULT 'setup'
                 CHECK (status IN ('setup', 'active', 'archived')),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  stage_labels TEXT[] NOT NULL DEFAULT '{}',   -- display labels only, no branching

  -- Per-competition config. These genuinely differ between competitions (the WC
  -- pools cap x 3 league matchdays = 6 free transfers; UCL's 8-matchday league
  -- phase would yield 16 under the same formula), so they cannot live in
  -- constants.js. constants.js keeps its exports as create-form defaults.
  budget                NUMERIC(5,1) NOT NULL DEFAULT 105.0,
  max_squad_size        INTEGER      NOT NULL DEFAULT 15,
  max_participants      INTEGER      NOT NULL DEFAULT 12,
  transfer_cap_league   INTEGER      NOT NULL DEFAULT 2,
  transfer_cap_knockout INTEGER      NOT NULL DEFAULT 5,
  min_bid_increment     NUMERIC(3,1) NOT NULL DEFAULT 0.3,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one default competition (functional unique index on a constant).
CREATE UNIQUE INDEX one_default_competition ON competitions ((true)) WHERE is_default;

COMMENT ON COLUMN competitions.status IS
  'setup = hidden from the user switcher (admin-only); active = playable; archived = read-only.';

-- The World Cup, backfilled as competition 1 and made the default so nothing changes.
-- stage_labels is Admin.jsx's WC_STAGES list verbatim.
INSERT INTO competitions (id, slug, name, short_label, status, is_default, sort_order, stage_labels)
VALUES (
  1,
  'world-cup-2026',
  'FIFA World Cup 2026',
  'Mundial 2026',
  'archived',
  true,
  0,
  ARRAY['Group Stage MD1', 'Group Stage MD2', 'Group Stage MD3', 'Round of 32',
        'Round of 16', 'Quarter-finals', 'Semi-finals', 'Third Place', 'Final']
);
SELECT setval('competitions_id_seq', 1, true);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Everyone reads every competition (the switcher, the leaderboard and the archive
-- all need it); only admins write. Scoping is a query-correctness problem, not an
-- authorization one — see the plan's "RLS — no competition predicates".
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitions_select_all ON competitions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY competitions_admin_write ON competitions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── Stage taxonomy on matchdays ───────────────────────────────────────────────
-- Two values, not three: a UCL knockout playoff round behaves exactly like a
-- knockout round for fantasy purposes (cap 5, H2H, excluded from the league table).
--
-- Deliberately NO column default: a default of 'league' would silently mislabel
-- every knockout matchday created by a writer that predates the Admin phase
-- selector (Admin.jsx:288, seed.sql:7). Instead 061 installs a BEFORE INSERT
-- trigger that derives phase from wc_stage using the exact rule below.
ALTER TABLE matchdays ADD COLUMN phase TEXT
  CHECK (phase IN ('league', 'knockout'));

-- Backfill with EXACTLY the rule being replaced => provably identical classification.
UPDATE matchdays SET phase = CASE WHEN wc_stage ILIKE '%group%' THEN 'league' ELSE 'knockout' END;
ALTER TABLE matchdays ALTER COLUMN phase SET NOT NULL;

-- Tournament order as data instead of an accident of insertion order. `ORDER BY id`
-- and `id <= v_active_md.id` are load-bearing "tournament order" semantics riding on
-- a shared SERIAL; row_number() OVER (ORDER BY id) is order-preserving by
-- construction, so switching the code to `sequence` is a provable no-op.
ALTER TABLE matchdays ADD COLUMN sequence INTEGER;
UPDATE matchdays m SET sequence = s.rn
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM matchdays) s
  WHERE s.id = m.id;
ALTER TABLE matchdays ALTER COLUMN sequence SET NOT NULL;

COMMENT ON COLUMN matchdays.wc_stage IS
  'Display label only. Nothing branches on this — use `phase` for league/knockout '
  'and `sequence` for tournament order. Kept (not renamed) because '
  'apps/polla/scripts/sync-schedule.mjs generates SQL text matching on it.';
COMMENT ON COLUMN matchdays.phase IS
  'league = feeds the league table and the league transfer cap; knockout = H2H bracket.';
