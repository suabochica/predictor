-- Diagnostic queries for the no-GK / broken-XI bug across an MD boundary.
-- Run these in the Supabase SQL editor (service role — bypasses RLS).
-- All read-only. Paste the output back for confirmation before any repair.
--
-- Background: My Team SEEDS a new MD from the most-recent saved MD (the MD1
-- snapshot), while SCORING reads the NULL (preseason) lineup that every
-- execute_transfer repoints. A "starting GK out -> outfielder in" transfer
-- leaves the NULL lineup with 0 starting GKs (execute_transfer step 5 inherits
-- is_starting blindly), and the seeded view drops the GK without promoting the
-- bench GK. These queries confirm both.


-- ── 1. Matchday state: which MDs exist, which is active/completed ───────────
select id, name, wc_stage, is_active, is_completed
from matchdays
order by id;


-- ── 2. CORE DIAGNOSTIC: every team's lineup per matchday, flagged if illegal ─
-- For each (team, matchday_id incl NULL): starters count + starting-GK count.
-- Anything not 11 starters / exactly 1 starting GK is broken. NULL rows are the
-- scoring source; non-NULL are saved/stamped MD lineups.
select
  t.name                                                    as team,
  l.matchday_id,
  count(*) filter (where l.is_starting)                     as starters,
  count(*) filter (where l.is_starting and p.position = 'GK') as starting_gk,
  count(*) filter (where not l.is_starting)                 as bench_plus
from lineups l
join teams   t on t.id = l.team_id
join players p on p.id = l.player_id
group by t.name, l.matchday_id
having count(*) filter (where l.is_starting) <> 11
    or count(*) filter (where l.is_starting and p.position = 'GK') <> 1
order by t.name, l.matchday_id nulls first;


-- ── 3. Drill into specific teams — the actual rows ─────────────────────────-
-- Adjust the name filters to your two teams under investigation.
select
  t.name as team, l.matchday_id, l.is_starting, l.is_captain,
  l.bench_order, p.name as player, p.position, p.country_code
from lineups l
join teams   t on t.id = l.team_id
join players p on p.id = l.player_id
where t.name ilike any (array['%benitez%', '%benítez%', '%stucky%'])
order by t.name, l.matchday_id nulls first, l.is_starting desc, l.bench_order;


-- ── 4. Confirm the GK transfers actually happened ──────────────────────────-
-- Look for out_pos = 'GK' and in_pos <> 'GK' (starting GK swapped for outfield).
select
  t.name as team, tr.matchday_id, tr.created_at,
  po.name as out_player, po.position as out_pos,
  pi.name as in_player,  pi.position as in_pos
from transfers tr
join teams   t  on t.id  = tr.team_id
join players po on po.id = tr.player_out_id
join players pi on pi.id = tr.player_in_id
order by tr.created_at desc;
