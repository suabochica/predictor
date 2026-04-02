import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../context/AuthContext';

export default function Layout({ children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Header />
      <div className="flex flex-1">
        {user && <Sidebar />}
        <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 ${user ? 'max-w-full' : ''}`}>
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
