import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { sumSeasonPointsByPlayer } from '../lib/scoring';

async function fetchAllPages(queryFn) {
  const PAGE = 1000;
  let from = 0;
  let result = [];
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error || !data) break;
    result = result.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return result;
}

export function usePlayerTotals() {
  const [totals, setTotals] = useState({});
  const [activePointsById, setActivePointsById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: totalsData }, { data: sysData }] = await Promise.all([
        supabase.from('player_tournament_totals').select('*'),
        supabase.from('auction_state').select('scoring_system').single(),
      ]);

      const map = {};
      for (const row of (totalsData ?? [])) map[row.player_id] = row;
      setTotals(map);

      const system = sysData?.scoring_system ?? 'opta';

      const [statsRows, playerRows] = await Promise.all([
        fetchAllPages((from, to) => supabase.from('player_stats').select('*').range(from, to)),
        fetchAllPages((from, to) => supabase.from('players').select('id, position').range(from, to)),
      ]);

      const positionById = Object.fromEntries(playerRows.map((p) => [p.id, p.position]));
      setActivePointsById(sumSeasonPointsByPlayer(statsRows, positionById, system));
      setLoading(false);
    }

    load();
  }, []);

  return { totals, activePointsById, loading };
}
