import { NavLink } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { classNames } from '../../lib/utils';
import homeIcon from '@predictor/ui/icons/home.svg';
import teamIcon from '@predictor/ui/icons/team.svg';
import auctionIcon from '@predictor/ui/icons/auction.svg';
import standingsIcon from '@predictor/ui/icons/standings.svg';
import marketIcon from '@predictor/ui/icons/market.svg';
import rulesIcon from '@predictor/ui/icons/rules.svg';

const mobileNavItems = [
  { to: '/dashboard', icon: homeIcon, label: 'Home' },
  { to: '/my-team', icon: teamIcon, label: 'Team' },
  { to: '/standings', icon: standingsIcon, label: 'Standings' },
  { to: '/market', icon: marketIcon, label: 'Market' },
  { to: '/como-jugar', icon: rulesIcon, label: 'Reglas' },
];

export default function MobileNav() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border">
      <div className="flex justify-around">
        {mobileNavItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
      </div>
    </nav>
  );
}
