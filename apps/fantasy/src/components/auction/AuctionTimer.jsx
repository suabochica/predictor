import { useEffect, useRef, useState } from 'react';

/**
 * Derives remaining time from round_started_at (source of truth).
 * Never drifts — recalculates against wall clock every second.
 */
export default function AuctionTimer({ roundStartedAt, roundDurationSeconds, onExpire }) {
  const [remaining, setRemaining] = useState(roundDurationSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;

    function tick() {
      if (!roundStartedAt) {
        setRemaining(roundDurationSeconds);
        return;
      }
      // Supabase returns timestamps without a Z suffix — treat as UTC explicitly.
      const utcStr = roundStartedAt.endsWith('Z') ? roundStartedAt : roundStartedAt + 'Z';
      const elapsed = Math.floor((Date.now() - new Date(utcStr).getTime()) / 1000);
      const left = Math.max(0, roundDurationSeconds - elapsed);
      setRemaining(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [roundStartedAt, roundDurationSeconds]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const pct = roundDurationSeconds > 0 ? remaining / roundDurationSeconds : 0;

  const colorClass =
    remaining > 30 ? 'text-emerald-400' :
    remaining > 10 ? 'text-yellow-400' :
                     'text-red-400';

  const barColor =
    remaining > 30 ? 'bg-emerald-500' :
    remaining > 10 ? 'bg-yellow-500' :
                     'bg-red-500';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className={`text-4xl font-mono font-bold tabular-nums leading-none ${colorClass}`}>
        {display}
      </span>
      <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${barColor}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
