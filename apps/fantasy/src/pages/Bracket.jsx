import { useEffect, useState } from 'react';
import { useKnockout } from '../hooks/useKnockout';
import { useStandings } from '../hooks/useStandings';
import { generateChampionshipBracket } from '../lib/brackets';
import TeamLineupModal from '../components/leaderboard/TeamLineupModal';
import MatchCard from '../components/bracket/MatchCard';
import { useCompetition } from '../context/CompetitionContext';
import { competitionCopy } from '../config/competitionCopy';

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
  const { db, competition } = useCompetition();
  const { matches, loading: matchesLoading } = useKnockout();
  const { standings, matchdays, loading: standingsLoading } = useStandings();
  // The real stages a fantasy round rides on are competition-specific copy; a
  // competition with none defined yet simply shows no subtitle.
  const subtitle = (round) => competitionCopy(competition).bracketSubtitles?.[round];
  const leagueMatchdays = matchdays.filter((md) => md.phase === 'league').length;
  const [viewing, setViewing] = useState(null); // { entry, matchdayId, matchdayName }
  // Live H2H points for unresolved, jornada-linked matches: `${mdId}:${teamId}` → matchday_points
  const [provStandings, setProvStandings] = useState({});

  useEffect(() => {
    const pairs = [];
    for (const m of matches) {
      if (m.winner_id == null && m.matchday_id != null) {
        if (m.team_a_id) pairs.push([m.matchday_id, m.team_a_id]);
        if (m.team_b_id) pairs.push([m.matchday_id, m.team_b_id]);
      }
    }
    if (pairs.length === 0) { setProvStandings({}); return; }
    const mdIds = [...new Set(pairs.map((p) => p[0]))];
    const teamIds = [...new Set(pairs.map((p) => p[1]))];
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('fantasy_standings')
        .select('team_id, matchday_id, matchday_points')
        .in('matchday_id', mdIds)
        .in('team_id', teamIds);
      if (cancelled) return;
      const map = {};
      for (const r of data ?? []) map[`${r.matchday_id}:${r.team_id}`] = r.matchday_points;
      setProvStandings(map);
    })();
    return () => { cancelled = true; };
  }, [matches]);

  const openTeam = (team, m) => {
    if (!team) return;
    setViewing({
      entry: {
        team_id: team.id,
        display_name: team.users?.display_name ?? team.name,
        team_name: team.name,
      },
      matchdayId: m?.matchday_id ?? null,
      matchdayName: m?.matchday?.name ?? null,
    });
  };

  if (matchesLoading || standingsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Cargando cuadro…
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
    // Unresolved but linked to a jornada → live provisional H2H from standings.
    if (!m.winner_id && m.matchday_id != null) {
      const pa = provStandings[`${m.matchday_id}:${m.team_a_id}`];
      const pb = provStandings[`${m.matchday_id}:${m.team_b_id}`];
      return {
        teamA: m.team_a,
        teamB: m.team_b,
        pointsA: pa ?? null,
        pointsB: pb ?? null,
        winnerId: null,
        provisional: pa != null || pb != null,
      };
    }
    // Resolved (final) or not yet linked → stored points / nothing.
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
        <h1 className="text-2xl font-bold text-primary">Cuadro</h1>
        <p className="text-secondary text-sm mt-0.5">Eliminación directa — puntos H2H por jornada</p>
      </div>

      {/* ── Not seeded yet ── */}
      {!hasMatches && !hasEnoughStandings && (
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <p className="text-secondary font-semibold">Cuadro no configurado aún</p>
          <p className="text-muted text-sm mt-1">
            El cuadro eliminatorio se define al completar la fase de liga ({leagueMatchdays} jornadas).
          </p>
        </div>
      )}

      {/* ── Seeded preview (standings exist but no DB matches yet) ── */}
      {!hasMatches && hasEnoughStandings && (
        <>
          <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 text-sm text-tertiary">
            Vista previa basada en posiciones actuales — el cuadro se bloquea al finalizar la fase de liga.
          </div>

          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            <RoundColumn title="Cuartos de final" subtitle={subtitle(1)}>
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
            <RoundColumn title="Semifinales" subtitle={subtitle(2)}>
              <PreviewMatchCard label="Semi A" teamA={null} teamB={null} seedA="GA" seedB="GB" />
              <PreviewMatchCard label="Semi B" teamA={null} teamB={null} seedA="GC" seedB="GD" />
            </RoundColumn>
            <Connector />
            <RoundColumn title="Final" subtitle={subtitle(3)}>
              <PreviewMatchCard label="Final" teamA={null} teamB={null} seedA="G Semi A" seedB="G Semi B" />
            </RoundColumn>
          </div>
        </>
      )}

      {/* ── Actual bracket from DB ── */}
      {hasMatches && (
        <>
          <div className="flex items-start gap-2 overflow-x-auto pb-3">
            {/* Round 1: Quarter-finals */}
            <RoundColumn title="Cuartos de final" subtitle={subtitle(1)}>
              {[{ key: 'Match A', display: 'Partido A' }, { key: 'Match B', display: 'Partido B' }, { key: 'Match C', display: 'Partido C' }, { key: 'Match D', display: 'Partido D' }].map(({ key, display }, i) => {
                const m = getMatch('championship', 1, key);
                const seeds = [{ a: 1, b: 8 }, { a: 4, b: 5 }, { a: 2, b: 7 }, { a: 3, b: 6 }];
                return (
                  <MatchCard
                    key={key}
                    label={display}
                    seed={seeds[i]}
                    onTeamClick={(team) => openTeam(team, m)}
                    {...matchProps(m)}
                  />
                );
              })}
            </RoundColumn>

            <Connector />

            {/* Round 2: Semi-finals */}
            <RoundColumn title="Semifinales" subtitle={subtitle(2)}>
              {['Semi A', 'Semi B'].map((label) => {
                const m = getMatch('championship', 2, label);
                return (
                  <MatchCard
                    key={label}
                    label={label}
                    onTeamClick={(team) => openTeam(team, m)}
                    {...matchProps(m)}
                  />
                );
              })}
            </RoundColumn>

            <Connector />

            {/* Round 3: Final */}
            <RoundColumn title="Final" subtitle={subtitle(3)}>
              {(() => {
                const m = getMatch('championship', 3, 'Final');
                return (
                  <MatchCard
                    label="Final"
                    onTeamClick={(team) => openTeam(team, m)}
                    {...matchProps(m)}
                  />
                );
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
                <h2 className="text-base font-bold text-primary mb-4">Clasificación final</h2>
                <div className="flex flex-col gap-2 max-w-xs">
                  <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                    <span className="text-lg font-black text-tertiary flex-shrink-0">🏆</span>
                    <div>
                      <p className="text-label-caps text-muted">Campeón</p>
                      <p className="text-sm font-medium text-primary">{teamName(champion)}</p>
                    </div>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                    <span className="text-sm font-black text-muted flex-shrink-0 w-6 text-center">2.</span>
                    <div>
                      <p className="text-label-caps text-muted">Subcampeón</p>
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
        <p className="font-semibold text-secondary">Reglas de puntuación H2H</p>
        <p>Ganador = más puntos en la jornada. Desempate: puntos del capitán → goles marcados → puesto en liga.</p>
        <p>Solo cuentan los puntos de la jornada actual — no el total acumulado de la temporada.</p>
      </div>

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
