import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@predictor/supabase';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import { useTeam } from '../hooks/useTeam';
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
    cls: 'bg-surface-hover text-secondary',
  },
  paused: {
    text: 'Auction is paused. Bidding is temporarily suspended.',
    cls: 'bg-warning/10 text-warning border border-warning/30',
  },
  completed: {
    text: 'The auction is complete. All squads have been finalised.',
    cls: 'bg-info/10 text-info border border-info/30',
  },
};

const POSITION_BADGE = {
  GK:  'bg-warning/15 text-warning',
  DEF: 'bg-info/15 text-info',
  MID: 'bg-tertiary/15 text-tertiary',
  FWD: 'bg-error/10 text-error',
};

const POSITION_GRADIENT = {
  GK:  'from-warning/10',
  DEF: 'from-info/10',
  MID: 'from-tertiary/10',
  FWD: 'from-error/10',
};

export default function Auction() {
  const { user } = useAuth();
  const { team, players: teamPlayers } = useTeam();
  const { auctionState, bids, ownedPlayerIds, loading, getHighestBid, getContestFloor, placeBid } = useAuction();
  const { players, loading: playersLoading } = usePlayers();

  const [posFilter, setPosFilter]       = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');
  const [bidAmounts, setBidAmounts] = useState({});
  const [submitting, setSubmitting] = useState(new Set());
  const [errors, setErrors]         = useState({});
  const [roundExpired, setRoundExpired] = useState(false);

  const handleRoundExpire = useCallback(() => setRoundExpired(true), []);

  // Reset expired flag whenever a new round starts
  useEffect(() => { setRoundExpired(false); }, [auctionState?.current_round, auctionState?.round_started_at]);

  if (loading || !auctionState) {
    return <div className="text-secondary p-6">Loading auction…</div>;
  }

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState;
  const isActive = status === AUCTION_STATUSES.ACTIVE;

  const currentRoundBids = bids.filter((b) => b.round_number === current_round);
  const myBids           = currentRoundBids.filter((b) => b.user_id === user?.id);
  const myBidCount       = myBids.length;

  const countries = useMemo(
    () => ['All', ...[...new Set(players.map((p) => p.country).filter(Boolean))].sort()],
    [players]
  );

  const filteredPlayers = players.filter((p) => {
    if (ownedPlayerIds.has(p.id)) return false;
    if (posFilter !== 'All' && p.position !== posFilter) return false;
    if (countryFilter !== 'All' && p.country !== countryFilter) return false;
    return true;
  });

  function minBidFor(player) {
    const floor = getContestFloor(player.id);
    if (floor !== null) return +(floor + MIN_BID_INCREMENT).toFixed(1);
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
      const { error } = await placeBid(playerId, amount, user.id, {
        budgetRemaining: team?.budget_remaining ?? 0,
        squadSize: teamPlayers?.length ?? 0,
      });
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
          <h1 className="text-2xl font-bold text-primary">Auction Room</h1>
          {isActive && (
            <p className="text-muted text-sm mt-1">Round {current_round}</p>
          )}
        </div>

        {isActive && (
          <div className="flex items-center gap-8">
            <AuctionTimer
              roundStartedAt={round_started_at}
              roundDurationSeconds={round_duration_seconds}
              onExpire={handleRoundExpire}
            />
            <div className="text-right">
              <p className="text-2xl font-bold text-primary tabular-nums">
                {myBidCount}
                <span className="text-muted text-base font-normal">
                  /{MAX_SIMULTANEOUS_BIDS}
                </span>
              </p>
              <p className="text-xs text-muted mt-0.5">bids this round</p>
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

      {/* ── Round expired banner ──────────────────────────────────────── */}
      {isActive && roundExpired && (
        <div className="rounded-xl px-5 py-4 text-sm font-medium bg-warning/10 text-warning border border-warning/30">
          Round {current_round} has ended — bidding locked. Waiting for admin to advance.
        </div>
      )}

      {/* ── My Bids ──────────────────────────────────────────────────── */}
      {myBidCount > 0 && (
        <section className="bg-surface rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-primary">
              My Bids — Round {current_round}
            </h2>
            <div className="flex gap-4 text-xs font-medium">
              <span className="text-tertiary">
                {myBids.filter((b) => getHighestBid(b.player_id)?.user_id === user?.id).length} leading
              </span>
              <span className="text-error">
                {myBids.filter((b) => getHighestBid(b.player_id)?.user_id !== user?.id).length} outbid
              </span>
              <span className="text-muted">{myBidCount}/{MAX_SIMULTANEOUS_BIDS} slots</span>
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
                      ? 'bg-tertiary/10 border border-tertiary/40'
                      : 'bg-error/5 border border-error/30/30'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ${
                        POSITION_BADGE[player?.position] ?? 'bg-border text-secondary'
                      }`}
                    >
                      {player?.position ?? '—'}
                    </span>
                    <span className="text-primary font-medium truncate">
                      {player?.name ?? `Player #${bid.player_id}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-3">
                    <span className="text-secondary text-xs">
                      Your bid:{' '}
                      <span className="text-primary font-semibold">£{bid.bid_amount.toFixed(1)}</span>
                    </span>
                    {isLeading ? (
                      <span className="text-tertiary text-xs font-semibold w-20 text-right">
                        Leading
                      </span>
                    ) : (
                      <span className="text-error text-xs font-semibold w-20 text-right">
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
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
              posFilter === pos
                ? 'bg-tertiary text-primary'
                : 'bg-surface-hover text-secondary hover:bg-border'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* ── Country filter ────────────────────────────────────────────── */}
      {countries.length > 2 && (
        <div className="flex gap-2 flex-wrap">
          {countries.map((country) => (
            <button
              key={country}
              onClick={() => setCountryFilter(country)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                countryFilter === country
                  ? 'bg-info text-primary'
                  : 'bg-surface-hover text-secondary hover:bg-border'
              }`}
            >
              {country}
            </button>
          ))}
        </div>
      )}

      {/* ── Player grid ──────────────────────────────────────────────── */}
      {playersLoading ? (
        <p className="text-muted text-sm">Loading players…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map((player) => {
            const isWon         = ownedPlayerIds.has(player.id);
            const highBid       = getHighestBid(player.id);
            const contestFloor  = getContestFloor(player.id);
            const isContested   = contestFloor !== null && !isWon;
            const myBidOnPlayer = myBids.find((b) => b.player_id === player.id);
            const isLeading     = myBidOnPlayer && highBid?.user_id === user?.id;
            const canBid        = isActive && !roundExpired && !isWon && !myBidOnPlayer && myBidCount < MAX_SIMULTANEOUS_BIDS;
            const minBid        = minBidFor(player);
            const isSubmitting  = submitting.has(player.id);

            return (
              <div
                key={player.id}
                className="bg-surface rounded-xl overflow-hidden border border-border flex flex-col"
              >
                {/* Card header */}
                <div
                  className={`bg-gradient-to-r ${POSITION_GRADIENT[player.position] ?? 'from-border/30'} to-transparent px-4 py-3 flex items-center justify-between gap-2`}
                >
                  <span className="text-primary font-semibold truncate">{player.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${POSITION_BADGE[player.position] ?? 'bg-border text-secondary'}`}
                  >
                    {player.position}
                  </span>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    {/* Country + listed price */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">{player.country}</span>
                      <span className="text-secondary">
                        Listed{' '}
                        <span className="text-primary font-semibold">£{player.price.toFixed(1)}</span>
                      </span>
                    </div>

                    {/* Highest bid */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">Top bid</span>
                      {highBid ? (
                        <span className="text-tertiary font-bold">
                          £{highBid.bid_amount.toFixed(1)}
                          <span className="text-muted font-normal ml-1.5">
                            — {highBid.users?.display_name ?? '?'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted italic text-xs">No bids yet</span>
                      )}
                    </div>

                    {/* Contested carry-over badge */}
                    {isContested && (
                      <div className="text-xs font-medium rounded-lg px-3 py-1.5 bg-warning/15 text-warning border border-warning/30">
                        ⚡ Contested — min bid £{(contestFloor + MIN_BID_INCREMENT).toFixed(1)} to win
                      </div>
                    )}

                    {/* My bid status badge */}
                    {!isWon && myBidOnPlayer && (
                      <div
                        className={`text-xs font-medium rounded-lg px-3 py-1.5 ${
                          isLeading
                            ? 'bg-tertiary/10 text-tertiary border border-tertiary/40/50'
                            : 'bg-error/10/50 text-error border border-error/30/50'
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
                          className="flex-1 min-w-0 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-primary text-sm placeholder-muted focus:outline-none focus:border-tertiary"
                        />
                        <button
                          onClick={() => handleBid(player.id)}
                          disabled={isSubmitting}
                          className="px-4 py-1.5 rounded-lg bg-tertiary hover:bg-tertiary disabled:opacity-50 text-primary text-sm font-semibold transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                        >
                          {isSubmitting ? '…' : 'Bid'}
                        </button>
                      </div>
                      {errors[player.id] && (
                        <p className="text-error text-xs" role="alert">{errors[player.id]}</p>
                      )}
                    </div>
                  )}

                  {/* Max bids reached */}
                  {isActive && !myBidOnPlayer && myBidCount >= MAX_SIMULTANEOUS_BIDS && (
                    <p className="text-xs text-muted italic pt-1">
                      Max bids reached for this round.
                    </p>
                  )}

                  {/* Auction not active */}
                  {!isActive && !myBidOnPlayer && (
                    <p className="text-xs text-secondary italic pt-1">
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
