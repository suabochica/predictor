import { getPositionColor, formatPrice } from '../../lib/utils';
import { LOCK_PRICE_THRESHOLD } from '../../config/constants';

export default function PlayerCard({ player, owned, canAfford, squadFull, mustBuyGk, onBuy }) {
  const isLockable = player.price <= LOCK_PRICE_THRESHOLD;
  const isMarketOnly = !isLockable; // >8.5M — only obtainable here

  let buyLabel = `Buy ${formatPrice(player.price)}`;
  let disabled = false;
  let disabledReason = '';

  if (owned) {
    buyLabel = 'In Squad';
    disabled = true;
  } else if (squadFull) {
    buyLabel = 'Squad Full';
    disabled = true;
    disabledReason = 'You already have 15 players';
  } else if (mustBuyGk) {
    buyLabel = 'GK required';
    disabled = true;
    disabledReason = 'Last slot must be a GK — your squad has none';
  } else if (!canAfford) {
    buyLabel = 'Over Budget';
    disabled = true;
    disabledReason = `Not enough budget`;
  }

  return (
    <div
      className={`bg-surface border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
        owned
          ? 'border-tertiary/40 opacity-70'
          : 'border-border hover:border-border-strong'
      }`}
    >
      {/* Top row: position + price + market-only badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-label-caps font-bold px-2 py-0.5 rounded ${getPositionColor(player.position)}`}
        >
          {player.position}
        </span>
        <div className="flex items-center gap-1.5">
          {isMarketOnly && (
            <span className="text-label-caps font-semibold px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/30">
              Market only
            </span>
          )}
          <span className="text-sm font-bold text-tertiary">{formatPrice(player.price)}</span>
        </div>
      </div>

      {/* Player info */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-primary leading-tight">{player.name}</p>
        <p className="text-xs text-secondary mt-0.5">
          {player.country}
          {player.country_code ? ` · ${player.country_code}` : ''}
        </p>
      </div>

      {/* Buy button */}
      <button
        onClick={() => !disabled && onBuy(player)}
        disabled={disabled}
        title={disabledReason}
        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
          owned
            ? 'bg-tertiary/10 text-tertiary cursor-default border border-tertiary/40'
            : disabled
            ? 'bg-surface-hover text-muted cursor-not-allowed border border-border'
            : 'bg-tertiary hover:brightness-90 text-primary cursor-pointer'
        }`}
      >
        {owned ? '✓ In Squad' : buyLabel}
      </button>
    </div>
  );
}
