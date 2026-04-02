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
      .select('*, teams!team_a_id(name), teams!team_b_id(name)')
      .order('round');
    setMatches(data ?? []);
    setLoading(false);
  }

  return { matches, loading, refresh: fetchMatches };
}
