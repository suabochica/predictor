-- 04_repair_lineups_md_boundary.sql
-- One-time MD2 (id = 10) rebuild for the MD-boundary lineup model.
-- Run in the Supabase SQL editor (service role — bypasses RLS) AFTER applying
-- migrations 048 (save_lineup GK guard) and 049 (seed_matchday_lineups).
--
-- Rebuilds each team's MD2 lineup deterministically from its final MD1 (id = 9)
-- XI, re-applying MD2-window transfers (transfers.matchday_id = 10) so a
-- transferred-out player's slot passes to the incoming player, then rebalances
-- the GK. This is the same logic the finalize hook now runs automatically; this
-- file is just the one-time catch-up for the already-active MD2.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ STEP 1 + 2 are READ-ONLY PREVIEW. Review them first. Nothing is written   │
-- │ until you run STEP 3 (the seed_matchday_lineups call) and beyond.         │
-- └──────────────────────────────────────────────────────────────────────────┘


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1 — PREVIEW (READ-ONLY): every team's rebuilt MD2 XI, row by row.
-- This mirrors the exact resolve/final CTE inside seed_matchday_lineups(9, 10),
-- BEFORE the GK rebalance. Eyeball each team: 15 rows (11 starters + 4 bench), no
-- transferred-away players. (A team showing 0 starting GK here is fine — the GK
-- rebalance in STEP 3 promotes its bench GK; STEP 2 flags exactly those teams.)
-- ════════════════════════════════════════════════════════════════════════════
WITH RECURSIVE tx AS (
  SELECT team_id, player_out_id, player_in_id, created_at
  FROM transfers
  WHERE matchday_id = 10
),
resolve AS (
  SELECT l.team_id, l.player_id AS orig, l.player_id AS cur,
         l.is_starting, l.is_captain, l.bench_order, 0 AS depth
  FROM lineups l
  WHERE l.matchday_id = 9
  UNION ALL
  SELECT r.team_id, r.orig, t.player_in_id,
         r.is_starting, r.is_captain, r.bench_order, r.depth + 1
  FROM resolve r
  JOIN tx t ON t.team_id = r.team_id AND t.player_out_id = r.cur
  WHERE r.depth < 20
),
final AS (
  SELECT DISTINCT ON (team_id, orig)
         team_id, orig, cur AS player_id, is_starting, is_captain, bench_order
  FROM resolve
  ORDER BY team_id, orig, depth DESC
)
SELECT
  t.name                                   AS team,
  f.is_starting,
  f.bench_order,
  f.is_captain,
  p.name                                   AS player,
  p.position,
  p.price,
  po.name                                  AS orig_md1_player   -- differs only if the slot was transferred in MD2
FROM final f
JOIN teams   t  ON t.id  = f.team_id
JOIN players p  ON p.id  = f.player_id
JOIN players po ON po.id = f.orig
ORDER BY t.name, f.is_starting DESC, p.position, f.bench_order;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2 — PREVIEW VALIDATION (READ-ONLY): per-team summary + anomaly flags.
-- Expect every team: rows = 15 (11 + 4 bench), starters = 11. starting_gk meaning:
--   1  → OK as-is.
--   0  → GK rebalance in STEP 3 will promote the bench GK (fine, expected).
--   2+ → ⚠ needs manual review (a GK was transferred IN over a starting
--         outfielder); decide which GK starts before running STEP 3.
-- ════════════════════════════════════════════════════════════════════════════
WITH RECURSIVE tx AS (
  SELECT team_id, player_out_id, player_in_id, created_at
  FROM transfers
  WHERE matchday_id = 10
),
resolve AS (
  SELECT l.team_id, l.player_id AS orig, l.player_id AS cur,
         l.is_starting, l.is_captain, l.bench_order, 0 AS depth
  FROM lineups l
  WHERE l.matchday_id = 9
  UNION ALL
  SELECT r.team_id, r.orig, t.player_in_id,
         r.is_starting, r.is_captain, r.bench_order, r.depth + 1
  FROM resolve r
  JOIN tx t ON t.team_id = r.team_id AND t.player_out_id = r.cur
  WHERE r.depth < 20
),
final AS (
  SELECT DISTINCT ON (team_id, orig)
         team_id, cur AS player_id, is_starting, is_captain, bench_order
  FROM resolve
  ORDER BY team_id, orig, depth DESC
)
SELECT
  t.name                                                        AS team,
  count(*)                                                      AS rows,
  count(*) FILTER (WHERE f.is_starting)                         AS starters,
  count(*) FILTER (WHERE f.is_starting AND p.position = 'GK')   AS starting_gk,
  count(*) FILTER (WHERE NOT f.is_starting AND p.position = 'GK') AS bench_gk,
  count(*) FILTER (WHERE f.is_captain)                          AS captains,
  CASE
    WHEN count(*) FILTER (WHERE f.is_starting AND p.position = 'GK') = 1 THEN 'OK'
    WHEN count(*) FILTER (WHERE f.is_starting AND p.position = 'GK') = 0
         AND count(*) FILTER (WHERE NOT f.is_starting AND p.position = 'GK') >= 1
      THEN 'rebalance -> bench GK promoted'
    ELSE 'NEEDS MANUAL REVIEW'
  END                                                           AS gk_status
