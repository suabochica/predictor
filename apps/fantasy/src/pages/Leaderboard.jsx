import { useMemo, useState } from 'react';
import { useStandings } from '../hooks/useStandings';
import { useAuth } from '@predictor/supabase';
import { useT } from '@predictor/i18n/react';
import { useCompetition } from '../context/CompetitionContext';
import { useLeague } from '../context/LeagueContext';
import TeamLineupModal from '../components/leaderboard/TeamLineupModal';
import MatchCard from '../components/bracket/MatchCard';
import { h2hResult } from '../lib/standings';
import { fmtPts } from '../lib/utils';

const CHAMPIONSHIP_SPOTS = 8;
const RELEGATION_SPOTS = 4;

function getBracketInfo(rank, total, format) {
  if (total < 8) return null; // not enough participants for bracket split
  if (format === 'h2h') {
    const direct = Math.max(0, 16 - total);
    return rank <= direct ? 'direct' : 'playoff';
  }
  if (rank <= CHAMPIONSHIP_SPOTS) return 'championship';
  if (rank > total - RELEGATION_SPOTS) return 'relegation';
  return null;
}

function RankBadge({ rank, bracket }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0';
  if (rank === 1) return <span className={`${base} bg-tertiary text-primary`}>{rank}</span>;
  if (rank === 2) return <span className={`${base} bg-border-strong text-primary`}>{rank}</span>;
  if (rank === 3) return <span className={`${base} bg-warning text-primary`}>{rank}</span>;
  if (bracket === 'championship' || bracket === 'direct')
    return <span className={`${base} bg-tertiary text-primary`}>{rank}</span>;
  if (bracket === 'playoff') return <span className={`${base} bg-warning/20 text-warning`}>{rank}</span>;
  if (bracket === 'relegation')
    return <span className={`${base} bg-error/10 text-error`}>{rank}</span>;
  return <span className={`${base} bg-border text-secondary`}>{rank}</span>;
}

function BracketBadge({ bracket }) {
  const t = useT();
  if (!bracket) return null;
  if (bracket === 'championship' || bracket === 'direct')
    return (
      <span className="hidden sm:inline text-label-caps font-semibold px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary border border-tertiary/40">
        {bracket === 'direct' ? t('fantasy.leaderboard.bracketBadge.direct') : t('fantasy.leaderboard.bracketBadge.championship')}
      </span>
    );
  if (bracket === 'playoff')
    return (
      <span className="hidden sm:inline text-label-caps font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/40">
        {t('fantasy.leaderboard.bracketBadge.playoff')}
      </span>
    );
  return (
    <span className="hidden sm:inline text-label-caps font-semibold px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/30">
      {t('fantasy.leaderboard.bracketBadge.relegation')}
    </span>
  );
}

