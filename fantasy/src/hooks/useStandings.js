import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useStandings() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStandings();
  }, []);

  async function fetchStandings() {
    const { data } = await supabase
      .from('fantasy_standings')
      .select('*, teams(name, user_id, users(display_name))')
      .order('total_points', { ascending: false });
    setStandings(data ?? []);
    setLoading(false);
  }

  return { standings, loading, refresh: fetchStandings };
}
