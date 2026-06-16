import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { breakdownPoints, aggregateBreakdown } from '../../lib/scoring';
import { fmtPts, getPositionColor } from '../../lib/utils';

export default function PointsBreakdownModal({ player, activeMatchdayId, isCaptain, onClose }) {
  const [allStats, setAllStats] = useState(null);
  const [scoringSystem, setScoringSystem] = useState('opta');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: statsData }, { data: sysData }] = await Promise.all([
        supabase.from('player_stats').select('*').eq('player_id', player.id),
        supabase.from('auction_state').select('scoring_system').single(),
      ]);
      if (cancelled) return;
      setAllStats(statsData ?? []);
      setScoringSystem(sysData?.scoring_system ?? 'opta');
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [player.id]);

  const sorted = [...(allStats ?? [])].sort((a, b) => b.matchday_id - a.matchday_id);
  const currentRow = sorted.find(s => s.matchday_id === activeMatchdayId) ?? sorted[0] ?? null;

  const currentItems = currentRow ? breakdownPoints(currentRow, player.position, scoringSystem) : [];
  const currentBase = Math.round(currentItems.reduce((sum, item) => sum + item.points, 0) * 10) / 10;
  const currentDisplay = isCaptain ? Math.round(currentBase * 2 * 10) / 10 : currentBase;

  const cumItems = allStats ? aggregateBreakdown(allStats, player.position, scoringSystem) : [];
  const cumTotal = Math.round(cumItems.reduce((sum, item) => sum + item.points, 0) * 10) / 10;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-label-caps font-bold px-1.5 py-0.5 rounded ${getPositionColor(player.position)}`}>
                {player.position}
              </span>
              <h3 className="text-base font-bold text-primary">{player.name}</h3>
              {isCaptain && (
                <span className="text-label-caps bg-tertiary text-primary font-bold px-1.5 py-0.5 rounded">C</span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">Desglose de puntos</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary text-xl leading-none px-2 -mr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="text-secondary text-sm p-6 text-center">Cargando…</p>
        ) : (
          <div className="p-5 space-y-5">
            {/* Current matchday */}
            <section>
              <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                Jornada actual
              </h4>
              {!currentRow ? (
                <p className="text-muted text-sm">Sin estadísticas para esta jornada.</p>
              ) : (
                <>
                  <BreakdownTable
                    items={currentItems.filter(item => item.points !== 0 || item.key === 'minutes')}
                  />
                  {isCaptain && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-sm">
                      <span className="text-muted">Capitán ×2</span>
                      <span className="text-secondary font-semibold">{fmtPts(currentBase)} × 2</span>
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-border flex justify-between">
                    <span className="text-sm font-semibold text-secondary">Total jornada</span>
                    <span className="text-tertiary font-bold">{fmtPts(currentDisplay)} pts</span>
                  </div>
                </>
              )}
            </section>

            {/* Cumulative */}
            <section>
              <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                Torneo completo
              </h4>
              {cumItems.length === 0 ? (
                <p className="text-muted text-sm">Sin estadísticas aún.</p>
              ) : (
                <>
                  <BreakdownTable
                    items={cumItems.filter(item => item.points !== 0 || item.key === 'minutes')}
                  />
                  <div className="mt-2 pt-2 border-t border-border flex justify-between">
                    <span className="text-sm font-semibold text-secondary">Total torneo</span>
                    <span className="text-info font-bold">{fmtPts(cumTotal)} pts</span>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownTable({ items }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const detail = item.unit != null
          ? `${item.count} × ${item.unit}`
          : item.count != null
          ? item.key === 'minutes' ? `${item.count}'` : `${item.count}`
          : null;

        return (
          <div key={item.key} className="flex items-center gap-2 text-sm">
            <span className="text-secondary flex-1 leading-tight">{item.label}</span>
            {detail && (
              <span className="text-muted text-xs whitespace-nowrap">{detail}</span>
            )}
            <span className={`font-semibold text-right min-w-[40px] ${
              item.points > 0 ? 'text-tertiary' : item.points < 0 ? 'text-error' : 'text-muted'
            }`}>
              {item.points > 0 ? `+${fmtPts(item.points)}` : fmtPts(item.points)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
