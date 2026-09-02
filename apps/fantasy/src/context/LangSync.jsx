import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@predictor/supabase';
import { LangProvider, useLang } from '@predictor/i18n/react';
import { unscopedFrom } from '../lib/db';
import { COOKIE_NAME } from '@predictor/i18n';

function hasLangCookie() {
  return document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_NAME}=`));
}

// Reconciles the cookie-resolved `lang` against `users.language` once auth
// resolves. Cookie present wins (written back to the DB); cookie absent
// adopts the DB value (writes the cookie via setLang). Mirrors
// CompetitionContext.jsx's resolvedFor-ref + optimistic non-blocking
// write-through — see that file for the precedent this copies.
function LangDbSync({ children }) {
  const { user, profile, loading: authLoading } = useAuth();
  const { lang, setLang } = useLang();
  const resolvedFor = useRef(null);

  useEffect(() => {
    if (authLoading || !user || !profile) return;
    if (resolvedFor.current === user.id) return;
    resolvedFor.current = user.id;

    if (hasLangCookie()) {
      if (profile.language && profile.language !== lang) {
        unscopedFrom('users').update({ language: lang }).eq('id', user.id).then(() => {});
      }
      return;
    }
    if (profile.language && profile.language !== lang) {
      setLang(profile.language);
    }
  }, [authLoading, user, profile, lang, setLang]);

  return children;
}

export function FantasyLangProvider({ children }) {
  const { user } = useAuth();

  const onPersist = useCallback(
    (nextLang) => {
      if (!user) return;
      // Optimistic and non-blocking: the durable preference follows the user
      // across devices, but the UI never waits on it.
      unscopedFrom('users').update({ language: nextLang }).eq('id', user.id).then(() => {});
    },
    [user]
  );

  return (
    <LangProvider onPersist={onPersist}>
      <LangDbSync>{children}</LangDbSync>
    </LangProvider>
  );
}
