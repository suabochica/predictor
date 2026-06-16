import { getPositionColor, fmtPts } from '../../lib/utils';

export default function PlayerSlot({ player, isCaptain, isSelected, onClick, points, totalPoints, onInfoClick }) {
  const displayName = player.name.split(' ').slice(-1)[0];
  const countryCode =
    player.country_code ?? player.country?.slice(0, 3).toUpperCase() ?? '???';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(player)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(player); } }}
      className={`relative flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg text-center transition-all w-[68px] min-h-[68px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
        isSelected
          ? 'ring-2 ring-tertiary bg-tertiary/15 shadow-lg shadow-tertiary/15'
          : 'bg-surface/80 hover:bg-surface-hover border border-border/50'
      }`}
    >
      {/* Points badge — live matchday (top-left) */}
      {points !== null && points !== undefined && (
        <span
          className={`absolute -top-2 -left-1.5 bg-surface border border-tertiary/60 text-tertiary text-label-caps font-extrabold min-w-4 h-4 px-0.5 rounded flex items-center justify-center z-10 shadow${onInfoClick ? ' cursor-pointer hover:border-tertiary hover:bg-tertiary/10 transition-colors' : ''}`}
          onClick={onInfoClick ? (e) => { e.stopPropagation(); onInfoClick(player); } : undefined}
          title={onInfoClick ? 'Ver desglose de puntos' : undefined}
        >
          {fmtPts(points)}
        </span>
      )}

      {/* Total points badge — cumulative tournament (bottom-left) */}
      {totalPoints != null && (
        <span
          className={`absolute -bottom-2 -left-1.5 bg-surface border border-info/60 text-info text-label-caps font-extrabold min-w-4 h-4 px-0.5 rounded flex items-center justify-center z-10 shadow${onInfoClick ? ' cursor-pointer hover:border-info hover:bg-info/10 transition-colors' : ''}`}
          onClick={onInfoClick ? (e) => { e.stopPropagation(); onInfoClick(player); } : undefined}
          title={onInfoClick ? 'Puntos totales (todas las jornadas) — clic para desglose' : 'Puntos totales (todas las jornadas)'}
        >
          {fmtPts(totalPoints)}
        </span>
      )}

      {/* Captain badge (top-right) */}
      {isCaptain && (
        <span className="absolute -top-2 -right-1.5 bg-tertiary text-primary text-label-caps font-extrabold w-4 h-4 rounded-full flex items-center justify-center z-10 shadow">
          C
        </span>
      )}

      {/* Position badge */}
      <span
        className={`text-label-caps font-bold px-1.5 py-0.5 rounded ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>

      {/* Player name */}
      <span className="text-label-caps text-primary font-medium leading-tight break-words max-w-full hyphens-auto">
        {displayName}
      </span>

      {/* Country code */}
      <span className="text-label-caps text-secondary">{countryCode}</span>
    </div>
  );
}
