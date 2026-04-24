import { getPositionColor } from '../../lib/utils';

export default function PlayerSlot({ player, isCaptain, isSelected, onClick }) {
  // Shorten name to last name for display
  const displayName = player.name.split(' ').slice(-1)[0];
  const countryCode =
    player.country_code ?? player.country?.slice(0, 3).toUpperCase() ?? '???';

  return (
    <button
      onClick={() => onClick(player)}
      className={`relative flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg text-center transition-all w-[68px] min-h-[68px] ${
        isSelected
          ? 'ring-2 ring-emerald-400 bg-emerald-900/60 shadow-lg shadow-emerald-900/50'
          : 'bg-gray-900/80 hover:bg-gray-800 border border-gray-700/50'
      }`}
    >
      {/* Captain badge */}
      {isCaptain && (
        <span className="absolute -top-2 -right-1.5 bg-yellow-400 text-gray-900 text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center z-10 shadow">
          C
        </span>
      )}

      {/* Position badge */}
      <span
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getPositionColor(player.position)}`}
      >
        {player.position}
      </span>

      {/* Player name */}
      <span className="text-[10px] text-white font-medium leading-tight break-words max-w-full hyphens-auto">
        {displayName}
      </span>

      {/* Country code */}
      <span className="text-[9px] text-gray-400">{countryCode}</span>
    </button>
  );
}
