import { Link } from 'react-router-dom';
import { useT } from '@predictor/i18n/react';

export default function NotFound() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-6xl mb-4">🚫</p>
      <h1 className="text-2xl font-bold text-primary mb-2">{t('fantasy.notFound.heading')}</h1>
      <p className="text-secondary mb-6">{t('fantasy.notFound.description')}</p>
      <Link to="/dashboard" className="text-tertiary hover:text-tertiary">
        {t('fantasy.notFound.backHome')}
      </Link>
    </div>
  );
}
