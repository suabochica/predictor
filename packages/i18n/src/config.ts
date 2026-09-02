export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** path=/ (never /polla/) so all three apps — one browser origin in prod — share it. */
export const COOKIE_NAME = 'predictor.lang';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * en-GB, not en-US — deliberate: it keeps 24-hour time and day-before-month, so
 * an English reader in this league sees the same *shape* of timestamp as
 * everyone else instead of an unfamiliar month-first one.
 */
export function localeTag(lang: Locale): string {
  return lang === 'en' ? 'en-GB' : 'es-ES';
}
