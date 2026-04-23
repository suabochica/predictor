# Bug: Auction Winners Assigned Wrong Lock Status

## File
`src/context/AuctionContext.jsx` — lines 194–196

## Problem
When the auction resolves and players are assigned to winners, the `team_players` insert hardcodes:

```js
is_locked: false,
slot_type: 'free',
```

Auction-won players should be `is_locked: true` and `slot_type: 'locked'`, since only players priced ≤8.5M go through the auction and they are by definition locked players.

## Impact
Every auction-won player appears as a free-slot player in the database. This means the locked-swap transfer rule (replacement must be ≤8.5M) never triggers for them — users could replace an auction-won player with any price player during a transfer window, bypassing a core game rule.

## Fix
Change lines 194–196 in `AuctionContext.jsx`:

```js
// Before
is_locked: false,
acquisition_price: winner.bid_amount,
slot_type: 'free',

// After
is_locked: true,
acquisition_price: winner.bid_amount,
slot_type: 'locked',
```

## Context
- `LOCK_PRICE_THRESHOLD = 8.5` is defined in `src/config/constants.js`
- Transfer validation in `Transfers.jsx` checks `player.slot_type === 'locked'` to enforce the ≤8.5M replacement rule
- The `transfers` table records `transfer_type: 'locked_swap'` vs `'free_slot'` based on this flag
