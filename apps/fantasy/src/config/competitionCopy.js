/**
 * Copy that describes the *real* tournament a competition is played on top of:
 * how fantasy rounds map onto actual stages, and how the tournament is named in
 * prose. None of it is derivable from the `competitions` row — `stage_labels`
 * lists the stages but says nothing about which fantasy round rides on which,
 * and no column holds a natural-language name with its article.
 *
 * Keyed by slug so the World Cup archive keeps its exact wording, while a
 * competition with no entry yet falls back to neutral phrasing and simply omits
 * the mapping tables rather than describing a tournament it isn't. Fill an entry
 * in once a competition's real format is known.
 *
 * Locale is nested *inside* each slug: `calendarRows`, `knockoutRealStages` and
 * `bracketSubtitles` are facts about a real tournament, not generic app copy —
 * keeping them under the slug means adding a competition later is one entry in
 * one file. `leagueMatchdayCount` and the footer dates sit outside the locale
 * split since they're locale-independent data, not copy (see I18N_PLAN.md
 * Phase 5, Risk A: an earlier version derived this count by parsing
 * `calendarRows`' Spanish text, which silently broke under English).
 */
const BY_SLUG = {
  'world-cup-2026': {
    // Footer competition-dates line. ISO; formatted at render (Footer.tsx).
    startDate: '2026-06-11',
    endDate: '2026-07-19',
    // Number of fantasy league-stage matchdays — drives Rules.jsx's league
    // section copy. Locale-independent by design (see file header).
    leagueMatchdayCount: 3,
    es: {
      tournament: 'el Mundial',
      tournamentPossessive: 'del Mundial',
      // Fantasy phase → real stage → participants still active.
      calendarRows: [
        ['Liga — Partidos jugados 1-3', 'Fase de grupos (Partidos jugados 1-3)', '12'],
        ['Eliminatoria — Cuartos', 'Dieciseisavos de final del Mundial', '8'],
        ['Eliminatoria — Semis', 'Octavos de final del Mundial', '4'],
        ['Eliminatoria — Final', 'Cuartos de final del Mundial', '2'],
      ],
      // One real stage per fantasy knockout round, in round order.
      knockoutRealStages: ['Dieciseisavos', 'Octavos', 'Cuartos de final'],
      // Bracket column subtitles, keyed by fantasy knockout round.
      bracketSubtitles: {
        1: 'Ronda de 32 del Mundial',
        2: 'Octavos de final del Mundial',
        3: 'Cuartos de final del Mundial',
      },
    },
    en: {
      tournament: 'the World Cup',
      tournamentPossessive: 'World Cup',
      calendarRows: [
        ['League — Matches played 1-3', 'Group stage (Matches played 1-3)', '12'],
        ['Knockout — Quarterfinals', 'World Cup round of 32', '8'],
        ['Knockout — Semifinals', 'World Cup round of 16', '4'],
        ['Knockout — Final', 'World Cup quarterfinals', '2'],
      ],
      knockoutRealStages: ['Round of 32', 'Round of 16', 'Quarterfinals'],
      bracketSubtitles: {
        1: 'World Cup round of 32',
        2: 'World Cup round of 16',
        3: 'World Cup quarterfinals',
      },
    },
  },
  'ucl-2026-27': {
    // Footer competition-dates line. Start = league-phase MD1
    // (matches_schedule.csv); end = the 2027 final, Estadio Metropolitano,
    // Madrid (uefa.com, confirmed 2026-09-02).
    startDate: '2026-09-08',
    endDate: '2027-06-05',
    // The real play-off round is fantasy MD9 and counts for the league table,
    // so the fantasy knockout is the standard 3-round, top-8 bracket.
    leagueMatchdayCount: 9,
    es: {
      tournament: 'la Champions',
      tournamentPossessive: 'de la Champions',
      calendarRows: [
        ['Liga — Jornada 1', 'Fase de liga (J1)', '8'],
        ['Liga — Jornada 2', 'Fase de liga (J2)', '8'],
        ['Liga — Jornada 3', 'Fase de liga (J3)', '8'],
        ['Liga — Jornada 4', 'Fase de liga (J4)', '8'],
        ['Liga — Jornada 5', 'Fase de liga (J5)', '8'],
        ['Liga — Jornada 6', 'Fase de liga (J6)', '8'],
        ['Liga — Jornada 7', 'Fase de liga (J7)', '8'],
        ['Liga — Jornada 8', 'Fase de liga (J8)', '8'],
        ['Liga — Jornada 9', 'Play-off de la Champions', '8'],
        ['Eliminatoria — Cuartos', 'Octavos de final de la Champions', '8'],
        ['Eliminatoria — Semis', 'Cuartos de final de la Champions', '4'],
        ['Eliminatoria — Final', 'Semifinales de la Champions', '2'],
      ],
      // One real stage per fantasy knockout round, in round order.
      knockoutRealStages: ['Octavos de final', 'Cuartos de final', 'Semifinales'],
      // Bracket column subtitles, keyed by fantasy knockout round.
      bracketSubtitles: {
        1: 'Octavos de final de la Champions',
        2: 'Cuartos de final de la Champions',
        3: 'Semifinales de la Champions',
      },
    },
    en: {
      tournament: 'the Champions League',
      tournamentPossessive: 'Champions League',
      calendarRows: [
        ['League — Matchday 1', 'League phase (MD1)', '8'],
        ['League — Matchday 2', 'League phase (MD2)', '8'],
        ['League — Matchday 3', 'League phase (MD3)', '8'],
        ['League — Matchday 4', 'League phase (MD4)', '8'],
        ['League — Matchday 5', 'League phase (MD5)', '8'],
        ['League — Matchday 6', 'League phase (MD6)', '8'],
        ['League — Matchday 7', 'League phase (MD7)', '8'],
        ['League — Matchday 8', 'League phase (MD8)', '8'],
        ['League — Matchday 9', 'Champions League play-off round', '8'],
        ['Knockout — Quarterfinals', 'Champions League round of 16', '8'],
        ['Knockout — Semifinals', 'Champions League quarterfinals', '4'],
        ['Knockout — Final', 'Champions League semifinals', '2'],
      ],
      knockoutRealStages: ['Round of 16', 'Quarterfinals', 'Semifinals'],
      bracketSubtitles: {
        1: 'Champions League round of 16',
        2: 'Champions League quarterfinals',
        3: 'Champions League semifinals',
      },
    },
  },
};

const FALLBACK_SHARED = {
  startDate: null,
  endDate: null,
  leagueMatchdayCount: null,
};

const FALLBACK_LOCALE = {
  es: {
    tournament: 'el torneo',
    tournamentPossessive: 'del torneo',
    calendarRows: null,
    knockoutRealStages: null,
    bracketSubtitles: null,
  },
  en: {
    tournament: 'the tournament',
    tournamentPossessive: 'tournament',
    calendarRows: null,
    knockoutRealStages: null,
    bracketSubtitles: null,
  },
};

export function competitionCopy(competition, lang = 'es') {
  const slugEntry = BY_SLUG[competition?.slug];
  return {
    ...FALLBACK_SHARED,
    ...(slugEntry ? { startDate: slugEntry.startDate, endDate: slugEntry.endDate, leagueMatchdayCount: slugEntry.leagueMatchdayCount } : {}),
    ...FALLBACK_LOCALE[lang],
    ...(slugEntry?.[lang] ?? {}),
  };
}
