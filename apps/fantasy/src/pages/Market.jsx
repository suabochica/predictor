import { useState, useMemo, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../hooks/useAuction';
import { usePlayers } from '../hooks/usePlayers';
import { usePlayerTotals } from '../hooks/usePlayerTotals';
import { useTransfers } from '../hooks/useTransfers';
import { useMatchdayLocks } from '../hooks/useMatchdayLocks';
import { supabase } from '@predictor/supabase';
import { useLang } from '@predictor/i18n/react';
import { formatDateTimeShort, formatDate } from '@predictor/i18n';
import { formatPrice, getPositionColor } from '../lib/utils';
import { getStatColumns } from '../lib/statColumns';
import { MAX_SQUAD_SIZE } from '../config/constants';
import { Table, Thead, Tbody, Th } from '@predictor/ui';
import FilterBar from '../components/market/FilterBar';
import PlayerRow from '../components/market/PlayerRow';
import { useCompetition } from '../context/CompetitionContext';

export default function Market() {
  const { t, lang } = useLang();
  const statColumns = getStatColumns(t);
  const { db, competitionId, competition } = useCompetition();
  const maxSquadSize = competition?.max_squad_size ?? MAX_SQUAD_SIZE;
  const { team, players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { activeMatchday, activeTransferWindow, refreshTeam } = useLeague();
  const { auctionState } = useAuction();
  const { players: allPlayers, loading: playersLoading, refresh: refreshPlayers } = usePlayers({ withOwner: true });
  const { totals: playerTotals, activePointsById, pointsByPlayerByMatchday, matchdayColumns } = usePlayerTotals();
  const { transfers, transfersUsedThisWindow, transfersRemaining, refresh: refreshTransfers } = useTransfers();
  const { lockTimeFor } = useMatchdayLocks(activeTransferWindow?.matchday_id);

  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'current_price', dir: 'desc' });
  const [offerOut, setOfferOut] = useState(null);
  const [confirmSwapIn, setConfirmSwapIn] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState(null);
  const [recentAction, setRecentAction] = useState(null);
  const [negWindow, setNegWindow] = useState(null);
  const [committedCash, setCommittedCash] = useState(0);
  const [committedPlayerIds, setCommittedPlayerIds] = useState(new Set());

  // Normalize squad rows into flat player objects
  const squad = useMemo(
    () =>
      squadRows.map((tp) => ({
        id: tp.player_id,
        name: tp.players?.name ?? t('fantasy.common.unknownPlayer'),
        country: tp.players?.country ?? '',
        country_code: tp.players?.country_code ?? null,
        position: tp.players?.position ?? 'FWD',
        price: tp.players?.price ?? 0,
        current_price: tp.players?.current_price ?? tp.acquisition_price ?? 0,
        acquisition_price: tp.acquisition_price,
      })),
    [squadRows, t]
  );

  // Unique country list for the filter pills (same as Auction)
  const countries = useMemo(
    () => [...new Set(allPlayers.map((p) => p.country).filter(Boolean))].sort(),
    [allPlayers]
  );

  const budget = team?.budget_remaining ?? 0;

  // Cash/players already staked in active closed-door negotiation offers can't
  // also be spent/transferred here — mirrors execute_transfer's guards (056).
  useEffect(() => {
    if (!team) return;
    fetchNegotiationState();
  }, [team?.id]);

  async function fetchNegotiationState() {
    const { data: windows } = await db
      .from('negotiation_windows')
      .select('*')
      .eq('status', 'open')
      .order('id', { ascending: false })
      .limit(1);
    const w = windows?.[0];
    const open = w && new Date(w.closes_at) > new Date();
    setNegWindow(open ? w : null);
    if (!open) {
      setCommittedCash(0);
      setCommittedPlayerIds(new Set());
      return;
    }
    const { data: offers } = await db
      .from('negotiation_offers')
      .select('cash, offered_player_id')
      .eq('window_id', w.id)
      .eq('status', 'active');
    setCommittedCash((offers ?? []).reduce((sum, o) => sum + Number(o.cash), 0));
    setCommittedPlayerIds(new Set((offers ?? []).map((o) => o.offered_player_id)));
  }

  const effectiveBudget = negWindow ? Number((budget - committedCash).toFixed(1)) : budget;

  function isPlayerLocked(player) {
    if (!player) return false;
    const lockMs = lockTimeFor(player.country_code);
    return lockMs !== null && Date.now() >= lockMs;
  }

  const noTransfersLeft =
    !activeTransferWindow?.is_preseason &&
    transfersRemaining !== null &&
    transfersRemaining <= 0;

  // Clear swap selection when no window is open or cap is reached
  useEffect(() => {
    if (!activeTransferWindow || noTransfersLeft) {
      setOfferOut(null);
      setConfirmSwapIn(null);
    }
  }, [activeTransferWindow, noTransfersLeft]);

  const marketOpen = !auctionState || auctionState.status === 'completed';

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (filters.position && p.position !== filters.position) return false;
      if (filters.country && p.country !== filters.country) return false;
      if (filters.maxPrice !== '' && filters.maxPrice != null && p.current_price > filters.maxPrice)
        return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.country?.toLowerCase().includes(q))
          return false;
      }
      if (filters.affordableOnly) {
        const effective = offerOut
          ? effectiveBudget + offerOut.current_price - p.current_price >= 0
          : p.current_price <= effectiveBudget;
        if (!effective) return false;
      }
      if (filters.freeAgentsOnly && p.owner !== null) return false;
      if (filters.hideEliminated && p.is_eliminated) return false;
      return true;
    });
  }, [allPlayers, filters, effectiveBudget, offerOut]);

  function sortValue(p, key) {
    if (key === 'current_price') return p.current_price ?? p.price ?? 0;
    if (key === 'total_points') return activePointsById[p.id] ?? 0;
    if (key.startsWith('md:')) return pointsByPlayerByMatchday[p.id]?.[Number(key.slice(3))] ?? 0;
    if (['name', 'country', 'position'].includes(key)) return p[key] ?? '';
    if (key === 'owner') return p.owner?.teamName ?? '';
    return playerTotals[p.id]?.[key] ?? 0;
  }

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: typeof sortValue({ id: -1 }, key) === 'string' ? 'asc' : 'desc' }
    );
  }

  const sortedPlayers = useMemo(() => {
    const arr = [...filteredPlayers];
    arr.sort((a, b) => {
      const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredPlayers, sort, playerTotals, activePointsById]);

  // Realtime: refresh on any team_players or transfers change
  useEffect(() => {
    if (!team) return;
    const channel = supabase
      .channel(`market-team-players-rt-${competitionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_players',
        filter: `competition_id=eq.${competitionId}`,
      }, () => {
        refreshSquad();
        refreshTeam();
        refreshPlayers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers', filter: `team_id=eq.${team.id}` }, () => {
        refreshTransfers();
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

    setSwapping(true);
    setSwapError(null);

    // Fast client-side pre-checks (UX only — server enforces authoritatively)
    if (noTransfersLeft) {
      setSwapError(t('fantasy.market.errors.noTransfersLeft'));
      setSwapping(false);
      return;
    }
    if (isPlayerLocked(playerOut)) {
      setSwapError(t('fantasy.market.errors.playerLocked', { name: playerOut.name }));
      setSwapping(false);
      return;
    }
    if (isPlayerLocked(playerIn)) {
      setSwapError(t('fantasy.market.errors.playerLocked', { name: playerIn.name }));
      setSwapping(false);
      return;
    }
    if (committedPlayerIds.has(playerOut.id)) {
      setSwapError(t('fantasy.market.errors.committedInNegotiation'));
      setSwapping(false);
      return;
    }
    if (budgetAfterSwap < committedCash) {
      setSwapError(t('fantasy.market.errors.insufficientBudgetCommitted'));
      setSwapping(false);
      return;
    }
    const gksAfter =
      squad.filter((p) => p.position === 'GK').length -
      (playerOut.position === 'GK' ? 1 : 0) +
      (playerIn.position === 'GK' ? 1 : 0);
    if (gksAfter < 1) {
      setSwapError(t('fantasy.market.errors.needGk'));
      setSwapping(false);
      return;
    }

    const { data, error } = await supabase.rpc('execute_transfer', {
      p_player_out_id: playerOut.id,
      p_player_in_id: playerIn.id,
    });

    const rpcError = error?.message ?? data?.error;
    if (rpcError) {
      setSwapError(rpcError);
      setSwapping(false);
      return;
    }

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
        {t('fantasy.market.loading')}
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">{t('fantasy.market.title')}</h1>
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-secondary">
          {t('fantasy.common.notRegistered')}
        </div>
      </div>
    );
  }

  if (!marketOpen) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">{t('fantasy.market.title')}</h1>
        <div className="bg-surface border border-warning/30 rounded-xl p-6 text-center">
          <p className="text-warning font-semibold">{t('fantasy.market.closedHeading')}</p>
          <p className="text-secondary text-sm mt-1">
            {t('fantasy.market.closedBody')}
          </p>
        </div>
      </div>
    );
  }

  if (team.status === 'eliminated') {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-primary">{t('fantasy.market.title')}</h1>
        <div className="bg-surface border border-error/30 rounded-xl p-6 text-center">
          <p className="text-error font-semibold">{t('fantasy.common.eliminatedReadOnly')}</p>
          <p className="text-secondary text-sm mt-1">
            {t('fantasy.market.eliminatedBody')}
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
          <h1 className="text-2xl font-bold text-primary">{t('fantasy.market.title')}</h1>
          <p className="text-secondary text-sm mt-0.5">
            {t('fantasy.market.subtitle')}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">
              {negWindow ? t('fantasy.market.budgetAvailable') : t('fantasy.market.budget')}
            </p>
            <p className="text-base font-bold text-tertiary">{formatPrice(effectiveBudget)}</p>
            {negWindow && committedCash > 0 && (
              <p className="text-xs text-muted mt-0.5">{t('fantasy.common.amountCommitted', { amount: formatPrice(committedCash) })}</p>
            )}
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
            <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.market.squadLabel')}</p>
            <p className="text-base font-bold text-primary">
              {squad.length}
              <span className="text-muted font-normal text-sm">/{maxSquadSize}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Transfer window banner ── */}
      {!activeTransferWindow ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-center">
          <p className="text-secondary font-semibold">{t('fantasy.market.seasonOver')}</p>
          <p className="text-muted text-sm mt-1">{t('fantasy.market.noMoreWindows')}</p>
        </div>
      ) : (
        <div className={`border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap ${noTransfersLeft ? 'bg-warning/5 border-warning/30' : 'bg-info/10 border-info/30'}`}>
          <div>
            <p className={`font-semibold ${noTransfersLeft ? 'text-warning' : 'text-info'}`}>
              {noTransfersLeft
                ? t('fantasy.market.noTransfersLeftHeading')
                : activeTransferWindow.is_preseason
                ? t('fantasy.market.preseasonUnlimited')
                : t('fantasy.market.windowFor', { name: activeTransferWindow.matchday_name })}
            </p>
            <p className="text-secondary text-sm mt-0.5">
              {noTransfersLeft
                ? t('fantasy.market.newTransfersNextWindow')
                : activeTransferWindow.closes_at
                ? t('fantasy.market.windowCloses', { date: formatDateTimeShort(activeTransferWindow.closes_at, lang) })
                : t('fantasy.market.playersLockAtKickoff')}
            </p>
          </div>
          <div className="flex items-center gap-6">
            {activeTransferWindow.max_transfers !== null ? (
              <>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{transfersRemaining}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.market.transferStats.remaining')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-secondary">{transfersUsedThisWindow}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.market.transferStats.used')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-muted">{activeTransferWindow.max_transfers}</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.market.transferStats.max')}</p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-2xl font-bold text-tertiary">∞</p>
                <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.market.transferStats.unlimited')}</p>
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
                  ? t('fantasy.market.offering', { name: offerOut.name })
                  : t('fantasy.market.pickToOffer')}
              </h3>
              {offerOut && (
                <p className="text-xs text-muted mt-0.5">
                  {t('fantasy.market.selectFreeAgent')}
                </p>
              )}
            </div>
            {offerOut && (
              <button
                onClick={() => { setOfferOut(null); setSwapError(null); }}
                className="text-xs text-secondary hover:text-primary px-2 py-1 rounded hover:bg-surface-hover transition-colors"
              >
                {t('fantasy.common.cancel')}
              </button>
            )}
          </div>
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5">
              {squad.map((p) => {
                const committed = committedPlayerIds.has(p.id);
                const locked = isPlayerLocked(p) || noTransfersLeft || committed;
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
                    {committed && (
                      <span className="text-label-caps text-info font-semibold text-xs flex-shrink-0">{t('fantasy.market.inNegotiation')}</span>
                    )}
                    {!committed && locked && (
                      <span className="text-label-caps text-warning font-semibold text-xs flex-shrink-0">{t('fantasy.market.lockedTag')}</span>
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
            <strong>{recentAction.outName}</strong> {t('fantasy.market.swapConnector')}{' '}
            <strong>{recentAction.inName}</strong>
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={filteredPlayers.length}
        countries={countries}
      />

      {/* ── Player table ── */}
      {filteredPlayers.length === 0 ? (
        <div className="text-center py-12 text-muted">
          {t('fantasy.market.noMatches')}
        </div>
      ) : (
        <Table>
          <Thead className="sticky top-0 z-10">
            <tr>
              <Th onClick={() => toggleSort('position')} className="cursor-pointer select-none">
                {t('fantasy.market.columns.position')} {sort.key === 'position' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('name')} className="cursor-pointer select-none">
                {t('fantasy.market.columns.player')} {sort.key === 'name' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('country')} className="hidden sm:table-cell cursor-pointer select-none">
                {t('fantasy.market.columns.country')} {sort.key === 'country' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('gp')} className="hidden sm:table-cell text-center cursor-pointer select-none">
                {t('fantasy.market.columns.gp')} {sort.key === 'gp' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('goals')} className="hidden sm:table-cell text-center cursor-pointer select-none">
                {t('fantasy.market.columns.goals')} {sort.key === 'goals' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('assists')} className="hidden sm:table-cell text-center cursor-pointer select-none">
                {t('fantasy.market.columns.assists')} {sort.key === 'assists' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('total_points')} className="text-center cursor-pointer select-none">
                {t('fantasy.market.columns.points')} {sort.key === 'total_points' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              {matchdayColumns.map((col) => (
                <Th
                  key={col.id}
                  onClick={() => toggleSort(`md:${col.id}`)}
                  className="text-center cursor-pointer select-none"
                  title={col.title}
                >
                  {col.label} {sort.key === `md:${col.id}` ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </Th>
              ))}
              <Th onClick={() => toggleSort('current_price')} className="text-right cursor-pointer select-none">
                {t('fantasy.market.columns.price')} {sort.key === 'current_price' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th onClick={() => toggleSort('owner')} className="hidden sm:table-cell cursor-pointer select-none">
                {t('fantasy.market.columns.owner')} {sort.key === 'owner' ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </Th>
              <Th>{t('fantasy.market.columns.action')}</Th>
              {statColumns.map((col) => (
                <Th
                  key={col.field}
                  onClick={() => toggleSort(col.field)}
                  className="text-center whitespace-nowrap cursor-pointer select-none"
                  title={col.label}
                >
                  {col.abbrev} {sort.key === col.field ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                </Th>
              ))}
            </tr>
          </Thead>
          <Tbody>
            {sortedPlayers.map((player) => {
              const isMine = player.owner?.userId === team?.user_id;
              const canAfford = offerOut
                ? effectiveBudget + offerOut.current_price - player.current_price >= 0
                : player.current_price <= effectiveBudget;
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
                  noTransfersLeft={noTransfersLeft}
                  onSwap={setConfirmSwapIn}
                  stats={{ ...(playerTotals[player.id] ?? {}), total_points: activePointsById[player.id] }}
                  matchdayColumns={matchdayColumns}
                  mdPoints={pointsByPlayerByMatchday[player.id]}
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
            <h2 className="text-lg font-bold text-primary">{t('fantasy.market.confirmModal.heading')}</h2>

            <div className="space-y-2">
              {/* Out */}
              <div className="bg-error/5 border border-error/30 rounded-xl p-3 flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(offerOut.position)}`}
                >
                  {offerOut.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-label-caps text-error font-semibold mb-0.5">{t('fantasy.market.confirmModal.out')}</p>
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
                  <p className="text-label-caps text-tertiary font-semibold mb-0.5">{t('fantasy.market.confirmModal.in')}</p>
                  <p className="text-sm font-semibold text-primary truncate">{confirmSwapIn.name}</p>
                </div>
                <span className="text-sm font-bold text-tertiary flex-shrink-0">
                  {formatPrice(confirmSwapIn.current_price)}
                </span>
              </div>
            </div>

            {confirmSwapIn.is_eliminated && (
              <div className="bg-error/10 border border-error/40 rounded-xl p-3 text-sm text-error font-medium">
                {t('fantasy.market.confirmModal.eliminatedWarning')}
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-secondary">
                <span>{t('fantasy.market.confirmModal.budgetBefore')}</span>
                <span className="text-primary">{formatPrice(budget)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>{t('fantasy.market.confirmModal.receivedFor', { name: offerOut.name })}</span>
                <span className="text-tertiary">+{formatPrice(offerOut.current_price)}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>{t('fantasy.market.confirmModal.costOf', { name: confirmSwapIn.name })}</span>
                <span className="text-error">−{formatPrice(confirmSwapIn.current_price)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5">
                <span className="text-secondary">{t('fantasy.market.confirmModal.budgetAfter')}</span>
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
                {t('fantasy.common.cancel')}
              </button>
              <button
                onClick={executeSwap}
                disabled={swapping || budgetAfterSwap < 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {swapping ? t('fantasy.market.confirmModal.submitting') : t('fantasy.market.confirmModal.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer history ── */}
      {transfers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-secondary">{t('fantasy.market.transferHistory.heading')}</h3>
          </div>
          <div className="divide-y divide-border">
            {transfers.map((tr) => (
              <div key={tr.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-label-caps font-semibold px-2 py-0.5 rounded bg-surface-hover text-secondary">
                  {tr.matchday_id ? `MD${tr.matchday_id}` : `W${tr.window_number}`}
                </span>
                <span className="text-error">
                  {tr.player_out?.name ?? t('fantasy.common.playerFallback', { id: tr.player_out_id })}
                </span>
                <span className="text-muted">→</span>
                <span className="text-tertiary">
                  {tr.player_in?.name ?? t('fantasy.common.playerFallback', { id: tr.player_in_id })}
                </span>
                {tr.price_difference != null && (
                  <span
                    className={`text-xs ml-auto ${
                      tr.price_difference >= 0 ? 'text-tertiary' : 'text-error'
                    }`}
                  >
                    {tr.price_difference >= 0 ? '+' : ''}
                    {Number(tr.price_difference).toFixed(1)}M
                  </span>
                )}
                <span className="text-xs text-muted w-full sm:w-auto sm:ml-auto">
                  {formatDate(tr.created_at, lang)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
