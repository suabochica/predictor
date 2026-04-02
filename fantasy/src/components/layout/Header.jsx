import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Header() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-700 text-white">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-emerald-400 hover:text-emerald-300">
          <span className="text-2xl">🏆</span>
          <span className="hidden sm:inline">WC2026 Fantasy</span>
        </Link>

        {/* Desktop Nav */}
        {user && (
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link to="/dashboard" className="hover:text-emerald-400 transition-colors">Dashboard</Link>
            <Link to="/my-team" className="hover:text-emerald-400 transition-colors">My Team</Link>
            <Link to="/auction" className="hover:text-emerald-400 transition-colors">Auction</Link>
            <Link to="/standings" className="hover:text-emerald-400 transition-colors">Standings</Link>
            <Link to="/bracket" className="hover:text-emerald-400 transition-colors">Bracket</Link>
          </nav>
        )}

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-300 hidden sm:inline">
                {profile?.display_name ?? user.email}
              </span>
              {profile?.is_admin && (
                <Link
                  to="/admin"
                  className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold px-2 py-1 rounded"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
