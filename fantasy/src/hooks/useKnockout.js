import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useKnockout() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    const { data } = await supabase
      .from('knockout_matches')
      .select(
        `*,
        team_a:teams!team_a_id(id, name, user_id, users(display_name)),
        team_b:teams!team_b_id(id, name, user_id, users(display_name)),
        winner:teams!winner_id(id, name, users(display_name))`
      )
      .order('round')
      .order('id');
    setMatches(data ?? []);
    setLoading(false);
  }

  return { matches, loading, refresh: fetchMatches };
}
