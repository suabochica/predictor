import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { Header, Footer } from '@predictor/ui';
import fantasyIcon from '@predictor/ui/icons/fantasy.svg';
import pollaIcon from '@predictor/ui/icons/polla.svg';
import { useAuth } from '@predictor/supabase';
import { useCompetition } from '../../context/CompetitionContext';
import { competitionCopy } from '../../config/competitionCopy';

export default function Layout({ children }) {
  const { user, profile } = useAuth();
  const { competition } = useCompetition();
  const copy = competitionCopy(competition);

  return (
    <div className="min-h-screen bg-neutral text-primary flex flex-col">
      <Header
        appName="Fantasy"
        appIcon={fantasyIcon}
        basePath="/fantasy/"
        isAdmin={profile?.is_admin ?? false}
        isAuthenticated={!!user}
        showLogin
        otherAppIcon={pollaIcon}
        otherAppPath="/polla/"
      />
      <div className="flex flex-1">
        {user && <Sidebar />}
        <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 ${user ? 'max-w-full' : ''}`}>
          {children}
        </main>
      </div>
      <MobileNav />
      <Footer
        competitionLabel={competition?.short_label}
        startDateISO={copy.startDate}
        endDateISO={copy.endDate}
      />
    </div>
  );
}
