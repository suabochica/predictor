import compositeScoringConfig from '../config/composite_scoring.json';
import { useCompetition } from '../context/CompetitionContext';
import { competitionCopy } from '../config/competitionCopy';
import { TRANSFER_CAP_ROUND_ROBIN, TRANSFER_CAP_KNOCKOUT } from '../config/constants';
import { useLang } from '@predictor/i18n/react';
import { formatDecimal } from '@predictor/i18n';
import RulesEs from '../components/rules/Rules.es';
import RulesEn from '../components/rules/Rules.en';

// DB column (snake_case) → fantasy.statColumns catalogue key. The composite
// bonus table reuses those labels instead of a second, slightly-differently
// worded set (see I18N_PLAN.md Phase 5).
const STAT_KEY_MAP = {
  shots_on_target: 'shotsOnTarget',
  shots_off_target: 'shotsOffTarget',
  blocked_shots: 'blockedShots',
  tackles: 'tackles',
  interceptions: 'interceptions',
  passes: 'passes',
  crosses: 'crosses',
  fouls_won: 'foulsWon',
  fouls_conceded: 'foulsConceded',
  offsides: 'offsides',
  penalties_won: 'penaltiesWon',
};

export default function HowToPlay() {
  const { competition } = useCompetition();
  const { lang, t } = useLang();
  const copy = competitionCopy(competition, lang);
  const money = (n) => formatDecimal(n, lang);
  const fmtWeight = (n) => (n > 0 ? `+${money(n)}` : money(n));

  const maxParticipants = competition?.max_participants ?? 12;
  const squadSize       = competition?.max_squad_size ?? 15;
  const budget          = money(competition?.budget ?? 105);
  const minIncrement    = money(competition?.min_bid_increment ?? 0.3);
  const leagueCap       = competition?.transfer_cap_league ?? TRANSFER_CAP_ROUND_ROBIN;
  const knockoutCap     = competition?.transfer_cap_knockout ?? TRANSFER_CAP_KNOCKOUT;
  const isH2H           = competition?.group_format === 'h2h';
  const h2hWinPts        = money(competition?.h2h_win_points ?? 3.0);
  const h2hDrawPts       = money(competition?.h2h_draw_points ?? 1.0);
  const h2hNarrowLossPts = money(competition?.h2h_narrow_loss_points ?? 0.5);
  const h2hNarrowMargin  = money(competition?.h2h_narrow_loss_margin ?? 5.0);
  // Locale-independent — see competitionCopy.js and I18N_PLAN.md Phase 5 Risk
  // A: an earlier version parsed calendarRows' Spanish text for this, which
  // silently broke under English.
  const leagueMatchdayCount = copy.leagueMatchdayCount ?? 3;
  const eliminatedCount = maxParticipants - 8;

  const compositeRows = Object.entries(compositeScoringConfig.bonuses).map(([col, weights]) => ({
    key: col,
    label: t(`fantasy.statColumns.${STAT_KEY_MAP[col]}.label`),
    GK: fmtWeight(weights.GK),
    DEF: fmtWeight(weights.DEF),
    MID: fmtWeight(weights.MID),
    FWD: fmtWeight(weights.FWD),
  }));

  const props = {
    competitionName: competition?.name,
    maxParticipants,
    squadSize,
    budget,
    minIncrement,
    knockoutCap,
    leagueCap,
    isH2H,
    h2hWinPts,
    h2hDrawPts,
    h2hNarrowLossPts,
    h2hNarrowMargin,
    leagueMatchdayCount,
    eliminatedCount,
    copy,
    compositeRows,
  };

  return lang === 'en' ? <RulesEn {...props} /> : <RulesEs {...props} />;
}
