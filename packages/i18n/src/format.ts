import { localeTag, type Locale } from './config';

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** e.g. "sáb, 13 jun 2026" / "Sat, 13 Jun 2026" */
export function formatDateLong(value: DateInput, lang: Locale): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(toDate(value));
}

/** e.g. "15:00" — always 24h, in both locales (see localeTag's en-GB note). */
export function formatTime(value: DateInput, lang: Locale): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(value));
}

/** e.g. "13/06/2026, 15:00" */
export function formatDateTimeShort(value: DateInput, lang: Locale): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(value));
}

/** e.g. "13/06/2026" */
export function formatDate(value: DateInput, lang: Locale): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

/** e.g. "15:00:32" */
export function formatClock(value: DateInput, lang: Locale): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(toDate(value));
}

/** ES renders the decimal comma ("0,3"); EN keeps the point ("0.3"). */
export function formatDecimal(n: number, lang: Locale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTag(lang), opts).format(n);
}
