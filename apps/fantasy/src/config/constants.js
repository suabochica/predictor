export const MAX_SQUAD_SIZE = 15;
export const MAX_LOCKED_PLAYERS = 10;
export const MIN_LOCKED_PLAYERS = 8;
export const LOCK_PRICE_THRESHOLD = 8.5;
export const TOTAL_BUDGET = 105.0;
export const AUCTION_CUSHION = 5.0;
export const MAX_SIMULTANEOUS_BIDS = 10;
export const MIN_BID_INCREMENT = 0.3;
export const DEFAULT_ROUND_DURATION_SECONDS = 180;
export const MAX_LEAGUE_PARTICIPANTS = 12;

export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export const VALID_FORMATIONS = [
  '3-4-3',
  '3-5-2',
  '4-3-3',
  '4-4-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
];

export const SQUAD_REQUIREMENTS = {
  GK: { squad: 2, minOnField: 1, maxOnField: 1 },
  DEF: { squad: 5, minOnField: 3, maxOnField: 5 },
  MID: { squad: 5, minOnField: 3, maxOnField: 5 },
  FWD: { squad: 3, minOnField: 1, maxOnField: 3 },
};

export const TRANSFER_WINDOWS = [
  { window: 1, maxTransfers: 7, label: 'After R32, before R16' },
  { window: 2, maxTransfers: 3, label: 'After R16, before QF' },
  { window: 3, maxTransfers: 3, label: 'After QF, before SF' },
];

export const AUCTION_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};
