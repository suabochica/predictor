import { NavLink } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { useLeague } from '../../context/LeagueContext';
import { classNames } from '../../lib/utils';
import homeIcon from '@predictor/ui/icons/home.svg';
import teamIcon from '@predictor/ui/icons/team.svg';
import marketIcon from '@predictor/ui/icons/market.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import transfersIcon from '@predictor/ui/icons/transfers.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import bracketsIcon from '@predictor/ui/icons/brackets.svg';
import historyIcon from '@predictor/ui/icons/history.svg';
import rulesIcon from '@predictor/ui/icons/rules.svg';
import adminIcon from '@predictor/ui/icons/admin.svg';

const navItems = [
  { to: '/dashboard', icon: homeIcon, label: 'Dashboard' },
  { to: '/my-team', icon: teamIcon, label: 'My Team' },
  { to: '/market', icon: marketIcon, label: 'Player Market' },
  { to: '/auction', icon: auctionIcon, label: 'Auction' },
  { to: '/transfers', icon: transfersIcon, label: 'Transfers' },
  { to: '/standings', icon: standingsIcon, label: 'Standings' },
  { to: '/bracket', icon: bracketsIcon, label: 'Bracket' },
  { to: '/history', icon: historyIcon, label: 'History' },
  { to: '/como-jugar', icon: rulesIcon, label: '¿Cómo jugar?' },
];

const adminItems = [
  { to: '/admin', icon: adminIcon, label: 'Admin Panel' },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const { team, activeMatchday, activeTransferWindow } = useLeague();

  return (
    <aside className="hidden md:flex flex-col w-56 bg-surface border-r border-border min-h-screen pt-4 pb-8">
      {/* Team info */}
      {team && (
        <div className="px-4 mb-6">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Your Team</p>
          <p className="font-semibold text-primary text-sm truncate">{team.name}</p>
          <p className="text-tertiary text-sm font-medium">
            {Number(team.budget_remaining).toFixed(1)}M remaining
          </p>
        </div>
      )}

      {/* Status badges */}
      <div className="px-4 mb-4 space-y-2">
        {activeMatchday && (
          <div className="bg-tertiary/10 border border-tertiary/40 rounded-lg px-3 py-2">
            <p className="text-xs text-tertiary font-medium">Active Matchday</p>
            <p className="text-xs text-secondary truncate">{activeMatchday.name}</p>
          </div>
        )}
        {activeTransferWindow && (
          <div className="bg-info/10 border border-info/30 rounded-lg px-3 py-2">
            <p className="text-xs text-info font-medium">
              {activeTransferWindow.is_preseason ? 'Preseason Transfers' : `${activeTransferWindow.matchday_name} Window`}
            </p>
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
                  ? 'bg-tertiary text-primary'
                  : 'text-secondary hover:bg-surface-hover hover:text-primary'
              )
            }
          >
            <img src={icon} className="w-5 h-5" alt="" />
            <span>{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="border-t border-border my-2" />
            {adminItems.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  classNames(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-warning text-primary'
                      : 'text-warning hover:bg-surface-hover hover:text-warning'
                  )
                }
              >
                <img src={icon} className="w-5 h-5" alt="" />
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
