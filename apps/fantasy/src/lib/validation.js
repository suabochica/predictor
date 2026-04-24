import { LOCK_PRICE_THRESHOLD, TOTAL_BUDGET, MIN_BID_INCREMENT } from '../config/constants';

export function validateBid(bidAmount, playerPrice, currentHighBid) {
  if (bidAmount < playerPrice) {
    return { valid: false, error: `Minimum bid is ${playerPrice}M (base price)` };
  }
  if (currentHighBid && bidAmount < currentHighBid + MIN_BID_INCREMENT) {
    return {
      valid: false,
      error: `Bid must be at least ${(currentHighBid + MIN_BID_INCREMENT).toFixed(1)}M`,
    };
  }
  return { valid: true };
}

export function validateBudget(currentBudget, cost) {
  if (cost > currentBudget) {
    return { valid: false, error: `Insufficient budget. Available: ${currentBudget.toFixed(1)}M` };
  }
  return { valid: true };
}

export function validateLockedPlayerSwap(playerOut, playerIn) {
  if (playerIn.price > LOCK_PRICE_THRESHOLD) {
    return {
      valid: false,
      error: `Locked slot replacements must be ≤${LOCK_PRICE_THRESHOLD}M. ${playerIn.name} costs ${playerIn.price}M`,
    };
  }
  return { valid: true };
}

export function validateTeamBudget(players) {
  const total = players.reduce((sum, p) => sum + p.acquisition_price, 0);
  if (total > TOTAL_BUDGET) {
    return {
      valid: false,
      error: `Team total ${total.toFixed(1)}M exceeds budget of ${TOTAL_BUDGET}M`,
    };
  }
  return { valid: true };
}
