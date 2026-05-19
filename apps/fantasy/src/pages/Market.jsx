import { useState, useMemo, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '@predictor/supabase';
import { formatPrice, getPositionColor } from '../lib/utils';
import { MAX_SQUAD_SIZE, MAX_LOCKED_PLAYERS, LOCK_PRICE_THRESHOLD } from '../config/constants';
import { lockPlayer } from '../lib/lockActions';
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
  const [recentBuy, setRecentBuy] = useState(null); // last successful purchase (free/skipped-lock)

  // Lock flow state
  const [lockPromptPlayer, setLockPromptPlayer] = useState(null); // player awaiting lock decision
  const [swapTarget, setSwapTarget] = useState(null); // locked player to swap out (when at MAX)
  const [locking, setLocking] = useState(false);
  const [lockToast, setLockToast] = useState(null); // { type: 'success'|'info'|'error', message }

  // Set of player IDs the user already owns
  const ownedIds = useMemo(
    () => new Set(squadRows.map((tp) => tp.player_id)),
    [squadRows]
  );

  // Locked squad rows used for swap picker and MAX check
  const lockedSquadRows = useMemo(
    () => squadRows.filter((tp) => tp.slot_type === 'locked'),
    [squadRows]
  );
  const atMaxLocked = lockedSquadRows.length >= MAX_LOCKED_PLAYERS;

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

  // Auto-clear lock toast after 5s
  useEffect(() => {
    if (!lockToast) return;
    const id = setTimeout(() => setLockToast(null), 5000);
    return () => clearTimeout(id);
  }, [lockToast]);

  // Realtime: track team_players changes (locks by others, refunds from other teams locking)
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

    // 1. Insert team_player row
    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: confirmPlayer.id,
      is_locked: false,
      acquisition_price: price,
      slot_type: 'free',
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

    // 4. For lockable players, show the lock decision prompt instead of the purchase toast.
    if (boughtPlayer.price <= LOCK_PRICE_THRESHOLD) {
      setLockPromptPlayer(boughtPlayer);
    } else {
      setRecentBuy(boughtPlayer);
      setTimeout(() => setRecentBuy(null), 4000);
    }
  }

  // ── Lock flow ─────────────────────────────────────────────────────────────
  async function handleLockConfirm() {
    if (!lockPromptPlayer || !team) return;
    setLocking(true);
    try {
      const result = await lockPlayer(
        team.id,
        lockPromptPlayer.id,
        swapTarget?.player_id ?? null
      );
      if (result.success) {
        await refreshSquad();
        await refreshTeam();
        setLockToast({ type: 'success', message: `${lockPromptPlayer.name} locked successfully.` });
        setLockPromptPlayer(null);
        setSwapTarget(null);
      } else if (result.reason === 'already_locked') {
        setLockToast({
          type: 'info',
          message: `Another team locked ${lockPromptPlayer.name} first — you still hold them as free.`,
        });
        setLockPromptPlayer(null);
        setSwapTarget(null);
      } else if (result.reason === 'max_locked_no_unlock') {
        setLockToast({ type: 'error', message: 'Pick a player to unlock first.' });
      }
    } catch (err) {
      setLockToast({ type: 'error', message: err.message });
    }
    setLocking(false);
  }

  function handleSkipLock() {
    const player = lockPromptPlayer;
    setLockPromptPlayer(null);
    setSwapTarget(null);
    setRecentBuy(player);
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

      {/* ── GK required — last slot ── */}
      {mustBuyGk && (
        <div className="bg-red-900/40 border border-red-700/50 rounded-xl p-3 text-sm text-red-300">
          <strong>GK required:</strong> This is your last squad slot and you have no goalkeeper — you must buy a GK.
        </div>
      )}

      {/* ── GK warning — running low on slots ── */}
      {!hasGkInSquad && !mustBuyGk && freeSlots <= 3 && freeSlots > 0 && (
        <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-3 text-sm text-orange-300">
          No GK in squad yet — you have {freeSlots} slot{freeSlots !== 1 ? 's' : ''} left. Remember to pick one.
        </div>
      )}

      {/* ── Lock result toast (success / info — shown after lock modal closes) ── */}
      {lockToast && !lockPromptPlayer && (
        <div
          className={`rounded-xl p-3 text-sm flex items-center gap-2 border ${
            lockToast.type === 'success'
              ? 'bg-blue-900/40 border-blue-700/50 text-blue-300'
              : 'bg-gray-800/60 border-gray-600/50 text-gray-300'
          }`}
        >
          <span>{lockToast.type === 'success' ? '[Locked]' : '[Info]'}</span>
          <span>{lockToast.message}</span>
        </div>
      )}

      {/* ── Recent purchase toast ── */}
      {recentBuy && (
        <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl p-3 text-sm text-emerald-300 flex items-center gap-2">
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
                {formatPrice(confirmPlayer.current_price ?? confirmPlayer.price)}
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
                <span className="text-red-400">
                  −{formatPrice(confirmPlayer.current_price ?? confirmPlayer.price)}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-1.5">
                <span className="text-gray-300">Budget after</span>
                <span className="text-emerald-400">
                  {formatPrice(budget - (confirmPlayer.current_price ?? confirmPlayer.price))}
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

      {/* ── Lock decision modal ── */}
      {lockPromptPlayer && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && handleSkipLock()}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-white">Lock this player?</h2>
              <p className="text-sm text-gray-400 mt-1">
                Locking <strong className="text-white">{lockPromptPlayer.name}</strong> claims
                them exclusively — other teams holding them as free will be refunded and lose
                access. You can unlock at any time.
              </p>
            </div>

            {/* Swap picker — only shown when at MAX_LOCKED */}
            {atMaxLocked && (
              <div className="space-y-2">
                <p className="text-xs text-yellow-400 font-medium">
                  You have {MAX_LOCKED_PLAYERS} locked players (max). Choose one to unlock:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {lockedSquadRows.map((tp) => (
                    <button
                      key={tp.player_id}
                      onClick={() =>
                        setSwapTarget(
                          swapTarget?.player_id === tp.player_id ? null : tp
                        )
                      }
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        swapTarget?.player_id === tp.player_id
                          ? 'bg-orange-900/50 border border-orange-600/60 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold mr-2 px-1.5 py-0.5 rounded ${getPositionColor(tp.players?.position)}`}
                      >
                        {tp.players?.position}
                      </span>
                      {tp.players?.name}
                      <span className="text-gray-500 ml-1.5 text-xs">
                        {formatPrice(tp.players?.current_price ?? tp.players?.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inline error (stays modal open — e.g. max_locked_no_unlock) */}
            {lockToast?.type === 'error' && (
              <p className="text-xs text-red-400">{lockToast.message}</p>
            )}

            {/* Gate message — explains why Lock button is disabled */}
            {atMaxLocked && !swapTarget && (
              <p className="text-xs text-amber-400">At max locks — pick one to unlock first.</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSkipLock}
                disabled={locking}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Keep as Free
              </button>
              <button
                onClick={handleLockConfirm}
                disabled={locking || (atMaxLocked && !swapTarget)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
              >
                {locking ? 'Locking…' : atMaxLocked ? 'Lock (swap)' : 'Lock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
