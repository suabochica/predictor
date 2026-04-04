import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuctionContext = createContext(null);

export function AuctionProvider({ children }) {
  const [auctionState, setAuctionState] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuctionState();
    fetchBids();

    // Realtime: subscribe to new bids
    const channel = supabase
      .channel('auction-bids')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auction_bids' },
        (payload) => {
          setBids((prev) => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_bids' },
        (payload) => {
          setBids((prev) => prev.map((b) => (b.id === payload.new.id ? payload.new : b)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_state' },
        (payload) => {
          setAuctionState(payload.new);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

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

  // ── Admin controls ──────────────────────────────────────────────────────────

  async function updateAuctionState(updates) {
    const { error } = await supabase
      .from('auction_state')
      .update(updates)
      .eq('id', auctionState.id);
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

  // Resolves the current round: marks winning bids, assigns players to teams,
  // and deducts acquisition cost from each winner's budget.
  // Returns { resolved: [...], errors: [...] }
  async function resolveRound() {
    const round = auctionState.current_round;
    const roundBids = bids.filter((b) => b.round_number === round);
    const playerIds = [...new Set(roundBids.map((b) => b.player_id))];

    const resolved = [];
    const errors   = [];

    for (const playerId of playerIds) {
      const winner = getHighestBid(playerId);
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

      // 3. Assign player to team (ignore if already assigned from a re-run)
      const { error: tpErr } = await supabase.from('team_players').upsert(
        {
          team_id: team.id,
          player_id: playerId,
          is_locked: false,
          acquisition_price: winner.bid_amount,
          slot_type: 'free',
        },
        { onConflict: 'team_id,player_id', ignoreDuplicates: true }
      );

      if (tpErr) {
        errors.push({ playerId, reason: `Team assignment failed: ${tpErr.message}` });
        continue;
      }

      // 4. Deduct from team budget
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

    return { resolved, errors };
  }

  // ── Bidding ─────────────────────────────────────────────────────────────────

  // Place a bid. Enforces max 10 active bids per user per round.
  async function placeBid(playerId, amount, userId) {
    const activeBids = bids.filter(
      (b) => b.user_id === userId && b.round_number === auctionState?.current_round
    );
    if (activeBids.length >= 10) {
      return { error: 'You already have 10 active bids this round.' };
    }
    const { data, error } = await supabase.from('auction_bids').insert({
      user_id: userId,
      player_id: playerId,
      bid_amount: amount,
      round_number: auctionState?.current_round,
    });
    return { data, error };
  }

  const value = {
    auctionState,
    bids,
    loading,
    getHighestBid,
    placeBid,
    startAuction,
    pauseAuction,
    resumeAuction,
    completeAuction,
    nextRound,
    resolveRound,
    refreshBids: fetchBids,
  };

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}

export function useAuction() {
  const ctx = useContext(AuctionContext);
  if (!ctx) throw new Error('useAuction must be used inside AuctionProvider');
  return ctx;
}
