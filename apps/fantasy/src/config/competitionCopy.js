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
 */
const BY_SLUG = {
  'world-cup-2026': {
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
  'ucl-2026-27': {
    tournament: 'la Champions',
    tournamentPossessive: 'de la Champions',
    // Fantasy phase → real stage → participants still active.
    calendarRows: [
      ['Liga — Jornada 1', 'Fase de liga (J1)', '12'],
      ['Liga — Jornada 2', 'Fase de liga (J2)', '12'],
      ['Liga — Jornada 3', 'Fase de liga (J3)', '12'],
      ['Liga — Jornada 4', 'Fase de liga (J4)', '12'],
      ['Liga — Jornada 5', 'Fase de liga (J5)', '12'],
      ['Liga — Jornada 6', 'Fase de liga (J6)', '12'],
      ['Liga — Jornada 7', 'Fase de liga (J7)', '12'],
      ['Liga — Jornada 8', 'Fase de liga (J8)', '12'],
      ['Eliminatoria — Play-off', 'Play-off de la Champions', '8'],
      ['Eliminatoria — Cuartos', 'Octavos de final de la Champions', '8'],
      ['Eliminatoria — Semis', 'Cuartos de final de la Champions', '4'],
      ['Eliminatoria — Final', 'Semifinales de la Champions', '2'],
    ],
    // One real stage per fantasy knockout round, in round order.
    knockoutRealStages: ['Play-off', 'Octavos de final', 'Cuartos de final', 'Semifinales'],
    // Bracket column subtitles, keyed by fantasy knockout round.
    bracketSubtitles: {
      1: 'Play-off de la Champions',
      2: 'Octavos de final de la Champions',
      3: 'Cuartos de final de la Champions',
      4: 'Semifinales de la Champions',
    },
  },
};

const FALLBACK = {
  tournament: 'el torneo',
  tournamentPossessive: 'del torneo',
  calendarRows: null,
  knockoutRealStages: null,
  bracketSubtitles: null,
};

export function competitionCopy(competition) {
  return { ...FALLBACK, ...(BY_SLUG[competition?.slug] ?? {}) };
}
