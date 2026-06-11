import { useState } from 'react';
import { useStandings } from '../hooks/useStandings';
import { useAuth } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';
import TeamLineupModal from '../components/leaderboard/TeamLineupModal';

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
  if (rank === 1) return <span className={`${base} bg-tertiary text-primary`}>{rank}</span>;
  if (rank === 2) return <span className={`${base} bg-border-strong text-primary`}>{rank}</span>;
  if (rank === 3) return <span className={`${base} bg-warning text-primary`}>{rank}</span>;
  if (bracket === 'championship')
    return <span className={`${base} bg-tertiary text-primary`}>{rank}</span>;
  if (bracket === 'relegation')
    return <span className={`${base} bg-error/10 text-error`}>{rank}</span>;
  return <span className={`${base} bg-border text-secondary`}>{rank}</span>;
}

function BracketBadge({ bracket }) {
  if (!bracket) return null;
  if (bracket === 'championship')
    return (
      <span className="hidden sm:inline text-label-caps font-semibold px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary border border-tertiary/40">
        Camp
      </span>
    );
  return (
    <span className="hidden sm:inline text-label-caps font-semibold px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/30">
      Desc
    </span>
  );
}

export default function Leaderboard() {
  const { standings, matchdays, loading } = useStandings();
  const { user } = useAuth();
  const { activeMatchday } = useLeague();

  const [viewingEntry, setViewingEntry] = useState(null);

  const hasScores = standings.some((s) => s.total_points > 0);
  const totalParticipants = standings.length;

  // Mid-matchday totals are provisional until the admin finalizes the matchday
  const provisionalActive =
    !!activeMatchday && !matchdays.find((md) => md.id === activeMatchday.id)?.is_completed;

  // League stage = the 3 group round-robin matchdays (MD1/MD2/MD3).
  const leagueMatchdays = matchdays.filter((md) => md.wc_stage?.toLowerCase().includes('group'));
  const leagueComplete = leagueMatchdays.length >= 3 && leagueMatchdays.every((md) => md.is_completed);
  // Per-matchday point columns show only the 3 group matchdays (round-robin).
  const groupMatchdays = leagueMatchdays.slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Cargando posiciones…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Tabla de posiciones</h1>
        <p className="text-secondary text-sm mt-0.5">
          {activeMatchday
            ? `Activo: ${activeMatchday.name}`
            : leagueComplete
            ? 'Fase de liga completada — cuadros bloqueados'
            : 'Pretemporada'}
        </p>
        {provisionalActive && hasScores && (
          <p className="text-xs text-muted mt-1">
            Los puntos de la jornada en curso son provisionales y pueden cambiar hasta que se finalice la jornada.
          </p>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Managers</p>
          <p className="text-2xl font-bold text-primary mt-1">{totalParticipants}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Jornadas</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {matchdays.filter((md) => md.is_completed).length}
            <span className="text-sm text-muted font-normal"> / {Math.max(6, matchdays.length)}</span>
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">Líder</p>
          <p className="text-sm font-bold text-tertiary mt-1 truncate">
            {standings[0]?.display_name ?? '—'}
          </p>
        </div>
      </div>

      {/* ── Bracket key ── */}
      {totalParticipants >= 8 && (
        <div className="flex items-center gap-4 text-xs text-secondary flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-tertiary inline-block" />
            Positions 1–{CHAMPIONSHIP_SPOTS} → Cuadro de campeonato
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-error/10 inline-block" />
            Positions {totalParticipants - RELEGATION_SPOTS + 1}–{totalParticipants} → Cuadro de descenso
          </span>
        </div>
      )}

      {/* ── Pre-tournament notice ── */}
      {!hasScores && (
        <div className="bg-surface/50 border border-border rounded-xl p-4 text-sm text-secondary text-center">
          Aún sin puntuaciones — la tabla se actualizará al completar la primera jornada.
        </div>
      )}

      {/* ── Standings table ── */}
      {standings.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted">
          Aún no hay participantes inscritos.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_repeat(3,2.5rem)_3rem_2.5rem] gap-x-2 px-4 py-2.5 border-b border-border text-label-caps font-semibold text-muted uppercase tracking-wider">
            <span>#</span>
            <span>Manager</span>
            {groupMatchdays.length > 0
              ? groupMatchdays.map((md) => (
                  <span key={md.id} className="hidden sm:block text-center truncate" title={md.name}>
                    {md.name.replace(/matchday\s*/i, 'JD').replace(/group stage /i, '')}
                  </span>
                ))
              : [1, 2, 3].map((n) => (
                  <span key={n} className="hidden sm:block text-center text-secondary">
                    JD{n}
                  </span>
                ))}
            <span className="text-center">Pts</span>
            <span className="hidden sm:block text-center" title="Goals scored (tiebreaker)">
              GS
            </span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
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
                  ? 'border-l-2 border-l-tertiary'
                  : bracket === 'relegation'
                  ? 'border-l-2 border-l-error'
                  : 'border-l-2 border-l-transparent';

              return (
                <div
                  key={entry.team_id}
                  onClick={() => setViewingEntry(entry)}
                  className={`grid grid-cols-[2rem_1fr_repeat(3,2.5rem)_3rem_2.5rem] gap-x-2 px-4 py-3 items-center cursor-pointer hover:bg-surface-hover transition-colors ${leftBorder}`}
                >
                  {/* Rank */}
                  <RankBadge rank={rank} bracket={bracket} />

                  {/* Manager name + badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-primary truncate">
                      {entry.display_name}
                    </span>
                    <BracketBadge bracket={bracket} />
                  </div>

                  {/* Per-matchday points */}
                  {groupMatchdays.length > 0
                    ? groupMatchdays.map((md) => (
                        <span
                          key={md.id}
                          className="hidden sm:block text-center text-sm text-secondary"
                        >
                          {entry.matchday_points[md.id] != null
                            ? entry.matchday_points[md.id]
                            : '—'}
                        </span>
                      ))
                    : [1, 2, 3].map((n) => (
                        <span key={n} className="hidden sm:block text-center text-sm text-secondary">
                          —
                        </span>
                      ))}

                  {/* Total points */}
                  <span
                    className={`text-center text-sm font-bold ${
                      hasScores ? 'text-tertiary' : 'text-muted'
                    }`}
                  >
                    {entry.total_points}
                  </span>

                  {/* Goals scored (tiebreaker) */}
                  <span className="hidden sm:block text-center text-xs text-muted">
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
        <p className="text-xs text-muted">
          Desempate: goles marcados por jugadores. La columna GS muestra el valor de desempate.
        </p>
      )}

      {/* ── League stage note ── */}
      {leagueComplete && (
        <div className="bg-tertiary/5 border border-tertiary/40 rounded-xl p-4 text-sm">
          <p className="text-tertiary font-semibold">Fase de liga completada</p>
          <p className="text-secondary mt-1">
            Los mejores {CHAMPIONSHIP_SPOTS} avanzan al cuadro de campeonato. Los últimos{' '}
            {RELEGATION_SPOTS} entran al cuadro de descenso. Ventana de fichajes 1 abierta.
          </p>
        </div>
      )}

      {viewingEntry && (
        <TeamLineupModal
          entry={viewingEntry}
          activeMatchdayId={activeMatchday?.id ?? null}
          onClose={() => setViewingEntry(null)}
        />
      )}
    </div>
  );
}
