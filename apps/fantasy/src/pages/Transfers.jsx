import { useState, useMemo } from 'react';
import { useTransfers } from '../hooks/useTransfers';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { usePlayers } from '../hooks/usePlayers';
import { usePlayerTotals } from '../hooks/usePlayerTotals';
import { useMatchdayLocks } from '../hooks/useMatchdayLocks';
import { supabase } from '@predictor/supabase';
import { getPositionColor, formatPrice } from '../lib/utils';
import { POSITIONS } from '../config/constants';
import { repointLineupPlayer } from '../lib/lineupSync';

// ── Small reusable components ─────────────────────────────────────────────

function PositionFilter({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {['All', ...POSITIONS].map((pos) => (
        <button
          key={pos}
          onClick={() => onChange(pos === 'All' ? '' : pos)}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
            (pos === 'All' && !value) || value === pos
              ? 'bg-tertiary text-primary'
              : 'bg-border text-secondary hover:bg-border-strong'
          }`}
        >
          {pos}
        </button>
      ))}
    </div>
  );
}

function PlayerStatsBadge({ stats }) {
  if (!stats || stats.gp === 0) return null;
  return (
    <span className="text-label-caps text-muted tabular-nums whitespace-nowrap hidden sm:inline">
      GP{stats.gp} G{stats.goals} A{stats.assists}{' '}
      <span className="text-tertiary">{stats.total_points}pts</span>
    </span>
  );
}

function LockBadge() {
  return (
    <span className="text-label-caps text-warning font-semibold hidden sm:inline">LOCKED</span>
  );
}

function SquadPlayerRow({ player, selected, isOut, isLocked, onSelect, stats }) {
  return (
    <button
      onClick={() => !isLocked && onSelect(player)}
      disabled={isLocked}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
        isLocked
          ? 'opacity-50 cursor-not-allowed'
          : isOut
          ? 'ring-2 ring-error bg-error/5'
          : selected
          ? 'ring-2 ring-tertiary bg-tertiary/5'
          : 'hover:bg-border/50'
      }`}
    >
      <span
        className={`text-label-caps font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>
      <span className="text-sm text-primary flex-1 truncate">{player.name}</span>
      {isLocked ? <LockBadge /> : <PlayerStatsBadge stats={stats} />}
      <span className="text-xs text-secondary flex-shrink-0">{player.country_code}</span>
      <span className="text-xs text-tertiary flex-shrink-0 w-12 text-right">
        {formatPrice(player.acquisition_price)}
      </span>
    </button>
  );
}

function AvailablePlayerRow({ player, selected, canAfford, isLocked, onSelect, stats }) {
  const disabled = !canAfford || isLocked;

  return (
    <button
      onClick={() => !disabled && onSelect(player)}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
        selected
          ? 'ring-2 ring-tertiary bg-tertiary/5'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-border/50'
      }`}
    >
      <span
        className={`text-label-caps font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>
      <span className="text-sm text-primary flex-1 truncate">{player.name}</span>
      {isLocked ? <LockBadge /> : <PlayerStatsBadge stats={stats} />}
      <span className="text-xs text-secondary flex-shrink-0">{player.country_code}</span>
      <span className="text-xs text-tertiary flex-shrink-0 w-12 text-right">
        {formatPrice(player.price)}
      </span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function Transfers() {
  const { activeTransferWindow, team, refreshTeam } = useLeague();
  const { players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { transfers, transfersUsedThisWindow, transfersRemaining, refresh: refreshTransfers } =
    useTransfers();
  const { players: allPlayers, loading: playersLoading } = usePlayers({ available: true });
  const { totals: playerTotals } = usePlayerTotals();
  const { lockTimeFor } = useMatchdayLocks(activeTransferWindow?.matchday_id);

  const [playerOut, setPlayerOut] = useState(null);
  const [playerIn, setPlayerIn] = useState(null);
  const [posFilter, setPosFilter] = useState('');
  const [searchIn, setSearchIn] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const budget = team?.budget_remaining ?? 0;

  // Normalize squad rows to flat player objects
  const squad = useMemo(
    () =>
      squadRows.map((tp) => ({
        id: tp.player_id,
        teamPlayerId: tp.id,
        name: tp.players?.name ?? 'Unknown',
        country: tp.players?.country ?? '',
        country_code: tp.players?.country_code ?? null,
        position: tp.players?.position ?? 'FWD',
        price: tp.players?.price ?? 0,
        acquisition_price: tp.acquisition_price,
      })),
    [squadRows]
  );

  function isPlayerLocked(player) {
    if (!player) return false;
    const lockMs = lockTimeFor(player.country);
    return lockMs !== null && Date.now() >= lockMs;
  }

  const ownedIds = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);

  const priceDiff = playerOut && playerIn
    ? Number((playerOut.acquisition_price - playerIn.price).toFixed(1))
    : null;
  const budgetAfter = priceDiff !== null ? Number((budget + priceDiff).toFixed(1)) : null;

  const availablePlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (posFilter && p.position !== posFilter) return false;
      if (searchIn) {
        const q = searchIn.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.country?.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [allPlayers, posFilter, searchIn]);

  function selectPlayerOut(player) {
    if (playerOut?.id === player.id) {
      setPlayerOut(null);
      setPlayerIn(null);
    } else {
      setPlayerOut(player);
      setPlayerIn(null);
      setTransferError(null);
    }
  }

  function selectPlayerIn(player) {
    setPlayerIn(playerIn?.id === player.id ? null : player);
    setTransferError(null);
  }

  async function executeTransfer() {
    if (!playerOut || !playerIn || !team || !activeTransferWindow) return;
    setTransferring(true);
    setTransferError(null);

    // Cap check (null = unlimited)
    if (transfersRemaining !== null && transfersRemaining <= 0) {
      setTransferError('No transfers remaining in this window.');
      setTransferring(false);
      return;
    }
    if (isPlayerLocked(playerOut)) {
      setTransferError(`${playerOut.name} is locked — their match has kicked off.`);
      setTransferring(false);
      return;
    }
    if (isPlayerLocked(playerIn)) {
      setTransferError(`${playerIn.name} is locked — their match has kicked off.`);
      setTransferring(false);
      return;
    }
    if (budgetAfter < 0) {
      setTransferError('Insufficient budget for this transfer.');
      setTransferring(false);
      return;
    }
    const gksAfter =
      squad.filter((p) => p.position === 'GK').length -
      (playerOut.position === 'GK' ? 1 : 0) +
      (playerIn.position === 'GK' ? 1 : 0);
    if (gksAfter < 1) {
      setTransferError('Transfer rejected: your squad must always have at least 1 goalkeeper.');
      setTransferring(false);
      return;
    }

    // 1. Remove outgoing player
    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', team.id)
      .eq('player_id', playerOut.id);

    if (deleteError) {
      setTransferError(deleteError.message);
      setTransferring(false);
      return;
    }

    // 2. Add incoming player
    const { error: insertError } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: playerIn.id,
      acquisition_price: playerIn.price,
    });

    if (insertError) {
      setTransferError(insertError.message);
      setTransferring(false);
      return;
    }

    // 3. Update budget
    const { error: budgetError } = await supabase
      .from('teams')
      .update({ budget_remaining: budgetAfter })
      .eq('id', team.id);

    if (budgetError) {
      setTransferError(budgetError.message);
      setTransferring(false);
      return;
    }

    // 4. Log transfer
    await supabase.from('transfers').insert({
      team_id: team.id,
      window_number: activeTransferWindow.window_number,
      matchday_id: activeTransferWindow.is_preseason ? null : activeTransferWindow.matchday_id,
      player_out_id: playerOut.id,
      player_in_id: playerIn.id,
      price_difference: priceDiff,
    });

    // 5. Repoint the upcoming matchday lineup
    await repointLineupPlayer(team.id, playerOut.id, playerIn.id);

    // 6. Refresh everything
    await Promise.all([refreshSquad(), refreshTeam(), refreshTransfers()]);

    setSuccessMsg(`${playerOut.name} → ${playerIn.name} transfer complete!`);
    setPlayerOut(null);
    setPlayerIn(null);
    setTransferring(false);
    setTimeout(() => setSuccessMsg(null), 5000);
  }

  const positionViolation = playerOut && playerIn && (
    squad.filter((p) => p.position === 'GK').length -
      (playerOut.position === 'GK' ? 1 : 0) +
      (playerIn.position === 'GK' ? 1 : 0)
  ) < 1;

  const confirmDisabled =
    transferring ||
    budgetAfter < 0 ||
    (transfersRemaining !== null && transfersRemaining <= 0) ||
    positionViolation ||
    isPlayerLocked(playerOut) ||
    isPlayerLocked(playerIn);

  // ── Render ─────────────────────────────────────────────────────────────

  if (teamLoading || playersLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        Loading transfers…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Transfers</h1>
        <p className="text-secondary text-sm mt-0.5">Swap players in and out during transfer windows</p>
      </div>

      {/* ── Window status ── */}
      {!activeTransferWindow ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-center">
          <p className="text-secondary font-semibold">Season complete</p>
          <p className="text-muted text-sm mt-1">No further transfer windows are open.</p>
        </div>
      ) : (
        <>
          {/* Window info banner */}
          <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-info font-semibold">
                {activeTransferWindow.is_preseason
                  ? 'Preseason — Unlimited Transfers'
                  : `${activeTransferWindow.matchday_name} Window`}
              </p>
              <p className="text-secondary text-sm mt-0.5">
                {activeTransferWindow.closes_at
                  ? `Window closes ${new Date(activeTransferWindow.closes_at).toLocaleString()}`
                  : 'Players lock when their match kicks off'}
              </p>
            </div>
            <div className="flex items-center gap-6">
              {activeTransferWindow.max_transfers !== null ? (
                <>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{transfersRemaining}</p>
                    <p className="text-label-caps text-muted uppercase tracking-wider">Remaining</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-secondary">{transfersUsedThisWindow}</p>
                    <p className="text-label-caps text-muted uppercase tracking-wider">Used</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted">{activeTransferWindow.max_transfers}</p>
                    <p className="text-label-caps text-muted uppercase tracking-wider">Max</p>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-2xl font-bold text-tertiary">∞</p>
                  <p className="text-label-caps text-muted uppercase tracking-wider">Unlimited</p>
                </div>
              )}
            </div>
          </div>

          {/* Success / Error messages */}
          {successMsg && (
            <div className="bg-tertiary/10 border border-tertiary/40/50 rounded-xl p-3 text-sm text-tertiary" role="alert">
              ✓ {successMsg}
            </div>
          )}
          {transferError && (
            <div className="bg-error/10/30 border border-error/30/50 rounded-xl p-3 text-sm text-error" role="alert">
              {transferError}
            </div>
          )}

          {/* Transfer preview strip */}
          {(playerOut || playerIn) && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                Transfer Preview
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Out */}
                <div className={`flex-1 min-w-[140px] rounded-lg p-3 border ${
                  playerOut ? 'border-error/30/60 bg-error/5' : 'border-dashed border-border'
                }`}>
                  {playerOut ? (
                    <>
                      <p className="text-label-caps text-error font-semibold uppercase mb-1">Out</p>
                      <p className="text-sm font-semibold text-primary">{playerOut.name}</p>
                      <p className="text-xs text-secondary mt-0.5">
                        {playerOut.country} · {formatPrice(playerOut.acquisition_price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted text-center py-1">Select player to transfer out</p>
                  )}
                </div>

                <span className="text-2xl text-muted">→</span>

                {/* In */}
                <div className={`flex-1 min-w-[140px] rounded-lg p-3 border ${
                  playerIn ? 'border-tertiary/40/60 bg-tertiary/5' : 'border-dashed border-border'
                }`}>
                  {playerIn ? (
                    <>
                      <p className="text-label-caps text-tertiary font-semibold uppercase mb-1">In</p>
                      <p className="text-sm font-semibold text-primary">{playerIn.name}</p>
                      <p className="text-xs text-secondary mt-0.5">
                        {playerIn.country} · {formatPrice(playerIn.price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted text-center py-1">
                      {playerOut ? 'Select player to bring in' : 'Select out player first'}
                    </p>
                  )}
                </div>

                {/* Budget impact */}
                {priceDiff !== null && (
                  <div className="text-center min-w-[100px]">
                    <p className="text-xs text-muted mb-1">Budget impact</p>
                    <p className={`text-sm font-bold ${priceDiff >= 0 ? 'text-tertiary' : 'text-error'}`}>
                      {priceDiff >= 0 ? '+' : ''}{formatPrice(priceDiff)}
                    </p>
                    <p className="text-xs text-secondary">{formatPrice(budgetAfter)} after</p>
                  </div>
                )}

                {/* Confirm button */}
                {playerOut && playerIn && (
                  <button
                    onClick={executeTransfer}
                    disabled={confirmDisabled}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:bg-tertiary text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  >
                    {transferring ? 'Transferring…' : 'Confirm Transfer'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Two-column panel ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* My Squad */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-secondary">My Squad</h3>
                <span className="text-xs text-muted">{squad.length} players</span>
              </div>
              <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
                {squad.length === 0 ? (
                  <p className="text-center text-muted text-sm py-6">No players in squad</p>
                ) : (
                  squad.map((p) => (
                    <SquadPlayerRow
                      key={p.id}
                      player={p}
                      selected={playerOut?.id === p.id}
                      isOut={playerOut?.id === p.id}
                      isLocked={isPlayerLocked(p)}
                      onSelect={selectPlayerOut}
                      stats={playerTotals[p.id] ?? null}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Available Players */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-secondary">
                    Available Players
                  </h3>
                  <span className="text-xs text-muted">{availablePlayers.length}</span>
                </div>
                <div className="space-y-2">
                  <PositionFilter value={posFilter} onChange={setPosFilter} />
                  <input
                    type="text"
                    placeholder="Search player…"
                    value={searchIn}
                    onChange={(e) => setSearchIn(e.target.value)}
                    className="w-full bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-tertiary"
                  />
                </div>
              </div>
              <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
                {!playerOut ? (
                  <p className="text-center text-muted text-sm py-6">
                    Select a player from your squad first
                  </p>
                ) : availablePlayers.length === 0 ? (
                  <p className="text-center text-muted text-sm py-6">
                    No matching players available
                  </p>
                ) : (
                  availablePlayers.map((p) => (
                    <AvailablePlayerRow
                      key={p.id}
                      player={p}
                      selected={playerIn?.id === p.id}
                      canAfford={(budget + (playerOut?.acquisition_price ?? 0) - p.price) >= 0}
                      isLocked={isPlayerLocked(p)}
                      onSelect={selectPlayerIn}
                      stats={playerTotals[p.id] ?? null}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Transfer history ── */}
      {transfers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-secondary">Transfer History</h3>
          </div>
          <div className="divide-y divide-border">
            {transfers.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-label-caps font-semibold px-2 py-0.5 rounded bg-surface-hover text-secondary">
                  {t.matchday_id ? `MD${t.matchday_id}` : `W${t.window_number}`}
                </span>
                <span className="text-error">
                  {t.player_out?.name ?? `Player #${t.player_out_id}`}
                </span>
                <span className="text-muted">→</span>
                <span className="text-tertiary">
                  {t.player_in?.name ?? `Player #${t.player_in_id}`}
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
