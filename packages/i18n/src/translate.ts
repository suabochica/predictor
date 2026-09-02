import { CATALOGS } from './catalogs';
import { DEFAULT_LOCALE, type Locale } from './config';

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const part of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isDev(): boolean {
  try {
    // @ts-expect-error — only defined under Vite/Astro; guarded for Node/Jest.
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  let out = str;
  for (const [name, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${name}\\}`, 'g'), String(val));
  }
  return out;
}

/**
 * `key` is `namespace.section.leaf`, e.g. `fantasy.rules.calendar.intro`.
 * Falls back to the ES catalogue, then to the key itself (visible, never
 * crashes) — dev-warning on every fallback. That warning is the completeness
 * audit for every phase; see also `catalogs/index.ts`'s `checkCatalogParity`.
 */
export function createT(lang: Locale) {
  function resolve(key: string): unknown {
    const path = key.split('.');
    const primary = getPath(CATALOGS[lang], path);
    if (primary !== undefined) return primary;

    if (lang !== DEFAULT_LOCALE) {
      const fallback = getPath(CATALOGS[DEFAULT_LOCALE], path);
      if (fallback !== undefined) {
        if (isDev()) {
          console.warn(`[i18n] missing "${lang}" key, falling back to "${DEFAULT_LOCALE}": ${key}`);
        }
        return fallback;
      }
    }

    if (isDev()) {
      console.warn(`[i18n] missing key in every locale: ${key}`);
    }
    return undefined;
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    const value = resolve(key);
    const str = typeof value === 'string' ? value : key;
    return interpolate(str, vars);
  }

  function tPlural(key: string, n: number, vars?: Record<string, string | number>): string {
    const value = resolve(key);
    let str: string;
    if (value && typeof value === 'object') {
      const rules = new Intl.PluralRules(lang === 'en' ? 'en-GB' : 'es-ES');
      const category = rules.select(n);
      const entry = value as Record<string, string>;
      str = entry[category] ?? entry.other ?? key;
    } else {
      str = typeof value === 'string' ? value : key;
    }
    return interpolate(str, { n, ...vars });
  }

  return { t, tPlural };
}
