import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLeague } from '../../context/LeagueContext';
import { classNames } from '../../lib/utils';

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/my-team', icon: '⚽', label: 'My Team' },
  { to: '/market', icon: '🛒', label: 'Player Market' },
  { to: '/auction', icon: '🔨', label: 'Auction' },
  { to: '/transfers', icon: '🔄', label: 'Transfers' },
  { to: '/standings', icon: '📊', label: 'Standings' },
  { to: '/bracket', icon: '🏅', label: 'Bracket' },
  { to: '/history', icon: '📜', label: 'History' },
];

const adminItems = [
  { to: '/admin', icon: '⚙️', label: 'Admin Panel' },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const { team, activeMatchday, activeTransferWindow } = useLeague();

  return (
    <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-700 min-h-screen pt-4 pb-8">
      {/* Team info */}
      {team && (
        <div className="px-4 mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your Team</p>
          <p className="font-semibold text-white text-sm truncate">{team.name}</p>
          <p className="text-emerald-400 text-sm font-medium">
            {Number(team.budget_remaining).toFixed(1)}M remaining
          </p>
        </div>
      )}

      {/* Status badges */}
      <div className="px-4 mb-4 space-y-2">
        {activeMatchday && (
          <div className="bg-emerald-900/50 border border-emerald-700 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-400 font-medium">🟢 Active Matchday</p>
            <p className="text-xs text-gray-300 truncate">{activeMatchday.name}</p>
          </div>
        )}
        {activeTransferWindow && (
          <div className="bg-blue-900/50 border border-blue-700 rounded-lg px-3 py-2">
            <p className="text-xs text-blue-400 font-medium">🔄 Transfer Window {activeTransferWindow.window_number}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              classNames(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="border-t border-gray-700 my-2" />
            {adminItems.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  classNames(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-amber-600 text-white'
                      : 'text-amber-400 hover:bg-gray-800 hover:text-amber-300'
                  )
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
