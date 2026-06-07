-- 037_market_ownership_visibility.sql
-- Ensure every authenticated user can READ all teams and team rosters so the
-- Market (and Auction) can show "owned by another team" and disable those swaps.
--
-- Symptom this fixes: in the Market, players owned by another team showed no
-- "Dueño" label and an enabled swap button. The frontend already renders the
-- owned/disabled state when player.owner is set, but usePlayers.js populates it
-- via an embedded join (players -> team_players -> teams). If the open SELECT
-- policies are missing/ineffective on the live DB, the embed returns empty and
-- every foreign-owned player looks like a free agent.
--
-- Idempotent: safe to re-run. SELECT-only; does not grant write access.
-- Permissive SELECT policies combine with OR, so this does not weaken the
-- existing per-user / admin policies on these tables.

DROP POLICY IF EXISTS "Authenticated users can view all teams" ON teams;
CREATE POLICY "Authenticated users can view all teams"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can view team players" ON team_players;
CREATE POLICY "Anyone can view team players"
  ON team_players FOR SELECT
  TO authenticated
  USING (true);
