import esCommon from './es/common';
import esGateway from './es/gateway';
import esPolla from './es/polla';
import esFantasy from './es/fantasy';
import esAdmin from './es/admin';
import enCommon from './en/common';
import enGateway from './en/gateway';
import enPolla from './en/polla';
import enFantasy from './en/fantasy';
import enAdmin from './en/admin';

export const CATALOGS = {
  es: { common: esCommon, gateway: esGateway, polla: esPolla, fantasy: esFantasy, admin: esAdmin },
  en: { common: enCommon, gateway: enGateway, polla: enPolla, fantasy: enFantasy, admin: enAdmin },
} as const;

function collectKeys(obj: unknown, prefix: string, out: Set<string>) {
  if (obj == null || typeof obj !== 'object') {
    if (prefix) out.add(prefix);
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    collectKeys(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

/**
 * Dev-only completeness check: every leaf key the ES catalogue defines that the
 * EN catalogue does not (yet). This is the audit `translate.ts`'s per-lookup
 * fallback warning can't give you in one shot — run it once at app startup in
 * dev to see the whole remaining gap.
 */
export function checkCatalogParity(): { missingInEn: string[] } {
  const esKeys = new Set<string>();
  const enKeys = new Set<string>();
  collectKeys(CATALOGS.es, '', esKeys);
  collectKeys(CATALOGS.en, '', enKeys);
  const missingInEn = [...esKeys].filter((k) => !enKeys.has(k)).sort();
  return { missingInEn };
}
