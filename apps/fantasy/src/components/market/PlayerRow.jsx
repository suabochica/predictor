import { useState } from 'react';
import { Td } from '@predictor/ui';
import { getPositionColor, formatPrice } from '../../lib/utils';

function StatTd({ value, className = '' }) {
  return (
    <Td className={`py-2 text-center text-xs tabular-nums text-secondary hidden sm:table-cell ${className}`}>
      {value ?? '—'}
    </Td>
  );
}

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
  stats,
}) {
  const [expanded, setExpanded] = useState(false);

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

  const hasStats = stats && stats.gp > 0;

  return (
    <>
      <tr className={`hover:bg-surface-hover/50 ${rowOpacity}`}>
        {/* Pos */}
        <Td className="py-2 px-3 w-12 shrink-0">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${getPositionColor(player.position)}`}>
            {player.position}
          </span>
        </Td>

        {/* Player */}
        <Td className="min-w-[140px] py-2 max-w-[200px]">
          <span className="block truncate font-semibold text-primary">{player.name}</span>
        </Td>

        {/* Country (hidden on mobile) */}
        <Td className="py-2 text-xs text-secondary whitespace-nowrap hidden sm:table-cell">
          {player.country}
          {player.country_code ? ` · ${player.country_code}` : ''}
        </Td>

        {/* GP */}
        <StatTd value={stats?.gp} />

        {/* G */}
        <StatTd value={stats?.goals} />

        {/* A */}
        <StatTd value={stats?.assists} />

        {/* Pts */}
        <StatTd
          value={stats?.total_points}
          className="font-semibold text-tertiary hidden sm:table-cell"
        />

        {/* Price */}
        <Td className="py-2 text-right text-sm font-bold text-tertiary whitespace-nowrap">
          {formatPrice(player.price)}
        </Td>

        {/* Owner (hidden on mobile) */}
        <Td className="py-2 text-xs text-secondary truncate max-w-[120px] hidden sm:table-cell">
          {owner && !isMine ? owner.teamName : null}
        </Td>

        {/* Opta expand toggle (hidden on mobile) */}
        <Td className="py-2 w-6 text-center hidden sm:table-cell">
          {hasStats && (
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Hide Opta stats' : 'Show Opta stats'}
              className="text-muted hover:text-secondary text-xs leading-none focus-visible:outline-none"
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </Td>

        {/* Action */}
        <Td className="py-2 w-36 shrink-0">
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

      {/* Opta tail — expanded detail row */}
      {expanded && hasStats && (
        <tr className="bg-surface-hover/20">
          <td colSpan={11} className="px-4 py-2 text-xs text-secondary border-b border-border/50">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span><span className="text-muted">Min</span> {stats.minutes}</span>
              <span><span className="text-muted">SoT</span> {stats.shots_on_target}</span>
              <span><span className="text-muted">Blk</span> {stats.blocked_shots}</span>
              <span><span className="text-muted">Tkl</span> {stats.tackles}</span>
              <span><span className="text-muted">Int</span> {stats.interceptions}</span>
              <span><span className="text-muted">FW</span> {stats.fouls_won}</span>
              <span><span className="text-muted">PW</span> {stats.penalties_won}</span>
              <span><span className="text-muted">Sv</span> {stats.saves}</span>
              <span><span className="text-muted">PS</span> {stats.penalty_saves}</span>
              <span><span className="text-muted">CS</span> {stats.clean_sheets}</span>
              {stats.opta_points != null && (
                <span className="text-tertiary font-semibold">
                  Opta {Number(stats.opta_points).toFixed(1)}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
