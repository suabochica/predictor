import PlayerSlot from './PlayerSlot';

function EmptyBenchSlot({ order, onClick, isTargetable }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-label-caps font-bold text-muted">{order}</span>
      <button
        onClick={onClick}
        disabled={!isTargetable}
        className={`w-[68px] min-h-[68px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 ${
          isTargetable
            ? 'border-info/40 bg-info/5 hover:bg-info/10 cursor-pointer'
            : 'border-border cursor-default'
        }`}
      >
        <span className={`text-label-caps ${isTargetable ? 'text-info font-semibold' : 'text-muted'}`}>
          {isTargetable ? '+ aquí' : 'Vacío'}
        </span>
      </button>
    </div>
  );
}

export default function BenchList({ bench, selectedId, onPlayerClick, onReorder, onEmptyBenchSlotClick, hasSelected, readOnly = false, pointsById, totalPointsById, onInfoClick }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
        Banca
      </h3>
      <div className="flex gap-3 flex-wrap">
        {bench.map((player, i) => (
          <div key={player.id} className="flex flex-col items-center gap-1">
            <span className="text-label-caps font-bold text-secondary">{i + 1}</span>
            <PlayerSlot
              player={player}
              isCaptain={false}
              isSelected={player.id === selectedId}
              onClick={onPlayerClick}
              points={pointsById?.[player.id] ?? null}
              totalPoints={totalPointsById?.[player.id] ?? null}
              onInfoClick={onInfoClick}
            />
            {!readOnly && (
              <div className="flex gap-0.5">
                <button
                  onClick={() => onReorder(i, i - 1)}
                  disabled={i === 0}
                  className="text-muted hover:text-secondary disabled:opacity-25 text-xs px-1.5 py-0.5 rounded hover:bg-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  title="Mover izquierda"
                  aria-label="Mover izquierda"
                >
                  ←
                </button>
                <button
                  onClick={() => onReorder(i, i + 1)}
                  disabled={i === bench.length - 1}
                  className="text-muted hover:text-secondary disabled:opacity-25 text-xs px-1.5 py-0.5 rounded hover:bg-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
                  title="Mover derecha"
                  aria-label="Mover derecha"
                >
                  →
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Empty bench slots */}
        {!readOnly && Array.from({ length: Math.max(0, 4 - bench.length) }).map((_, i) => (
          <EmptyBenchSlot
            key={`empty-${i}`}
            order={bench.length + i + 1}
            onClick={onEmptyBenchSlotClick}
            isTargetable={hasSelected}
          />
        ))}
      </div>
      {!readOnly && (
        <p className="text-label-caps text-muted mt-3">
          El orden de la banca es solo organizativo — los suplentes no puntúan ni entran automáticamente.
        </p>
      )}
    </div>
  );
}
