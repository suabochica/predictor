import { useEffect, useState } from 'react';
import { sumSeasonPointsByPlayer, getActivePoints } from '../lib/scoring';
import { useCompetition } from '../context/CompetitionContext';

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
  const { db } = useCompetition();
  const [totals, setTotals] = useState({});
  const [activePointsById, setActivePointsById] = useState({});
  const [pointsByPlayerByMatchday, setPointsByPlayerByMatchday] = useState({});
  const [matchdayColumns, setMatchdayColumns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: totalsData }, { data: sysData }, { data: matchdaysData }] = await Promise.all([
        db.from('player_tournament_totals').select('*'),
        db.from('auction_state').select('scoring_system').order('id').limit(1).maybeSingle(),
        db.from('matchdays').select('id, name, wc_stage, sequence').order('sequence'),
      ]);

      const map = {};
      for (const row of (totalsData ?? [])) map[row.player_id] = row;
      setTotals(map);

      const system = sysData?.scoring_system ?? 'opta';
      const matchdayById = Object.fromEntries((matchdaysData ?? []).map((md) => [md.id, md]));

      // player_stats has no competition_id (it hangs off matchday_id/player_id), so
      // scope it by this competition's matchdays instead of paginating every
      // competition's rows and discarding the rest.
      const scopedMatchdayIds = (matchdaysData ?? []).map((md) => md.id);
      const [statsRows, playerRows] = await Promise.all([
        scopedMatchdayIds.length
          ? fetchAllPages((from, to) =>
              db.from('player_stats').select('*').in('matchday_id', scopedMatchdayIds).range(from, to)
            )
          : Promise.resolve([]),
        fetchAllPages((from, to) => db.from('players').select('id, position').range(from, to)),
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
          .sort((a, b) => (matchdayById[a]?.sequence ?? a) - (matchdayById[b]?.sequence ?? b))
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
