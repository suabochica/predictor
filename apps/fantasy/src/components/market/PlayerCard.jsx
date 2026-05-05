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
      className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
        owned
          ? 'border-emerald-800/60 opacity-70'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      {/* Top row: position + price + market-only badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded ${getPositionColor(player.position)}`}
        >
          {player.position}
        </span>
        <div className="flex items-center gap-1.5">
          {isMarketOnly && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-800/60 text-purple-300 border border-purple-700/40">
              Market only
            </span>
          )}
          <span className="text-sm font-bold text-emerald-400">{formatPrice(player.price)}</span>
        </div>
      </div>

      {/* Player info */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-white leading-tight">{player.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {player.country}
          {player.country_code ? ` · ${player.country_code}` : ''}
        </p>
      </div>

      {/* Buy button */}
      <button
        onClick={() => !disabled && onBuy(player)}
        disabled={disabled}
        title={disabledReason}
        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
          owned
            ? 'bg-emerald-900/40 text-emerald-400 cursor-default border border-emerald-800/50'
            : disabled
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
        }`}
      >
        {owned ? '✓ In Squad' : buyLabel}
      </button>
    </div>
  );
}
