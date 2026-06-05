import { useKnockout } from '../hooks/useKnockout';
import { useStandings } from '../hooks/useStandings';
import { generateChampionshipBracket } from '../lib/brackets';

// ── Match card ────────────────────────────────────────────────────────────

function MatchCard({ label, teamA, teamB, pointsA, pointsB, winnerId, seed }) {
  const hasResult = pointsA != null && pointsB != null;
  const aWon = winnerId && teamA && winnerId === teamA.id;
  const bWon = winnerId && teamB && winnerId === teamB.id;

  function teamName(team) {
    if (!team) return 'TBD';
    return team.users?.display_name ?? team.name ?? 'TBD';
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-3 min-w-[180px]">
      {label && (
        <span className="text-label-caps text-muted block mb-2">{label}</span>
      )}

      {/* Team A */}
      <div
        className={`flex items-center justify-between py-1 gap-2 ${
          aWon ? 'text-primary' : hasResult ? 'text-muted' : 'text-secondary'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.a != null && (
            <span className="text-label-caps text-muted flex-shrink-0">({seed.a})</span>
          )}
          {aWon && <span className="text-label-caps text-tertiary flex-shrink-0">W</span>}
          <span className="text-xs truncate">{teamName(teamA)}</span>
        </div>
        {hasResult && (
          <span className={`text-sm font-bold flex-shrink-0 ${aWon ? 'text-tertiary' : ''}`}>
            {pointsA}
          </span>
        )}
      </div>

      <div className="border-t border-border my-0.5" />

      {/* Team B */}
      <div
        className={`flex items-center justify-between py-1 gap-2 ${
          bWon ? 'text-primary' : hasResult ? 'text-muted' : 'text-secondary'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.b != null && (
            <span className="text-label-caps text-muted flex-shrink-0">({seed.b})</span>
          )}
          {bWon && <span className="text-label-caps text-tertiary flex-shrink-0">W</span>}
          <span className="text-xs truncate">{teamName(teamB)}</span>
        </div>
        {hasResult && (
          <span className={`text-sm font-bold flex-shrink-0 ${bWon ? 'text-tertiary' : ''}`}>
            {pointsB}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Seeded preview card (from standings) ─────────────────────────────────

function PreviewMatchCard({ label, teamA, teamB, seedA, seedB }) {
  return (
    <div className="bg-surface border border-dashed border-border rounded-xl p-3 min-w-[180px] opacity-80">
      <span className="text-label-caps text-muted block mb-2">{label}</span>
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-label-caps text-muted">({seedA})</span>
        <span className="text-xs text-secondary truncate">
          {teamA?.display_name ?? 'TBD'}
        </span>
      </div>
      <div className="border-t border-border my-0.5" />
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-label-caps text-muted">({seedB})</span>
        <span className="text-xs text-secondary truncate">
          {teamB?.display_name ?? 'TBD'}
        </span>
      </div>
    </div>
  );
}

// ── Column of match cards with a header ──────────────────────────────────

function RoundColumn({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 min-w-[196px]">
      <div className="text-center">
        <p className="text-label-caps font-semibold text-secondary uppercase tracking-widest">
          {title}
        </p>
        {subtitle && (
          <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center self-center text-secondary text-lg px-1 flex-shrink-0" aria-label="Connector">
      →
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function Bracket() {
  const { matches, loading: matchesLoading } = useKnockout();
  const { standings, loading: standingsLoading } = useStandings();

  if (matchesLoading || standingsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Loading bracket…
      </div>
    );
  }

  const hasMatches = matches.length > 0;
  const hasEnoughStandings = standings.length >= 8;

  function getMatch(bracket, round, label) {
    return matches.find(
      (m) => m.bracket === bracket && m.round === round && m.match_label === label
    ) ?? null;
  }

  function matchProps(m) {
    if (!m) return { teamA: null, teamB: null, pointsA: null, pointsB: null, winnerId: null };
    return {
      teamA: m.team_a,
      teamB: m.team_b,
      pointsA: m.team_a_points,
      pointsB: m.team_b_points,
      winnerId: m.winner_id,
    };
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Bracket</h1>
        <p className="text-secondary text-sm mt-0.5">Single-elimination — H2H matchday points</p>
      </div>

      {/* ── Not seeded yet ── */}
      {!hasMatches && !hasEnoughStandings && (
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary font-semibold">Bracket not seeded yet</p>
          <p className="text-muted text-sm mt-1">
            The knockout bracket is set once the league stage (3 matchdays) is complete.
          </p>
        </div>
      )}

      {/* ── Seeded preview (standings exist but no DB matches yet) ── */}
      {!hasMatches && hasEnoughStandings && (
        <>
          <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 text-sm text-tertiary">
            Preview based on current standings — bracket locks when league stage is finalised.
          </div>

          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            <RoundColumn title="Quarter-finals" subtitle="WC Round of 32">
              {generateChampionshipBracket(standings).map((m, i) => (
                <PreviewMatchCard
                  key={m.label}
                  label={m.label}
                  teamA={m.teamA}
                  teamB={m.teamB}
                  seedA={[1, 4, 2, 3][i]}
                  seedB={[8, 5, 7, 6][i]}
                />
              ))}
            </RoundColumn>
            <Connector />
            <RoundColumn title="Semi-finals" subtitle="WC Round of 16">
              <PreviewMatchCard label="Semi A" teamA={null} teamB={null} seedA="WA" seedB="WB" />
              <PreviewMatchCard label="Semi B" teamA={null} teamB={null} seedA="WC" seedB="WD" />
            </RoundColumn>
            <Connector />
            <RoundColumn title="Final" subtitle="WC Quarter-finals">
              <PreviewMatchCard label="Final" teamA={null} teamB={null} seedA="W Semi A" seedB="W Semi B" />
            </RoundColumn>
          </div>
        </>
      )}

      {/* ── Actual bracket from DB ── */}
      {hasMatches && (
        <>
          <div className="flex items-start gap-2 overflow-x-auto pb-3">
            {/* Round 1: Quarter-finals */}
            <RoundColumn title="Quarter-finals" subtitle="WC Round of 32">
              {['Match A', 'Match B', 'Match C', 'Match D'].map((label, i) => {
                const m = getMatch('championship', 1, label);
                const seeds = [{ a: 1, b: 8 }, { a: 4, b: 5 }, { a: 2, b: 7 }, { a: 3, b: 6 }];
                return (
                  <MatchCard
                    key={label}
                    label={label}
                    seed={seeds[i]}
                    {...matchProps(m)}
                  />
                );
              })}
            </RoundColumn>

            <Connector />

            {/* Round 2: Semi-finals */}
            <RoundColumn title="Semi-finals" subtitle="WC Round of 16">
              {['Semi A', 'Semi B'].map((label) => {
                const m = getMatch('championship', 2, label);
                return <MatchCard key={label} label={label} {...matchProps(m)} />;
              })}
            </RoundColumn>

            <Connector />

            {/* Round 3: Final */}
            <RoundColumn title="Final" subtitle="WC Quarter-finals">
              {(() => {
                const m = getMatch('championship', 3, 'Final');
                return <MatchCard label="Final" {...matchProps(m)} />;
              })()}
            </RoundColumn>
          </div>

          {/* ── Final result ── */}
          {(() => {
            const finalMatch = getMatch('championship', 3, 'Final');
            if (!finalMatch?.winner_id) return null;
            const champion = finalMatch.winner;
            const runnerUp =
              finalMatch.winner_id === finalMatch.team_a?.id
                ? finalMatch.team_b
                : finalMatch.team_a;
            const teamName = (t) => t?.users?.display_name ?? t?.name ?? 'TBD';
            return (
              <section>
                <h2 className="text-base font-bold text-primary mb-4">Final Standings</h2>
                <div className="flex flex-col gap-2 max-w-xs">
                  <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                    <span className="text-lg font-black text-tertiary flex-shrink-0">🏆</span>
                    <div>
                      <p className="text-label-caps text-muted">Champion</p>
                      <p className="text-sm font-medium text-primary">{teamName(champion)}</p>
                    </div>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                    <span className="text-sm font-black text-muted flex-shrink-0 w-6 text-center">2.</span>
                    <div>
                      <p className="text-label-caps text-muted">Runner-up</p>
                      <p className="text-sm font-medium text-primary">{teamName(runnerUp)}</p>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}
        </>
      )}

      {/* ── H2H scoring rules ── */}
      <div className="bg-surface/50 border border-border/50 rounded-xl p-4 text-xs text-muted space-y-1">
        <p className="font-semibold text-secondary">H2H Scoring Rules</p>
        <p>Winner = higher matchday points. Tiebreaker: captain points → goals scored → league seed.</p>
        <p>Only current-round matchday points count — not cumulative season total.</p>
      </div>
    </div>
  );
}
