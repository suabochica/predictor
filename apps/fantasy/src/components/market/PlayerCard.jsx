import { getPositionColor, formatPrice } from '../../lib/utils';

export default function PlayerCard({
  player,
  isMine,
  owner,
  canAfford,
  squadFull,
  mustBuyGk,
  offerOutName,
  onBuy,
  onSwap,
}) {
  let actionLabel = `Buy ${formatPrice(player.price)}`;
  let disabled = false;
  let disabledReason = '';
  let actionStyle = 'bg-tertiary hover:brightness-90 text-primary cursor-pointer';
  let cardStyle = 'border-border hover:border-border-strong';

  if (isMine) {
    actionLabel = '✓ In Squad';
    disabled = true;
    actionStyle = 'bg-tertiary/10 text-tertiary cursor-default border border-tertiary/40';
    cardStyle = 'border-tertiary/40 opacity-70';
  } else if (owner) {
    actionLabel = `Owned: ${owner.teamName}`;
    disabled = true;
    disabledReason = `Owned by ${owner.teamName}`;
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
    cardStyle = 'border-border opacity-60';
  } else if (squadFull && offerOutName) {
    actionLabel = `Swap with ${offerOutName}`;
    actionStyle = 'bg-tertiary hover:brightness-90 text-primary cursor-pointer';
  } else if (squadFull) {
    actionLabel = 'Squad Full';
    disabled = true;
    disabledReason = 'You already have 15 players';
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
  } else if (mustBuyGk) {
    actionLabel = 'GK required';
    disabled = true;
    disabledReason = 'Last slot must be a GK — your squad has none';
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
  } else if (!canAfford) {
    actionLabel = 'Over Budget';
    disabled = true;
    disabledReason = 'Not enough budget';
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
  }

  function handleClick() {
    if (disabled) return;
    if (squadFull && offerOutName) {
      onSwap(player);
    } else {
      onBuy(player);
    }
  }

  return (
    <div
      className={`bg-surface border rounded-xl p-4 flex flex-col gap-3 transition-colors ${cardStyle}`}
    >
      {/* Top row: position + price */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-label-caps font-bold px-2 py-0.5 rounded ${getPositionColor(player.position)}`}
        >
          {player.position}
        </span>
        <span className="text-sm font-bold text-tertiary">{formatPrice(player.price)}</span>
      </div>

      {/* Player info */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-primary leading-tight">{player.name}</p>
        <p className="text-xs text-secondary mt-0.5">
          {player.country}
          {player.country_code ? ` · ${player.country_code}` : ''}
        </p>
      </div>

      {/* Action button */}
      <button
        onClick={handleClick}
        disabled={disabled}
        title={disabledReason}
        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${actionStyle}`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
