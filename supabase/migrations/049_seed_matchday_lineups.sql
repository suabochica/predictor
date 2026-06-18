-- 049_seed_matchday_lineups.sql
-- Reusable "materialize a matchday's lineups from the previous matchday" RPC.
-- Single source of truth for the MD-boundary lineup model:
--   * the finalize hook (Admin.jsx) seeds the next MD from the just-finalized MD,
--   * the one-time MD2 repair (supabase/manual/04) calls it for (9 -> 10).
--
-- It carries every slot (is_starting / is_captain / bench_order) from the source
-- matchday to the target, re-applying any transfers made in the TARGET window
-- (transfers.matchday_id = p_target_md) so a transferred-out player's slot passes
-- to the incoming player — following multi-hop chains (X->Y->Z). Finally it
-- rebalances the GK so each rebuilt XI keeps exactly one starting goalkeeper.
--
-- Auth: SECURITY DEFINER. Service role (SQL editor, auth.uid() NULL) is allowed
-- so the manual repair runs; otherwise admin-only via public.is_admin (036).

CREATE OR REPLACE FUNCTION seed_matchday_lineups(
  p_source_md integer,
  p_target_md integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service role (auth.uid() NULL, e.g. SQL editor); otherwise admin-only.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('error', 'No autorizado.');
  END IF;

  -- Full rebuild of the target matchday from the source + target-window transfers.
  DELETE FROM lineups WHERE matchday_id = p_target_md;

  WITH RECURSIVE tx AS (
    SELECT team_id, player_out_id, player_in_id, created_at
    FROM transfers
    WHERE matchday_id = p_target_md
  ),
  resolve AS (
    -- Depth 0: every source-MD slot, original player still in place.
    SELECT l.team_id, l.player_id AS orig, l.player_id AS cur,
           l.is_starting, l.is_captain, l.bench_order, 0 AS depth
    FROM lineups l
    WHERE l.matchday_id = p_source_md
    UNION ALL
    -- Follow each target-window transfer that swaps out the current holder.
    SELECT r.team_id, r.orig, t.player_in_id,
           r.is_starting, r.is_captain, r.bench_order, r.depth + 1
    FROM resolve r
    JOIN tx t ON t.team_id = r.team_id AND t.player_out_id = r.cur
    WHERE r.depth < 20                          -- cycle / runaway guard
  ),
  final AS (                                     -- deepest resolution per slot
    SELECT DISTINCT ON (team_id, orig)
           team_id, cur AS player_id, is_starting, is_captain, bench_order
    FROM resolve
    ORDER BY team_id, orig, depth DESC
  )
  INSERT INTO lineups (team_id, matchday_id, player_id, is_starting, is_captain, bench_order)
  SELECT team_id, p_target_md, player_id, is_starting, is_captain, bench_order
  FROM final;

  -- ── GK rebalance (scoped to the freshly inserted target rows) ──────────────
  -- For any team whose target XI has 0 starting GK but a bench GK, demote the
  -- cheapest outfield starter into the bench GK's old slot, then promote the
  -- bench GK. Mirrors supabase/manual/04 2a/2b but filtered to p_target_md.

  -- 2a. Demote cheapest outfield starter into the bench GK's old bench slot.
  WITH md_lineups AS (
    SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.matchday_id = p_target_md
  ),
  broken_teams AS (
    SELECT team_id
    FROM md_lineups
    GROUP BY team_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id, ml.bench_order
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE NOT ml.is_starting AND ml.position = 'GK'
    ORDER BY ml.team_id, ml.price DESC NULLS LAST, ml.id
  ),
  demote AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE ml.is_starting AND ml.position <> 'GK'
    ORDER BY ml.team_id, ml.price ASC NULLS LAST, ml.id
  )
  UPDATE lineups l
  SET is_starting = false,
      bench_order = bg.bench_order
  FROM demote d
  JOIN bench_gk bg ON bg.team_id = d.team_id
  WHERE l.id = d.id;

  -- 2b. Promote the bench GK into the XI.
  WITH md_lineups AS (
    SELECT l.id, l.team_id, l.is_starting, l.bench_order, p.position, p.price
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.matchday_id = p_target_md
  ),
  broken_teams AS (
    SELECT team_id
    FROM md_lineups
    GROUP BY team_id
    HAVING count(*) FILTER (WHERE is_starting AND position = 'GK') = 0
       AND count(*) FILTER (WHERE NOT is_starting AND position = 'GK') >= 1
  ),
  bench_gk AS (
    SELECT DISTINCT ON (ml.team_id) ml.team_id, ml.id
    FROM md_lineups ml
    JOIN broken_teams bt ON bt.team_id = ml.team_id
    WHERE NOT ml.is_starting AND ml.position = 'GK'
    ORDER BY ml.team_id, ml.price DESC NULLS LAST, ml.id
  )
  UPDATE lineups l
  SET is_starting = true,
      bench_order = NULL
  FROM bench_gk bg
  WHERE l.id = bg.id;

  RETURN json_build_object('success', true, 'target_md', p_target_md);
END;
$$;

GRANT EXECUTE ON FUNCTION seed_matchday_lineups(integer, integer) TO authenticated;
