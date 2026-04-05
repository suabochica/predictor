import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {profile?.display_name ?? 'Manager'} 👋
        </h1>
        <p className="text-gray-400 mt-1">FIFA World Cup 2026 Fantasy League</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Current Phase</p>
          <p className="text-lg font-semibold text-white mt-1">
            {activeMatchday ? activeMatchday.name : 'Pre-Tournament'}
          </p>
          {activeMatchday && (
            <p className="text-xs text-emerald-400 mt-1">{activeMatchday.wc_stage}</p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Budget Remaining</p>
          <p className="text-lg font-semibold text-emerald-400 mt-1">
            {team ? formatPrice(team.budget_remaining) : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">of 105.0M total</p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Squad Size</p>
          <p className="text-lg font-semibold text-white mt-1">
            {players.length} / 15
          </p>
          <p className="text-xs text-gray-500 mt-1">players registered</p>
        </div>
      </div>

      {/* Transfer window notice */}
      {activeTransferWindow && (
        <div className="bg-blue-900/40 border border-blue-700 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <p className="font-semibold text-blue-300">
              Transfer Window {activeTransferWindow.window_number} is Open
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              Max {activeTransferWindow.max_transfers} transfers. Closes{' '}
              {activeTransferWindow.closes_at
                ? new Date(activeTransferWindow.closes_at).toLocaleString()
                : 'TBD'}
            </p>
            <Link to="/transfers" className="text-sm text-blue-400 hover:text-blue-300 mt-1 inline-block">
              Go to transfers →
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
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
              className="bg-gray-900 border border-gray-700 hover:border-emerald-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
