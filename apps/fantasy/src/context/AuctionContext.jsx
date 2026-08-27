import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { MAX_SQUAD_SIZE, MIN_BID_INCREMENT, WC_COMPETITION_ID } from '../config/constants';

const AuctionContext = createContext(null);

export function AuctionProvider({ children }) {
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

    const channel = supabase
      .channel('auction-bids')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auction_bids' },
        () => { fetchBids(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_bids' },
        () => { fetchBids(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_state' },
        (payload) => {
          setAuctionState(payload.new);
          fetchBids();
          fetchOwnedPlayerIds();
          fetchPlayerOwners();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_players' },
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
    const { data } = await supabase.from('auction_state').select('*').order('id').limit(1).single();
    setAuctionState(data);
    setLoading(false);
  }

  async function fetchBids() {
    const { data } = await supabase
      .from('auction_bids')
      .select('*, players(name, position, price), users(display_name)')
      .order('created_at', { ascending: false });
    setBids(data ?? []);
  }

  async function fetchOwnedPlayerIds() {
    const { data } = await supabase.from('team_players').select('player_id');
    setOwnedPlayerIds(new Set((data ?? []).map((r) => r.player_id)));
  }

  async function fetchPlayerOwners() {
    const { data } = await supabase
      .from('team_players')
      .select('player_id, teams(name, user_id)');
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
    const { error } = await supabase
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
    const { data: freshState } = await supabase
      .from('auction_state').select('current_round').order('id').limit(1).single();
    const round = freshState?.current_round ?? auctionState.current_round;

    const { data: freshBids } = await supabase
      .from('auction_bids')
      .select('*, players(name, position, price), users(display_name)')
      .eq('round_number', round);
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
          const { error: coErr } = await supabase.from('auction_bids').upsert(
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
      const { error: bidErr } = await supabase
        .from('auction_bids')
        .update({ is_winning: true })
        .eq('id', winner.id);

      if (bidErr) {
        errors.push({ playerId, reason: `Bid update failed: ${bidErr.message}` });
        continue;
      }

      // 2. Look up winner's team
      const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('id, budget_remaining')
        .eq('user_id', winner.user_id)
        .single();

      if (teamErr || !team) {
        errors.push({ playerId, reason: 'Winner has no team registered.' });
        continue;
      }

      // 3. Safety net: skip if team already has a full squad. Also fetch positions for GK check.
      const { data: currentSquad } = await supabase
        .from('team_players')
        .select('player_id, players(position)')
        .eq('team_id', team.id);

      const currentSquadSize = currentSquad?.length ?? 0;

      if (currentSquadSize >= MAX_SQUAD_SIZE) {
        errors.push({ playerId, reason: `Squad is full (${MAX_SQUAD_SIZE}/${MAX_SQUAD_SIZE}) — player skipped.` });
        continue;
      }

      // GK safety net: if awarding a non-GK would fill the squad while the team has no GK, skip.
      if (winner.players?.position !== 'GK') {
        const hasGK = (currentSquad ?? []).some((tp) => tp.players?.position === 'GK');
        if (!hasGK && currentSquadSize + 1 >= MAX_SQUAD_SIZE) {
          errors.push({ playerId, reason: `Squad would be full with no goalkeeper — player skipped.` });
          continue;
        }
      }

      // 4. Assign player to team (ignore if already assigned from a re-run)
      const { error: tpErr } = await supabase.from('team_players').upsert(
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
      await supabase
        .from('players')
        .update({ current_price: winner.bid_amount })
        .eq('id', playerId);

      // 6. Deduct from team budget
      await supabase
        .from('teams')
        .update({
          budget_remaining: +(team.budget_remaining - winner.bid_amount).toFixed(1),
        })
        .eq('id', team.id);

      resolved.push({
        playerId,
        playerName: winner.players?.name ?? `Player #${playerId}`,
        winnerName: winner.users?.display_name ?? '?',
        amount: winner.bid_amount,
      });
    }

    fetchBids();
    fetchOwnedPlayerIds();
    fetchPlayerOwners();
    return { resolved, contested, errors };
  }

  // ── Auto-bid RPCs ────────────────────────────────────────────────────────────

  async function runAutoBids() {
    const { data: freshState } = await supabase
      .from('auction_state').select('current_round').order('id').limit(1).single();
    const round = freshState?.current_round ?? auctionState?.current_round;
    const { data, error } = await supabase.rpc('run_auto_bids', {
      p_round: round,
      p_competition_id: WC_COMPETITION_ID,
    });
    return { data, error };
  }

  async function autoCompleteSquads() {
    const { data, error } = await supabase.rpc('auto_complete_squads', {
      p_competition_id: WC_COMPETITION_ID,
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
      return { error: `This player carries over — minimum bid is £${(floor + MIN_BID_INCREMENT).toFixed(1)} (must exceed previous high of £${floor.toFixed(1)}).` };
    }
    if (teamSnapshot) {
      const { budgetRemaining, squadSize, gkOwned = 0, playerPosition } = teamSnapshot;
      const sumOfActive    = activeBids.reduce((s, b) => s + b.bid_amount, 0);
      const effectiveBudget = budgetRemaining - sumOfActive;
      const projectedSquad  = squadSize + activeBids.length + 1;

      if (projectedSquad > MAX_SQUAD_SIZE) {
        return { error: 'No squad slots remain for new bids.' };
      }
      if (amount > effectiveBudget) {
        return { error: `Effective budget left: £${effectiveBudget.toFixed(1)}M.` };
      }

      // GK reserve: keep the last slot open for a GK when none is owned or in active bids.
      if (playerPosition && playerPosition !== 'GK' && gkOwned === 0) {
        const noGkInActiveBids = !activeBids.some((b) => b.players?.position === 'GK');
        if (noGkInActiveBids && projectedSquad > MAX_SQUAD_SIZE - 1) {
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
