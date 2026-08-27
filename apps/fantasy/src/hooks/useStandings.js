import { useEffect, useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';

export function useStandings() {
  const { db } = useCompetition();
  const [standings, setStandings] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [teamsRes, standingsRes, matchdaysRes] = await Promise.all([
      db
        .from('teams')
        .select('id, name, user_id, users(display_name)'),
      db
        .from('fantasy_standings')
        .select('team_id, matchday_id, matchday_points, total_points, goals_scored'),
      db
        .from('matchdays')
        .select('id, name, wc_stage, phase, sequence, is_completed')
        .order('sequence'),
    ]);

    const teams = teamsRes.data ?? [];
    const standingsData = standingsRes.data ?? [];
    const matchdaysData = matchdaysRes.data ?? [];

    setMatchdays(matchdaysData);

    // The leaderboard ranks teams by the league-phase matchdays only — knockout
    // rounds are H2H-only and must never enter the league total. No `.slice(0, 3)`:
    // `phase` names the set exactly, and hard-coding 3 would have truncated UCL's
    // 8-matchday league phase. Same rule the Leaderboard uses.
    const leagueIds = new Set(
      matchdaysData.filter((md) => md.phase === 'league').map((md) => md.id)
    );

    // Seed every enrolled team with 0 points
    const byTeam = {};
    for (const t of teams) {
      byTeam[t.id] = {
        team_id: t.id,
        team_name: t.name,
        display_name: t.users?.display_name ?? t.name ?? 'Unknown',
        total_points: 0,
        goals_scored: 0,
        matchday_points: {}, // matchday_id -> points for that matchday
      };
    }

    // Overlay actual scores where available
    for (const row of standingsData) {
      if (!byTeam[row.team_id]) continue;
      // Keep every matchday's points in the per-md map (columns/popups render
      // only the league columns; knockout entries are harmless here).
      byTeam[row.team_id].matchday_points[row.matchday_id] = row.matchday_points;
      // Only league rows feed the leaderboard total/goals. The stored
      // total_points is cumulative AND polluted (computeStandingsForMatchday
      // folds in every other matchday incl. knockout), so we sum the group
      // matchday_points ourselves instead of trusting it.
      if (!leagueIds.has(row.matchday_id)) continue;
      byTeam[row.team_id].total_points += row.matchday_points ?? 0;
      byTeam[row.team_id].goals_scored += row.goals_scored ?? 0;
    }

    // matchday_points is numeric(8,1); round the summed floats to 1 decimal.
    for (const t of Object.values(byTeam)) {
      t.total_points = Math.round(t.total_points * 10) / 10;
    }

    // Sort: total_points DESC, goals_scored DESC (tiebreaker)
    const sorted = Object.values(byTeam).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return b.goals_scored - a.goals_scored;
    });

    setStandings(sorted);
    setLoading(false);
  }

  return { standings, matchdays, loading, refresh: fetchAll };
}
