import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@predictor/supabase';
import { Table, Thead, Tbody, Th } from '@predictor/ui';
import { useAuction } from '../context/AuctionContext';
import { usePlayers } from '../hooks/usePlayers';
import { useTeam } from '../hooks/useTeam';
import AuctionTimer from '../components/auction/AuctionTimer';
import AuctionPlayerRow from '../components/auction/AuctionPlayerRow';
import {
  AUCTION_STATUSES,
  MIN_BID_INCREMENT,
  MAX_SQUAD_SIZE,
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


export default function Auction() {
  const { user } = useAuth();
  const { team, players: teamPlayers } = useTeam();
  const { auctionState, bids, ownedPlayerIds, playerOwners, loading, getHighestBid, getContestFloor, placeBid, refreshBids } = useAuction();
  const { players, loading: playersLoading } = usePlayers();

  const [posFilter, setPosFilter]         = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');
  const [bidAmounts, setBidAmounts]       = useState({});
  const [submitting, setSubmitting]       = useState(new Set());
  const [errors, setErrors]              = useState({});
  const [roundExpired, setRoundExpired]  = useState(false);
  const [bidsTab, setBidsTab]            = useState('my');

  const handleRoundExpire = useCallback(() => setRoundExpired(true), []);

  useEffect(() => { setRoundExpired(false); }, [auctionState?.current_round, auctionState?.round_started_at]);

  if (loading || !auctionState) {
    return <div className="text-secondary p-6">Loading auction…</div>;
  }

  const { status, current_round, round_duration_seconds, round_started_at } = auctionState;
  const isActive = status === AUCTION_STATUSES.ACTIVE;

  const currentRoundBids = bids.filter((b) => b.round_number === current_round);
  const myBids           = currentRoundBids.filter((b) => b.user_id === user?.id);
  const myBidCount       = myBids.length;

  const squadSize       = teamPlayers?.length ?? 0;
  const freeSlots       = MAX_SQUAD_SIZE - squadSize;
  const effectiveBudget = (team?.budget_remaining ?? 0) - myBids.reduce((s, b) => s + b.bid_amount, 0);

  const gkOwned = (teamPlayers ?? []).filter((tp) => tp.players?.position === 'GK').length;
  const gkInActiveBids = myBids.some((b) => b.players?.position === 'GK');

  const countries = useMemo(
    () => ['All', ...[...new Set(players.map((p) => p.country).filter(Boolean))].sort()],
    [players]
  );

  const filteredPlayers = players.filter((p) => {
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
        gkOwned,
        playerPosition: player.position,
      });
      if (error) {
        setErrors((prev) => ({
          ...prev,
          [playerId]: typeof error === 'string' ? error : error.message,
        }));
      } else {
        setBidAmounts((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
        refreshBids();
      }
    } catch {
      setErrors((prev) => ({ ...prev, [playerId]: 'Failed to place bid. Please try again.' }));
    } finally {
      setSubmitting((prev) => { const n = new Set(prev); n.delete(playerId); return n; });
    }
  }

  // Group all current-round bids by player for the "All Bids" tab.
  const allBidsByPlayer = useMemo(() => {
    const byPlayer = new Map();
    for (const bid of currentRoundBids) {
      if (!byPlayer.has(bid.player_id)) {
        byPlayer.set(bid.player_id, []);
      }
      byPlayer.get(bid.player_id).push(bid);
    }
    return [...byPlayer.entries()].map(([playerId, playerBids]) => {
      const highBid       = getHighestBid(playerId);
      const uniqueBidders = new Set(playerBids.map((b) => b.user_id)).size;
      const player        = players.find((p) => p.id === playerId);
      return { playerId, player, playerBids, highBid, uniqueBidders };
    }).sort((a, b) => (b.highBid?.bid_amount ?? 0) - (a.highBid?.bid_amount ?? 0));
  }, [currentRoundBids, players]);

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
                  /{freeSlots}
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

      {/* ── Team Summary ─────────────────────────────────────────────── */}
      {team && (
        <section className="bg-surface rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Budget */}
            <div className="space-y-1">
              <p className="text-xs text-muted uppercase tracking-wider font-medium">Budget</p>
              <p className="text-xl font-bold text-primary tabular-nums">
                £{team.budget_remaining.toFixed(1)}M
              </p>
              {isActive && myBids.length > 0 && (
                <p className="text-xs text-secondary">
                  Effective:{' '}
                  <span className={`font-semibold ${effectiveBudget < 0 ? 'text-error' : 'text-tertiary'}`}>
                    £{effectiveBudget.toFixed(1)}M
                  </span>{' '}
                  <span className="text-muted">after active bids</span>
                </p>
              )}
            </div>

            {/* Squad progress */}
            <div className="space-y-1">
              <p className="text-xs text-muted uppercase tracking-wider font-medium">Squad</p>
              <p className="text-xl font-bold text-primary tabular-nums">
                {squadSize}
                <span className="text-muted text-base font-normal">/{MAX_SQUAD_SIZE}</span>
              </p>
              <p className="text-xs text-secondary">
                {freeSlots} slot{freeSlots !== 1 ? 's' : ''} remaining
              </p>
            </div>

            {/* By Position — informational only, warn if no GK */}
            <div className="space-y-1">
              <p className="text-xs text-muted uppercase tracking-wider font-medium">By Position</p>
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                {POSITIONS.map((pos) => {
                  const acquired   = (teamPlayers ?? []).filter((tp) => tp.players?.position === pos).length;
                  const isGkMissing = pos === 'GK' && acquired === 0 && squadSize > 0;
                  return (
                    <div key={pos} className="flex items-center gap-1.5 text-sm">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${POSITION_BADGE[pos]}`}>
                        {pos}
                      </span>
                      <span className={isGkMissing ? 'text-error font-semibold' : 'text-primary'}>
                        {acquired}
                      </span>
                      {isGkMissing && <span className="text-error text-xs">Need ≥1 GK</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Acquired player list */}
          {squadSize > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted hover:text-secondary font-medium select-none">
                Show {squadSize} acquired player{squadSize !== 1 ? 's' : ''}
              </summary>
              <div className="mt-3 space-y-1">
                {[...teamPlayers]
                  .sort((a, b) => (b.acquisition_price ?? 0) - (a.acquisition_price ?? 0))
                  .map((tp) => (
                    <div
                      key={tp.id}
                      className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                            POSITION_BADGE[tp.players?.position] ?? 'bg-border text-secondary'
                          }`}
                        >
                          {tp.players?.position ?? '—'}
                        </span>
                        <span className="text-primary">{tp.players?.name ?? `Player #${tp.player_id}`}</span>
                      </div>
                      <span className="text-secondary tabular-nums">
                        £{(tp.acquisition_price ?? 0).toFixed(1)}M
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* ── My Bids / All Bids ───────────────────────────────────────── */}
      {(myBidCount > 0 || currentRoundBids.length > 0) && isActive && (
        <section className="bg-surface rounded-xl p-5 space-y-3">
          {/* Tab toggle */}
          <div className="flex items-center gap-1 border-b border-border pb-3">
            <button
              onClick={() => setBidsTab('my')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                bidsTab === 'my'
                  ? 'bg-tertiary text-primary'
                  : 'bg-surface-hover text-secondary hover:bg-border'
              }`}
            >
              My Bids {myBidCount > 0 && `(${myBidCount})`}
            </button>
            <button
              onClick={() => setBidsTab('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
                bidsTab === 'all'
                  ? 'bg-tertiary text-primary'
                  : 'bg-surface-hover text-secondary hover:bg-border'
              }`}
            >
              All Bids {currentRoundBids.length > 0 && `(${currentRoundBids.length})`}
            </button>
          </div>

          {/* My Bids tab */}
          {bidsTab === 'my' && (
            <>
              {myBidCount === 0 ? (
                <p className="text-muted text-sm">No bids placed yet this round.</p>
              ) : (
                <>
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
                      <span className="text-muted">{myBidCount}/{freeSlots} slots</span>
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
                              : 'bg-error/5 border border-error/30'
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
                            {bid.is_carryover && (
                              <span
                                title={`Carried over from Round ${bid.round_number - 1}`}
                                className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30"
                              >
                                ↩ R{bid.round_number - 1}
                              </span>
                            )}
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
                </>
              )}
            </>
          )}

          {/* All Bids tab */}
          {bidsTab === 'all' && (
            <>
              {allBidsByPlayer.length === 0 ? (
                <p className="text-muted text-sm">No bids placed yet this round.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Player</th>
                        <th className="pb-2 pr-4 font-medium">Pos</th>
                        <th className="pb-2 pr-4 font-medium">Top Bid</th>
                        <th className="pb-2 pr-4 font-medium">Leader</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {allBidsByPlayer.map(({ playerId, player, highBid, uniqueBidders }) => (
                        <tr key={playerId} className="text-secondary hover:bg-surface-hover/40">
                          <td className="py-2 pr-4 font-medium text-primary">
                            {player?.name ?? `Player #${playerId}`}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${POSITION_BADGE[player?.position] ?? 'bg-border text-secondary'}`}>
                              {player?.position ?? '—'}
                            </span>
                          </td>
                          <td className="py-2 pr-4 font-bold text-tertiary">
                            £{highBid?.bid_amount?.toFixed(1) ?? '—'}
                          </td>
                          <td className="py-2 pr-4 text-primary text-xs">
                            {highBid?.users?.display_name ?? '—'}
                          </td>
                          <td className="py-2">
                            {uniqueBidders > 1 ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                                ⚡ Contested ({uniqueBidders})
                              </span>
                            ) : (
                              <span className="text-xs text-tertiary font-medium">Leading</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
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

      {/* ── Player table ─────────────────────────────────────────────── */}
      {playersLoading ? (
        <p className="text-muted text-sm">Loading players…</p>
      ) : (
        <Table>
          <Thead className="sticky top-0 z-10">
            <tr>
              <Th>Pos</Th>
              <Th>Player</Th>
              <Th>Country</Th>
              <Th className="text-right">Listed</Th>
              <Th className="text-right">Top bid</Th>
              <Th>Status</Th>
              <Th>Bid</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredPlayers.map((player) => {
              const isOwned       = ownedPlayerIds.has(player.id);
              const ownerInfo     = playerOwners.get(player.id);
              const ownerLabel    = !isOwned ? null
                : ownerInfo?.userId === user?.id
                  ? 'In your squad'
                  : `Owned: ${ownerInfo?.teamName ?? 'Another team'}`;
              const highBid       = getHighestBid(player.id);
              const contestFloor  = getContestFloor(player.id);
              const isContested   = contestFloor !== null;
              const myBidOnPlayer = myBids.find((b) => b.player_id === player.id);
              const isLeading     = !!myBidOnPlayer && highBid?.user_id === user?.id;
              const isGkReserved  =
                player.position !== 'GK' &&
                gkOwned === 0 &&
                !gkInActiveBids &&
                squadSize + myBidCount + 1 > MAX_SQUAD_SIZE - 1;
              const canBid        = isActive && !roundExpired && !myBidOnPlayer && !isOwned && myBidCount < freeSlots && !isGkReserved;
              const minBid        = minBidFor(player);
              const isSubmitting  = submitting.has(player.id);

              return (
                <AuctionPlayerRow
                  key={player.id}
                  player={player}
                  ownerLabel={ownerLabel}
                  isLeading={isLeading}
                  contestFloor={contestFloor}
                  isContested={isContested}
                  highBid={highBid}
                  myBidOnPlayer={myBidOnPlayer}
                  canBid={canBid}
                  isGkReserved={isGkReserved}
                  minBid={minBid}
                  isSubmitting={isSubmitting}
                  bidValue={bidAmounts[player.id]}
                  error={errors[player.id]}
                  onBidChange={(val) => setBidAmounts((prev) => ({ ...prev, [player.id]: val }))}
                  onBidSubmit={() => handleBid(player.id)}
                  isActive={isActive}
                  status={status}
                  myBidCount={myBidCount}
                  freeSlots={freeSlots}
                />
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
