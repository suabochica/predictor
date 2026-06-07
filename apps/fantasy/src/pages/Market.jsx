import { useState, useMemo, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { usePlayerTotals } from '../hooks/usePlayerTotals';
import { useTransfers } from '../hooks/useTransfers';
import { useMatchdayLocks } from '../hooks/useMatchdayLocks';
import { supabase } from '@predictor/supabase';
import { formatPrice, getPositionColor } from '../lib/utils';
import { MAX_SQUAD_SIZE } from '../config/constants';
import { repointLineupPlayer } from '../lib/lineupSync';
import { Table, Thead, Tbody, Th } from '@predictor/ui';
import FilterBar from '../components/market/FilterBar';
import PlayerRow from '../components/market/PlayerRow';

export default function Market() {
  const { team, players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { activeTransferWindow, refreshTeam } = useLeague();
  const { auctionState } = useAuction();
  const { players: allPlayers, loading: playersLoading, refresh: refreshPlayers } = usePlayers({ withOwner: true });
  const { totals: playerTotals } = usePlayerTotals();
  const { transfers, transfersUsedThisWindow, transfersRemaining, refresh: refreshTransfers } = useTransfers();
  const { lockTimeFor } = useMatchdayLocks(activeTransferWindow?.matchday_id);

  const [filters, setFilters] = useState({});
  const [offerOut, setOfferOut] = useState(null);
  const [confirmSwapIn, setConfirmSwapIn] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState(null);
  const [recentAction, setRecentAction] = useState(null);

  // Normalize squad rows into flat player objects
  const squad = useMemo(
    () =>
      squadRows.map((tp) => ({
        id: tp.player_id,
        name: tp.players?.name ?? 'Desconocido',
        country: tp.players?.country ?? '',
        country_code: tp.players?.country_code ?? null,
        position: tp.players?.position ?? 'FWD',
        price: tp.players?.price ?? 0,
        current_price: tp.players?.current_price ?? tp.acquisition_price ?? 0,
        acquisition_price: tp.acquisition_price,
      })),
    [squadRows]
  );

  const budget = team?.budget_remaining ?? 0;

  function isPlayerLocked(player) {
    if (!player) return false;
    const lockMs = lockTimeFor(player.country);
    return lockMs !== null && Date.now() >= lockMs;
  }

  // Clear swap selection when no window is open
  useEffect(() => {
    if (!activeTransferWindow) {
      setOfferOut(null);
      setConfirmSwapIn(null);
    }
  }, [activeTransferWindow]);

  const marketOpen = !auctionState || auctionState.status === 'completed';

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (filters.position && p.position !== filters.position) return false;
      if (filters.maxPrice !== '' && filters.maxPrice != null && p.current_price > filters.maxPrice)
        return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.country?.toLowerCase().includes(q))
          return false;
      }
      if (filters.affordableOnly) {
        const effective = offerOut
          ? budget + offerOut.current_price - p.current_price >= 0
          : p.current_price <= budget;
        if (!effective) return false;
      }
      if (filters.freeAgentsOnly && p.owner !== null) return false;
      return true;
    });
  }, [allPlayers, filters, budget, offerOut]);

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

  // ── Budget math ──────────────────────────────────────────────────────────
  const budgetAfterSwap =
    offerOut && confirmSwapIn
      ? Number((budget + offerOut.current_price - confirmSwapIn.current_price).toFixed(1))
      : null;

  // ── Transfer execution ──────────────────────────────────────────────────
  async function executeSwap() {
    if (!offerOut || !confirmSwapIn || !team || !activeTransferWindow) return;
    const playerOut = offerOut;
    const playerIn = confirmSwapIn;
    const newBudget = budgetAfterSwap;

    setSwapping(true);
    setSwapError(null);

    // Guards
    if (transfersRemaining !== null && transfersRemaining <= 0) {
      setSwapError('Sin fichajes restantes en esta ventana.');
      setSwapping(false);
      return;
    }
    if (isPlayerLocked(playerOut)) {
      setSwapError(`${playerOut.name} está bloqueado — su partido ya inició.`);
      setSwapping(false);
      return;
    }
    if (isPlayerLocked(playerIn)) {
      setSwapError(`${playerIn.name} está bloqueado — su partido ya inició.`);
      setSwapping(false);
      return;
    }
    if (newBudget < 0) {
      setSwapError('Presupuesto insuficiente para este cambio.');
      setSwapping(false);
      return;
    }
    const gksAfter =
      squad.filter((p) => p.position === 'GK').length -
      (playerOut.position === 'GK' ? 1 : 0) +
      (playerIn.position === 'GK' ? 1 : 0);
    if (gksAfter < 1) {
      setSwapError('Cambio rechazado: tu plantilla debe tener siempre al menos 1 portero.');
      setSwapping(false);
      return;
    }

    // 1. Remove outgoing player
    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', team.id)
      .eq('player_id', playerOut.id);
    if (deleteError) { setSwapError(deleteError.message); setSwapping(false); return; }

    // 2. Add incoming player
    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: playerIn.id,
      acquisition_price: playerIn.current_price,
    });
    if (insertError) { setSwapError(insertError.message); setSwapping(false); return; }

    // 3. Update budget
    const { error: budgetError } = await supabase
      .from('teams')
      .update({ budget_remaining: newBudget })
      .eq('id', team.id);
    if (budgetError) { setSwapError(budgetError.message); setSwapping(false); return; }

    // 4. Log transfer
    await supabase.from('transfers').insert({
      team_id: team.id,
      window_number: activeTransferWindow.window_number,
      matchday_id: activeTransferWindow.is_preseason ? null : activeTransferWindow.matchday_id,
      player_out_id: playerOut.id,
      player_in_id: playerIn.id,
      price_difference: Number((playerOut.current_price - playerIn.current_price).toFixed(1)),
    });

    // 5. Repoint lineup
    await repointLineupPlayer(team.id, playerOut.id, playerIn.id);

    // 6. Refresh everything
    await Promise.all([refreshSquad(), refreshTeam(), refreshTransfers(), refreshPlayers()]);

    setConfirmSwapIn(null);
    setOfferOut(null);
    setSwapping(false);
    setRecentAction({ inName: playerIn.name, outName: playerOut.name });
    setTimeout(() => setRecentAction(null), 4000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (teamLoading || playersLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Cargando mercado…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Mercado de jugadores</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-secondary">
          Aún no estás inscrito en la liga. Pide a un admin que te agregue.
        </div>
      </div>
    );
  }

  if (!marketOpen) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">Mercado de jugadores</h1>
        <div className="bg-surface border border-warning/30 rounded-xl p-6 text-center">
          <p className="text-warning font-semibold">Mercado cerrado</p>
          <p className="text-secondary text-sm mt-1">
            El mercado abre al completar la subasta.
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
          <h1 className="text-2xl font-bold text-primary">Mercado de jugadores</h1>
          <p className="text-secondary text-sm mt-0.5">
            Intercambia jugadores durante las ventanas de fichajes
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">Presupuesto</p>
            <p className="text-base font-bold text-tertiary">{formatPrice(budget)}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">Plantilla</p>
            <p className="text-base font-bold text-primary">
              {squad.length}
              <span className="text-muted font-normal text-sm">/{MAX_SQUAD_SIZE}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Transfer window banner ── */}
      {!activeTransferWindow ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-center">
          <p className="text-secondary font-semibold">Temporada finalizada</p>
          <p className="text-muted text-sm mt-1">No hay más ventanas de fichajes abiertas.</p>
        </div>
      ) : (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-info font-semibold">
              {activeTransferWindow.is_preseason
                ? 'Pretemporada — Fichajes ilimitados'
                : `Ventana ${activeTransferWindow.matchday_name}`}
            </p>
            <p className="text-secondary text-sm mt-0.5">
              {activeTransferWindow.closes_at
                ? `La ventana cierra ${new Date(activeTransferWindow.closes_at).toLocaleString()}`
                : 'Los jugadores se bloquean al iniciar su partido'}
            </p>
          </div>
          <div className="flex items-center gap-6">
            {activeTransferWindow.max_transfers !== null ? (
              <>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{transfersRemaining}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">Restantes</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-secondary">{transfersUsedThisWindow}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">Usados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-muted">{activeTransferWindow.max_transfers}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">Máx</p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-2xl font-bold text-tertiary">∞</p>
                <p className="text-label-caps text-muted uppercase tracking-wider">Ilimitado</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Squad picker (always shown when a window is open) ── */}
      {activeTransferWindow && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-secondary">
                {offerOut
                  ? `Ofreciendo: ${offerOut.name}`
                  : 'Mi plantilla — elige uno para ofrecer'}
              </h3>
              {offerOut && (
                <p className="text-xs text-muted mt-0.5">
                  Ahora selecciona un agente libre para intercambiar
                </p>
              )}
            </div>
            {offerOut && (
              <button
                onClick={() => { setOfferOut(null); setSwapError(null); }}
                className="text-xs text-secondary hover:text-primary px-2 py-1 rounded hover:bg-surface-hover transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5">
              {squad.map((p) => {
                const locked = isPlayerLocked(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => !locked && setOfferOut(offerOut?.id === p.id ? null : p)}
                    disabled={locked}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                      locked
                        ? 'opacity-40 cursor-not-allowed'
                        : offerOut?.id === p.id
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
                    {locked && (
                      <span className="text-label-caps text-warning font-semibold text-xs flex-shrink-0">BLOQUEADO</span>
                    )}
                    <span className="text-xs text-tertiary flex-shrink-0">
                      {formatPrice(p.current_price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent action toast ── */}
      {recentAction && (
        <div className="bg-tertiary/10 border border-tertiary/40 rounded-xl p-3 text-sm text-tertiary flex items-center gap-2" role="status">
          <span>✓</span>
          <span>
            <strong>{recentAction.outName}</strong> intercambiado por{' '}
            <strong>{recentAction.inName}</strong>
          </span>
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
          Ningún jugador coincide con tus filtros.
        </div>
      ) : (
        <Table>
          <Thead className="sticky top-0 z-10">
            <tr>
              <Th>Pos</Th>
              <Th>Jugador</Th>
              <Th className="hidden sm:table-cell">País</Th>
              <Th className="hidden sm:table-cell text-center">PJ</Th>
              <Th className="hidden sm:table-cell text-center">G</Th>
              <Th className="hidden sm:table-cell text-center">A</Th>
              <Th className="hidden sm:table-cell text-center">Pts</Th>
              <Th className="text-right">Precio</Th>
              <Th className="hidden sm:table-cell">Dueño</Th>
              <Th className="hidden sm:table-cell w-6" />
              <Th>Acción</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredPlayers.map((player) => {
              const isMine = player.owner?.userId === team?.user_id;
              const canAfford = offerOut
                ? budget + offerOut.current_price - player.current_price >= 0
                : player.current_price <= budget;
              return (
                <PlayerRow
                  key={player.id}
                  player={player}
                  isMine={isMine}
                  owner={isMine ? null : player.owner}
                  canAfford={canAfford}
                  windowOpen={!!activeTransferWindow}
                  offerOutName={offerOut?.name ?? null}
                  isLocked={isPlayerLocked(player)}
                  onSwap={setConfirmSwapIn}
                  stats={playerTotals[player.id] ?? null}
                />
              );
            })}
          </Tbody>
        </Table>
      )}

      {/* ── Confirm swap modal ── */}
      {confirmSwapIn && offerOut && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && !swapping && setConfirmSwapIn(null)}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-primary">Confirmar fichaje</h2>

            <div className="space-y-2">
              {/* Out */}
              <div className="bg-error/5 border border-error/30 rounded-xl p-3 flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(offerOut.position)}`}
                >
                  {offerOut.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-label-caps text-error font-semibold mb-0.5">Sale</p>
                  <p className="text-sm font-semibold text-primary truncate">{offerOut.name}</p>
                </div>
                <span className="text-sm font-bold text-secondary flex-shrink-0">
                  {formatPrice(offerOut.current_price)}
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
                  <p className="text-label-caps text-tertiary font-semibold mb-0.5">Entra</p>
                  <p className="text-sm font-semibold text-primary truncate">{confirmSwapIn.name}</p>
                </div>
                <span className="text-sm font-bold text-tertiary flex-shrink-0">
                  {formatPrice(confirmSwapIn.current_price)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Presupuesto antes</span>
                <span className="text-primary">{formatPrice(budget)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Recibido por {offerOut.name}</span>
                <span className="text-tertiary">+{formatPrice(offerOut.current_price)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Costo de {confirmSwapIn.name}</span>
                <span className="text-error">−{formatPrice(confirmSwapIn.current_price)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5">
                <span className="text-secondary">Presupuesto después</span>
                <span className={budgetAfterSwap >= 0 ? 'text-tertiary' : 'text-error'}>
                  {formatPrice(budgetAfterSwap)}
                </span>
              </div>
            </div>

            {swapError && (
              <p className="text-xs text-error" role="alert">{swapError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmSwapIn(null); setSwapError(null); }}
                disabled={swapping}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cancelar
              </button>
              <button
                onClick={executeSwap}
                disabled={swapping || budgetAfterSwap < 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {swapping ? 'Fichando…' : 'Confirmar fichaje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer history ── */}
      {transfers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-secondary">Historial de fichajes</h3>
          </div>
          <div className="divide-y divide-border">
            {transfers.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-label-caps font-semibold px-2 py-0.5 rounded bg-surface-hover text-secondary">
                  {t.matchday_id ? `MD${t.matchday_id}` : `W${t.window_number}`}
                </span>
                <span className="text-error">
                  {t.player_out?.name ?? `Jugador #${t.player_out_id}`}
                </span>
                <span className="text-muted">→</span>
                <span className="text-tertiary">
                  {t.player_in?.name ?? `Jugador #${t.player_in_id}`}
                </span>
                {t.price_difference != null && (
                  <span
                    className={`text-xs ml-auto ${
                      t.price_difference >= 0 ? 'text-tertiary' : 'text-error'
                    }`}
                  >
                    {t.price_difference >= 0 ? '+' : ''}
                    {Number(t.price_difference).toFixed(1)}M
                  </span>
                )}
                <span className="text-xs text-muted w-full sm:w-auto sm:ml-auto">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
