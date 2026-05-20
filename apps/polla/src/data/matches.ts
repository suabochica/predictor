import type { Match } from '../types';

/**
 * Country data with emoji flags for all 48 FIFA World Cup 2026 qualified teams.
 * Codes are FIFA trigrammes.
 */
export const countries: Record<string, { name: string; flag: string }> = {
  ALG: { name: 'Algeria', flag: '🇩🇿' },
  ARG: { name: 'Argentina', flag: '🇦🇷' },
  AUS: { name: 'Australia', flag: '🇦🇺' },
  AUT: { name: 'Austria', flag: '🇦🇹' },
  BEL: { name: 'Belgium', flag: '🇧🇪' },
  BIH: { name: 'Bosnia & Herz.', flag: '🇧🇦' },
  BRA: { name: 'Brazil', flag: '🇧🇷' },
  CAN: { name: 'Canada', flag: '🇨🇦' },
  CIV: { name: 'Ivory Coast', flag: '🇨🇮' },
  COD: { name: 'DR Congo', flag: '🇨🇩' },
  COL: { name: 'Colombia', flag: '🇨🇴' },
  CPV: { name: 'Cape Verde', flag: '🇨🇻' },
  CRO: { name: 'Croatia', flag: '🇭🇷' },
  CUW: { name: 'Curaçao', flag: '🇨🇼' },
  CZE: { name: 'Czech Republic', flag: '🇨🇿' },
  ECU: { name: 'Ecuador', flag: '🇪🇨' },
  EGY: { name: 'Egypt', flag: '🇪🇬' },
  ENG: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  ESP: { name: 'Spain', flag: '🇪🇸' },
  FRA: { name: 'France', flag: '🇫🇷' },
  GER: { name: 'Germany', flag: '🇩🇪' },
  GHA: { name: 'Ghana', flag: '🇬🇭' },
  HAI: { name: 'Haiti', flag: '🇭🇹' },
  IRN: { name: 'Iran', flag: '🇮🇷' },
  IRQ: { name: 'Iraq', flag: '🇮🇶' },
  JOR: { name: 'Jordan', flag: '🇯🇴' },
  JPN: { name: 'Japan', flag: '🇯🇵' },
  KOR: { name: 'South Korea', flag: '🇰🇷' },
  KSA: { name: 'Saudi Arabia', flag: '🇸🇦' },
  MAR: { name: 'Morocco', flag: '🇲🇦' },
  MEX: { name: 'Mexico', flag: '🇲🇽' },
  NED: { name: 'Netherlands', flag: '🇳🇱' },
  NOR: { name: 'Norway', flag: '🇳🇴' },
  NZL: { name: 'New Zealand', flag: '🇳🇿' },
  PAN: { name: 'Panama', flag: '🇵🇦' },
  PAR: { name: 'Paraguay', flag: '🇵🇾' },
  POR: { name: 'Portugal', flag: '🇵🇹' },
  QAT: { name: 'Qatar', flag: '🇶🇦' },
  RSA: { name: 'South Africa', flag: '🇿🇦' },
  SCO: { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  SEN: { name: 'Senegal', flag: '🇸🇳' },
  SUI: { name: 'Switzerland', flag: '🇨🇭' },
  SWE: { name: 'Sweden', flag: '🇸🇪' },
  TUN: { name: 'Tunisia', flag: '🇹🇳' },
  TUR: { name: 'Turkey', flag: '🇹🇷' },
  URU: { name: 'Uruguay', flag: '🇺🇾' },
  USA: { name: 'USA', flag: '🇺🇸' },
  UZB: { name: 'Uzbekistan', flag: '🇺🇿' },
};

// Matches are now stored in Supabase (matches table).
// This array is kept as a fallback for offline development.
export const matches: Match[] = [];
