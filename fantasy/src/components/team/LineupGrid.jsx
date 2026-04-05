import { parseFormation } from '../../lib/formations';
import PlayerSlot from './PlayerSlot';

function EmptySlot({ label }) {
  return (
    <div className="w-[68px] min-h-[68px] border-2 border-dashed border-emerald-700/40 rounded-lg flex items-center justify-center">
      <span className="text-[10px] text-emerald-700 font-semibold">{label}</span>
    </div>
  );
}

function PositionRow({ players, required, posLabel, captainId, selectedId, onPlayerClick }) {
  const empty = Math.max(0, required - players.length);
  return (
    <div className="flex justify-center items-end gap-2 flex-wrap">
      {players.map((player) => (
        <PlayerSlot
          key={player.id}
          player={player}
          isCaptain={player.id === captainId}
          isSelected={player.id === selectedId}
          onClick={onPlayerClick}
        />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <EmptySlot key={`empty-${posLabel}-${i}`} label={posLabel} />
      ))}
    </div>
  );
}

export default function LineupGrid({ starters, formation, captainId, selectedId, onPlayerClick }) {
  const required = parseFormation(formation);

  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of starters) {
    byPos[p.position]?.push(p);
  }

  return (
    <div className="relative bg-emerald-950/40 border border-emerald-800/40 rounded-xl overflow-hidden">
      {/* Pitch lines */}
      <div className="absolute inset-x-6 top-1/2 h-px bg-white/8 pointer-events-none" />
      <div className="absolute inset-x-[30%] top-[5%] h-px bg-white/8 pointer-events-none" />
      <div className="absolute inset-x-[30%] bottom-[5%] h-px bg-white/8 pointer-events-none" />

      {/* Rows: attack → defense (top to bottom) */}
      <div className="relative z-10 px-4 py-5 space-y-4">
        <PositionRow
          players={byPos.FWD}
          required={required.FWD}
          posLabel="FWD"
          captainId={captainId}
          selectedId={selectedId}
          onPlayerClick={onPlayerClick}
        />
        <PositionRow
          players={byPos.MID}
          required={required.MID}
          posLabel="MID"
          captainId={captainId}
          selectedId={selectedId}
          onPlayerClick={onPlayerClick}
        />
        <PositionRow
          players={byPos.DEF}
          required={required.DEF}
          posLabel="DEF"
          captainId={captainId}
          selectedId={selectedId}
          onPlayerClick={onPlayerClick}
        />
        <PositionRow
          players={byPos.GK}
          required={required.GK}
          posLabel="GK"
          captainId={captainId}
          selectedId={selectedId}
          onPlayerClick={onPlayerClick}
        />
      </div>
    </div>
  );
}
