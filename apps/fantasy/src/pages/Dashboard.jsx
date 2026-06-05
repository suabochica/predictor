import { Link } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import teamIcon from '@predictor/ui/icons/team.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import marketIcon from '@predictor/ui/icons/market.svg';

import { useLeague } from '../context/LeagueContext';
import { useTeam } from '../hooks/useTeam';
import { formatPrice } from '../lib/utils';

export default function Dashboard() {
  const { profile } = useAuth();
  const { activeMatchday, activeTransferWindow } = useLeague();
  const { team, players } = useTeam();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          ¡Bienvenido de nuevo, {profile?.display_name ?? 'Manager'}!
        </h1>
        <p className="text-secondary mt-1">FIFA World Cup 2026 Fantasy League</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Fase actual</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {activeMatchday ? activeMatchday.name : 'Pretemporada'}
          </p>
          {activeMatchday && (
            <p className="text-xs text-tertiary mt-1">{activeMatchday.wc_stage}</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Presupuesto restante</p>
          <p className="text-lg font-semibold text-tertiary mt-1">
            {team ? formatPrice(team.budget_remaining) : '—'}
          </p>
          <p className="text-xs text-muted mt-1">de 105.0M total</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Tamaño de plantilla</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {players.length} / 15
          </p>
          <p className="text-xs text-muted mt-1">jugadores registrados</p>
        </div>
      </div>

      {/* Transfer window notice */}
      {activeTransferWindow && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-start gap-3">
          <img src={marketIcon} className="w-6 h-6 mt-0.5" alt="" />
          <div>
            <p className="font-semibold text-info">
              {activeTransferWindow.is_preseason
                ? 'Pretemporada — Fichajes ilimitados'
                : `Ventana de fichajes ${activeTransferWindow.matchday_name}`}
            </p>
            <p className="text-sm text-secondary mt-0.5">
              {activeTransferWindow.max_transfers != null
                ? `${activeTransferWindow.max_transfers} fichajes permitidos. `
                : 'Fichajes ilimitados. '}
              {activeTransferWindow.closes_at
                ? `La ventana cierra ${new Date(activeTransferWindow.closes_at).toLocaleString()}`
                : 'Jugadores se bloquean al inicio del partido'}
            </p>
            <Link to="/market" className="text-sm text-info hover:text-info mt-1 inline-block">
              Ir al mercado →
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to="/my-team"
            className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
          >
            <img src={teamIcon} className="w-6 h-6" alt="" />
            <span className="text-xs font-medium text-secondary group-hover:text-primary">Alineación</span>
          </Link>
          <Link
            to="/auction"
            className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
          >
            <img src={auctionIcon} className="w-6 h-6" alt="" />
            <span className="text-xs font-medium text-secondary group-hover:text-primary">Sala de subasta</span>
          </Link>
          <Link
            to="/standings"
            className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
          >
            <img src={standingsIcon} className="w-6 h-6" alt="" />
            <span className="text-xs font-medium text-secondary group-hover:text-primary">Tabla de posiciones</span>
          </Link>
          <Link
            to="/market"
            className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
          >
            <img src={marketIcon} className="w-6 h-6" alt="" />
            <span className="text-xs font-medium text-secondary group-hover:text-primary">Mercado de jugadores</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
