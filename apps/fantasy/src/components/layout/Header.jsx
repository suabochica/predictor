import { Link } from 'react-router-dom';
import { useAuth } from '@predictor/supabase';
import { Button } from '@predictor/ui';
import fantasyIcon from '@predictor/ui/icons/fantasy.svg';

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
        <Link to="/" className="flex items-center gap-2 font-atomic font-bold text-lg text-tertiary hover:text-tertiary">
          <img src={fantasyIcon} className="w-6 h-6" alt="" />
          <span className="hidden sm:inline">Fantasy</span>
        </Link>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {profile?.is_admin && (
                <Link
                  to="/admin"
                  className="text-xs bg-warning hover:brightness-90 text-primary font-bold px-2 py-1 rounded"
                >
                  Admin
                </Link>
              )}
              <Button variant="primary" onClick={handleSignOut}>
                Cerrar sesión
              </Button>
            </>
          ) : (
            <Link to="/login" className="inline-flex items-center justify-center font-medium rounded-sm bg-tertiary text-on-tertiary hover:brightness-95 px-5 py-3 transition-colors">
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
