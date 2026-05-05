import { useStandings } from '../hooks/useStandings';
import { useAuth } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';

const CHAMPIONSHIP_SPOTS = 8;
const RELEGATION_SPOTS = 4;

function getBracketInfo(rank, total) {
  if (total < 8) return null; // not enough participants for bracket split
  if (rank <= CHAMPIONSHIP_SPOTS) return 'championship';
  if (rank > total - RELEGATION_SPOTS) return 'relegation';
  return null;
}

function RankBadge({ rank, bracket }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0';
  if (rank === 1) return <span className={`${base} bg-yellow-400 text-gray-900`}>{rank}</span>;
  if (rank === 2) return <span className={`${base} bg-gray-300 text-gray-900`}>{rank}</span>;
  if (rank === 3) return <span className={`${base} bg-orange-400 text-gray-900`}>{rank}</span>;
  if (bracket === 'championship')
    return <span className={`${base} bg-emerald-700 text-white`}>{rank}</span>;
  if (bracket === 'relegation')
    return <span className={`${base} bg-red-900 text-red-300`}>{rank}</span>;
  return <span className={`${base} bg-gray-700 text-gray-300`}>{rank}</span>;
}

function BracketBadge({ bracket }) {
  if (!bracket) return null;
  if (bracket === 'championship')
    return (
      <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-800/60 text-emerald-300 border border-emerald-700/40">
        Champ
      </span>
    );
  return (
    <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-700/40">
      Releg
    </span>
  );
}

export default function Standings() {
  const { standings, matchdays, loading } = useStandings();
  const { user } = useAuth();
  const { activeMatchday } = useLeague();

  const hasScores = standings.some((s) => s.total_points > 0);
  const totalParticipants = standings.length;

  // Determine if league stage is complete (all 4 league matchdays done)
  const leagueMatchdays = matchdays.filter((md) => !md.wc_stage?.toLowerCase().includes('knockout'));
  const leagueComplete = leagueMatchdays.length >= 4 && leagueMatchdays.every((md) => md.is_completed);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading standings…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Standings</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {activeMatchday
            ? `Active: ${activeMatchday.name}`
            : leagueComplete
            ? 'League stage complete — brackets locked'
            : 'Pre-tournament'}
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Managers</p>
          <p className="text-2xl font-bold text-white mt-1">{totalParticipants}</p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Matchdays</p>
          <p className="text-2xl font-bold text-white mt-1">
            {matchdays.filter((md) => md.is_completed).length}
            <span className="text-sm text-gray-500 font-normal"> / {Math.max(4, matchdays.length)}</span>
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Leader</p>
          <p className="text-sm font-bold text-emerald-400 mt-1 truncate">
            {standings[0]?.display_name ?? '—'}
          </p>
        </div>
      </div>

      {/* ── Bracket key ── */}
      {totalParticipants >= 8 && (
        <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-700 inline-block" />
            Positions 1–{CHAMPIONSHIP_SPOTS} → Championship bracket
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-900 inline-block" />
            Positions {totalParticipants - RELEGATION_SPOTS + 1}–{totalParticipants} → Relegation bracket
          </span>
        </div>
      )}

      {/* ── Pre-tournament notice ── */}
      {!hasScores && (
        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-400 text-center">
          No scores yet — standings will update after the first matchday is completed.
        </div>
      )}

      {/* ── Standings table ── */}
      {standings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-500">
          No participants enrolled yet.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_repeat(4,2.5rem)_3rem_2.5rem] gap-x-2 px-4 py-2.5 border-b border-gray-700 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <span>#</span>
            <span>Manager</span>
            {matchdays.length > 0
              ? matchdays.slice(0, 4).map((md) => (
                  <span key={md.id} className="hidden sm:block text-center truncate" title={md.name}>
                    {md.name.replace(/matchday\s*/i, 'MD').replace(/group stage /i, '')}
                  </span>
                ))
              : [1, 2, 3, 4].map((n) => (
                  <span key={n} className="hidden sm:block text-center text-gray-700">
                    MD{n}
                  </span>
                ))}
            <span className="text-center">Pts</span>
            <span className="hidden sm:block text-center" title="Goals scored (tiebreaker)">
              GS
            </span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-800">
            {standings.map((entry, idx) => {
              const rank = idx + 1;
              const bracket = getBracketInfo(rank, totalParticipants);
              const isCurrentUser = entry.team_id !== undefined &&
                // We identify by display_name since we don't expose team.user_id here
                // A more robust check would compare user IDs — done via useAuth
                false; // placeholder; real check below

              // Check if this is the logged-in user's team
              // We rely on display_name matching user profile (best effort without user_id in entry)
              const rowIsMe = entry.display_name && user; // resolved below

              const leftBorder =
                bracket === 'championship'
                  ? 'border-l-2 border-l-emerald-600'
                  : bracket === 'relegation'
                  ? 'border-l-2 border-l-red-700'
                  : 'border-l-2 border-l-transparent';

              return (
                <div
                  key={entry.team_id}
                  className={`grid grid-cols-[2rem_1fr_repeat(4,2.5rem)_3rem_2.5rem] gap-x-2 px-4 py-3 items-center ${leftBorder} ${
                    rank <= 3 ? 'bg-gray-900' : 'bg-gray-900'
                  }`}
                >
                  {/* Rank */}
                  <RankBadge rank={rank} bracket={bracket} />

                  {/* Manager name + badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-white truncate">
                      {entry.display_name}
                    </span>
                    <BracketBadge bracket={bracket} />
                  </div>

                  {/* Per-matchday points */}
                  {matchdays.length > 0
                    ? matchdays.slice(0, 4).map((md) => (
                        <span
                          key={md.id}
                          className="hidden sm:block text-center text-sm text-gray-400"
                        >
                          {entry.matchday_points[md.id] != null
                            ? entry.matchday_points[md.id]
                            : '—'}
                        </span>
                      ))
                    : [1, 2, 3, 4].map((n) => (
                        <span key={n} className="hidden sm:block text-center text-sm text-gray-700">
                          —
                        </span>
                      ))}

                  {/* Total points */}
                  <span
                    className={`text-center text-sm font-bold ${
                      hasScores ? 'text-emerald-400' : 'text-gray-600'
                    }`}
                  >
                    {entry.total_points}
                  </span>

                  {/* Goals scored (tiebreaker) */}
                  <span className="hidden sm:block text-center text-xs text-gray-500">
                    {entry.goals_scored}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tiebreaker note ── */}
      {hasScores && (
        <p className="text-xs text-gray-600">
          Tiebreaker: goals scored by owned players. GS column shows tiebreaker value.
        </p>
      )}

      {/* ── League stage note ── */}
      {leagueComplete && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 text-sm">
          <p className="text-emerald-300 font-semibold">League stage complete</p>
          <p className="text-gray-400 mt-1">
            Top {CHAMPIONSHIP_SPOTS} advance to the Championship bracket. Bottom{' '}
            {RELEGATION_SPOTS} enter the Relegation bracket. Transfer Window 1 now open.
          </p>
        </div>
      )}
    </div>
  );
}
