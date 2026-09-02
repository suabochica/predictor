import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { Header, Footer } from '@predictor/ui';
import fantasyIcon from '@predictor/ui/icons/fantasy.svg';
import pollaIcon from '@predictor/ui/icons/polla.svg';
import { useAuth } from '@predictor/supabase';
import { useLang } from '@predictor/i18n/react';
import { useCompetition } from '../../context/CompetitionContext';
import { competitionCopy } from '../../config/competitionCopy';

export default function Layout({ children }) {
  const { user, profile } = useAuth();
  const { competition } = useCompetition();
  const copy = competitionCopy(competition);
  const { lang, setLang, t } = useLang();

  return (
    <div className="min-h-screen bg-neutral text-primary flex flex-col">
      <Header
        appName="Fantasy"
        appIcon={fantasyIcon}
        basePath="/fantasy/"
        isAdmin={profile?.is_admin ?? false}
        adminLabel={t('common.header.admin')}
        isAuthenticated={!!user}
        showLogin
        loginLabel={t('common.header.login')}
        logoutLabel={t('common.header.logout')}
        otherAppIcon={pollaIcon}
        otherAppPath="/polla/"
        otherAppTitle={t('common.header.goTo', { app: 'Polla' })}
        lang={lang}
        onLangChange={setLang}
      />
      <div className="flex flex-1">
        {user && <Sidebar />}
        <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 ${user ? 'max-w-full' : ''}`}>
          {children}
        </main>
      </div>
      <MobileNav />
      <Footer
        lang={lang}
        competitionLabel={competition?.short_label}
        startDateISO={copy.startDate}
        endDateISO={copy.endDate}
        homeLabel={t('common.footer.home')}
        lastUpdatedLabel={t('common.footer.lastUpdated')}
        madeByLabel={t('common.footer.madeBy')}
        andLabel={t('common.footer.and')}
      />
    </div>
  );
}
