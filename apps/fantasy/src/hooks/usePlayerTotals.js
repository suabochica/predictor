import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { sumSeasonPointsByPlayer, getActivePoints } from '../lib/scoring';

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
  const [pointsByPlayerByMatchday, setPointsByPlayerByMatchday] = useState({});
  const [matchdayColumns, setMatchdayColumns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: totalsData }, { data: sysData }, { data: matchdaysData }] = await Promise.all([
        supabase.from('player_tournament_totals').select('*'),
        supabase.from('auction_state').select('scoring_system').single(),
        supabase.from('matchdays').select('id, name, wc_stage'),
      ]);

      const map = {};
      for (const row of (totalsData ?? [])) map[row.player_id] = row;
      setTotals(map);

      const system = sysData?.scoring_system ?? 'opta';
      const matchdayById = Object.fromEntries((matchdaysData ?? []).map((md) => [md.id, md]));

      const [statsRows, playerRows] = await Promise.all([
        fetchAllPages((from, to) => supabase.from('player_stats').select('*').range(from, to)),
        fetchAllPages((from, to) => supabase.from('players').select('id, position').range(from, to)),
      ]);

      const positionById = Object.fromEntries(playerRows.map((p) => [p.id, p.position]));
      setActivePointsById(sumSeasonPointsByPlayer(statsRows, positionById, system));

      const byPlayer = {};
      const matchdayIds = new Set();
      for (const row of statsRows) {
        const pos = positionById[row.player_id];
        if (!pos) continue;
        matchdayIds.add(row.matchday_id);
        (byPlayer[row.player_id] ??= {})[row.matchday_id] = getActivePoints(row, pos, system);
      }
      setPointsByPlayerByMatchday(byPlayer);
      setMatchdayColumns(
        [...matchdayIds]
          .sort((a, b) => a - b)
          .map((id) => {
            const md = matchdayById[id];
            const label = md ? md.name.replace(/matchday\s*/i, 'JD').replace(/group stage /i, '') : `MD${id}`;
            return { id, label, title: md?.name ?? label };
          })
      );

      setLoading(false);
    }

    load();
  }, []);

  return { totals, activePointsById, pointsByPlayerByMatchday, matchdayColumns, loading };
}
