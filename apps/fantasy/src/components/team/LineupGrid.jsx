import PlayerSlot from './PlayerSlot';

function EmptySlot({ onClick, isTargetable }) {
  return (
    <button
      onClick={onClick}
      disabled={!isTargetable}
      className={`w-[68px] min-h-[68px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
        isTargetable
          ? 'border-tertiary bg-tertiary/5 hover:bg-tertiary/10 cursor-pointer'
          : 'border-tertiary/40 cursor-default'
      }`}
    >
      <span className={`text-label-caps font-semibold ${isTargetable ? 'text-tertiary' : 'text-tertiary'}`}>
        {isTargetable ? '+ aquí' : 'Agregar al XI'}
      </span>
    </button>
  );
}

function PositionRow({ players, captainId, selectedId, onPlayerClick, pointsById }) {
  if (players.length === 0) return null;
  return (
    <div className="flex justify-center items-end gap-2 flex-wrap">
      {players.map((player) => (
        <PlayerSlot
          key={player.id}
          player={player}
          isCaptain={player.id === captainId}
          isSelected={player.id === selectedId}
          onClick={onPlayerClick}
          points={pointsById?.[player.id] ?? null}
        />
      ))}
    </div>
  );
}

export default function LineupGrid({ starters, captainId, selectedId, onPlayerClick, onEmptySlotClick, hasSelected, pointsById }) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of starters) {
    byPos[p.position]?.push(p);
  }

  const showEmptySlot = starters.length < 11;

  return (
    <div className="relative bg-tertiary/5 border border-tertiary/40 rounded-xl overflow-hidden">
      {/* Pitch lines */}
      <div className="absolute inset-x-6 top-1/2 h-px bg-white/8 pointer-events-none" />
      <div className="absolute inset-x-[30%] top-[5%] h-px bg-white/8 pointer-events-none" />
      <div className="absolute inset-x-[30%] bottom-[5%] h-px bg-white/8 pointer-events-none" />

      {/* Rows: attack → defense (top to bottom) */}
      <div className="relative z-10 px-4 py-5 space-y-4">
        <PositionRow players={byPos.FWD} captainId={captainId} selectedId={selectedId} onPlayerClick={onPlayerClick} pointsById={pointsById} />
        <PositionRow players={byPos.MID} captainId={captainId} selectedId={selectedId} onPlayerClick={onPlayerClick} pointsById={pointsById} />
        <PositionRow players={byPos.DEF} captainId={captainId} selectedId={selectedId} onPlayerClick={onPlayerClick} pointsById={pointsById} />
        <PositionRow players={byPos.GK} captainId={captainId} selectedId={selectedId} onPlayerClick={onPlayerClick} pointsById={pointsById} />

        {showEmptySlot && (
          <div className="flex justify-center">
            <EmptySlot onClick={onEmptySlotClick} isTargetable={hasSelected} />
          </div>
        )}
      </div>
    </div>
  );
}
