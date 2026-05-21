import { Link } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
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
          Welcome back, {profile?.display_name ?? 'Manager'} 👋
        </h1>
        <p className="text-secondary mt-1">FIFA World Cup 2026 Fantasy League</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Current Phase</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {activeMatchday ? activeMatchday.name : 'Pre-Tournament'}
          </p>
          {activeMatchday && (
            <p className="text-xs text-tertiary mt-1">{activeMatchday.wc_stage}</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Budget Remaining</p>
          <p className="text-lg font-semibold text-tertiary mt-1">
            {team ? formatPrice(team.budget_remaining) : '—'}
          </p>
          <p className="text-xs text-muted mt-1">of 105.0M total</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">Squad Size</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {players.length} / 15
          </p>
          <p className="text-xs text-muted mt-1">players registered</p>
        </div>
      </div>

      {/* Transfer window notice */}
      {activeTransferWindow && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <p className="font-semibold text-info">
              Transfer Window {activeTransferWindow.window_number} is Open
            </p>
            <p className="text-sm text-secondary mt-0.5">
              Max {activeTransferWindow.max_transfers} transfers. Closes{' '}
              {activeTransferWindow.closes_at
                ? new Date(activeTransferWindow.closes_at).toLocaleString()
                : 'TBD'}
            </p>
            <Link to="/transfers" className="text-sm text-info hover:text-info mt-1 inline-block">
              Go to transfers →
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/my-team', icon: '⚽', label: 'Set Lineup' },
            { to: '/auction', icon: '🔨', label: 'Auction Room' },
            { to: '/standings', icon: '📊', label: 'Standings' },
            { to: '/market', icon: '🛒', label: 'Player Market' },
          ].map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-secondary group-hover:text-primary">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
