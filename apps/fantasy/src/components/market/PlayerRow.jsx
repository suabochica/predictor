import { Td } from '@predictor/ui';
import { getPositionColor, formatPrice } from '../../lib/utils';

export default function PlayerRow({
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
  let actionLabel = `Buy £${player.price.toFixed(1)}M`;
  let disabled = false;
  let disabledReason = '';
  let actionStyle = 'bg-tertiary hover:brightness-90 text-primary cursor-pointer';
  let rowOpacity = '';

  if (isMine) {
    actionLabel = '✓ In Squad';
    disabled = true;
    actionStyle = 'bg-tertiary/10 text-tertiary cursor-default border border-tertiary/40';
    rowOpacity = 'opacity-70';
  } else if (owner) {
    actionLabel = `Owned: ${owner.teamName}`;
    disabled = true;
    disabledReason = `Owned by ${owner.teamName}`;
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
    rowOpacity = 'opacity-60';
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
    <tr className={`hover:bg-surface-hover/50 ${rowOpacity}`}>
      <Td className="py-2 px-3 w-12 shrink-0">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${getPositionColor(player.position)}`}>
          {player.position}
        </span>
      </Td>
      <Td className="min-w-[160px] py-2 max-w-[220px]">
        <span className="block truncate font-semibold text-primary">{player.name}</span>
      </Td>
      <Td className="py-2 text-xs text-secondary whitespace-nowrap">
        {player.country}
        {player.country_code ? ` · ${player.country_code}` : ''}
      </Td>
      <Td className="py-2 text-right text-sm font-bold text-tertiary whitespace-nowrap">
        {formatPrice(player.price)}
      </Td>
      <Td className="py-2 text-xs text-secondary truncate max-w-[120px]">
        {owner && !isMine ? owner.teamName : null}
      </Td>
      <Td className="py-2 w-40 shrink-0">
        <button
          onClick={handleClick}
          disabled={disabled}
          title={disabledReason}
          className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${actionStyle}`}
        >
          {actionLabel}
        </button>
      </Td>
    </tr>
  );
}
