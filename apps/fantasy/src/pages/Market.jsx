import { useState, useMemo, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '@predictor/supabase';
import { formatPrice, getPositionColor } from '../lib/utils';
import { MAX_SQUAD_SIZE } from '../config/constants';
import FilterBar from '../components/market/FilterBar';
import PlayerCard from '../components/market/PlayerCard';

export default function Market() {
  const { team, players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { refreshTeam } = useLeague();
  const { auctionState } = useAuction();
  const { players: allPlayers, loading: playersLoading } = usePlayers({ available: true });

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
  const hasGkInSquad = squadRows.some((tp) => tp.players?.position === 'GK');
  // Last remaining slot must be filled by a GK if the squad has none yet.
  const mustBuyGk = freeSlots === 1 && !hasGkInSquad;

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

  // Realtime: refresh available players when any team_players row changes
  useEffect(() => {
    if (!team) return;
    const channel = supabase
      .channel('market-team-players-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_players' }, () => {
        refreshSquad();
        refreshTeam();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [team?.id]);

  // ── Purchase flow ─────────────────────────────────────────────────────────
  async function confirmBuy() {
    if (!confirmPlayer || !team) return;
    // Final guard: if this is the last slot and no GK in squad, only a GK is allowed.
    if (mustBuyGk && confirmPlayer.position !== 'GK') {
      setBuyError('Your squad has no GK — you must fill this last slot with a GK.');
      return;
    }
    setBuying(true);
    setBuyError(null);

    // Use current_price (ratcheted post-auction) if available, fall back to base price.
    const price = confirmPlayer.current_price ?? confirmPlayer.price;

    // 1. Insert team_player row (exclusively owned — DB unique constraint enforces one team per player)
    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: confirmPlayer.id,
      acquisition_price: price,
    });

    if (insertError) {
      setBuyError(insertError.message);
      setBuying(false);
      return;
    }

    // 2. Deduct from team budget
    const newBudget = Number((budget - price).toFixed(1));
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

    const boughtPlayer = confirmPlayer;
    setConfirmPlayer(null);
    setBuying(false);

    setRecentBuy(boughtPlayer);
    setTimeout(() => setRecentBuy(null), 4000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (teamLoading || playersLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Loading market…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Player Market</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-secondary">
          You're not enrolled in the league yet. Ask an admin to add you.
        </div>
      </div>
    );
  }

  if (!marketOpen) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Player Market</h1>
        <div className="bg-surface border border-warning/30 rounded-xl p-6 text-center">
          <p className="text-warning font-semibold">Market is closed</p>
          <p className="text-secondary text-sm mt-1">
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
          <h1 className="text-2xl font-bold text-primary">Player Market</h1>
          <p className="text-secondary text-sm mt-0.5">
            Buy players — exclusively owned once purchased
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">Budget</p>
            <p className="text-base font-bold text-tertiary">{formatPrice(budget)}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">Free Slots</p>
            <p className={`text-base font-bold ${freeSlots === 0 ? 'text-error' : 'text-primary'}`}>
              {freeSlots}
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">Squad</p>
            <p className="text-base font-bold text-primary">
              {squadSize}
              <span className="text-muted font-normal text-sm">/{MAX_SQUAD_SIZE}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Squad full warning ── */}
      {squadFull && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning" role="alert">
          Your squad is full (15/15). Remove a player to make room.
        </div>
      )}

      {/* ── GK required — last slot ── */}
      {mustBuyGk && (
          <div className="bg-error/10/40 border border-error/30/50 rounded-xl p-3 text-sm text-error" role="alert">
          <strong>GK required:</strong> This is your last squad slot and you have no goalkeeper — you must buy a GK.
        </div>
      )}

      {/* ── GK warning — running low on slots ── */}
      {!hasGkInSquad && !mustBuyGk && freeSlots <= 3 && freeSlots > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning" role="alert">
          No GK in squad yet — you have {freeSlots} slot{freeSlots !== 1 ? 's' : ''} left. Remember to pick one.
        </div>
      )}

      {/* ── Recent purchase toast ── */}
      {recentBuy && (
        <div className="bg-tertiary/10 border border-tertiary/40/50 rounded-xl p-3 text-sm text-tertiary flex items-center gap-2" role="status">
          <span>✓</span>
          <span>
            <strong>{recentBuy.name}</strong> added to your squad for{' '}
            {formatPrice(recentBuy.current_price ?? recentBuy.price)}
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
        <div className="text-center py-12 text-muted">
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
              mustBuyGk={mustBuyGk && player.position !== 'GK'}
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
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-primary">Confirm Purchase</h2>

            {/* Player info */}
            <div className="bg-surface-hover rounded-xl p-4 flex items-center gap-3">
              <span
                className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(confirmPlayer.position)}`}
              >
                {confirmPlayer.position}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{confirmPlayer.name}</p>
                <p className="text-xs text-secondary">{confirmPlayer.country}</p>
              </div>
              <span className="text-base font-bold text-tertiary ml-auto flex-shrink-0">
                {formatPrice(confirmPlayer.current_price ?? confirmPlayer.price)}
              </span>
            </div>

            {/* Budget impact */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Budget before</span>
                <span className="text-primary">{formatPrice(budget)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Cost</span>
                <span className="text-error">
                  −{formatPrice(confirmPlayer.current_price ?? confirmPlayer.price)}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5">
                <span className="text-secondary">Budget after</span>
                <span className="text-tertiary">
                  {formatPrice(budget - (confirmPlayer.current_price ?? confirmPlayer.price))}
                </span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Squad size</span>
                <span className="text-primary">
                  {squadSize} → {squadSize + 1} / {MAX_SQUAD_SIZE}
                </span>
              </div>
            </div>

            {/* Error */}
            {buyError && (
              <p className="text-xs text-error" role="alert">{buyError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmPlayer(null);
                  setBuyError(null);
                }}
                disabled={buying}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmBuy}
                disabled={buying}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
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
