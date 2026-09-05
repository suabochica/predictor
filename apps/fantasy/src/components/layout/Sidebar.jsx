import { NavLink } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { useT } from '@predictor/i18n/react';
import { useLeague } from '../../context/LeagueContext';
import { useCompetition } from '../../context/CompetitionContext';
import { classNames } from '../../lib/utils';
import homeIcon from '@predictor/ui/icons/home.svg';
import teamIcon from '@predictor/ui/icons/team.svg';
import marketIcon from '@predictor/ui/icons/market.svg';
import negotiationsIcon from '@predictor/ui/icons/transfers.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import bracketsIcon from '@predictor/ui/icons/brackets.svg';
import historyIcon from '@predictor/ui/icons/history.svg';
import rulesIcon from '@predictor/ui/icons/rules.svg';
import adminIcon from '@predictor/ui/icons/admin.svg';

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const { team, activeMatchday, activeTransferWindow } = useLeague();
  const { competitions, competitionId, setCompetition } = useCompetition();
  const t = useT();

  const navItems = [
    { to: '/dashboard', icon: homeIcon, label: t('fantasy.sidebar.nav.home') },
    { to: '/my-team', icon: teamIcon, label: t('fantasy.sidebar.nav.myTeam') },
    { to: '/market', icon: marketIcon, label: t('fantasy.sidebar.nav.market') },
    { to: '/negotiations', icon: negotiationsIcon, label: t('fantasy.sidebar.nav.negotiations') },
    { to: '/auction', icon: auctionIcon, label: t('fantasy.sidebar.nav.auction') },
    { to: '/leaderboard', icon: standingsIcon, label: t('fantasy.sidebar.nav.leaderboard') },
    { to: '/bracket', icon: bracketsIcon, label: t('fantasy.sidebar.nav.bracket') },
    { to: '/history', icon: historyIcon, label: t('fantasy.sidebar.nav.history') },
    { to: '/rules', icon: rulesIcon, label: t('fantasy.sidebar.nav.rules') },
  ];

  const adminItems = [
    { to: '/admin', icon: adminIcon, label: t('fantasy.sidebar.adminPanel') },
  ];

  return (
    <aside className="hidden md:flex flex-col w-56 bg-surface border-r border-border min-h-screen pt-4 pb-8">
      {/* Competition switcher — hidden while there is only one to pick from */}
      {competitions.length > 1 && (
        <div className="px-4 mb-5">
          <label htmlFor="competition-switcher" className="block text-xs text-muted uppercase tracking-wider mb-1">
            {t('fantasy.common.competitionSwitcher')}
          </label>
          <select
            id="competition-switcher"
            value={competitionId ?? ''}
            onChange={(e) => setCompetition(Number(e.target.value))}
            className="w-full bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-primary text-sm focus:outline-none focus:border-tertiary"
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>{c.short_label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Team info */}
      {team && (
        <div className="px-4 mb-6">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">{t('fantasy.sidebar.yourTeam')}</p>
          <p className="font-semibold text-primary text-sm truncate">{team.name}</p>
          <p className="text-tertiary text-sm font-medium">
            {t('fantasy.sidebar.budgetAvailable', { amount: Number(team.budget_remaining).toFixed(1) })}
          </p>
        </div>
      )}

      {/* Status badges */}
      <div className="px-4 mb-4 space-y-2">
        {activeMatchday && (
          <div className="bg-tertiary/10 border border-tertiary/40 rounded-lg px-3 py-2">
            <p className="text-xs text-tertiary font-medium">{t('fantasy.sidebar.activeMatchday')}</p>
            <p className="text-xs text-secondary truncate">{activeMatchday.name}</p>
          </div>
        )}
        {activeTransferWindow && (
          <div className="bg-info/10 border border-info/30 rounded-lg px-3 py-2">
            <p className="text-xs text-info font-medium">
              {activeTransferWindow.is_preseason
                ? t('fantasy.sidebar.preseasonTransfers')
                : t('fantasy.sidebar.transferWindow', { name: activeTransferWindow.matchday_name })}
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
