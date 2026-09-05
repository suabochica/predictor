import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useCompetition } from './CompetitionContext';
import { createDb } from '../lib/db';
import { MAX_SQUAD_SIZE, MIN_BID_INCREMENT } from '../config/constants';

const AuctionContext = createContext(null);

/**
 * Auction state for ONE competition.
 *
 * By default that is the sidebar competition, from `useCompetition()` — the
 * player-facing binding, mounted once in `App.jsx`.
 *
 * `competitionId` overrides it: Admin mounts a second instance bound to the
 * panel's own selector, so the auction controls always act on the competition
 * the panel header names. Same pattern as `usePlayers(filters, dbOverride)`.
 * Both mount sites KEY the provider on that id, which is what lets the
 * subscribe effect below keep its `[]` dep array.
 *
 * `scope` only names the realtime channel. Two instances on the same
 * competition would otherwise share a topic and collide (see LeagueContext).
 */
export function AuctionProvider({ children, competitionId: overrideId = null, scope = 'app' }) {
  const {
    db: activeDb,
    competitionId: activeId,
    competition: activeCompetition,
    competitions,
  } = useCompetition();
  const competitionId = overrideId ?? activeId;
  const db = useMemo(
    () => (overrideId == null ? activeDb : createDb(overrideId)),
    [overrideId, activeDb]
  );
  const competition =
    overrideId == null
      ? activeCompetition
      : competitions.find((c) => c.id === overrideId) ?? null;
  // Squad size and bid increment are per-competition config (060); the constants
  // survive only as the fallback while a competition row is still resolving.
  const maxSquadSize = competition?.max_squad_size ?? MAX_SQUAD_SIZE;
  const minBidIncrement = Number(competition?.min_bid_increment ?? MIN_BID_INCREMENT);
  const [auctionState, setAuctionState] = useState(null);
  const [bids, setBids] = useState([]);
  const [ownedPlayerIds, setOwnedPlayerIds] = useState(new Set());
  const [playerOwners, setPlayerOwners] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuctionState();
    fetchBids();
    fetchOwnedPlayerIds();
    fetchPlayerOwners();

    // Every binding is filtered, not just the channel renamed: without the filter
    // the server pushes every row change on the table, and the auction_state
    // handler below would blindly replace this competition's state with another's.
    const rowFilter = `competition_id=eq.${competitionId}`;
    const channel = supabase
      .channel(`auction-${scope}-${competitionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auction_bids', filter: rowFilter },
        () => { fetchBids(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_bids', filter: rowFilter },
        () => { fetchBids(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_state', filter: rowFilter },
        (payload) => {
          setAuctionState(payload.new);
          fetchBids();
          fetchOwnedPlayerIds();
          fetchPlayerOwners();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_players', filter: rowFilter },
        () => {
          fetchOwnedPlayerIds();
          fetchPlayerOwners();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Fallback re-fetch when round counter advances in case the realtime handler fires late.
  useEffect(() => {
    if (!auctionState?.current_round) return;
    fetchBids();
    fetchOwnedPlayerIds();
  }, [auctionState?.current_round]);

  async function fetchAuctionState() {
    const { data } = await db.from('auction_state').select('*').order('id').limit(1).single();
    setAuctionState(data);
    setLoading(false);
  }

  async function fetchBids() {
    const { data } = await db
      .from('auction_bids')
      .select('*, players!auction_bids_player_id_fkey(name, position, price), users(display_name)')
      .order('created_at', { ascending: false });
    setBids(data ?? []);
  }

  async function fetchOwnedPlayerIds() {
    const { data } = await db.from('team_players').select('player_id');
    setOwnedPlayerIds(new Set((data ?? []).map((r) => r.player_id)));
  }

  async function fetchPlayerOwners() {
    const { data } = await db
      .from('team_players')
      .select('player_id, teams!team_players_team_id_fkey(name, user_id)');
    const map = new Map();
    for (const tp of data ?? []) {
      if (tp.teams) {
        map.set(tp.player_id, { teamName: tp.teams.name, userId: tp.teams.user_id });
      }
    }
    setPlayerOwners(map);
  }

  // Returns highest bid for a given player in the current round.
  // Tie-break: earliest created_at wins (first bidder).
  function getHighestBid(playerId) {
    const playerBids = bids.filter(
      (b) => b.player_id === playerId && b.round_number === auctionState?.current_round
    );
    if (!playerBids.length) return null;
    return playerBids.sort((a, b) =>
      a.bid_amount !== b.bid_amount
        ? b.bid_amount - a.bid_amount
        : new Date(a.created_at) - new Date(b.created_at)
    )[0];
  }

  // Returns the highest bid placed on a player in any PREVIOUS round where
  // they were not awarded (i.e., contested carry-over floor). Returns null if
  // no carry-over floor exists for this player.
  function getContestFloor(playerId) {
    if (ownedPlayerIds.has(playerId)) return null;
    const previousBids = bids.filter(
      (b) => b.player_id === playerId && b.round_number < (auctionState?.current_round ?? 1)
    );
    if (!previousBids.length) return null;
    return Math.max(...previousBids.map((b) => b.bid_amount));
  }

  // ── Admin controls ──────────────────────────────────────────────────────────

  async function updateAuctionState(updates) {
    const { error } = await db
      .from('auction_state')
      .update(updates)
      .eq('id', auctionState.id);
    // Refresh local state immediately so the admin's own page reflects the change
    // without waiting for the realtime echo (which then re-sets the same value).
    if (!error) await fetchAuctionState();
    return { error };
  }

  async function startAuction() {
    return updateAuctionState({
      status: 'active',
      current_round: 1,
      round_started_at: new Date().toISOString(),
    });
  }

  async function pauseAuction() {
    return updateAuctionState({ status: 'paused' });
  }

  async function resumeAuction() {
    return updateAuctionState({
      status: 'active',
      round_started_at: new Date().toISOString(),
    });
  }

  async function completeAuction() {
    return updateAuctionState({ status: 'completed' });
  }

  async function nextRound() {
    return updateAuctionState({
      current_round: auctionState.current_round + 1,
      round_started_at: new Date().toISOString(),
    });
  }

  // End the current round early: push round_started_at into the past so every
  // client's timer reads 0 (same end-state as a natural timeout). Bidding stops;
  // the round is NOT resolved — admin then runs Resolve & Next Round.
  async function endRound() {
    const duration = auctionState.round_duration_seconds ?? 0;
    const expired = new Date(Date.now() - (duration + 1) * 1000).toISOString();
    return updateAuctionState({ round_started_at: expired });
  }

  // Resolves the current round: marks winning bids, assigns players to teams,
  // and deducts acquisition cost from each winner's budget.
  // A player is only awarded if exactly ONE user bid on them this round.
  // Players with multiple bidders are contested and carry over to the next round.
  // Returns { resolved: [...], contested: [...], errors: [...] }
  async function resolveRound() {
    // Read fresh from the DB rather than React state: realtime may not have
    // delivered this round's bids (or a round advance) into local state yet,
    // which previously caused contested players to be lost on early/quick resolves.
    // Every read below reports its error instead of coalescing to `?? []`: a
    // failed read here otherwise leaves `roundBids` empty, the loop never runs,
    // and resolveRound() returns zero errors — which the caller reads as "nobody
    // bid this round" and advances the round, awarding nothing. That is exactly
    // how the UCL round-1 resolve silently no-op'd (the `players(...)` embed
    // below was missing the FK hint c535b2f added everywhere else, so PostgREST
    // rejected it as ambiguous — see migration 061's dual FKs).
    const { data: freshState, error: stateErr } = await db
      .from('auction_state').select('current_round').order('id').limit(1).single();
    if (stateErr) {
      return {
        resolved: [],
        contested: [],
        errors: [{ playerId: null, reason: `Could not read auction state: ${stateErr.message}` }],
      };
    }
    const round = freshState?.current_round ?? auctionState.current_round;

    const { data: freshBids, error: bidsErr } = await db
      .from('auction_bids')
      .select('*, players!auction_bids_player_id_fkey(name, position, price), users(display_name)')
      .eq('round_number', round);
    if (bidsErr) {
      return {
        resolved: [],
        contested: [],
        errors: [{ playerId: null, reason: `Could not read round ${round} bids: ${bidsErr.message}` }],
      };
    }
    const roundBids = freshBids ?? [];
    const playerIds = [...new Set(roundBids.map((b) => b.player_id))];

    // Highest bid for a player this round; tie-break earliest created_at (first bidder).
    const highestOf = (playerId) => {
      const pb = roundBids.filter((b) => b.player_id === playerId);
      if (!pb.length) return null;
      return pb.sort((a, b) =>
        a.bid_amount !== b.bid_amount
          ? b.bid_amount - a.bid_amount
          : new Date(a.created_at) - new Date(b.created_at)
      )[0];
    };

    const resolved  = [];
    const contested = [];
    const errors    = [];

    for (const playerId of playerIds) {
      // A throw anywhere below would otherwise abort the whole round mid-way,
      // leaving the players already handled awarded and the rest untouched with
      // nothing to show for it. Record it against this player and carry on; the
      // non-empty errors array stops the caller from advancing the round.
      try {
        // Skip players already resolved in a previous resolveRound() call.
        if (roundBids.some((b) => b.player_id === playerId && b.is_winning)) continue;

        const playerBids    = roundBids.filter((b) => b.player_id === playerId);
        const uniqueBidders = new Set(playerBids.map((b) => b.user_id));

        // Multiple bidders → contested, carry over to next round.
        if (uniqueBidders.size > 1) {
          const topBid = highestOf(playerId);
          contested.push({
            playerId,
            playerName: topBid?.players?.name ?? `Player #${playerId}`,
            amount: topBid?.bid_amount ?? 0,
          });
          if (topBid) {
            // Carry the top bid into the next round, owned by the top bidder.
            // upsert + ignoreDuplicates against auction_bids_unique_user_player_round
            // (migration 021) keeps a re-run of resolveRound() on the same round idempotent.
            const { error: coErr } = await db.from('auction_bids').upsert(
              {
                user_id: topBid.user_id,
                player_id: playerId,
                bid_amount: topBid.bid_amount,
                round_number: round + 1,
                is_carryover: true,
              },
              { onConflict: 'user_id,player_id,round_number', ignoreDuplicates: true }
            );
            if (coErr) errors.push({ playerId, reason: `Carry-over failed: ${coErr.message}` });
          }
          continue;
        }

        const winner = highestOf(playerId);
        if (!winner) continue;

        // 1. Mark winning bid
        const { error: bidErr } = await db
          .from('auction_bids')
          .update({ is_winning: true })
          .eq('id', winner.id);

        if (bidErr) {
          errors.push({ playerId, reason: `Bid update failed: ${bidErr.message}` });
          continue;
        }

        // 2. Look up winner's team
        const { data: team, error: teamErr } = await db
          .from('teams')
          .select('id, budget_remaining')
          .eq('user_id', winner.user_id)
          .single();

        if (teamErr || !team) {
          errors.push({ playerId, reason: 'Winner has no team registered.' });
          continue;
        }

        // 3. Safety net: skip if team already has a full squad. Also fetch positions for GK check.
        const { data: currentSquad, error: squadErr } = await db
          .from('team_players')
          .select('player_id, players(position)')
          .eq('team_id', team.id);

        if (squadErr) {
          errors.push({ playerId, reason: `Squad check failed: ${squadErr.message}` });
          continue;
        }

        const currentSquadSize = currentSquad?.length ?? 0;

        if (currentSquadSize >= maxSquadSize) {
          errors.push({ playerId, reason: `Squad is full (${maxSquadSize}/${maxSquadSize}) — player skipped.` });
          continue;
        }

        // GK safety net: if awarding a non-GK would fill the squad while the team has no GK, skip.
        if (winner.players?.position !== 'GK') {
          const hasGK = (currentSquad ?? []).some((tp) => tp.players?.position === 'GK');
          if (!hasGK && currentSquadSize + 1 >= maxSquadSize) {
            errors.push({ playerId, reason: `Squad would be full with no goalkeeper — player skipped.` });
            continue;
          }
        }

        // 4. Assign player to team (ignore if already assigned from a re-run)
        const { error: tpErr } = await db.from('team_players').upsert(
          {
            team_id: team.id,
            player_id: playerId,
            acquisition_price: winner.bid_amount,
          },
          { onConflict: 'team_id,player_id', ignoreDuplicates: true }
        );

        if (tpErr) {
          errors.push({ playerId, reason: `Team assignment failed: ${tpErr.message}` });
          continue;
        }

        // 5. Persist winning bid as current_price (price never reverts after auction)
        const { error: priceErr } = await db
          .from('players')
          .update({ current_price: winner.bid_amount })
          .eq('id', playerId);

        if (priceErr) {
          errors.push({ playerId, reason: `Price update failed: ${priceErr.message}` });
        }

        // 6. Deduct from team budget. Reported but not retried on a re-run: step
        // 1 already marked the bid winning, so a second pass skips this player.
        const { error: budgetErr } = await db
          .from('teams')
          .update({
            budget_remaining: +(team.budget_remaining - winner.bid_amount).toFixed(1),
          })
          .eq('id', team.id);

        if (budgetErr) {
          errors.push({
            playerId,
            reason: `Player awarded but budget NOT deducted (£${winner.bid_amount.toFixed(1)}) — fix manually: ${budgetErr.message}`,
          });
        }

        resolved.push({
          playerId,
          playerName: winner.players?.name ?? `Player #${playerId}`,
          winnerName: winner.users?.display_name ?? '?',
          amount: winner.bid_amount,
        });
      } catch (err) {
        errors.push({ playerId, reason: `Unexpected failure: ${err?.message ?? err}` });
      }
    }

    fetchBids();
    fetchOwnedPlayerIds();
    fetchPlayerOwners();
    return { resolved, contested, errors };
  }

  // ── Auto-bid RPCs ────────────────────────────────────────────────────────────

  async function runAutoBids() {
    const { data: freshState } = await db
      .from('auction_state').select('current_round').order('id').limit(1).single();
    const round = freshState?.current_round ?? auctionState?.current_round;
    const { data, error } = await supabase.rpc('run_auto_bids', {
      p_round: round,
      p_competition_id: competitionId,
    });
    return { data, error };
  }

  async function autoCompleteSquads() {
    const { data, error } = await supabase.rpc('auto_complete_squads', {
      p_competition_id: competitionId,
    });
    return { data, error };
  }

  // ── Bidding ─────────────────────────────────────────────────────────────────

  // Place a bid. Client-side guards (fast UX): one bid per player, carry-over
  // floor, effective budget, squad slots, and GK reserve.
  // The RPC is the server-side source of truth for race safety and ascending bids.
  // teamSnapshot = { budgetRemaining, squadSize, gkOwned, playerPosition }
  async function placeBid(playerId, amount, userId, teamSnapshot) {
    const activeBids = bids.filter(
      (b) => b.user_id === userId && b.round_number === auctionState?.current_round
    );
    if (activeBids.some((b) => b.player_id === playerId)) {
      return { error: 'You already have a bid on this player this round.' };
    }
    const floor = getContestFloor(playerId);
    if (floor !== null && amount <= floor) {
      return { error: `This player carries over — minimum bid is £${(floor + minBidIncrement).toFixed(1)} (must exceed previous high of £${floor.toFixed(1)}).` };
    }
    if (teamSnapshot) {
      const { budgetRemaining, squadSize, gkOwned = 0, playerPosition } = teamSnapshot;
      const sumOfActive    = activeBids.reduce((s, b) => s + b.bid_amount, 0);
      const effectiveBudget = budgetRemaining - sumOfActive;
      const projectedSquad  = squadSize + activeBids.length + 1;

      if (projectedSquad > maxSquadSize) {
        return { error: 'No squad slots remain for new bids.' };
      }
      if (amount > effectiveBudget) {
        return { error: `Effective budget left: £${effectiveBudget.toFixed(1)}M.` };
      }

      // GK reserve: keep the last slot open for a GK when none is owned or in active bids.
      if (playerPosition && playerPosition !== 'GK' && gkOwned === 0) {
        const noGkInActiveBids = !activeBids.some((b) => b.players?.position === 'GK');
        if (noGkInActiveBids && projectedSquad > maxSquadSize - 1) {
          return { error: 'Last squad slot must stay open for a goalkeeper.' };
        }
      }
    }

    const { data, error } = await supabase.rpc('place_bid', {
      p_player_id: playerId,
      p_amount: amount,
      p_round: auctionState?.current_round,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { data, error: null };
  }

  const value = {
    auctionState,
    bids,
    ownedPlayerIds,
    playerOwners,
    loading,
    getHighestBid,
    getContestFloor,
    placeBid,
    startAuction,
    pauseAuction,
    resumeAuction,
    completeAuction,
    nextRound,
    endRound,
    resolveRound,
    runAutoBids,
    autoCompleteSquads,
    refreshBids: fetchBids,
  };

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}

export function useAuction() {
  const ctx = useContext(AuctionContext);
  if (!ctx) throw new Error('useAuction must be used inside AuctionProvider');
  return ctx;
}
