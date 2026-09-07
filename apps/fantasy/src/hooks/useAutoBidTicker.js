import { useEffect, useRef } from 'react';
import { AUCTION_STATUSES, AUTO_BID_DELAY_SECONDS } from '../config/constants';
import { parseDbTimestamp } from '../lib/utils';

/**
 * Watches a live auction round and asks the server to run the auto-bid ("Pista
 * de Subasta") pass once the round reaches its half-point.
 *
 * This used to live inline in `Admin.jsx`, which meant the pass ran only while
 * one specific browser — the admin's — happened to have that page mounted. The
 * UCL 2026-27 round 1 got no auto-bids at all because the admin started the
 * round and closed the tab. Mounting this on every participant's Auction page
 * as well makes the trigger distributed instead of single-homed.
 *
 * Two things keep that from turning into N duplicate passes:
 *
 *   - `run_due_auto_bids` (migration 072) takes an advisory lock and stamps
 *     `auto_bids_ran_for_round`. It is the source of truth for "already ran".
 *   - `firedRef` below is a local courtesy only: it stops one tab hammering the
 *     RPC every second after it has fired. It cannot dedupe across browsers and
 *     resets on every page load, so it must never be the only guard.
 *
 * Callers pass `runDueAutoBids` from their own `useAuction()`, so the hook
 * follows whichever competition that provider is scoped to. It is called from
 * the pages rather than from `AuctionContext` because `Admin.jsx` mounts a
 * *second* `AuctionProvider` for the administered competition, and a
 * context-level ticker would double-mount there.
 */
export function useAutoBidTicker(auctionState, runDueAutoBids) {
  const firedRef = useRef({});

  // Held in a ref, not a dep: `runDueAutoBids` is recreated on every render of
  // AuctionProvider, and depending on it would tear down and restart the 1s
  // interval on every render.
  const runRef = useRef(runDueAutoBids);
  useEffect(() => { runRef.current = runDueAutoBids; }, [runDueAutoBids]);

  const status         = auctionState?.status;
  const round          = auctionState?.current_round;
  const startedAt      = auctionState?.round_started_at;
  const durationSecs   = auctionState?.round_duration_seconds;

  useEffect(() => {
    if (status !== AUCTION_STATUSES.ACTIVE || !startedAt) return;

    const startedMs = parseDbTimestamp(startedAt)?.getTime();
    if (!startedMs) return;

    // min(90s, duration/2): identical to the old flat 90s at UCL's 180s rounds,
    // but on a shorter round it stays inside the window instead of firing after
    // expiry. Must match guard 5 in `run_due_auto_bids`.
    const thresholdSecs = Math.min(AUTO_BID_DELAY_SECONDS, (durationSecs ?? 0) / 2);
    const guardKey = `${round}-${startedAt}`;

    let cancelled = false;

    const checkAndFire = async () => {
      if (cancelled || firedRef.current[guardKey]) return;
      const elapsed = (Date.now() - startedMs) / 1000;
      if (elapsed < thresholdSecs) return;
      firedRef.current[guardKey] = true;
      // The server answers a too-early / already-ran / expired call with a
      // `note`, not an error, so there is nothing to surface in the normal case.
      await runRef.current?.();
    };

    checkAndFire();
    const interval = setInterval(() => {
      if (firedRef.current[guardKey]) { clearInterval(interval); return; }
      checkAndFire();
    }, 1000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [status, round, startedAt, durationSecs]);
}