export default function Leaderboard() {
  const { standings, matchdays, fixtures, format, loading } = useStandings();
  const { user } = useAuth();
  const { competition } = useCompetition();
  const { activeMatchday } = useLeague();
  const t = useT();

  const [viewing, setViewing] = useState(null); // { entry, matchdayId, matchdayName }
  const openTeam = (entry, matchdayId, matchdayName) =>
    setViewing({ entry, matchdayId, matchdayName });

  const [selectedFixturesMd, setSelectedFixturesMd] = useState(null);

  const isH2H = format === 'h2h';

  const hasScores = standings.some((s) => s.total_points > 0);
  const totalParticipants = standings.length;

  // Mid-matchday totals are provisional until the admin finalizes the matchday
  const provisionalActive =
    !!activeMatchday && !matchdays.find((md) => md.id === activeMatchday.id)?.is_completed;

  // League phase = every matchday that feeds the table (3 for the WC group stage,
  // 8 for a UCL-style H2H league phase). No `.slice(0, 3)` and no `>= 3`: both
  // would truncate any competition whose league phase isn't three matchdays long.
  const leagueMatchdays = matchdays.filter((md) => md.phase === 'league');
  const leagueComplete = leagueMatchdays.length > 0 && leagueMatchdays.every((md) => md.is_completed);
  // Per-matchday point columns show every league matchday.
  const groupMatchdays = leagueMatchdays;

  const cfg = useMemo(
    () => ({
      h2h_win_points: competition?.h2h_win_points,
      h2h_draw_points: competition?.h2h_draw_points,
      h2h_narrow_loss_points: competition?.h2h_narrow_loss_points,
      h2h_narrow_loss_margin: competition?.h2h_narrow_loss_margin,
    }),
    [competition]
  );

  // matchday_id -> team_id -> opponent team_id, for coloring each per-matchday
  // chip W/D/L without a second query — matchday_points is already loaded.
  const fixtureLookup = useMemo(() => {
    const map = {};
    for (const fx of fixtures) {
      map[fx.matchday_id] ??= {};
      map[fx.matchday_id][fx.team_a_id] = fx.team_b_id;
      map[fx.matchday_id][fx.team_b_id] = fx.team_a_id;
    }
    return map;
  }, [fixtures]);

  const standingsByTeamId = useMemo(
    () => Object.fromEntries(standings.map((s) => [s.team_id, s])),
    [standings]
  );

  // Fixtures panel: default to the active league matchday, falling back to the
  // last one once the league phase is over. `selectedFixturesMd` overrides once
  // the user picks a matchday from the dropdown.
  const activeLeagueMdId = groupMatchdays.find((md) => md.id === activeMatchday?.id)?.id ?? null;
  const lastLeagueMdId = groupMatchdays[groupMatchdays.length - 1]?.id ?? null;
  const fixturesMdId = isH2H ? selectedFixturesMd ?? activeLeagueMdId ?? lastLeagueMdId : null;
  const fixturesMd = groupMatchdays.find((md) => md.id === fixturesMdId) ?? null;
  const panelFixtures = isH2H
    ? fixtures.filter((fx) => fx.matchday_id === fixturesMdId).sort((a, b) => a.slot - b.slot)
    : [];

  // Fixed-width columns beyond `#` (2rem) and `Manager` (1fr). Kept in sync
  // between the header and every row via the same computed style.
  const matchdayColCount = groupMatchdays.length > 0 ? groupMatchdays.length : 3;
  const fixedCols = isH2H
    ? [...Array(matchdayColCount).fill(2.5), 2.25, 2.25, 2.25, 2.25, 2.75, 2.75, 2.5]
    : [...Array(matchdayColCount).fill(2.5), 3, 2.5];
  const gridTemplateColumns = ['2rem', '1fr', ...fixedCols.map((r) => `${r}rem`)].join(' ');
  // Manager gets a 19rem floor — matches the old hardcoded `min-w-[34rem]`
  // exactly for the WC's 3-matchday cumulative layout (2 + 19 + 13 = 34).
  const gridStyle = {
    gridTemplateColumns,
    minWidth: `${2 + 19 + fixedCols.reduce((sum, r) => sum + r, 0)}rem`,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        {t('fantasy.leaderboard.loading')}
      </div>
    );
  }

  const directSpots = Math.max(0, 16 - totalParticipants);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('fantasy.leaderboard.pageTitle')}</h1>
        <p className="text-secondary text-sm mt-0.5">
          {activeMatchday
            ? t('fantasy.leaderboard.activeLabel', { name: activeMatchday.name })
            : leagueComplete
            ? t('fantasy.leaderboard.leagueStageComplete')
            : t('fantasy.common.preseason')}
        </p>
        {provisionalActive && hasScores && (
          <p className="text-xs text-muted mt-1">
            {t('fantasy.leaderboard.provisionalNotice')}
          </p>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.leaderboard.managers')}</p>
          <p className="text-2xl font-bold text-primary mt-1">{totalParticipants}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.leaderboard.matchdays')}</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {matchdays.filter((md) => md.is_completed).length}
            <span className="text-sm text-muted font-normal"> / {matchdays.length}</span>
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.leaderboard.leader')}</p>
          <p className="text-sm font-bold text-tertiary mt-1 truncate">
            {standings[0]?.display_name ?? '—'}
          </p>
        </div>
      </div>

      {/* ── Bracket key ── */}
      {totalParticipants >= 8 && (
        <div className="flex items-center gap-4 text-xs text-secondary flex-wrap">
          {isH2H ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-tertiary inline-block" />
                {t('fantasy.leaderboard.bracketKey.directQuarterfinal', { n: directSpots })}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-warning/30 inline-block" />
                {t('fantasy.leaderboard.bracketKey.playoff', { from: directSpots + 1, to: totalParticipants })}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-tertiary inline-block" />
                {t('fantasy.leaderboard.bracketKey.championship', { n: CHAMPIONSHIP_SPOTS })}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-error/10 inline-block" />
                {t('fantasy.leaderboard.bracketKey.relegation', {
                  from: totalParticipants - RELEGATION_SPOTS + 1,
                  to: totalParticipants,
                })}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Pre-tournament notice ── */}
      {!hasScores && (
        <div className="bg-surface/50 border border-border rounded-xl p-4 text-sm text-secondary text-center">
          {t('fantasy.leaderboard.noScoresYet')}
        </div>
      )}

      {/* ── Standings table ── */}
      {standings.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted">
          {t('fantasy.leaderboard.noParticipants')}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          {/* Table header */}
          <div
            style={gridStyle}
            className="grid gap-x-2 px-4 py-2.5 border-b border-border text-label-caps font-semibold text-muted uppercase tracking-wider"
          >
            <span>#</span>
            <span>Manager</span>
            {groupMatchdays.length > 0
              ? groupMatchdays.map((md) => (
                  <span key={md.id} className="text-center truncate" title={md.name}>
                    {md.name.replace(/matchday\s*/i, t('fantasy.leaderboard.matchdayAbbrev')).replace(/group stage /i, '')}
                  </span>
                ))
              : [1, 2, 3].map((n) => (
                  <span key={n} className="text-center text-secondary">
                    {t('fantasy.leaderboard.matchdayAbbrev')}{n}
                  </span>
                ))}
            {isH2H && (
              <>
                <span className="text-center" title={t('fantasy.leaderboard.columns.played.title')}>
                  {t('fantasy.leaderboard.columns.played.abbrev')}
                </span>
                <span className="text-center" title={t('fantasy.leaderboard.columns.won.title')}>
                  {t('fantasy.leaderboard.columns.won.abbrev')}
                </span>
                <span className="text-center" title={t('fantasy.leaderboard.columns.drawn.title')}>
                  {t('fantasy.leaderboard.columns.drawn.abbrev')}
                </span>
                <span className="text-center" title={t('fantasy.leaderboard.columns.lost.title')}>
                  {t('fantasy.leaderboard.columns.lost.abbrev')}
                </span>
              </>
            )}
            <span className="text-center">{t('fantasy.leaderboard.columns.points')}</span>
            {isH2H && (
              <span className="text-center" title={t('fantasy.leaderboard.columns.fantasyPoints.title')}>
                {t('fantasy.leaderboard.columns.fantasyPoints.abbrev')}
              </span>
            )}
            <span className="text-center" title={t('fantasy.leaderboard.columns.goalsScored.title')}>
              {t('fantasy.leaderboard.columns.goalsScored.abbrev')}
            </span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {standings.map((entry, idx) => {
              const rank = idx + 1;
              const bracket = getBracketInfo(rank, totalParticipants, format);
              const rowIsMe = !!user && entry.user_id === user.id;

              const leftBorder =
                bracket === 'championship' || bracket === 'direct'
                  ? 'border-l-2 border-l-tertiary'
                  : bracket === 'playoff'
                  ? 'border-l-2 border-l-warning'
                  : bracket === 'relegation'
                  ? 'border-l-2 border-l-error'
                  : 'border-l-2 border-l-transparent';

              return (
                <div
                  key={entry.team_id}
                  onClick={() => openTeam(entry, activeMatchday?.id ?? null, activeMatchday?.name ?? null)}
                  style={gridStyle}
                  className={`grid gap-x-2 px-4 py-3 items-center cursor-pointer hover:bg-surface-hover transition-colors ${leftBorder} ${
                    rowIsMe ? 'bg-tertiary/5' : ''
                  }`}
                >
                  {/* Rank */}
                  <RankBadge rank={rank} bracket={bracket} />

                  {/* Manager name + badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-sm truncate ${
                        rowIsMe ? 'font-bold text-tertiary' : 'font-medium text-primary'
                      }`}
                    >
                      {entry.display_name}
                    </span>
                    <BracketBadge bracket={bracket} />
                  </div>

                  {/* Per-matchday points */}
                  {groupMatchdays.length > 0
                    ? groupMatchdays.map((md) => {
                        const ownPts = entry.matchday_points[md.id];
                        const hasPts = ownPts != null;

                        let resultClass = '';
                        if (isH2H && hasPts) {
                          const oppId = fixtureLookup[md.id]?.[entry.team_id];
                          const oppPts =
                            oppId != null ? standingsByTeamId[oppId]?.matchday_points?.[md.id] : undefined;
                          if (oppPts != null) {
                            const { result } = h2hResult(ownPts, oppPts, cfg);
                            resultClass =
                              result === 'W'
                                ? 'bg-success/10 text-success'
                                : result === 'D'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-error/10 text-error';
                          }
                        }

                        return (
                          <span
                            key={md.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasPts) openTeam(entry, md.id, md.name);
                            }}
                            className={
                              isH2H
                                ? `text-center text-sm rounded font-medium py-0.5 ${
                                    resultClass || 'text-secondary'
                                  } ${hasPts ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`
                                : `text-center text-sm text-secondary ${
                                    hasPts ? 'hover:text-primary cursor-pointer' : 'cursor-default'
                                  }`
                            }
                          >
                            {fmtPts(ownPts)}
                          </span>
                        );
                      })
                    : [1, 2, 3].map((n) => (
                        <span key={n} className="text-center text-sm text-secondary">
                          —
                        </span>
                      ))}

                  {isH2H && (
                    <>
                      <span className="text-center text-xs text-secondary">{entry.played ?? 0}</span>
                      <span className="text-center text-xs text-secondary">{entry.won ?? 0}</span>
                      <span className="text-center text-xs text-secondary">{entry.drawn ?? 0}</span>
                      <span className="text-center text-xs text-secondary">{entry.lost ?? 0}</span>
                    </>
                  )}

                  {/* League/total points */}
                  <span
                    className={`text-center text-sm font-bold ${
                      hasScores ? 'text-tertiary' : 'text-muted'
                    }`}
                  >
                    {isH2H ? fmtPts(entry.h2h_points) : fmtPts(entry.total_points)}
                  </span>

                  {isH2H && (
                    <span className="text-center text-xs text-muted">{fmtPts(entry.total_points)}</span>
                  )}

                  {/* Goals scored (tiebreaker) */}
                  <span className="text-center text-xs text-muted">
                    {entry.goals_scored}
                  </span>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* ── Fixtures panel ── */}
      {isH2H && groupMatchdays.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-bold text-primary">
              {fixturesMd
                ? t('fantasy.leaderboard.fixtures.heading', {
                    n: groupMatchdays.findIndex((md) => md.id === fixturesMd.id) + 1,
                  })
                : t('fantasy.leaderboard.fixtures.heading', { n: '' })}
            </h2>
            <select
              value={fixturesMdId ?? ''}
              onChange={(e) => setSelectedFixturesMd(Number(e.target.value))}
              className="text-sm bg-surface border border-border rounded-lg px-2 py-1 text-secondary"
            >
              {groupMatchdays.map((md) => (
                <option key={md.id} value={md.id}>
                  {md.name}
                </option>
              ))}
            </select>
          </div>

          {panelFixtures.length === 0 ? (
            <div className="bg-surface/50 border border-border rounded-xl p-4 text-sm text-muted text-center">
              {t('fantasy.leaderboard.fixtures.notDrawnYet')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {panelFixtures.map((fx, i) => {
                const a = standingsByTeamId[fx.team_a_id];
                const b = standingsByTeamId[fx.team_b_id];
                const pointsA = a?.matchday_points?.[fixturesMdId] ?? null;
                const pointsB = b?.matchday_points?.[fixturesMdId] ?? null;
                return (
                  <MatchCard
                    key={fx.id}
                    label={t('fantasy.leaderboard.fixtures.matchLabel', { n: i + 1 })}
                    teamA={a ? { id: a.team_id, name: a.display_name } : null}
                    teamB={b ? { id: b.team_id, name: b.display_name } : null}
                    pointsA={pointsA}
                    pointsB={pointsB}
                    winnerId={null}
                    provisional={!fixturesMd?.is_completed && (pointsA != null || pointsB != null)}
                    onTeamClick={(team) => {
                      const entry = standingsByTeamId[team.id];
                      if (entry) openTeam(entry, fixturesMdId, fixturesMd?.name ?? null);
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Tiebreaker note ── */}
      {hasScores && (
        <p className="text-xs text-muted">
          {isH2H
            ? t('fantasy.leaderboard.tiebreakerH2h')
            : t('fantasy.leaderboard.tiebreakerCumulative', { abbrev: t('fantasy.leaderboard.columns.goalsScored.abbrev') })}
        </p>
      )}

      {/* ── League stage note ── */}
      {leagueComplete && (
        <div className="bg-tertiary/5 border border-tertiary/40 rounded-xl p-4 text-sm">
          <p className="text-tertiary font-semibold">{t('fantasy.leaderboard.leagueStageCompleteNotice')}</p>
          <p className="text-secondary mt-1">
            {isH2H
              ? t('fantasy.leaderboard.afterLeagueH2h', { n: directSpots })
              : t('fantasy.leaderboard.afterLeagueCumulative', {
                  championship: CHAMPIONSHIP_SPOTS,
                  relegation: RELEGATION_SPOTS,
                })}
          </p>
        </div>
      )}

      {viewing && (
        <TeamLineupModal
          entry={viewing.entry}
          matchdayId={viewing.matchdayId}
          matchdayName={viewing.matchdayName}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
