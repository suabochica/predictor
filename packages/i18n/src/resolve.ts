import { COOKIE_NAME, DEFAULT_LOCALE, isLocale, type Locale } from './config';

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    out[name] = decodeURIComponent(rest.join('=') ?? '');
  }
  return out;
}

export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim().split('-')[0]?.toLowerCase();
  return isLocale(first) ? first : null;
}

/**
 * Server-side (Astro middleware) resolution: `?lang=` query param → cookie →
 * `Accept-Language` → default. `shouldWriteCookie` is only true for the query
 * param case — the caller (middleware) still owns actually setting it.
 */
export function resolveServerLang(opts: {
  queryLang?: string | null;
  cookieHeader?: string | null;
  acceptLanguageHeader?: string | null;
}): { lang: Locale; shouldWriteCookie: boolean } {
  if (isLocale(opts.queryLang)) {
    return { lang: opts.queryLang, shouldWriteCookie: true };
  }
  const cookies = parseCookieHeader(opts.cookieHeader);
  if (isLocale(cookies[COOKIE_NAME])) {
    return { lang: cookies[COOKIE_NAME] as Locale, shouldWriteCookie: false };
  }
  const fromHeader = fromAcceptLanguage(opts.acceptLanguageHeader);
  if (fromHeader) return { lang: fromHeader, shouldWriteCookie: false };
  return { lang: DEFAULT_LOCALE, shouldWriteCookie: false };
}

/**
 * Client-side resolution: `?lang=` → cookie → `navigator.language` → default.
 * Mirrors the server rule minus the DB column — reconciling against
 * `profile.language` is the caller's job (needs `useAuth`, which this
 * framework-agnostic module can't depend on).
 */
export function resolveClientLang(opts: {
  queryLang?: string | null;
  cookieHeader?: string | null;
  navigatorLanguage?: string | null;
}): Locale {
  if (isLocale(opts.queryLang)) return opts.queryLang;
  const cookies = parseCookieHeader(opts.cookieHeader);
  if (isLocale(cookies[COOKIE_NAME])) return cookies[COOKIE_NAME] as Locale;
  const navLang = opts.navigatorLanguage?.split('-')[0]?.toLowerCase();
  if (isLocale(navLang)) return navLang;
  return DEFAULT_LOCALE;
}

/** Not HttpOnly — the client must be able to read and write it. */
export function writeLangCookie(lang: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
