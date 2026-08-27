import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { useLeague } from '../../context/LeagueContext';
import { useCompetition } from '../../context/CompetitionContext';
import { classNames, isKnockout } from '../../lib/utils';
import homeIcon from '@predictor/ui/icons/home.svg';
import teamIcon from '@predictor/ui/icons/team.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import marketIcon from '@predictor/ui/icons/market.svg';
import negotiationsIcon from '@predictor/ui/icons/transfers.svg';
import bracketsIcon from '@predictor/ui/icons/brackets.svg';
import historyIcon from '@predictor/ui/icons/history.svg';
import rulesIcon from '@predictor/ui/icons/rules.svg';
import adminIcon from '@predictor/ui/icons/admin.svg';

const tabla = { to: '/leaderboard', icon: standingsIcon, label: 'Tabla' };
const cuadros = { to: '/bracket', icon: bracketsIcon, label: 'Cuadros' };

export default function MobileNav() {
  const { user, isAdmin } = useAuth();
  const { activeMatchday } = useLeague();
  const { competitions, competitionId, setCompetition } = useCompetition();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  // The Tabla/Cuadros pair share one bottom-bar slot. While viewing either page
  // the slot points at the other; elsewhere it follows the tournament stage.
  // The complement always lives in the "Más" menu so it's one tap from anywhere.
  let slotItem, otherItem;
  if (pathname === '/leaderboard') {
    slotItem = cuadros;
    otherItem = tabla;
  } else if (pathname === '/bracket') {
    slotItem = tabla;
    otherItem = cuadros;
  } else if (isKnockout(activeMatchday)) {
    slotItem = cuadros;
    otherItem = tabla;
  } else {
    slotItem = tabla;
    otherItem = cuadros;
  }

  const primaryNavItems = [
    { to: '/dashboard', icon: homeIcon, label: 'Inicio' },
    { to: '/my-team', icon: teamIcon, label: 'Equipo' },
    slotItem,
    { to: '/market', icon: marketIcon, label: 'Mercado' },
  ];

  const moreNavItems = [
    { to: '/auction', icon: auctionIcon, label: 'Subasta' },
    { to: '/negotiations', icon: negotiationsIcon, label: 'Negociaciones' },
    otherItem,
    { to: '/history', icon: historyIcon, label: 'Históricos' },
    { to: '/rules', icon: rulesIcon, label: 'Reglas' },
  ];

  return (
    <>
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border">
        {moreOpen && (
          <div className="absolute bottom-full right-0 mb-px w-48 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Competition switcher — hidden while there is only one to pick from */}
            {competitions.length > 1 && (
              <div className="px-4 py-3 border-b border-border">
                <label htmlFor="competition-switcher-mobile" className="block text-xs text-muted uppercase tracking-wider mb-1">
                  Competencia
                </label>
                <select
                  id="competition-switcher-mobile"
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

            {moreNavItems.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  classNames(
                    'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                    isActive ? 'text-tertiary' : 'text-secondary hover:bg-surface-hover hover:text-primary'
                  )
                }
              >
                <img src={icon} className="w-5 h-5" alt="" />
                <span>{label}</span>
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <div className="border-t border-border" />
                <NavLink
                  to="/admin"
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    classNames(
                      'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                      isActive ? 'text-warning' : 'text-warning hover:bg-surface-hover'
                    )
                  }
                >
                  <img src={adminIcon} className="w-5 h-5" alt="" />
                  <span>Panel de admin</span>
                </NavLink>
              </>
            )}
          </div>
        )}

        <div className="flex justify-around">
          {primaryNavItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                classNames(
                  'flex flex-col items-center justify-center py-2 px-3 min-w-[44px] min-h-[56px] text-xs font-medium transition-colors',
                  isActive ? 'text-tertiary' : 'text-muted hover:text-secondary'
                )
              }
            >
              <img src={icon} className="w-5 h-5 mb-0.5" alt="" />
              <span>{label}</span>
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={classNames(
              'flex flex-col items-center justify-center py-2 px-3 min-w-[44px] min-h-[56px] text-xs font-medium transition-colors',
              moreOpen ? 'text-tertiary' : 'text-muted hover:text-secondary'
            )}
          >
            <svg className="w-5 h-5 mb-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="4" cy="10" r="1.6" />
              <circle cx="10" cy="10" r="1.6" />
              <circle cx="16" cy="10" r="1.6" />
            </svg>
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
