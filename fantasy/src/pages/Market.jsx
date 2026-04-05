import { useState, useMemo } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '../lib/supabase';
import { formatPrice, getPositionColor } from '../lib/utils';
import { MAX_SQUAD_SIZE } from '../config/constants';
import FilterBar from '../components/market/FilterBar';
import PlayerCard from '../components/market/PlayerCard';

export default function Market() {
  const { team, players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { refreshTeam } = useLeague();
  const { auctionState } = useAuction();
  const { players: allPlayers, loading: playersLoading } = usePlayers();

  const [filters, setFilters] = useState({ hideOwned: true });
  const [confirmPlayer, setConfirmPlayer] = useState(null); // player pending purchase
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [recentBuy, setRecentBuy] = useState(null); // last successful purchase

  // Set of player IDs the user already owns
  const ownedIds = useMemo(
    () => new Set(squadRows.map((tp) => tp.player_id)),
    [squadRows]
  );

  const squadSize = squadRows.length;
  const squadFull = squadSize >= MAX_SQUAD_SIZE;
  const budget = team?.budget_remaining ?? 0;
  const freeSlots = MAX_SQUAD_SIZE - squadSize;

  // Market open when auction is completed (or no auction state yet — dev mode)
  const marketOpen =
    !auctionState || auctionState.status === 'completed';

  // Apply client-side filters on top of what usePlayers provides
  const filteredPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (filters.position && p.position !== filters.position) return false;
      if (filters.maxPrice !== '' && filters.maxPrice != null && p.price > filters.maxPrice)
        return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.country?.toLowerCase().includes(q))
          return false;
      }
      if (filters.affordableOnly && p.price > budget) return false;
      if (filters.hideOwned && ownedIds.has(p.id)) return false;
      return true;
    });
  }, [allPlayers, filters, ownedIds, budget]);

  // ── Purchase flow ─────────────────────────────────────────────────────────
  async function confirmBuy() {
    if (!confirmPlayer || !team) return;
    setBuying(true);
    setBuyError(null);

    // 1. Insert team_player row
    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: confirmPlayer.id,
      is_locked: false,
      acquisition_price: confirmPlayer.price,
      slot_type: 'free',
    });

    if (insertError) {
      setBuyError(insertError.message);
      setBuying(false);
      return;
    }

    // 2. Deduct from team budget
    const newBudget = Number((budget - confirmPlayer.price).toFixed(1));
    const { error: updateError } = await supabase
      .from('teams')
      .update({ budget_remaining: newBudget })
      .eq('id', team.id);

    if (updateError) {
      setBuyError(updateError.message);
      setBuying(false);
      return;
    }

    // 3. Refresh local state
    await refreshSquad();
    await refreshTeam();

    setRecentBuy(confirmPlayer);
    setConfirmPlayer(null);
    setBuying(false);

    setTimeout(() => setRecentBuy(null), 4000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (teamLoading || playersLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading market…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">Player Market</h1>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-400">
          You're not enrolled in the league yet. Ask an admin to add you.
        </div>
      </div>
    );
  }

  if (!marketOpen) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">Player Market</h1>
        <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-6 text-center">
          <p className="text-yellow-300 font-semibold">Market is closed</p>
          <p className="text-gray-400 text-sm mt-1">
            The free market opens once the auction is complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Player Market</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Free slot shopping — multiple managers can own the same player
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Budget</p>
            <p className="text-base font-bold text-emerald-400">{formatPrice(budget)}</p>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Free Slots</p>
            <p className={`text-base font-bold ${freeSlots === 0 ? 'text-red-400' : 'text-white'}`}>
              {freeSlots}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Squad</p>
            <p className="text-base font-bold text-white">
              {squadSize}
              <span className="text-gray-500 font-normal text-sm">/{MAX_SQUAD_SIZE}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Squad full warning ── */}
      {squadFull && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-3 text-sm text-yellow-300">
          Your squad is full (15/15). Remove a player to make room.
        </div>
      )}

      {/* ── Recent purchase toast ── */}
      {recentBuy && (
        <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl p-3 text-sm text-emerald-300 flex items-center gap-2">
          <span>✓</span>
          <span>
            <strong>{recentBuy.name}</strong> added to your squad for{' '}
            {formatPrice(recentBuy.price)}
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={filteredPlayers.length}
      />

      {/* ── Player grid ── */}
      {filteredPlayers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No players match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredPlayers.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              owned={ownedIds.has(player.id)}
              canAfford={player.price <= budget}
              squadFull={squadFull && !ownedIds.has(player.id)}
              onBuy={setConfirmPlayer}
            />
          ))}
        </div>
      )}

      {/* ── Confirm purchase modal ── */}
      {confirmPlayer && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmPlayer(null)}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Confirm Purchase</h2>

            {/* Player info */}
            <div className="bg-gray-800 rounded-xl p-4 flex items-center gap-3">
              <span
                className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(confirmPlayer.position)}`}
              >
                {confirmPlayer.position}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{confirmPlayer.name}</p>
                <p className="text-xs text-gray-400">{confirmPlayer.country}</p>
              </div>
              <span className="text-base font-bold text-emerald-400 ml-auto flex-shrink-0">
                {formatPrice(confirmPlayer.price)}
              </span>
            </div>

            {/* Budget impact */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Budget before</span>
                <span className="text-white">{formatPrice(budget)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Cost</span>
                <span className="text-red-400">−{formatPrice(confirmPlayer.price)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-1.5">
                <span className="text-gray-300">Budget after</span>
                <span className="text-emerald-400">
                  {formatPrice(budget - confirmPlayer.price)}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Squad size</span>
                <span className="text-white">
                  {squadSize} → {squadSize + 1} / {MAX_SQUAD_SIZE}
                </span>
              </div>
            </div>

            {/* Error */}
            {buyError && (
              <p className="text-xs text-red-400">{buyError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmPlayer(null);
                  setBuyError(null);
                }}
                disabled={buying}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmBuy}
                disabled={buying}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
              >
                {buying ? 'Buying…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
