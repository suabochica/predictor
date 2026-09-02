import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { createT } from './translate';
import { resolveClientLang, writeLangCookie } from './resolve';

interface LangContextValue {
  lang: Locale;
  setLang: (lang: Locale) => void;
  t: ReturnType<typeof createT>['t'];
  tPlural: ReturnType<typeof createT>['tPlural'];
}

const LangContext = createContext<LangContextValue | null>(null);

interface LangProviderProps {
  children: ReactNode;
  /**
   * Fire-and-forget callback invoked whenever the user explicitly changes
   * language (never on the initial resolve) — the app wires this to a
   * `users.language` write, matching `CompetitionContext.jsx`'s
   * optimistic-write-through shape. Left unset here since the DB↔cookie
   * reconciliation (adopt `profile.language` once auth resolves) needs
   * `useAuth`, which this package doesn't depend on — that's Phase 1.
   */
  onPersist?: (lang: Locale) => void;
}

export function LangProvider({ children, onPersist }: LangProviderProps) {
  const [lang, setLangState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOCALE;
    return resolveClientLang({
      queryLang: new URLSearchParams(window.location.search).get('lang'),
      cookieHeader: document.cookie,
      navigatorLanguage: window.navigator?.language,
    });
  });

  const setLang = useCallback(
    (next: Locale) => {
      setLangState(next);
      writeLangCookie(next);
      onPersist?.(next);
    },
    [onPersist]
  );

  // Islands take `lang` as a prop rather than reading the cookie themselves
  // (avoids a hydration mismatch), but this top-level provider still owns
  // `<html lang>` for the SPA shell.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const { t, tPlural } = useMemo(() => createT(lang), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, tPlural }), [lang, setLang, t, tPlural]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

export function useT() {
  return useLang().t;
}
