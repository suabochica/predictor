import { Td } from '@predictor/ui';
import { MAX_SIMULTANEOUS_BIDS } from '../../config/constants';

const POSITION_BADGE = {
  GK:  'bg-warning/15 text-warning',
  DEF: 'bg-info/15 text-info',
  MID: 'bg-tertiary/15 text-tertiary',
  FWD: 'bg-error/10 text-error',
};

export default function AuctionPlayerRow({
  player,
  ownerLabel,
  isLeading,
  isContested,
  contestFloor,
  highBid,
  myBidOnPlayer,
  canBid,
  isGkReserved,
  minBid,
  isSubmitting,
  bidValue,
  error,
  onBidChange,
  onBidSubmit,
  isActive,
  status,
  myBidCount,
}) {
  let statusPill = null;
  if (ownerLabel) {
    const isMine = ownerLabel === 'In your squad';
    statusPill = (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
        isMine
          ? 'bg-tertiary/10 text-tertiary border border-tertiary/40'
          : 'bg-surface-hover text-muted border border-border'
      }`}>
        {isMine ? '★ In your squad' : ownerLabel}
      </span>
    );
  } else if (isContested) {
    statusPill = (
      <div className="space-y-0.5">
        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-warning/15 text-warning border border-warning/30 whitespace-nowrap">
          ⚡ Contested
        </span>
        {contestFloor !== null && (
          <p className="text-xs text-muted">floor £{contestFloor.toFixed(1)}</p>
        )}
      </div>
    );
  } else if (myBidOnPlayer && isLeading) {
    statusPill = (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-tertiary/10 text-tertiary border border-tertiary/40 whitespace-nowrap">
        ✓ Leading
      </span>
    );
  } else if (myBidOnPlayer && !isLeading) {
    statusPill = (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-error/10 text-error border border-error/30 whitespace-nowrap">
        ✗ Outbid
      </span>
    );
  }

  let bidCell = null;
  if (canBid) {
    bidCell = (
      <div className="flex gap-1.5 items-center">
        <input
          type="number"
          step="0.1"
          min={minBid}
          placeholder={`£${minBid.toFixed(1)}`}
          value={bidValue ?? ''}
          onChange={(e) => onBidChange(e.target.value)}
          className="w-20 min-w-0 bg-surface-hover border border-border rounded px-2 py-1 text-primary text-xs placeholder-muted focus:outline-none focus:border-tertiary"
        />
        <button
          onClick={onBidSubmit}
          disabled={isSubmitting}
          className="px-3 py-1 rounded bg-tertiary hover:brightness-90 disabled:opacity-50 text-primary text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary shrink-0"
        >
          {isSubmitting ? '…' : 'Bid'}
        </button>
      </div>
    );
  } else if (isActive && isGkReserved) {
    bidCell = (
      <span className="text-xs text-warning italic">Last slot reserved for GK.</span>
    );
  } else if (isActive && !myBidOnPlayer && myBidCount >= MAX_SIMULTANEOUS_BIDS) {
    bidCell = (
      <span className="text-xs text-muted italic">Max bids reached.</span>
    );
  } else if (!isActive && !myBidOnPlayer) {
    bidCell = (
      <span className="text-xs text-secondary italic">
        Bidding {status === 'pending' ? 'not started' : status}.
      </span>
    );
  }

  return (
    <>
      <tr className="hover:bg-surface-hover/50">
        <Td className="py-2 px-3">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap ${POSITION_BADGE[player.position] ?? 'bg-border text-secondary'}`}>
            {player.position}
          </span>
        </Td>
        <Td className="min-w-[160px] py-2 max-w-[220px]">
          <span className="block truncate font-semibold text-primary">{player.name}</span>
        </Td>
        <Td className="py-2 text-secondary text-xs whitespace-nowrap">{player.country}</Td>
        <Td className="py-2 text-right text-xs text-secondary whitespace-nowrap">
          £{player.price.toFixed(1)}M
        </Td>
        <Td className="py-2 text-right text-xs whitespace-nowrap">
          {highBid ? (
            <>
              <span className="text-tertiary font-bold">£{highBid.bid_amount.toFixed(1)}</span>
              <span className="text-muted ml-1">— {highBid.users?.display_name ?? '?'}</span>
            </>
          ) : (
            <span className="text-muted italic">No bids</span>
          )}
        </Td>
        <Td className="py-2 whitespace-nowrap">{statusPill}</Td>
        <Td className="py-2">{bidCell}</Td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-3 pb-2 pt-0">
            <p className="text-error text-xs" role="alert">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}
