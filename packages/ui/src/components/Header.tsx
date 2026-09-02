import { LOCALES, buildLangHref } from '@predictor/i18n';
import type { Locale } from '@predictor/i18n';

interface HeaderProps {
  appName: string;
  appIcon: string;
  basePath: string;
  isAdmin?: boolean;
  adminLabel?: string;
  isAuthenticated?: boolean;
  showLogin?: boolean;
  loginLabel?: string;
  logoutLabel?: string;
  otherAppIcon?: string;
  otherAppPath?: string;
  /** Full alt/title text for the other-app icon, e.g. "Ir a Fantasy" / "Go to Fantasy". */
  otherAppTitle?: string;
  /**
   * Language switcher — rendered only when `lang` is given plus one of
   * `currentUrl` (Astro pages: plain `?lang=` anchors, no hydration needed)
   * or `onLangChange` (the fantasy SPA: buttons, no reload).
   */
  lang?: Locale;
  currentUrl?: string;
  onLangChange?: (lang: Locale) => void;
}

export function Header({
  appName,
  appIcon,
  basePath,
  isAdmin = false,
  adminLabel = 'Admin',
  isAuthenticated = true,
  showLogin = false,
  loginLabel = 'Iniciar sesión',
  logoutLabel = 'Cerrar sesión',
  otherAppIcon,
  otherAppPath,
  otherAppTitle,
  lang,
  currentUrl,
  onLangChange,
}: HeaderProps) {
  const showOtherApp = otherAppIcon && otherAppPath;
  const showLangSwitcher = lang && (currentUrl || onLangChange);

  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-border text-primary">
      <div className="mx-auto px-4 h-12 flex items-center justify-between">
        <a
          href={basePath}
          className="flex items-center gap-2 font-atomic font-bold text-lg text-tertiary hover:text-tertiary"
        >
          <img src={appIcon} className="w-6 h-6" alt="" />
          <span className="hidden sm:inline">{appName}</span>
        </a>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <span className="text-xs bg-warning text-primary font-bold px-2 py-1 rounded">
              {adminLabel}
            </span>
          )}
          {showLangSwitcher && (
            <div className="flex items-center gap-1 text-xs font-semibold text-muted">
              {LOCALES.map((l) => {
                const isActive = l === lang;
                const className = isActive
                  ? 'text-tertiary'
                  : 'hover:text-tertiary transition-colors';
                return onLangChange ? (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onLangChange(l)}
                    aria-current={isActive}
                    className={className}
                  >
                    {l.toUpperCase()}
                  </button>
                ) : (
                  <a
                    key={l}
                    href={buildLangHref(currentUrl!, l)}
                    aria-current={isActive}
                    className={className}
                  >
                    {l.toUpperCase()}
                  </a>
                );
              })}
            </div>
          )}
          {showOtherApp && (
            <a
              href={otherAppPath}
              className="opacity-60 hover:opacity-100 transition-opacity"
              title={otherAppTitle}
            >
              <img src={otherAppIcon} className="w-6 h-6" alt={otherAppTitle ?? ''} />
            </a>
          )}
          {isAuthenticated ? (
            <form method="POST" action="/auth/signout">
              <button
                type="submit"
                className="inline-flex items-center justify-center font-medium rounded-md bg-tertiary text-on-tertiary hover:brightness-95 px-5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                {logoutLabel}
              </button>
            </form>
          ) : showLogin ? (
            <a
              href="/login"
              className="inline-flex items-center justify-center font-medium rounded-md bg-tertiary text-on-tertiary hover:brightness-95 px-5 py-3 transition-colors"
            >
              {loginLabel}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
