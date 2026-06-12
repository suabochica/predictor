import { Td } from '@predictor/ui';
import { getPositionColor, formatPrice, fmtPts } from '../../lib/utils';
import { statColumns } from '../../lib/statColumns';

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
  windowOpen,
  offerOutName,
  isLocked,
  noTransfersLeft,
  onSwap,
  stats,
}) {
  let actionLabel = 'Elige jugador para intercambiar';
  let disabled = true;
  let disabledReason = '';
  let actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
  let rowOpacity = '';

  if (isMine) {
    actionLabel = '✓ En plantilla';
    actionStyle = 'bg-tertiary/10 text-tertiary cursor-default border border-tertiary/40';
    rowOpacity = 'opacity-70';
  } else if (owner) {
    actionLabel = `Dueño: ${owner.teamName}`;
    disabledReason = `Propiedad de ${owner.teamName}`;
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
    rowOpacity = 'opacity-60';
  } else if (isLocked) {
    actionLabel = 'Bloqueado';
    disabledReason = 'Partido iniciado';
    actionStyle = 'bg-warning/10 text-warning cursor-not-allowed border border-warning/30';
  } else if (noTransfersLeft) {
    actionLabel = 'Sin fichajes';
    disabledReason = 'Sin fichajes restantes en esta ventana';
    actionStyle = 'bg-surface-hover text-muted cursor-not-allowed border border-border';
  } else if (!windowOpen) {
    actionLabel = 'Sin ventana abierta';
    disabledReason = 'No hay ventana de fichajes abierta';
  } else if (offerOutName) {
    if (!canAfford) {
      actionLabel = 'Sin presupuesto';
      disabledReason = 'Presupuesto insuficiente para este cambio';
    } else {
      actionLabel = `Intercambiar con ${offerOutName}`;
      disabled = false;
      actionStyle = 'bg-tertiary hover:brightness-90 text-primary cursor-pointer';
    }
  }
  // else: no offerOut yet — "Pick player to swap out" (default)

  function handleClick() {
    if (disabled) return;
    onSwap(player);
  }

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
          value={fmtPts(stats?.total_points)}
          className="font-semibold text-tertiary hidden sm:table-cell"
        />

        {/* Price */}
        <Td className="py-2 text-right text-sm font-bold text-tertiary whitespace-nowrap">
          {formatPrice(player.current_price ?? player.price)}
        </Td>

        {/* Owner (hidden on mobile) */}
        <Td className="py-2 text-xs text-secondary truncate max-w-[120px] hidden sm:table-cell">
          {owner && !isMine ? owner.teamName : null}
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

        {/* Per-stat columns */}
        {statColumns.map((col) => (
          <Td key={col.field} className="py-2 text-center text-xs tabular-nums text-secondary">
            {stats?.[col.field] ?? '—'}
          </Td>
        ))}
      </tr>
    </>
  );
}
