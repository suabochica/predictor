import { useState, useEffect } from 'react';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import { supabase } from '../lib/supabase';
import { AUCTION_STATUSES } from '../config/constants';

const STATUS_BADGE = {
  pending:   'bg-gray-700 text-gray-300',
  active:    'bg-emerald-700 text-emerald-100',
  paused:    'bg-yellow-600 text-yellow-100',
  completed: 'bg-blue-700 text-blue-200',
};

const POSITION_BADGE = {
  GK:  'bg-yellow-900 text-yellow-300',
  DEF: 'bg-blue-900 text-blue-300',
  MID: 'bg-emerald-900 text-emerald-300',
  FWD: 'bg-red-900 text-red-300',
};

export default function Admin() {
  const {
    auctionState,
    bids,
    loading,
    getHighestBid,
    startAuction,
    pauseAuction,
    resumeAuction,
    completeAuction,
    nextRound,
    resolveRound,
  } = useAuction();

  const { players, loading: playersLoading } = usePlayers();
  const [confirming, setConfirming] = useState(false);
  const [resolving, setResolving]   = useState(false);
  const [resolveErrors, setResolveErrors] = useState([]);

  // ── League Participants ────────────────────────────────────────────────────
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [addingTeamFor, setAddingTeamFor] = useState(null);

  useEffect(() => { fetchParticipants(); }, []);

  async function fetchParticipants() {
    setParticipantsLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, display_name, email, teams(id, name, budget_remaining)')
      .order('created_at', { ascending: true });
    setParticipants(data ?? []);
    setParticipantsLoading(false);
  }

  async function handleAddToLeague(user) {
    setAddingTeamFor(user.id);
    await supabase.from('teams').insert({
      user_id: user.id,
      name: user.display_name,
      budget_remaining: 105.0,
    });
    await fetchParticipants();
    setAddingTeamFor(null);
  }

  async function handleRemoveFromLeague(userId) {
    await supabase.from('teams').delete().eq('user_id', userId);
    await fetchParticipants();
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-gray-400 p-6">Loading auction state…</div>;
  }
  if (!auctionState) {
    return (
      <div className="text-red-400 p-6">
        No auction state found. Run the seed SQL in Supabase.
      </div>
    );
  }

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState;
  const isPending   = status === AUCTION_STATUSES.PENDING;
  const isActive    = status === AUCTION_STATUSES.ACTIVE;
  const isPaused    = status === AUCTION_STATUSES.PAUSED;
  const isCompleted = status === AUCTION_STATUSES.COMPLETED;

  const currentRoundBids = bids.filter((b) => b.round_number === current_round);
  const biddedPlayerIds  = [...new Set(currentRoundBids.map((b) => b.player_id))];

  // Build winner summary for the confirmation panel
  const winnersPreview = biddedPlayerIds.map((playerId) => {
    const highBid = getHighestBid(playerId);
    return {
      playerId,
      playerName: highBid?.players?.name ?? `Player #${playerId}`,
      position:   highBid?.players?.position ?? '—',
      winnerName: highBid?.users?.display_name ?? '?',
      amount:     highBid?.bid_amount ?? 0,
      bidCount:   currentRoundBids.filter((b) => b.player_id === playerId).length,
    };
  });

  async function handleResolveAndAdvance() {
    setResolving(true);
    setResolveErrors([]);
    const { errors } = await resolveRound();
    if (errors.length > 0) {
      setResolveErrors(errors);
      setResolving(false);
      return; // stay on confirmation panel so admin can see errors
    }
    await nextRound();
    setResolving(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${STATUS_BADGE[status]}`}>
          {status}
        </span>
      </div>

      {/* ── League Participants ──────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white">League Participants</h2>
          {!participantsLoading && (
            <span className="text-sm text-gray-500">
              {participants.filter((u) => u.teams).length} of {participants.length} users enrolled
            </span>
          )}
        </div>

        {isCompleted && (
          <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
            Auction complete. New enrollments will access unwon players via the free market.
          </p>
        )}

        {participantsLoading ? (
          <p className="text-gray-500 text-sm">Loading users…</p>
        ) : participants.length === 0 ? (
          <p className="text-gray-500 text-sm">No registered users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-medium">User</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Budget</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {participants.map((u) => (
                  <tr key={u.id} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2.5 pr-4 text-white font-medium">{u.display_name}</td>
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      {u.teams ? (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900 text-emerald-300">
                          Enrolled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400">
                          No team
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-400">
                      {u.teams ? `£${Number(u.teams.budget_remaining).toFixed(1)}` : '—'}
                    </td>
                    <td className="py-2.5">
                      {u.teams ? (
                        <button
                          onClick={() => handleRemoveFromLeague(u.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToLeague(u)}
                          disabled={addingTeamFor === u.id}
                          className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                        >
                          {addingTeamFor === u.id ? 'Adding…' : 'Add to League'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Auction Controls ─────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">Auction Controls</h2>

        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-gray-500 mb-1">Round</p>
            <p className="text-white text-2xl font-bold">{current_round || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Round Duration</p>
            <p className="text-white text-2xl font-bold">{round_duration_seconds}s</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Round Started</p>
            <p className="text-white font-medium">
              {round_started_at
                ? new Date(round_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {isPending && (
            <button
              onClick={startAuction}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              Start Auction
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={pauseAuction}
                className="px-5 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-semibold transition-colors"
              >
                Pause
              </button>
              <button
                onClick={() => { setConfirming(true); setResolveErrors([]); }}
                disabled={confirming}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-colors"
              >
                Resolve & Next Round →
              </button>
              <button
                onClick={completeAuction}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                Complete Auction
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button
                onClick={resumeAuction}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                Resume
              </button>
              <button
                onClick={completeAuction}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                Complete Auction
              </button>
            </>
          )}

          {isCompleted && (
            <p className="text-gray-500 text-sm italic">Auction is complete. No further actions available.</p>
          )}
        </div>
      </section>

      {/* ── Round Resolution Confirmation ───────────────────────────────── */}
      {confirming && (
        <section className="bg-gray-900 rounded-xl p-6 space-y-4 border border-emerald-800/50">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">
              Resolve Round {current_round} &amp; Advance
            </h2>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>

          {winnersPreview.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No bids were placed this round. Advancing will skip resolution.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium">Player</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Winning Bid</th>
                    <th className="pb-3 pr-4 font-medium">Winner</th>
                    <th className="pb-3 font-medium">Bids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {winnersPreview.map((row) => (
                    <tr key={row.playerId} className="text-gray-300">
                      <td className="py-2.5 pr-4 text-white font-medium">{row.playerName}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[row.position] ?? 'bg-gray-800 text-gray-400'}`}>
                          {row.position}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-bold text-emerald-400">
                        £{row.amount.toFixed(1)}
                      </td>
                      <td className="py-2.5 pr-4 text-white">{row.winnerName}</td>
                      <td className="py-2.5 text-gray-500">{row.bidCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resolveErrors.length > 0 && (
            <div className="bg-red-900/40 border border-red-800/50 rounded-lg p-4 space-y-1">
              <p className="text-red-300 text-sm font-semibold">Resolution errors — round not advanced:</p>
              {resolveErrors.map((e, i) => (
                <p key={i} className="text-red-400 text-xs">
                  Player #{e.playerId}: {e.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleResolveAndAdvance}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {resolving ? 'Resolving…' : `Confirm & Advance to Round ${current_round + 1}`}
            </button>
            <button
              onClick={() => { setConfirming(false); setResolveErrors([]); }}
              disabled={resolving}
              className="px-5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Live Bids ────────────────────────────────────────────────────── */}
      {(isActive || isPaused) && (
        <section className="bg-gray-900 rounded-xl p-6 space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-white">
              Round {current_round} — Live Bids
            </h2>
            <span className="text-sm text-gray-500">
              {currentRoundBids.length} bid{currentRoundBids.length !== 1 ? 's' : ''} across {biddedPlayerIds.length} player{biddedPlayerIds.length !== 1 ? 's' : ''}
            </span>
          </div>

          {biddedPlayerIds.length === 0 ? (
            <p className="text-gray-500 text-sm">No bids placed yet this round.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium">Player</th>
                    <th className="pb-3 pr-4 font-medium">Pos</th>
                    <th className="pb-3 pr-4 font-medium">Listed</th>
                    <th className="pb-3 pr-4 font-medium">Top Bid</th>
                    <th className="pb-3 pr-4 font-medium">Leading</th>
                    <th className="pb-3 font-medium">Bids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {biddedPlayerIds.map((playerId) => {
                    const highBid    = getHighestBid(playerId);
                    const player     = highBid?.players;
                    const position   = player?.position ?? '—';
                    const playerBids = currentRoundBids.filter((b) => b.player_id === playerId);

                    return (
                      <tr key={playerId} className="text-gray-300 hover:bg-gray-800/40">
                        <td className="py-3 pr-4 font-medium text-white">
                          {player?.name ?? `Player #${playerId}`}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[position] ?? 'bg-gray-800 text-gray-400'}`}>
                            {position}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          £{player?.price?.toFixed(1) ?? '—'}
                        </td>
                        <td className="py-3 pr-4 font-bold text-emerald-400">
                          £{highBid?.bid_amount?.toFixed(1)}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {highBid?.users?.display_name ?? '—'}
                        </td>
                        <td className="py-3 text-gray-500">{playerBids.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Player Pool ──────────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white">Player Pool</h2>
          {!playersLoading && (
            <span className="text-sm text-gray-500">{players.length} players</span>
          )}
        </div>

        {playersLoading ? (
          <p className="text-gray-500 text-sm">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="text-gray-500 text-sm">No players found. Run the seed SQL.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Pos</th>
                  <th className="pb-3 pr-4 font-medium">Country</th>
                  <th className="pb-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {players.map((p) => (
                  <tr key={p.id} className="text-gray-300 hover:bg-gray-800/40">
                    <td className="py-2 pr-4 text-white font-medium">{p.name}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${POSITION_BADGE[p.position] ?? 'bg-gray-800 text-gray-400'}`}>
                        {p.position}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{p.country ?? '—'}</td>
                    <td className="py-2 font-semibold text-white">£{p.price?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
