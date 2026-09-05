// `field` is the DB column name — used as a sort key and row index, never
// translated. `abbrev`/`label` are display-only, sourced from the `fantasy`
// i18n catalogue (see I18N_PLAN.md Phase 3 / Risk A).
export function getStatColumns(t) {
  return [
    { field: 'minutes',          abbrev: t('fantasy.statColumns.minutes.abbrev'),        label: t('fantasy.statColumns.minutes.label') },
    { field: 'goals',            abbrev: t('fantasy.statColumns.goals.abbrev'),           label: t('fantasy.statColumns.goals.label') },
    { field: 'assists',          abbrev: t('fantasy.statColumns.assists.abbrev'),         label: t('fantasy.statColumns.assists.label') },
    { field: 'shots_on_target',  abbrev: t('fantasy.statColumns.shotsOnTarget.abbrev'),   label: t('fantasy.statColumns.shotsOnTarget.label') },
    { field: 'shots_off_target', abbrev: t('fantasy.statColumns.shotsOffTarget.abbrev'),  label: t('fantasy.statColumns.shotsOffTarget.label') },
    { field: 'blocked_shots',    abbrev: t('fantasy.statColumns.blockedShots.abbrev'),    label: t('fantasy.statColumns.blockedShots.label') },
    { field: 'tackles',          abbrev: t('fantasy.statColumns.tackles.abbrev'),         label: t('fantasy.statColumns.tackles.label') },
    { field: 'interceptions',    abbrev: t('fantasy.statColumns.interceptions.abbrev'),   label: t('fantasy.statColumns.interceptions.label') },
    { field: 'passes',           abbrev: t('fantasy.statColumns.passes.abbrev'),          label: t('fantasy.statColumns.passes.label') },
    { field: 'crosses',          abbrev: t('fantasy.statColumns.crosses.abbrev'),         label: t('fantasy.statColumns.crosses.label') },
    { field: 'fouls_won',        abbrev: t('fantasy.statColumns.foulsWon.abbrev'),        label: t('fantasy.statColumns.foulsWon.label') },
    { field: 'fouls_conceded',   abbrev: t('fantasy.statColumns.foulsConceded.abbrev'),   label: t('fantasy.statColumns.foulsConceded.label') },
    { field: 'offsides',         abbrev: t('fantasy.statColumns.offsides.abbrev'),        label: t('fantasy.statColumns.offsides.label') },
    { field: 'penalties_won',    abbrev: t('fantasy.statColumns.penaltiesWon.abbrev'),    label: t('fantasy.statColumns.penaltiesWon.label') },
    { field: 'saves',            abbrev: t('fantasy.statColumns.saves.abbrev'),           label: t('fantasy.statColumns.saves.label') },
    { field: 'penalty_saves',    abbrev: t('fantasy.statColumns.penaltySaves.abbrev'),    label: t('fantasy.statColumns.penaltySaves.label') },
    { field: 'penalty_misses',   abbrev: t('fantasy.statColumns.penaltyMisses.abbrev'),   label: t('fantasy.statColumns.penaltyMisses.label') },
    { field: 'goals_conceded',   abbrev: t('fantasy.statColumns.goalsConceded.abbrev'),   label: t('fantasy.statColumns.goalsConceded.label') },
    { field: 'yellow_cards',     abbrev: t('fantasy.statColumns.yellowCards.abbrev'),     label: t('fantasy.statColumns.yellowCards.label') },
    { field: 'red_cards',        abbrev: t('fantasy.statColumns.redCards.abbrev'),        label: t('fantasy.statColumns.redCards.label') },
    { field: 'own_goals',        abbrev: t('fantasy.statColumns.ownGoals.abbrev'),        label: t('fantasy.statColumns.ownGoals.label') },
    { field: 'clean_sheets',     abbrev: t('fantasy.statColumns.cleanSheets.abbrev'),     label: t('fantasy.statColumns.cleanSheets.label') },
  ];
}
