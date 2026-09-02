import { useEffect, useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { computeH2HRecords, rankStandings } from '../lib/standings';

export function useStandings() {
  const { db, competition } = useCompetition();
  const [standings, setStandings] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  const format = competition?.group_format ?? 'cumulative';

  useEffect(() => {
    fetchAll();
  }, [format]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const isH2H = format === 'h2h';

    const [teamsRes, standingsRes, matchdaysRes, fixturesRes] = await Promise.all([
      db
        .from('teams')
        .select('id, name, user_id, users(display_name)'),
      db
        .from('fantasy_standings')
        .select('team_id, matchday_id, matchday_points, total_points, goals_scored, captain_points'),
      db
        .from('matchdays')
        .select('id, name, wc_stage, phase, sequence, is_completed')
        .order('sequence'),
      isH2H
        ? db.from('group_fixtures').select('id, matchday_id, team_a_id, team_b_id, slot').order('slot')
        : Promise.resolve({ data: [] }),
    ]);

    const teams = teamsRes.data ?? [];
    const standingsData = standingsRes.data ?? [];
    const matchdaysData = matchdaysRes.data ?? [];
    const fixturesData = fixturesRes.data ?? [];

    setMatchdays(matchdaysData);
    setFixtures(fixturesData);

    // The leaderboard ranks teams by the league-phase matchdays only — knockout
    // rounds are H2H-only and must never enter the league total. No `.slice(0, 3)`:
    // `phase` names the set exactly, and hard-coding 3 would have truncated UCL's
    // 8-matchday league phase. Same rule the Leaderboard uses.
    const leagueIds = new Set(
      matchdaysData.filter((md) => md.phase === 'league').map((md) => md.id)
    );

    // Seed every enrolled team with 0 points
    const byTeam = {};
    for (const t of teams) {
      byTeam[t.id] = {
        team_id: t.id,
        team_name: t.name,
        user_id: t.user_id,
        display_name: t.users?.display_name ?? t.name ?? 'Unknown',
        total_points: 0,
        goals_scored: 0,
        captain_points: 0,
        matchday_points: {}, // matchday_id -> points for that matchday
      };
    }

    // pointsByMatchdayTeam for computeH2HRecords: only league matchdays, and
    // presence of the team_id key is what "has a fantasy_standings row" means.
    const pointsByMatchdayTeam = {};

    // Overlay actual scores where available
    for (const row of standingsData) {
      if (!byTeam[row.team_id]) continue;
      // Keep every matchday's points in the per-md map (columns/popups render
      // only the league columns; knockout entries are harmless here).
      byTeam[row.team_id].matchday_points[row.matchday_id] = row.matchday_points;
      // Only league rows feed the leaderboard total/goals. The stored
      // total_points is cumulative AND polluted (computeStandingsForMatchday
      // folds in every other matchday incl. knockout), so we sum the group
      // matchday_points ourselves instead of trusting it.
      if (!leagueIds.has(row.matchday_id)) continue;
      byTeam[row.team_id].total_points += row.matchday_points ?? 0;
      byTeam[row.team_id].goals_scored += row.goals_scored ?? 0;
      byTeam[row.team_id].captain_points += row.captain_points ?? 0;

      if (isH2H) {
        pointsByMatchdayTeam[row.matchday_id] ??= {};
        pointsByMatchdayTeam[row.matchday_id][row.team_id] = row.matchday_points;
      }
    }

    // matchday_points is numeric(8,1); round the summed floats to 1 decimal.
    for (const t of Object.values(byTeam)) {
      t.total_points = Math.round(t.total_points * 10) / 10;
      t.captain_points = Math.round(t.captain_points * 10) / 10;
    }

    if (isH2H) {
      const cfg = {
        h2h_win_points: competition.h2h_win_points,
        h2h_draw_points: competition.h2h_draw_points,
        h2h_narrow_loss_points: competition.h2h_narrow_loss_points,
        h2h_narrow_loss_margin: competition.h2h_narrow_loss_margin,
      };
      const records = computeH2HRecords(fixturesData, pointsByMatchdayTeam, cfg);
      for (const [teamId, rec] of Object.entries(records)) {
        if (!byTeam[teamId]) continue;
        Object.assign(byTeam[teamId], rec);
      }
      // Teams with no played fixtures yet still need the h2h fields present.
      for (const t of Object.values(byTeam)) {
        t.played ??= 0;
        t.won ??= 0;
        t.drawn ??= 0;
        t.lost ??= 0;
        t.h2h_points ??= 0;
      }
    }

    const sorted = rankStandings(Object.values(byTeam), format);

    setStandings(sorted);
    setLoading(false);
  }

  return { standings, matchdays, fixtures, format, loading, refresh: fetchAll };
}
