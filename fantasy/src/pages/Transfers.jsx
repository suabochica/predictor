import { useState, useMemo } from 'react';
import { useTransfers } from '../hooks/useTransfers';
import { useTeam } from '../hooks/useTeam';
import { useLeague } from '../context/LeagueContext';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '../lib/supabase';
import { getPositionColor, formatPrice } from '../lib/utils';
import { LOCK_PRICE_THRESHOLD, TOTAL_BUDGET, POSITIONS } from '../config/constants';

// ── Small reusable components ─────────────────────────────────────────────

function PositionFilter({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {['All', ...POSITIONS].map((pos) => (
        <button
          key={pos}
          onClick={() => onChange(pos === 'All' ? '' : pos)}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
            (pos === 'All' && !value) || value === pos
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {pos}
        </button>
      ))}
    </div>
  );
}

function SquadPlayerRow({ player, selected, isOut, onSelect }) {
  const benchIdx = null; // not needed here
  return (
    <button
      onClick={() => onSelect(player)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        isOut
          ? 'ring-2 ring-red-500 bg-red-900/20'
          : selected
          ? 'ring-2 ring-emerald-500 bg-emerald-900/20'
          : 'hover:bg-gray-700/50'
      }`}
    >
      <span
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>
      <span className="text-sm text-white flex-1 truncate">{player.name}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{player.country_code}</span>
      <span className="text-xs text-emerald-400 flex-shrink-0 w-12 text-right">
        {formatPrice(player.acquisition_price)}
      </span>
      <span
        className={`text-[9px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded ${
          player.slot_type === 'locked'
            ? 'bg-purple-800/60 text-purple-300'
            : 'bg-blue-800/60 text-blue-300'
        }`}
      >
        {player.slot_type === 'locked' ? 'Locked' : 'Free'}
      </span>
    </button>
  );
}

function AvailablePlayerRow({ player, selected, canAfford, alreadyOwned, lockedSlot, onSelect }) {
  const tooExpensive = lockedSlot && player.price > LOCK_PRICE_THRESHOLD;
  const disabled = tooExpensive || alreadyOwned || !canAfford;

  return (
    <button
      onClick={() => !disabled && onSelect(player)}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        selected
          ? 'ring-2 ring-emerald-500 bg-emerald-900/20'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-gray-700/50'
      }`}
    >
      <span
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>
      <span className="text-sm text-white flex-1 truncate">{player.name}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{player.country_code}</span>
      <span className="text-xs text-emerald-400 flex-shrink-0 w-12 text-right">
        {formatPrice(player.price)}
      </span>
      {tooExpensive && (
        <span className="text-[9px] text-red-400 flex-shrink-0">{'>'}{LOCK_PRICE_THRESHOLD}M</span>
      )}
      {alreadyOwned && !tooExpensive && (
        <span className="text-[9px] text-gray-500 flex-shrink-0">Owned</span>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function Transfers() {
  const { activeTransferWindow, team, refreshTeam } = useLeague();
  const { players: squadRows, loading: teamLoading, refresh: refreshSquad } = useTeam();
  const { transfers, transfersUsedThisWindow, transfersRemaining, refresh: refreshTransfers } =
    useTransfers();
  const { players: allPlayers, loading: playersLoading } = usePlayers();

  const [playerOut, setPlayerOut] = useState(null); // squad player to remove
  const [playerIn, setPlayerIn] = useState(null);   // available player to add
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
        is_locked: tp.is_locked,
        slot_type: tp.slot_type,
        acquisition_price: tp.acquisition_price,
      })),
    [squadRows]
  );

  const ownedIds = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);

  // When playerOut is a locked slot, only ≤8.5M players are allowed in
  const isLockedSwap = playerOut?.slot_type === 'locked';

  // Budget impact preview
  const priceDiff = playerOut && playerIn
    ? Number((playerOut.acquisition_price - playerIn.price).toFixed(1))
    : null;
  const budgetAfter = priceDiff !== null ? Number((budget + priceDiff).toFixed(1)) : null;
  const budgetValid = budgetAfter !== null && budgetAfter >= 0 && budgetAfter + Number((squad.reduce((s, p) => s + p.price, 0) - playerOut?.price + playerIn?.price || 0).toFixed(1)) <= TOTAL_BUDGET;

  // Filter available players
  const availablePlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (ownedIds.has(p.id)) return false; // already in squad
      if (isLockedSwap && p.price > LOCK_PRICE_THRESHOLD) return false; // locked swap rule
      if (posFilter && p.position !== posFilter) return false;
      if (searchIn) {
        const q = searchIn.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.country?.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [allPlayers, ownedIds, isLockedSwap, posFilter, searchIn]);

  function selectPlayerOut(player) {
    if (playerOut?.id === player.id) {
      setPlayerOut(null);
      setPlayerIn(null);
    } else {
      setPlayerOut(player);
      setPlayerIn(null); // reset in when out changes
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

    // Validation
    if (transfersRemaining <= 0) {
      setTransferError('No transfers remaining in this window.');
      setTransferring(false);
      return;
    }
    if (isLockedSwap && playerIn.price > LOCK_PRICE_THRESHOLD) {
      setTransferError(`Locked slot replacement must be ≤${LOCK_PRICE_THRESHOLD}M.`);
      setTransferring(false);
      return;
    }
    if (budgetAfter < 0) {
      setTransferError('Insufficient budget for this transfer.');
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
      is_locked: playerOut.is_locked,
      acquisition_price: playerIn.price,
      slot_type: playerOut.slot_type,
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
      player_out_id: playerOut.id,
      player_in_id: playerIn.id,
      transfer_type: isLockedSwap ? 'locked_swap' : 'free_slot',
      price_difference: priceDiff,
    });

    // 5. Refresh everything
    await Promise.all([refreshSquad(), refreshTeam(), refreshTransfers()]);

    setSuccessMsg(`${playerOut.name} → ${playerIn.name} transfer complete!`);
    setPlayerOut(null);
    setPlayerIn(null);
    setTransferring(false);
    setTimeout(() => setSuccessMsg(null), 5000);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (teamLoading || playersLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading transfers…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Transfers</h1>
        <p className="text-gray-400 text-sm mt-0.5">Swap players in and out during transfer windows</p>
      </div>

      {/* ── Window status ── */}
      {!activeTransferWindow ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-gray-300 font-semibold">No transfer window is currently open</p>
          <p className="text-gray-500 text-sm mt-1">
            Transfer windows open after each league stage round. Check back after matchday results.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 max-w-sm mx-auto text-xs text-gray-500">
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <p className="font-semibold text-gray-300">Window 1</p>
              <p>After R32</p>
              <p className="text-emerald-600">7 transfers</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <p className="font-semibold text-gray-300">Window 2</p>
              <p>After R16</p>
              <p className="text-emerald-600">3 transfers</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <p className="font-semibold text-gray-300">Window 3</p>
              <p>After QF</p>
              <p className="text-emerald-600">3 transfers</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Window info banner */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-blue-300 font-semibold">
                Transfer Window {activeTransferWindow.window_number} — Open
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                {activeTransferWindow.closes_at
                  ? `Closes ${new Date(activeTransferWindow.closes_at).toLocaleString()}`
                  : 'Deadline TBD'}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{transfersRemaining}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Remaining</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{transfersUsedThisWindow}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Used</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-500">{activeTransferWindow.max_transfers}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Max</p>
              </div>
            </div>
          </div>

          {/* Locked swap info */}
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-3 text-xs text-gray-400">
            <span className="text-gray-300 font-semibold">Locked slot swaps: </span>
            incoming player must be ≤{LOCK_PRICE_THRESHOLD}M. Budget difference is applied.
            <span className="text-gray-300 font-semibold"> Free slot swaps: </span>
            any player allowed.
          </div>

          {/* Success / Error messages */}
          {successMsg && (
            <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl p-3 text-sm text-emerald-300">
              ✓ {successMsg}
            </div>
          )}
          {transferError && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 text-sm text-red-300">
              {transferError}
            </div>
          )}

          {/* Transfer preview strip */}
          {(playerOut || playerIn) && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Transfer Preview
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Out */}
                <div className={`flex-1 min-w-[140px] rounded-lg p-3 border ${
                  playerOut ? 'border-red-700/60 bg-red-900/20' : 'border-dashed border-gray-700'
                }`}>
                  {playerOut ? (
                    <>
                      <p className="text-[10px] text-red-400 font-semibold uppercase mb-1">Out</p>
                      <p className="text-sm font-semibold text-white">{playerOut.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {playerOut.country} · {formatPrice(playerOut.acquisition_price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600 text-center py-1">Select player to transfer out</p>
                  )}
                </div>

                <span className="text-2xl text-gray-600">→</span>

                {/* In */}
                <div className={`flex-1 min-w-[140px] rounded-lg p-3 border ${
                  playerIn ? 'border-emerald-700/60 bg-emerald-900/20' : 'border-dashed border-gray-700'
                }`}>
                  {playerIn ? (
                    <>
                      <p className="text-[10px] text-emerald-400 font-semibold uppercase mb-1">In</p>
                      <p className="text-sm font-semibold text-white">{playerIn.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {playerIn.country} · {formatPrice(playerIn.price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600 text-center py-1">
                      {playerOut ? 'Select player to bring in' : 'Select out player first'}
                    </p>
                  )}
                </div>

                {/* Budget impact */}
                {priceDiff !== null && (
                  <div className="text-center min-w-[100px]">
                    <p className="text-xs text-gray-500 mb-1">Budget impact</p>
                    <p className={`text-sm font-bold ${priceDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {priceDiff >= 0 ? '+' : ''}{formatPrice(priceDiff)}
                    </p>
                    <p className="text-xs text-gray-400">{formatPrice(budgetAfter)} after</p>
                  </div>
                )}

                {/* Confirm button */}
                {playerOut && playerIn && (
                  <button
                    onClick={executeTransfer}
                    disabled={transferring || budgetAfter < 0 || transfersRemaining <= 0}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">My Squad</h3>
                <span className="text-xs text-gray-500">{squad.length} players</span>
              </div>
              <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
                {squad.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-6">No players in squad</p>
                ) : (
                  squad.map((p) => (
                    <SquadPlayerRow
                      key={p.id}
                      player={p}
                      selected={playerOut?.id === p.id}
                      isOut={playerOut?.id === p.id}
                      onSelect={selectPlayerOut}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Available Players */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-300">
                    Available Players
                    {isLockedSwap && (
                      <span className="ml-2 text-[10px] text-purple-300 font-normal">
                        (≤{LOCK_PRICE_THRESHOLD}M only — locked swap)
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-gray-500">{availablePlayers.length}</span>
                </div>
                <div className="space-y-2">
                  <PositionFilter value={posFilter} onChange={setPosFilter} />
                  <input
                    type="text"
                    placeholder="Search player…"
                    value={searchIn}
                    onChange={(e) => setSearchIn(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
              <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
                {!playerOut ? (
                  <p className="text-center text-gray-600 text-sm py-6">
                    Select a player from your squad first
                  </p>
                ) : availablePlayers.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-6">
                    No matching players available
                  </p>
                ) : (
                  availablePlayers.map((p) => (
                    <AvailablePlayerRow
                      key={p.id}
                      player={p}
                      selected={playerIn?.id === p.id}
                      canAfford={(budget + (playerOut?.acquisition_price ?? 0) - p.price) >= 0}
                      alreadyOwned={ownedIds.has(p.id)}
                      lockedSlot={isLockedSwap}
                      onSelect={selectPlayerIn}
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
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300">Transfer History</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {transfers.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                  W{t.window_number}
                </span>
                <span className="text-red-300">
                  {t.player_out?.name ?? `Player #${t.player_out_id}`}
                </span>
                <span className="text-gray-600">→</span>
                <span className="text-emerald-300">
                  {t.player_in?.name ?? `Player #${t.player_in_id}`}
                </span>
                {t.price_difference != null && (
                  <span
                    className={`text-xs ml-auto ${
                      t.price_difference >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {t.price_difference >= 0 ? '+' : ''}
                    {Number(t.price_difference).toFixed(1)}M
                  </span>
                )}
                <span className="text-xs text-gray-600 w-full sm:w-auto sm:ml-auto">
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
