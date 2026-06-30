interface HeaderProps {
  appName: string;
  appIcon: string;
  basePath: string;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  showLogin?: boolean;
  otherAppIcon?: string;
  otherAppPath?: string;
}

export function Header({
  appName,
  appIcon,
  basePath,
  isAdmin = false,
  isAuthenticated = true,
  showLogin = false,
  otherAppIcon,
  otherAppPath,
}: HeaderProps) {
  const otherAppLabel = otherAppPath?.replace(/^\/|\/$/g, "");
  const showOtherApp = otherAppIcon && otherAppPath;

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
              Admin
            </span>
          )}
          {showOtherApp && (
            <a
              href={otherAppPath}
              className="opacity-60 hover:opacity-100 transition-opacity"
              title={`Ir a ${otherAppLabel}`}
            >
              <img
                src={otherAppIcon}
                className="w-6 h-6"
                alt={`Ir a ${otherAppLabel}`}
              />
            </a>
          )}
          {isAuthenticated ? (
            <form method="POST" action="/auth/signout">
              <button
                type="submit"
                className="inline-flex items-center justify-center font-medium rounded-md bg-tertiary text-on-tertiary hover:brightness-95 px-5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2"
              >
                Cerrar sesión
              </button>
            </form>
          ) : showLogin ? (
            <a
              href="/login"
              className="inline-flex items-center justify-center font-medium rounded-md bg-tertiary text-on-tertiary hover:brightness-95 px-5 py-3 transition-colors"
            >
              Iniciar sesión
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
