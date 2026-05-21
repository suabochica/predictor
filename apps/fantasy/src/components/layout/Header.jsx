import { Link } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';

export default function Header() {
  const { user, profile } = useAuth();

  function handleSignOut() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/signout';
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-border text-primary">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-tertiary hover:text-tertiary">
          <span className="text-2xl">🏆</span>
          <span className="hidden sm:inline">WC2026 Fantasy</span>
        </Link>

        {/* Desktop Nav */}
        {user && (
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link to="/dashboard" className="hover:text-tertiary transition-colors">Dashboard</Link>
            <Link to="/my-team" className="hover:text-tertiary transition-colors">My Team</Link>
            <Link to="/auction" className="hover:text-tertiary transition-colors">Auction</Link>
            <Link to="/standings" className="hover:text-tertiary transition-colors">Standings</Link>
            <Link to="/bracket" className="hover:text-tertiary transition-colors">Bracket</Link>
          </nav>
        )}

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-secondary hidden sm:inline">
                {profile?.display_name ?? user.email}
              </span>
              {profile?.is_admin && (
                <Link
                  to="/admin"
                  className="text-xs bg-warning hover:brightness-90 text-primary font-bold px-2 py-1 rounded"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm text-secondary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm bg-tertiary hover:brightness-90 text-primary px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
