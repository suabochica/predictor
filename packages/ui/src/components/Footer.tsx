import { localeTag } from '@predictor/i18n';
import type { Locale } from '@predictor/i18n';

// World-Cup-only defaults, used as-is by gateway and polla (both pin
// competition_id 1). Fantasy overrides these per its active competition —
// see `competitionCopy.js`'s `startDate`/`endDate` fields.
const DEFAULT_LABEL = 'Mundial 2026';
const DEFAULT_START_ISO = '2026-06-11';
const DEFAULT_END_ISO = '2026-07-19';

const LAST_UPDATED_ISO = '2026-09-07';

function formatDate(iso: string, lang: Locale): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeTag(lang), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export interface FooterProps {
  lang?: Locale;
  competitionLabel?: string;
  startDateISO?: string | null;
  endDateISO?: string | null;
  homeLabel?: string;
  lastUpdatedLabel?: string;
  madeByLabel?: string;
  andLabel?: string;
}

export function Footer({
  lang = 'es',
  competitionLabel = DEFAULT_LABEL,
  startDateISO = DEFAULT_START_ISO,
  endDateISO = DEFAULT_END_ISO,
  homeLabel = 'Inicio',
  lastUpdatedLabel = 'Última actualización',
  madeByLabel = 'Hecho con ❤️ por',
  andLabel = 'y',
}: FooterProps) {
  return (
    <footer className="mt-auto py-4 text-center text-body-sm text-muted border-t border-border">
      <div className="flex items-center justify-center gap-4">
        <a href="/" className="hover:text-tertiary transition-colors">
          {homeLabel}
        </a>
        <span>•</span>
        <a href="/polla/" className="hover:text-tertiary transition-colors">
          Polla
        </a>
        <span>•</span>
        <a href="/fantasy/" className="hover:text-tertiary transition-colors">
          Fantasy
        </a>
      </div>
      {competitionLabel && startDateISO && endDateISO && (
        <p className="mt-2 text-muted">
          {competitionLabel} • {formatDate(startDateISO, lang)} – {formatDate(endDateISO, lang)}
        </p>
      )}
      <p className="text-muted">
        {lastUpdatedLabel}: {formatDate(LAST_UPDATED_ISO, lang)}
      </p>
      <p className="text-muted">
        {madeByLabel}{" "}
        <a
          href="https://github.com/lstuckyb"
          className="hover:text-tertiary transition-colors"
        >
          Lucas Stucky
        </a>{" "}
        {andLabel}{" "}
        <a
          href="https://github.com/suabochica"
          className="hover:text-tertiary transition-colors"
        >
          suabochica
        </a>
      </p>
    </footer>
  );
}