FROM final f
JOIN teams   t ON t.id = f.team_id
JOIN players p ON p.id = f.player_id
GROUP BY t.name
ORDER BY gk_status DESC, t.name;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3 — REBUILD (WRITE): only run after the preview above looks right.
-- Deletes + rebuilds MD2 (id = 10) from MD1 (id = 9) with transfers applied and
-- GK rebalanced. Idempotent — re-running produces the same result.
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT seed_matchday_lineups(9, 10);


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4 — DELETE STALE TRULY-FUTURE ROWS (WRITE): MD3+ snapshots re-seed
-- themselves on their own finalize, so any pre-existing rows are stale.
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM lineups
-- WHERE matchday_id IN (
--   SELECT id FROM matchdays WHERE id > 10 AND NOT is_completed
-- );


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5 — REBALANCE PRESEASON (NULL) LINEUPS (WRITE): the NULL lineup remains
-- the legitimate MD1 fallback source; repair any with 0 starting GK in place.
-- (Unchanged from the prior repair — promote bench GK, demote cheapest outfield.)
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--
-- -- 5a. Demote cheapest outfield starter into the bench GK's old slot.
-- WITH null_lineups AS (
--   SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
--   FROM lineups l JOIN players p ON p.id = l.player_id
--   WHERE l.matchday_id IS NULL
-- ),
-- broken_teams AS (
--   SELECT team_id FROM null_lineups GROUP BY team_id
--   HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
--      AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
-- ),
-- bench_gk AS (
--   SELECT DISTINCT ON (nl.team_id) nl.team_id, nl.id, nl.bench_order
--   FROM null_lineups nl JOIN broken_teams bt ON bt.team_id = nl.team_id
--   WHERE NOT nl.is_starting AND nl.position = 'GK'
--   ORDER BY nl.team_id, nl.price DESC NULLS LAST, nl.id
-- ),
-- demote AS (
--   SELECT DISTINCT ON (nl.team_id) nl.team_id, nl.id
--   FROM null_lineups nl JOIN broken_teams bt ON bt.team_id = nl.team_id
--   WHERE nl.is_starting AND nl.position <> 'GK'
--   ORDER BY nl.team_id, nl.price ASC NULLS LAST, nl.id
-- )
-- UPDATE lineups l
-- SET is_starting = false, bench_order = bg.bench_order
-- FROM demote d JOIN bench_gk bg ON bg.team_id = d.team_id
-- WHERE l.id = d.id;
--
-- -- 5b. Promote the bench GK into the XI.
-- WITH null_lineups AS (
--   SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
--   FROM lineups l JOIN players p ON p.id = l.player_id
--   WHERE l.matchday_id IS NULL
-- ),
-- broken_teams AS (
--   SELECT team_id FROM null_lineups GROUP BY team_id
--   HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
--      AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
-- ),
-- bench_gk AS (
--   SELECT DISTINCT ON (nl.team_id) nl.team_id, nl.id
--   FROM null_lineups nl JOIN broken_teams bt ON bt.team_id = nl.team_id
--   WHERE NOT nl.is_starting AND nl.position = 'GK'
--   ORDER BY nl.team_id, nl.price DESC NULLS LAST, nl.id
-- )
-- UPDATE lineups l
-- SET is_starting = true, bench_order = NULL
-- FROM bench_gk bg
-- WHERE l.id = bg.id;
--
-- COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6 — VERIFY: re-run query 2 of diagnose_lineup_md_boundary.sql.
-- Expect zero rows (every team / matchday = 11 starters, exactly 1 starting GK)
-- and no transferred-away players left in MD2.
-- ════════════════════════════════════════════════════════════════════════════
