import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useStandings() {
  const [standings, setStandings] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [teamsRes, standingsRes, matchdaysRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, user_id, users(display_name)'),
      supabase
        .from('fantasy_standings')
        .select('team_id, matchday_id, matchday_points, total_points, goals_scored'),
      supabase
        .from('matchdays')
        .select('id, name, wc_stage, is_completed')
        .order('id'),
    ]);

    const teams = teamsRes.data ?? [];
    const standingsData = standingsRes.data ?? [];
    const matchdaysData = matchdaysRes.data ?? [];

    setMatchdays(matchdaysData);

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
      byTeam[row.team_id].matchday_points[row.matchday_id] = row.matchday_points;
      // goals_scored is stored per-matchday; sum across all rows for tiebreaker
      byTeam[row.team_id].goals_scored += row.goals_scored ?? 0;
      // total_points is cumulative; highest row = running total
      if (row.total_points > byTeam[row.team_id].total_points) {
        byTeam[row.team_id].total_points = row.total_points;
      }
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
