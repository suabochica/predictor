import { Link } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { useLang } from '@predictor/i18n/react';
import { formatDateTimeShort } from '@predictor/i18n';
import teamIcon from '@predictor/ui/icons/team.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import marketIcon from '@predictor/ui/icons/market.svg';
import negotiationsIcon from '@predictor/ui/icons/transfers.svg';
import bracketsIcon from '@predictor/ui/icons/brackets.svg';
import historyIcon from '@predictor/ui/icons/history.svg';
import rulesIcon from '@predictor/ui/icons/rules.svg';
import adminIcon from '@predictor/ui/icons/admin.svg';

import { useLeague } from '../context/LeagueContext';
import { useCompetition } from '../context/CompetitionContext';
import { useTeam } from '../hooks/useTeam';
import { formatPrice } from '../lib/utils';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { competition } = useCompetition();
  const { activeMatchday, activeTransferWindow } = useLeague();
  const { team, players } = useTeam();
  const { t, lang } = useLang();

  const quickActions = [
    { to: '/my-team', icon: teamIcon, label: t('fantasy.dashboard.actions.lineup') },
    { to: '/auction', icon: auctionIcon, label: t('fantasy.dashboard.actions.auctionRoom') },
    { to: '/leaderboard', icon: standingsIcon, label: t('fantasy.dashboard.actions.leaderboard') },
    { to: '/market', icon: marketIcon, label: t('fantasy.dashboard.actions.market') },
    { to: '/negotiations', icon: negotiationsIcon, label: t('fantasy.dashboard.actions.negotiations') },
    { to: '/bracket', icon: bracketsIcon, label: t('fantasy.dashboard.actions.bracket') },
    { to: '/history', icon: historyIcon, label: t('fantasy.dashboard.actions.history') },
    { to: '/rules', icon: rulesIcon, label: t('fantasy.dashboard.actions.rules') },
    ...(isAdmin ? [{ to: '/admin', icon: adminIcon, label: t('fantasy.dashboard.actions.adminPanel') }] : []),
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          {t('fantasy.dashboard.welcomeBack', { name: profile?.display_name ?? 'Manager' })}
        </h1>
        <p className="text-secondary mt-1">
          {competition?.name ? `${competition.name} Fantasy League` : 'Fantasy League'}
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.dashboard.currentPhase')}</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {activeMatchday ? activeMatchday.name : t('fantasy.common.preseason')}
          </p>
          {activeMatchday && (
            <p className="text-xs text-tertiary mt-1">{activeMatchday.wc_stage}</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.dashboard.remainingBudget')}</p>
          <p className="text-lg font-semibold text-tertiary mt-1">
            {team ? formatPrice(team.budget_remaining) : '—'}
          </p>
          <p className="text-xs text-muted mt-1">{t('fantasy.dashboard.totalBudgetSuffix', { amount: '105.0' })}</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wider">{t('fantasy.dashboard.squadSize')}</p>
          <p className="text-lg font-semibold text-primary mt-1">
            {players.length} / 15
          </p>
          <p className="text-xs text-muted mt-1">{t('fantasy.dashboard.playersRegistered')}</p>
        </div>
      </div>

      {/* Transfer window notice */}
      {activeTransferWindow && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-start gap-3">
          <img src={marketIcon} className="w-6 h-6 mt-0.5" alt="" />
          <div>
            <p className="font-semibold text-info">
              {activeTransferWindow.is_preseason
                ? t('fantasy.dashboard.preseasonUnlimitedTransfers')
                : t('fantasy.dashboard.transferWindowFor', { name: activeTransferWindow.matchday_name })}
            </p>
            <p className="text-sm text-secondary mt-0.5">
              {activeTransferWindow.max_transfers != null
                ? t('fantasy.dashboard.transfersAllowed', { n: activeTransferWindow.max_transfers })
                : t('fantasy.dashboard.unlimitedTransfers')}
              {activeTransferWindow.closes_at
                ? t('fantasy.dashboard.windowClosesAt', { date: formatDateTimeShort(activeTransferWindow.closes_at, lang) })
                : t('fantasy.dashboard.playersLockAtKickoff')}
            </p>
            <Link to="/market" className="text-sm text-info hover:text-info mt-1 inline-block">
              {t('fantasy.dashboard.goToMarket')}
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-3">{t('fantasy.dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              className="bg-surface border border-border hover:border-tertiary rounded-xl p-4 flex flex-col items-center gap-2 transition-colors group"
            >
              <img src={icon} className="w-6 h-6" alt="" />
              <span className="text-xs font-medium text-secondary group-hover:text-primary">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
