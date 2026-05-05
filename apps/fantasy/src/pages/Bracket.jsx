import { useKnockout } from '../hooks/useKnockout';
import { useStandings } from '../hooks/useStandings';
import { generateChampionshipBracket, generateRelegationBracket } from '../lib/brackets';

// ── Match card ────────────────────────────────────────────────────────────

function MatchCard({ label, teamA, teamB, pointsA, pointsB, winnerId, placement, seed }) {
  const hasResult = pointsA != null && pointsB != null;
  const aWon = winnerId && teamA && winnerId === teamA.id;
  const bWon = winnerId && teamB && winnerId === teamB.id;

  function teamName(team) {
    if (!team) return 'TBD';
    return team.users?.display_name ?? team.name ?? 'TBD';
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 min-w-[180px]">
      {/* Match label */}
      {(label || placement) && (
        <div className="flex items-center justify-between mb-2">
          {label && <span className="text-[10px] text-gray-500">{label}</span>}
          {placement && (
            <span className="text-[10px] font-bold text-yellow-400">{placement}</span>
          )}
        </div>
      )}

      {/* Team A */}
      <div
        className={`flex items-center justify-between py-1 gap-2 ${
          aWon ? 'text-white' : hasResult ? 'text-gray-500' : 'text-gray-300'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.a != null && (
            <span className="text-[9px] text-gray-600 flex-shrink-0">({seed.a})</span>
          )}
          {aWon && <span className="text-[9px] text-emerald-400 flex-shrink-0">W</span>}
          <span className="text-xs truncate">{teamName(teamA)}</span>
        </div>
        {hasResult && (
          <span className={`text-sm font-bold flex-shrink-0 ${aWon ? 'text-emerald-400' : ''}`}>
            {pointsA}
          </span>
        )}
      </div>

      <div className="border-t border-gray-800 my-0.5" />

      {/* Team B */}
      <div
        className={`flex items-center justify-between py-1 gap-2 ${
          bWon ? 'text-white' : hasResult ? 'text-gray-500' : 'text-gray-300'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.b != null && (
            <span className="text-[9px] text-gray-600 flex-shrink-0">({seed.b})</span>
          )}
          {bWon && <span className="text-[9px] text-emerald-400 flex-shrink-0">W</span>}
          <span className="text-xs truncate">{teamName(teamB)}</span>
        </div>
        {hasResult && (
          <span className={`text-sm font-bold flex-shrink-0 ${bWon ? 'text-emerald-400' : ''}`}>
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
    <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-3 min-w-[180px] opacity-80">
      <span className="text-[10px] text-gray-500 block mb-2">{label}</span>
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-[9px] text-gray-600">({seedA})</span>
        <span className="text-xs text-gray-300 truncate">
          {teamA?.display_name ?? 'TBD'}
        </span>
      </div>
      <div className="border-t border-gray-800 my-0.5" />
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-[9px] text-gray-600">({seedB})</span>
        <span className="text-xs text-gray-300 truncate">
          {teamB?.display_name ?? 'TBD'}
        </span>
      </div>
    </div>
  );
}

// ── Column of match cards with a header ──────────────────────────────────

function RoundColumn({ title, children }) {
  return (
    <div className="flex flex-col gap-3 min-w-[196px]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest text-center">
        {title}
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center self-center text-gray-700 text-lg px-1 flex-shrink-0">
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
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading bracket…
      </div>
    );
  }

  const hasMatches = matches.length > 0;
  const hasEnoughStandings = standings.length >= 8;

  // Group actual matches by bracket + round
  function getMatch(bracket, round, label) {
    return matches.find(
      (m) => m.bracket === bracket && m.round === round && m.match_label === label
    ) ?? null;
  }

  // Helper to build team + points props from a match row
  function matchProps(m) {
    if (!m) return { teamA: null, teamB: null, pointsA: null, pointsB: null, winnerId: null };
    return {
      teamA: m.team_a,
      teamB: m.team_b,
      pointsA: m.team_a_points,
      pointsB: m.team_b_points,
      winnerId: m.winner_id,
      placement: m.placement,
    };
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Bracket</h1>
        <p className="text-gray-400 text-sm mt-0.5">Knockout tournament — H2H matchday points</p>
      </div>

      {/* ── Not seeded yet ── */}
      {!hasMatches && !hasEnoughStandings && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-300 font-semibold">Bracket not seeded yet</p>
          <p className="text-gray-500 text-sm mt-1">
            The knockout bracket is set once the league stage (4 matchdays) is complete.
          </p>
        </div>
      )}

      {/* ── Seeded preview (standings exist but no DB matches yet) ── */}
      {!hasMatches && hasEnoughStandings && (
        <>
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-3 text-sm text-yellow-400">
            Preview based on current standings — bracket locks when league stage is finalised.
          </div>

          {/* Championship preview */}
          <section>
            <h2 className="text-base font-bold text-white mb-4">
              Championship Bracket
              <span className="ml-2 text-sm text-gray-500 font-normal">(Top 8)</span>
            </h2>
            {(() => {
              const champMatches = generateChampionshipBracket(standings);
              return (
                <div className="flex items-start gap-2 overflow-x-auto pb-2">
                  <RoundColumn title="Round 1">
                    {champMatches.map((m, i) => (
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
                  <RoundColumn title="Round 2">
                    <PreviewMatchCard label="Semi A" teamA={null} teamB={null} seedA="WA" seedB="WB" />
                    <PreviewMatchCard label="Semi B" teamA={null} teamB={null} seedA="WC" seedB="WD" />
                    <PreviewMatchCard label="5/6" teamA={null} teamB={null} seedA="LA" seedB="LB" />
                    <PreviewMatchCard label="7/8" teamA={null} teamB={null} seedA="LC" seedB="LD" />
                  </RoundColumn>
                  <Connector />
                  <RoundColumn title="Round 3">
                    <PreviewMatchCard label="Final" teamA={null} teamB={null} seedA="W Semi A" seedB="W Semi B" />
                    <PreviewMatchCard label="3rd Place" teamA={null} teamB={null} seedA="L Semi A" seedB="L Semi B" />
                    <PreviewMatchCard label="5th Place" teamA={null} teamB={null} seedA="W 5/6" seedB="L 5/6" />
                    <PreviewMatchCard label="7th Place" teamA={null} teamB={null} seedA="W 7/8" seedB="L 7/8" />
                  </RoundColumn>
                </div>
              );
            })()}
          </section>

          {/* Relegation preview */}
          {standings.length >= 12 && (
            <section>
              <h2 className="text-base font-bold text-white mb-4">
                Relegation Bracket
                <span className="ml-2 text-sm text-gray-500 font-normal">(Bottom 4)</span>
              </h2>
              {(() => {
                const relMatches = generateRelegationBracket(standings);
                return (
                  <div className="flex items-start gap-2 overflow-x-auto pb-2">
                    <RoundColumn title="Round 1">
                      {relMatches.map((m, i) => (
                        <PreviewMatchCard
                          key={m.label}
                          label={m.label}
                          teamA={m.teamA}
                          teamB={m.teamB}
                          seedA={[9, 10][i]}
                          seedB={[12, 11][i]}
                        />
                      ))}
                    </RoundColumn>
                    <Connector />
                    <RoundColumn title="Round 2">
                      <PreviewMatchCard label="9th Place" teamA={null} teamB={null} seedA="WX" seedB="WY" />
                      <PreviewMatchCard label="11th Place" teamA={null} teamB={null} seedA="LX" seedB="LY" />
                    </RoundColumn>
                  </div>
                );
              })()}
            </section>
          )}
        </>
      )}

      {/* ── Actual bracket from DB ── */}
      {hasMatches && (
        <>
          {/* Championship */}
          <section>
            <h2 className="text-base font-bold text-white mb-4">
              Championship Bracket
              <span className="ml-2 text-sm text-gray-500 font-normal">(Top 8)</span>
            </h2>
            <div className="flex items-start gap-2 overflow-x-auto pb-3">
              {/* Round 1 */}
              <RoundColumn title="Round 1">
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

              {/* Round 2 */}
              <RoundColumn title="Round 2">
                {[
                  { label: 'Semi A', bracket: 'championship' },
                  { label: 'Semi B', bracket: 'championship' },
                  { label: '5/6 Match', bracket: 'losers' },
                  { label: '7/8 Match', bracket: 'losers' },
                ].map(({ label, bracket }) => {
                  const m = getMatch(bracket, 2, label);
                  return <MatchCard key={label} label={label} {...matchProps(m)} />;
                })}
              </RoundColumn>

              <Connector />

              {/* Round 3 */}
              <RoundColumn title="Final">
                {[
                  { label: 'Final', bracket: 'championship' },
                  { label: '3rd Place', bracket: 'championship' },
                  { label: '5th Place', bracket: 'losers' },
                  { label: '7th Place', bracket: 'losers' },
                ].map(({ label, bracket }) => {
                  const m = getMatch(bracket, 3, label);
                  return <MatchCard key={label} label={label} {...matchProps(m)} />;
                })}
              </RoundColumn>
            </div>
          </section>

          {/* Relegation */}
          {matches.some((m) => m.bracket === 'relegation') && (
            <section>
              <h2 className="text-base font-bold text-white mb-4">
                Relegation Bracket
                <span className="ml-2 text-sm text-gray-500 font-normal">(Bottom 4)</span>
              </h2>
              <div className="flex items-start gap-2 overflow-x-auto pb-3">
                <RoundColumn title="Round 1">
                  {['Match X', 'Match Y'].map((label, i) => {
                    const m = getMatch('relegation', 1, label);
                    const seeds = [{ a: 9, b: 12 }, { a: 10, b: 11 }];
                    return (
                      <MatchCard key={label} label={label} seed={seeds[i]} {...matchProps(m)} />
                    );
                  })}
                </RoundColumn>

                <Connector />

                <RoundColumn title="Round 2">
                  {['9th Place', '11th Place'].map((label) => {
                    const m = getMatch('relegation', 2, label);
                    return <MatchCard key={label} label={label} {...matchProps(m)} />;
                  })}
                </RoundColumn>
              </div>
            </section>
          )}

          {/* Final placements summary */}
          {matches.some((m) => m.placement) && (
            <section>
              <h2 className="text-base font-bold text-white mb-4">Final Standings</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {matches
                  .filter((m) => m.placement && m.winner_id)
                  .sort((a, b) => {
                    const rank = (p) => parseInt(p?.match(/\d+/)?.[0] ?? 99);
                    return rank(a.placement) - rank(b.placement);
                  })
                  .map((m) => {
                    const winnerName =
                      m.winner?.users?.display_name ?? m.winner?.name ?? 'TBD';
                    const rank = m.placement?.match(/\d+/)?.[0];
                    return (
                      <div
                        key={m.id}
                        className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex items-center gap-3"
                      >
                        <span
                          className={`text-lg font-black flex-shrink-0 ${
                            rank === '1'
                              ? 'text-yellow-400'
                              : rank === '2'
                              ? 'text-gray-300'
                              : rank === '3'
                              ? 'text-orange-400'
                              : 'text-gray-500'
                          }`}
                        >
                          {rank === '1' ? '🏆' : `${rank}.`}
                        </span>
                        <span className="text-sm font-medium text-white truncate">
                          {winnerName}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── H2H scoring rules ── */}
      <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-400">H2H Scoring Rules</p>
        <p>Winner = higher matchday points. Tiebreaker: captain points → goals scored → league seed.</p>
        <p>Only current-round matchday points count — not cumulative season total.</p>
      </div>
    </div>
  );
}
