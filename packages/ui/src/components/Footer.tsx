// World-Cup-only defaults, used as-is by gateway and polla (both pin
// competition_id 1). Fantasy overrides these per its active competition —
// see `competitionCopy.js`'s `startDate`/`endDate` fields.
const DEFAULT_LABEL = 'Mundial 2026';
const DEFAULT_START_ISO = '2026-06-11';
const DEFAULT_END_ISO = '2026-07-19';

const LAST_UPDATED_ISO = '2026-06-17';

function formatDateEs(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export interface FooterProps {
  competitionLabel?: string;
  startDateISO?: string | null;
  endDateISO?: string | null;
}

export function Footer({
  competitionLabel = DEFAULT_LABEL,
  startDateISO = DEFAULT_START_ISO,
  endDateISO = DEFAULT_END_ISO,
}: FooterProps) {
  return (
    <footer className="mt-auto py-4 text-center text-body-sm text-muted border-t border-border">
      <div className="flex items-center justify-center gap-4">
        <a href="/" className="hover:text-tertiary transition-colors">
          Inicio
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
          {competitionLabel} • {formatDateEs(startDateISO)} – {formatDateEs(endDateISO)}
        </p>
      )}
      <p className="text-muted">Última actualización: {formatDateEs(LAST_UPDATED_ISO)}</p>
      <p className="text-muted">
        Hecho con ❤️ por{" "}
        <a
          href="https://github.com/lstuckyb"
          className="hover:text-tertiary transition-colors"
        >
          Lucas Stucky
        </a>{" "}
        y{" "}
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
