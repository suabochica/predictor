import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

export function usePlayerTotals() {
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('player_tournament_totals')
      .select('*')
      .then(({ data }) => {
        const map = {};
        for (const row of (data ?? [])) map[row.player_id] = row;
        setTotals(map);
        setLoading(false);
      });
  }, []);

  return { totals, loading };
}
