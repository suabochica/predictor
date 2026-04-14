import type { Match } from '../types';

// Country data with emoji flags for World Cup 2026
export const countries: Record<string, { name: string; flag: string }> = {
  ARG: { name: 'Argentina', flag: '🇦🇷' },
  AUS: { name: 'Australia', flag: '🇦🇺' },
  BEL: { name: 'Belgium', flag: '🇧🇪' },
  BRA: { name: 'Brazil', flag: '🇧🇷' },
  CAN: { name: 'Canada', flag: '🇨🇦' },
  CMR: { name: 'Cameroon', flag: '🇨🇲' },
  CHI: { name: 'Chile', flag: '🇨🇱' },
  COL: { name: 'Colombia', flag: '🇨🇴' },
  CRC: { name: 'Costa Rica', flag: '🇨🇷' },
  CRO: { name: 'Croatia', flag: '🇭🇷' },
  DEN: { name: 'Denmark', flag: '🇩🇰' },
  ECU: { name: 'Ecuador', flag: '🇪🇨' },
  ENG: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  FRA: { name: 'France', flag: '🇫🇷' },
  GER: { name: 'Germany', flag: '🇩🇪' },
  GHA: { name: 'Ghana', flag: '🇬🇭' },
  IRN: { name: 'Iran', flag: '🇮🇷' },
  JPN: { name: 'Japan', flag: '🇯🇵' },
  KOR: { name: 'South Korea', flag: '🇰🇷' },
  MEX: { name: 'Mexico', flag: '🇲🇽' },
  MAR: { name: 'Morocco', flag: '🇲🇦' },
  NED: { name: 'Netherlands', flag: '🇳🇱' },
  NZL: { name: 'New Zealand', flag: '🇳🇿' },
  NGA: { name: 'Nigeria', flag: '🇳🇬' },
  POL: { name: 'Poland', flag: '🇵🇱' },
  POR: { name: 'Portugal', flag: '🇵🇹' },
  QAT: { name: 'Qatar', flag: '🇶🇦' },
  SAU: { name: 'Saudi Arabia', flag: '🇸🇦' },
  SEN: { name: 'Senegal', flag: '🇸🇳' },
  SRB: { name: 'Serbia', flag: '🇷🇸' },
  ESP: { name: 'Spain', flag: '🇪🇸' },
  SUI: { name: 'Switzerland', flag: '🇨🇭' },
  URU: { name: 'Uruguay', flag: '🇺🇾' },
  USA: { name: 'USA', flag: '🇺🇸' },
  WAL: { name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
};

// Sample World Cup 2026 matches (group stage)
export const matches: Match[] = [
  // Group Stage - Matchday 1 (June 11, 2026)
  { match_id: 'M01', team_a: 'MEX', team_b: 'CAN', match_date: '2026-06-11', group: 'A', status: 'upcoming' },
  { match_id: 'M02', team_a: 'USA', team_b: 'MEX', match_date: '2026-06-11', group: 'B', status: 'upcoming' },

  // Matchday 2 (June 12, 2026)
  { match_id: 'M03', team_a: 'ARG', team_b: 'BRA', match_date: '2026-06-12', group: 'C', status: 'upcoming' },
  { match_id: 'M04', team_a: 'ENG', team_b: 'FRA', match_date: '2026-06-12', group: 'D', status: 'upcoming' },

  // Matchday 3 (June 13, 2026)
  { match_id: 'M05', team_a: 'GER', team_b: 'ESP', match_date: '2026-06-13', group: 'E', status: 'upcoming' },
  { match_id: 'M06', team_a: 'POR', team_b: 'NED', match_date: '2026-06-13', group: 'F', status: 'upcoming' },

  // Matchday 4 (June 14, 2026)
  { match_id: 'M07', team_a: 'BEL', team_b: 'CRO', match_date: '2026-06-14', group: 'G', status: 'upcoming' },
  { match_id: 'M08', team_a: 'URU', team_b: 'COL', match_date: '2026-06-14', group: 'H', status: 'upcoming' },

  // Matchday 5 (June 15, 2026)
  { match_id: 'M09', team_a: 'JPN', team_b: 'KOR', match_date: '2026-06-15', group: 'A', status: 'upcoming' },
  { match_id: 'M10', team_a: 'MAR', team_b: 'SEN', match_date: '2026-06-15', group: 'B', status: 'upcoming' },
];