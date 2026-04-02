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

  // Returns highest bid for a given player in the current round
  function getHighestBid(playerId) {
    const playerBids = bids.filter(
      (b) => b.player_id === playerId && b.round_number === auctionState?.current_round
    );
    if (!playerBids.length) return null;
    return playerBids.reduce((max, b) => (b.bid_amount > max.bid_amount ? b : max));
  }

  const value = {
    auctionState,
    bids,
    loading,
    getHighestBid,
    refreshBids: fetchBids,
  };

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}

export function useAuction() {
  const ctx = useContext(AuctionContext);
  if (!ctx) throw new Error('useAuction must be used inside AuctionProvider');
  return ctx;
}
