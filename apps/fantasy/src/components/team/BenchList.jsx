import PlayerSlot from './PlayerSlot';

function EmptyBenchSlot({ order, onClick, isTargetable }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold text-gray-600">{order}</span>
      <button
        onClick={onClick}
        disabled={!isTargetable}
        className={`w-[68px] min-h-[68px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
          isTargetable
            ? 'border-blue-400/60 bg-blue-900/20 hover:bg-blue-900/40 cursor-pointer'
            : 'border-gray-700 cursor-default'
        }`}
      >
        <span className={`text-[10px] ${isTargetable ? 'text-blue-400 font-semibold' : 'text-gray-600'}`}>
          {isTargetable ? '+ here' : 'Empty'}
        </span>
      </button>
    </div>
  );
}

export default function BenchList({ bench, selectedId, onPlayerClick, onReorder, onEmptyBenchSlotClick, hasSelected }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Bench
      </h3>
      <div className="flex gap-3 flex-wrap">
        {bench.map((player, i) => (
          <div key={player.id} className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400">{i + 1}</span>
            <PlayerSlot
              player={player}
              isCaptain={false}
              isSelected={player.id === selectedId}
              onClick={onPlayerClick}
            />
            <div className="flex gap-0.5">
              <button
                onClick={() => onReorder(i, i - 1)}
                disabled={i === 0}
                className="text-gray-500 hover:text-gray-200 disabled:opacity-25 text-xs px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
                title="Move up priority"
              >
                ←
              </button>
              <button
                onClick={() => onReorder(i, i + 1)}
                disabled={i === bench.length - 1}
                className="text-gray-500 hover:text-gray-200 disabled:opacity-25 text-xs px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
                title="Move down priority"
              >
                →
              </button>
            </div>
          </div>
        ))}

        {/* Empty bench slots */}
        {Array.from({ length: Math.max(0, 4 - bench.length) }).map((_, i) => (
          <EmptyBenchSlot
            key={`empty-${i}`}
            order={bench.length + i + 1}
            onClick={onEmptyBenchSlotClick}
            isTargetable={hasSelected}
          />
        ))}
      </div>
      <p className="text-[10px] text-gray-600 mt-3">
        Auto-sub priority: 1 (first choice) → 4 (last resort)
      </p>
    </div>
  );
}
