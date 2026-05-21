import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '@predictor/supabase';

export default function Layout({ children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-neutral text-primary flex flex-col">
      <Header />
      <div className="flex flex-1">
        {user && <Sidebar />}
        <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 ${user ? 'max-w-full' : ''}`}>
          {children}
        </main>
      </div>
      <MobileNav />
      <footer className="py-4 text-center text-sm text-muted border-t border-border">
        <div className="flex items-center justify-center gap-4">
          <a href="/" className="hover:text-tertiary transition-colors">Dashboard</a>
          <span className="text-muted">•</span>
          <a href="/polla/" className="hover:text-tertiary transition-colors">Polla</a>
          <span className="text-muted">•</span>
          <a href="/fantasy/" className="hover:text-tertiary transition-colors">Fantasy</a>
        </div>
      </footer>
    </div>
  );
}
