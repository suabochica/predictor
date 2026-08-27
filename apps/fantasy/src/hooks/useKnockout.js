import { useEffect, useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';

export function useKnockout() {
  const { db } = useCompetition();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    const { data } = await db
      .from('knockout_matches')
      .select(
        `*,
        matchday:matchdays(id, name),
        team_a:teams!knockout_matches_team_a_id_fkey(id, name, user_id, users(display_name)),
        team_b:teams!knockout_matches_team_b_id_fkey(id, name, user_id, users(display_name)),
        winner:teams!knockout_matches_winner_id_fkey(id, name, users(display_name))`
      )
      .order('round')
      .order('id');
    setMatches(data ?? []);
    setLoading(false);
  }

  return { matches, loading, refresh: fetchMatches };
}
