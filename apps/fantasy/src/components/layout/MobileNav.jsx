import { NavLink } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { classNames } from '../../lib/utils';

const mobileNavItems = [
  { to: '/dashboard', icon: '🏠', label: 'Home' },
  { to: '/my-team', icon: '⚽', label: 'Team' },
  { to: '/auction', icon: '🔨', label: 'Auction' },
  { to: '/standings', icon: '📊', label: 'Standings' },
  { to: '/market', icon: '🛒', label: 'Market' },
];

export default function MobileNav() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700">
      <div className="flex justify-around">
        {mobileNavItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              classNames(
                'flex flex-col items-center justify-center py-2 px-3 min-w-[44px] min-h-[56px] text-xs font-medium transition-colors',
                isActive ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'
              )
            }
          >
            <span className="text-xl leading-none mb-0.5">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
