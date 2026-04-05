import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLeague } from '../context/LeagueContext';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import AuctionTimer from '../components/auction/AuctionTimer';
import {
  AUCTION_STATUSES,
  MIN_BID_INCREMENT,
  MAX_SIMULTANEOUS_BIDS,
  POSITIONS,
} from '../config/constants';

const STATUS_BANNER = {
  pending: {
    text: "The auction hasn't started yet. Check back soon.",
    cls: 'bg-gray-800 text-gray-400',
  },
  paused: {
    text: 'Auction is paused. Bidding is temporarily suspended.',
    cls: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800/50',
  },
  completed: {
    text: 'The auction is complete. All squads have been finalised.',
    cls: 'bg-blue-900/50 text-blue-300 border border-blue-800/50',
  },
};

const POSITION_BADGE = {
  GK:  'bg-yellow-900 text-yellow-300',
  DEF: 'bg-blue-900 text-blue-300',
  MID: 'bg-emerald-900 text-emerald-300',
  FWD: 'bg-red-900 text-red-300',
};

const POSITION_GRADIENT = {
  GK:  'from-yellow-900/30',
  DEF: 'from-blue-900/30',
  MID: 'from-emerald-900/30',
  FWD: 'from-red-900/30',
};

export default function Auction() {
  const { user } = useAuth();
  const { team } = useLeague();
  const { auctionState, bids, loading, getHighestBid, placeBid } = useAuction();
  const { players, loading: playersLoading } = usePlayers();

  const [posFilter, setPosFilter]   = useState('All');
  const [bidAmounts, setBidAmounts] = useState({});
  const [submitting, setSubmitting] = useState(new Set());
  const [errors, setErrors]         = useState({});

  if (loading || !auctionState) {
    return <div className="text-gray-400 p-6">Loading auction…</div>;
  }

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState;
  const isActive = status === AUCTION_STATUSES.ACTIVE;

  const currentRoundBids = bids.filter((b) => b.round_number === current_round);
  const myBids           = currentRoundBids.filter((b) => b.user_id === user?.id);
  const myBidCount       = myBids.length;
  // Players already won in any previous round — show a badge and disable bidding.
  const wonPlayerIds     = new Set(bids.filter((b) => b.is_winning).map((b) => b.player_id));

  const filteredPlayers =
    posFilter === 'All' ? players : players.filter((p) => p.position === posFilter);

  function minBidFor(player) {
    const high = getHighestBid(player.id);
    if (!high) return player.price;
    return +(high.bid_amount + MIN_BID_INCREMENT).toFixed(1);
  }

  async function handleBid(playerId) {
    if (!team) {
      setErrors((prev) => ({ ...prev, [playerId]: 'You must have a registered team to bid.' }));
      return;
    }

    const amount = parseFloat(bidAmounts[playerId]);
    const player = players.find((p) => p.id === playerId);
    const minBid = minBidFor(player);

    if (isNaN(amount) || amount < minBid) {
      setErrors((prev) => ({ ...prev, [playerId]: `Min bid: £${minBid.toFixed(1)}` }));
      return;
    }

    setSubmitting((prev) => new Set(prev).add(playerId));
    setErrors((prev) => { const n = { ...prev }; delete n[playerId]; return n; });

    try {
      const { error } = await placeBid(playerId, amount, user.id);
      if (error) {
        setErrors((prev) => ({
          ...prev,
          [playerId]: typeof error === 'string' ? error : error.message,
        }));
      } else {
        setBidAmounts((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
      }
    } catch {
      setErrors((prev) => ({ ...prev, [playerId]: 'Failed to place bid. Please try again.' }));
    } finally {
      setSubmitting((prev) => { const n = new Set(prev); n.delete(playerId); return n; });
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Auction Room</h1>
          {isActive && (
            <p className="text-gray-500 text-sm mt-1">Round {current_round}</p>
          )}
        </div>

        {isActive && (
          <div className="flex items-center gap-8">
            <AuctionTimer
              roundStartedAt={round_started_at}
              roundDurationSeconds={round_duration_seconds}
            />
            <div className="text-right">
              <p className="text-2xl font-bold text-white tabular-nums">
                {myBidCount}
                <span className="text-gray-500 text-base font-normal">
                  /{MAX_SIMULTANEOUS_BIDS}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">bids this round</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Status banner (pending / paused / completed) ──────────────── */}
      {STATUS_BANNER[status] && (
        <div className={`rounded-xl px-5 py-4 text-sm font-medium ${STATUS_BANNER[status].cls}`}>
          {STATUS_BANNER[status].text}
        </div>
      )}

      {/* ── My Bids ──────────────────────────────────────────────────── */}
      {myBidCount > 0 && (
        <section className="bg-gray-900 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-white">
              My Bids — Round {current_round}
            </h2>
            <div className="flex gap-4 text-xs font-medium">
              <span className="text-emerald-400">
                {myBids.filter((b) => getHighestBid(b.player_id)?.user_id === user?.id).length} leading
              </span>
              <span className="text-red-400">
                {myBids.filter((b) => getHighestBid(b.player_id)?.user_id !== user?.id).length} outbid
              </span>
              <span className="text-gray-500">{myBidCount}/{MAX_SIMULTANEOUS_BIDS} slots</span>
            </div>
          </div>

          <div className="space-y-2">
            {myBids.map((bid) => {
              const player    = players.find((p) => p.id === bid.player_id);
              const highBid   = getHighestBid(bid.player_id);
              const isLeading = highBid?.user_id === user?.id;

              return (
                <div
                  key={bid.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    isLeading
                      ? 'bg-emerald-900/30 border border-emerald-800/40'
                      : 'bg-red-900/20 border border-red-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ${
                        POSITION_BADGE[player?.position] ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {player?.position ?? '—'}
                    </span>
                    <span className="text-white font-medium truncate">
                      {player?.name ?? `Player #${bid.player_id}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-3">
                    <span className="text-gray-400 text-xs">
                      Your bid:{' '}
                      <span className="text-white font-semibold">£{bid.bid_amount.toFixed(1)}</span>
                    </span>
                    {isLeading ? (
                      <span className="text-emerald-400 text-xs font-semibold w-20 text-right">
                        Leading
                      </span>
                    ) : (
                      <span className="text-red-400 text-xs font-semibold w-20 text-right">
                        Outbid £{highBid?.bid_amount.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Position filter tabs ──────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {['All', ...POSITIONS].map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              posFilter === pos
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* ── Player grid ──────────────────────────────────────────────── */}
      {playersLoading ? (
        <p className="text-gray-500 text-sm">Loading players…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map((player) => {
            const isWon         = wonPlayerIds.has(player.id);
            const highBid       = getHighestBid(player.id);
            const myBidOnPlayer = myBids.find((b) => b.player_id === player.id);
            const isLeading     = myBidOnPlayer && highBid?.user_id === user?.id;
            const canBid        = isActive && !isWon && !myBidOnPlayer && myBidCount < MAX_SIMULTANEOUS_BIDS;
            const minBid        = minBidFor(player);
            const isSubmitting  = submitting.has(player.id);

            return (
              <div
                key={player.id}
                className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 flex flex-col"
              >
                {/* Card header */}
                <div
                  className={`bg-gradient-to-r ${POSITION_GRADIENT[player.position] ?? 'from-gray-800/30'} to-transparent px-4 py-3 flex items-center justify-between gap-2`}
                >
                  <span className="text-white font-semibold truncate">{player.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${POSITION_BADGE[player.position] ?? 'bg-gray-700 text-gray-300'}`}
                  >
                    {player.position}
                  </span>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    {/* Country + listed price */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{player.country}</span>
                      <span className="text-gray-400">
                        Listed{' '}
                        <span className="text-white font-semibold">£{player.price.toFixed(1)}</span>
                      </span>
                    </div>

                    {/* Highest bid */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Top bid</span>
                      {highBid ? (
                        <span className="text-emerald-400 font-bold">
                          £{highBid.bid_amount.toFixed(1)}
                          <span className="text-gray-500 font-normal ml-1.5">
                            — {highBid.users?.display_name ?? '?'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-600 italic text-xs">No bids yet</span>
                      )}
                    </div>

                    {/* Won badge */}
                    {isWon && (
                      <div className="text-xs font-medium rounded-lg px-3 py-1.5 bg-purple-900/50 text-purple-300 border border-purple-800/50">
                        ✓ Won — player is on a squad
                      </div>
                    )}

                    {/* My bid status badge */}
                    {!isWon && myBidOnPlayer && (
                      <div
                        className={`text-xs font-medium rounded-lg px-3 py-1.5 ${
                          isLeading
                            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800/50'
                            : 'bg-red-900/50 text-red-300 border border-red-800/50'
                        }`}
                      >
                        {isLeading ? '✓ Leading' : '✗ Outbid'} — Your bid:{' '}
                        <span className="font-bold">£{myBidOnPlayer.bid_amount.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  {/* Bid input */}
                  {canBid && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min={minBid}
                          placeholder={`£${minBid.toFixed(1)}`}
                          value={bidAmounts[player.id] ?? ''}
                          onChange={(e) =>
                            setBidAmounts((prev) => ({ ...prev, [player.id]: e.target.value }))
                          }
                          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => handleBid(player.id)}
                          disabled={isSubmitting}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0"
                        >
                          {isSubmitting ? '…' : 'Bid'}
                        </button>
                      </div>
                      {errors[player.id] && (
                        <p className="text-red-400 text-xs">{errors[player.id]}</p>
                      )}
                    </div>
                  )}

                  {/* Max bids reached */}
                  {isActive && !myBidOnPlayer && myBidCount >= MAX_SIMULTANEOUS_BIDS && (
                    <p className="text-xs text-gray-600 italic pt-1">
                      Max bids reached for this round.
                    </p>
                  )}

                  {/* Auction not active */}
                  {!isActive && !myBidOnPlayer && (
                    <p className="text-xs text-gray-700 italic pt-1">
                      Bidding {status === 'pending' ? 'not started' : status}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
