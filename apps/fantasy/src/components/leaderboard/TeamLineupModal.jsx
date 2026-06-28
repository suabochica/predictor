import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import LineupGrid from '../team/LineupGrid';
import BenchList from '../team/BenchList';
import PointsBreakdownModal from '../team/PointsBreakdownModal';
import { getActivePoints, sumSeasonPointsByPlayer } from '../../lib/scoring';

const LINEUP_SELECT =
  'is_starting, is_captain, bench_order, players(id, name, country, country_code, position, is_eliminated)';

const noop = () => {};

export default function TeamLineupModal({ entry, matchdayId, matchdayName, onClose }) {
  const [rows, setRows] = useState(null); // null = loading, [] = none found
  const [scoringSystem, setScoringSystem] = useState('opta');
  const [liveStats, setLiveStats] = useState({});
  const [allStats, setAllStats] = useState([]);

  const [error, setError] = useState(null);
  const [breakdownPlayer, setBreakdownPlayer] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let data = null;

        if (matchdayId != null) {
          const res = await supabase
            .from('lineups')
            .select(LINEUP_SELECT)
            .eq('team_id', entry.team_id)
            .eq('matchday_id', matchdayId);
          if (res.error) throw res.error;
          data = res.data;
        }

        if (!data || data.length === 0) {
          const { data: recent, error: recentErr } = await supabase
            .from('lineups')
            .select('matchday_id')
            .eq('team_id', entry.team_id)
            .not('matchday_id', 'is', null)
            .order('matchday_id', { ascending: false })
            .limit(1);
          if (recentErr) throw recentErr;
          if (recent && recent.length > 0) {
            const res = await supabase
              .from('lineups')
              .select(LINEUP_SELECT)
              .eq('team_id', entry.team_id)
              .eq('matchday_id', recent[0].matchday_id);
            if (res.error) throw res.error;
            data = res.data;
          }
        }

        if (!data || data.length === 0) {
          const res = await supabase
            .from('lineups')
            .select(LINEUP_SELECT)
            .eq('team_id', entry.team_id)
            .is('matchday_id', null);
          if (res.error) throw res.error;
          data = res.data;
        }

        if (!cancelled) {
          setRows(data ?? []);
          setError(null);
        }
      } catch (err) {
        console.error('TeamLineupModal load error:', err);
        if (!cancelled) setError(err.message ?? 'Error desconocido');
      }
    }

    setRows(null);
    setError(null);
    load();
    return () => { cancelled = true; };
  }, [entry.team_id, matchdayId]);

  // Fetch scoring system + player stats once rows are loaded
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const playerIds = rows.filter(r => r.players).map(r => r.players.id);
    if (playerIds.length === 0) return;
    let cancelled = false;

    async function loadStats() {
      const [
        { data: sysData },
        { data: liveData },
        { data: allData },
      ] = await Promise.all([
        supabase.from('auction_state').select('scoring_system').single(),
        matchdayId
          ? supabase.from('player_stats').select('*').eq('matchday_id', matchdayId).in('player_id', playerIds)
          : Promise.resolve({ data: [] }),
        supabase.from('player_stats').select('*').in('player_id', playerIds),
      ]);
      if (cancelled) return;
      setScoringSystem(sysData?.scoring_system ?? 'opta');
      const liveMap = {};
      for (const s of liveData ?? []) liveMap[s.player_id] = s;
      setLiveStats(liveMap);
      setAllStats(allData ?? []);
    }

    loadStats();
    return () => { cancelled = true; };
  }, [rows, matchdayId]); // eslint-disable-line

  const players = (rows ?? [])
    .filter((r) => r.players)
    .map((r) => ({
      ...r.players,
      is_starting: r.is_starting,
      is_captain: r.is_captain,
      bench_order: r.bench_order,
    }));
  const starters = players.filter((p) => p.is_starting);
  const bench = players
    .filter((p) => !p.is_starting)
    .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99));
  const captainId = players.find((p) => p.is_captain)?.id ?? null;

  // Live matchday points (with captain ×2)
  const pointsById = {};
  for (const p of players) {
    const s = liveStats[p.id];
    if (!s) continue;
    const raw = getActivePoints(s, p.position, scoringSystem);
    pointsById[p.id] = p.id === captainId ? Math.round(raw * 2 * 10) / 10 : raw;
  }

  // Cumulative tournament total (base, no captain ×2)
  const positionById = Object.fromEntries(players.map((p) => [p.id, p.position]));
  const totalPointsById = sumSeasonPointsByPlayer(allStats, positionById, scoringSystem);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-primary truncate">{entry.display_name}</h2>
            {entry.team_name && entry.team_name !== entry.display_name && (
              <p className="text-sm text-secondary truncate">{entry.team_name}</p>
            )}
            {matchdayName && (
              <p className="text-xs text-muted truncate">{matchdayName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary text-xl leading-none px-2 -mr-2"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {rows === null && !error ? (
          <p className="text-secondary text-sm py-8 text-center">Cargando alineación…</p>
        ) : error ? (
          <p className="text-error text-sm py-8 text-center">
            Error al cargar la alineación: {error}
          </p>
        ) : players.length === 0 ? (
          <p className="text-secondary text-sm py-8 text-center">
            Este equipo aún no ha guardado una alineación.
          </p>
        ) : (
          <>
            <LineupGrid
              starters={starters}
              captainId={captainId}
              selectedId={null}
              onPlayerClick={noop}
              onEmptySlotClick={noop}
              hasSelected={false}
              pointsById={pointsById}
              totalPointsById={totalPointsById}
              onInfoClick={setBreakdownPlayer}
            />
            <BenchList
              bench={bench}
              selectedId={null}
              onPlayerClick={noop}
              readOnly
              pointsById={pointsById}
              totalPointsById={totalPointsById}
              onInfoClick={setBreakdownPlayer}
            />
            {breakdownPlayer && (
              <PointsBreakdownModal
                player={breakdownPlayer}
                activeMatchdayId={matchdayId}
                isCaptain={breakdownPlayer.id === captainId}
                onClose={() => setBreakdownPlayer(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
