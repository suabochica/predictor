export const MAX_SQUAD_SIZE = 15;
export const TOTAL_BUDGET = 105.0;
export const AUCTION_CUSHION = 5.0;
export const MIN_BID_INCREMENT = 0.3;
export const DEFAULT_ROUND_DURATION_SECONDS = 180;
export const MAX_LEAGUE_PARTICIPANTS = 12;

export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export const SQUAD_REQUIREMENTS = {
  GK: { squad: 2, minOnField: 1, maxOnField: 1 },
  DEF: { squad: 5, minOnField: 3, maxOnField: 5 },
  MID: { squad: 5, minOnField: 3, maxOnField: 5 },
  FWD: { squad: 3, minOnField: 1, maxOnField: 3 },
};

// Per-matchday transfer allowances (preseason = null = unlimited)
export const TRANSFER_CAP_ROUND_ROBIN = 2;
export const TRANSFER_CAP_KNOCKOUT = 5;

export const MIN_GOALKEEPERS = 1;
export const LOCK_LEAD_MINUTES = 10;

export const AUCTION_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

export const AUTO_BID_DELAY_SECONDS = 90;
export const MAX_PROXY_TARGETS = 30;
