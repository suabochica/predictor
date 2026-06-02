import { useState, useMemo, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { usePlayerTotals } from '../hooks/usePlayerTotals';
import { supabase } from '@predictor/supabase';
import { formatPrice, getPositionColor } from '../lib/utils';
import { MAX_SQUAD_SIZE } from '../config/constants';
import { repointLineupPlayer } from '../lib/lineupSync';
import { Table, Thead, Tbody, Th } from '@predictor/ui';
import FilterBar from '../components/market/FilterBar';
import PlayerRow from '../components/market/PlayerRow';

export default function Market() {
  const { team, players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { refreshTeam } = useLeague();
  const { auctionState } = useAuction();
  const { players: allPlayers, loading: playersLoading, refresh: refreshPlayers } = usePlayers({ withOwner: true });
  const { totals: playerTotals } = usePlayerTotals();

  const [filters, setFilters] = useState({});
  const [offerOut, setOfferOut] = useState(null);       // squad player selected to swap out
  const [confirmPlayer, setConfirmPlayer] = useState(null); // player pending purchase
  const [confirmSwapIn, setConfirmSwapIn] = useState(null); // free-agent pending swap
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState(null);
  const [recentAction, setRecentAction] = useState(null);

  // Normalize squad rows into flat player objects
  const squad = useMemo(
    () =>
      squadRows.map((tp) => ({
        id: tp.player_id,
        name: tp.players?.name ?? 'Unknown',
        country: tp.players?.country ?? '',
        country_code: tp.players?.country_code ?? null,
        position: tp.players?.position ?? 'FWD',
        price: tp.players?.price ?? 0,
        acquisition_price: tp.acquisition_price,
      })),
    [squadRows]
  );

  const squadSize = squad.length;
  const squadFull = squadSize >= MAX_SQUAD_SIZE;
  const budget = team?.budget_remaining ?? 0;
  const freeSlots = MAX_SQUAD_SIZE - squadSize;
  const hasGkInSquad = squad.some((p) => p.position === 'GK');
  const mustBuyGk = freeSlots === 1 && !hasGkInSquad;

  // Clear swap selection when squad is no longer full (e.g. someone else buys a player)
  useEffect(() => {
    if (!squadFull && !swapping) setOfferOut(null);
  }, [squadFull]);

  const marketOpen = !auctionState || auctionState.status === 'completed';

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
      if (filters.freeAgentsOnly && p.owner !== null) return false;
      return true;
    });
  }, [allPlayers, filters, budget]);

  // Realtime: refresh on any team_players change
  useEffect(() => {
    if (!team) return;
    const channel = supabase
      .channel('market-team-players-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_players' }, () => {
        refreshSquad();
        refreshTeam();
        refreshPlayers();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [team?.id]);

  // ── Purchase flow ──────────────────────────────────────────────────────────
  async function confirmBuy() {
    if (!confirmPlayer || !team) return;
    if (mustBuyGk && confirmPlayer.position !== 'GK') {
      setBuyError('Your squad has no GK — you must fill this last slot with a GK.');
      return;
    }
    setBuying(true);
    setBuyError(null);

    const price = confirmPlayer.current_price ?? confirmPlayer.price;

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

    await Promise.all([refreshSquad(), refreshTeam(), refreshPlayers()]);
    const bought = confirmPlayer;
    setConfirmPlayer(null);
    setBuying(false);
    setRecentAction({ type: 'buy', player: bought });
    setTimeout(() => setRecentAction(null), 4000);
  }

  // ── Swap flow ──────────────────────────────────────────────────────────────
  const budgetAfterSwap =
    offerOut && confirmSwapIn
      ? Number((budget + offerOut.acquisition_price - confirmSwapIn.price).toFixed(1))
      : null;

  async function executeSwap() {
    if (!offerOut || !confirmSwapIn || !team) return;
    // Capture locals so async state changes mid-execution don't lose refs
    const playerOut = offerOut;
    const playerIn = confirmSwapIn;
    const newBudget = budgetAfterSwap;

    if (newBudget < 0) {
      setSwapError('Insufficient budget for this swap.');
      return;
    }
    setSwapping(true);
    setSwapError(null);

    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', team.id)
      .eq('player_id', playerOut.id);
    if (deleteError) {
      setSwapError(deleteError.message);
      setSwapping(false);
      return;
    }

    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: playerIn.id,
      acquisition_price: playerIn.price,
    });
    if (insertError) {
      setSwapError(insertError.message);
      setSwapping(false);
      return;
    }

    const { error: budgetError } = await supabase
      .from('teams')
      .update({ budget_remaining: newBudget })
      .eq('id', team.id);
    if (budgetError) {
      setSwapError(budgetError.message);
      setSwapping(false);
      return;
    }

    // Repoint the upcoming matchday lineup and null default from playerOut → playerIn
    await repointLineupPlayer(team.id, playerOut.id, playerIn.id);

    await Promise.all([refreshSquad(), refreshTeam(), refreshPlayers()]);
    setConfirmSwapIn(null);
    setOfferOut(null);
    setSwapping(false);
    setRecentAction({ type: 'swap', inName: playerIn.name, outName: playerOut.name });
    setTimeout(() => setRecentAction(null), 4000);
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

      {/* ── Squad picker (swap mode — only when squad full) ── */}
      {squadFull && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-secondary">
                {offerOut
                  ? `Offering out: ${offerOut.name}`
                  : 'My Squad — pick one to offer'}
              </h3>
              {offerOut && (
                <p className="text-xs text-muted mt-0.5">
                  Now select a free agent below to swap in
                </p>
              )}
            </div>
            {offerOut && (
              <button
                onClick={() => setOfferOut(null)}
                className="text-xs text-secondary hover:text-primary px-2 py-1 rounded hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5">
              {squad.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOfferOut(offerOut?.id === p.id ? null : p)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                    offerOut?.id === p.id
                      ? 'ring-2 ring-error bg-error/5'
                      : 'hover:bg-border/50'
                  }`}
                >
                  <span
                    className={`text-label-caps font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(p.position)}`}
                  >
                    {p.position}
                  </span>
                  <span className="text-sm text-primary flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-tertiary flex-shrink-0">
                    {formatPrice(p.acquisition_price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GK required — last slot ── */}
      {mustBuyGk && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-3 text-sm text-error" role="alert">
          <strong>GK required:</strong> This is your last squad slot and you have no goalkeeper — you must buy a GK.
        </div>
      )}

      {/* ── GK warning — running low on slots ── */}
      {!hasGkInSquad && !mustBuyGk && freeSlots <= 3 && freeSlots > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning" role="alert">
          No GK in squad yet — you have {freeSlots} slot{freeSlots !== 1 ? 's' : ''} left. Remember to pick one.
        </div>
      )}

      {/* ── Recent action toast ── */}
      {recentAction && (
        <div className="bg-tertiary/10 border border-tertiary/40 rounded-xl p-3 text-sm text-tertiary flex items-center gap-2" role="status">
          <span>✓</span>
          {recentAction.type === 'swap' ? (
            <span>
              <strong>{recentAction.outName}</strong> swapped out for{' '}
              <strong>{recentAction.inName}</strong>
            </span>
          ) : (
            <span>
              <strong>{recentAction.player.name}</strong> added to your squad for{' '}
              {formatPrice(recentAction.player.current_price ?? recentAction.player.price)}
            </span>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={filteredPlayers.length}
      />

      {/* ── Player table ── */}
      {filteredPlayers.length === 0 ? (
        <div className="text-center py-12 text-muted">
          No players match your filters.
        </div>
      ) : (
        <Table>
          <Thead className="sticky top-0 z-10">
            <tr>
              <Th>Pos</Th>
              <Th>Player</Th>
              <Th className="hidden sm:table-cell">Country</Th>
              <Th className="hidden sm:table-cell text-center">GP</Th>
              <Th className="hidden sm:table-cell text-center">G</Th>
              <Th className="hidden sm:table-cell text-center">A</Th>
              <Th className="hidden sm:table-cell text-center">Pts</Th>
              <Th className="text-right">Price</Th>
              <Th className="hidden sm:table-cell">Owner</Th>
              <Th className="hidden sm:table-cell w-6" />
              <Th>Action</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredPlayers.map((player) => {
              const isMine = player.owner?.userId === team?.user_id;
              return (
                <PlayerRow
                  key={player.id}
                  player={player}
                  isMine={isMine}
                  owner={isMine ? null : player.owner}
                  canAfford={player.price <= budget}
                  squadFull={squadFull}
                  mustBuyGk={mustBuyGk && player.position !== 'GK'}
                  offerOutName={offerOut?.name ?? null}
                  onBuy={setConfirmPlayer}
                  onSwap={setConfirmSwapIn}
                  stats={playerTotals[player.id] ?? null}
                />
              );
            })}
          </Tbody>
        </Table>
      )}

      {/* ── Confirm purchase modal ── */}
      {confirmPlayer && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmPlayer(null)}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-primary">Confirm Purchase</h2>

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

            {buyError && (
              <p className="text-xs text-error" role="alert">{buyError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmPlayer(null); setBuyError(null); }}
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

      {/* ── Confirm swap modal ── */}
      {confirmSwapIn && offerOut && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && !swapping && setConfirmSwapIn(null)}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-primary">Confirm Swap</h2>

            <div className="space-y-2">
              {/* Out */}
              <div className="bg-error/5 border border-error/30 rounded-xl p-3 flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(offerOut.position)}`}
                >
                  {offerOut.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-label-caps text-error font-semibold mb-0.5">Out</p>
                  <p className="text-sm font-semibold text-primary truncate">{offerOut.name}</p>
                </div>
                <span className="text-sm font-bold text-secondary flex-shrink-0">
                  {formatPrice(offerOut.acquisition_price)}
                </span>
              </div>

              <div className="text-center text-muted text-lg">↓</div>

              {/* In */}
              <div className="bg-tertiary/5 border border-tertiary/40 rounded-xl p-3 flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(confirmSwapIn.position)}`}
                >
                  {confirmSwapIn.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-label-caps text-tertiary font-semibold mb-0.5">In</p>
                  <p className="text-sm font-semibold text-primary truncate">{confirmSwapIn.name}</p>
                </div>
                <span className="text-sm font-bold text-tertiary flex-shrink-0">
                  {formatPrice(confirmSwapIn.price)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Budget before</span>
                <span className="text-primary">{formatPrice(budget)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Received for {offerOut.name}</span>
                <span className="text-tertiary">+{formatPrice(offerOut.acquisition_price)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Cost of {confirmSwapIn.name}</span>
                <span className="text-error">−{formatPrice(confirmSwapIn.price)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5">
                <span className="text-secondary">Budget after</span>
                <span className={budgetAfterSwap >= 0 ? 'text-tertiary' : 'text-error'}>
                  {formatPrice(budgetAfterSwap)}
                </span>
              </div>
            </div>

            {budgetAfterSwap < 0 && (
              <p className="text-xs text-error" role="alert">
                Not enough budget for this swap.
              </p>
            )}
            {swapError && (
              <p className="text-xs text-error" role="alert">{swapError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmSwapIn(null); setSwapError(null); }}
                disabled={swapping}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={executeSwap}
                disabled={swapping || budgetAfterSwap < 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {swapping ? 'Swapping…' : 'Confirm Swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
