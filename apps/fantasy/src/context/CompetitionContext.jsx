import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@predictor/supabase';
import { useT } from '@predictor/i18n/react';
import { createDb, unscopedFrom } from '../lib/db';

const CompetitionContext = createContext(null);

const STORAGE_KEY = 'fantasy.activeCompetitionId';

function readStoredId() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null; // private mode / storage disabled
  }
}

function writeStoredId(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* non-fatal: the DB column is the durable copy */
  }
}

function readSlugParam() {
  try {
    return new URLSearchParams(window.location.search).get('competition');
  } catch {
    return null;
  }
}

// Single source of the visibility rule: 'setup' means half-built, so it stays out
// of the user switcher until an admin promotes it. Admins see everything, which is
// what makes the Admin panel able to work on a competition nobody else can reach.
async function fetchVisibleCompetitions(isAdmin) {
  const { data } = await unscopedFrom('competitions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  return (data ?? []).filter((c) => isAdmin || c.status !== 'setup');
}

export function CompetitionProvider({ children }) {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const resolvedFor = useRef(null);

  useEffect(() => {
    // AuthProvider only clears `loading` after the profile round-trip, so by the
    // time we get here `profile` is populated (or null) — no second resolve pass.
    if (authLoading) return;
    if (!user) {
      resolvedFor.current = null;
      setCompetitions([]);
      setCompetitionId(null);
      setLoading(false);
      return;
    }
    if (resolvedFor.current === user.id) return;
    resolvedFor.current = user.id;

    let cancelled = false;

    (async () => {
      const visible = await fetchVisibleCompetitions(isAdmin);
      if (cancelled) return;
      setCompetitions(visible);

      if (!visible.length) {
        setCompetitionId(null);
        setLoading(false);
        return;
      }

      const byId = (id) => (id == null ? null : visible.find((c) => c.id === id) ?? null);
      const slug = readSlugParam();

      let picked =
        (slug ? visible.find((c) => c.slug === slug) : null) ??
        byId(readStoredId()) ??
        byId(profile?.active_competition_id);

      if (!picked) {
        // Fall back to a competition this user is actually playing in.
        const { data: myTeams } = await unscopedFrom('teams')
          .select('competition_id')
          .eq('user_id', user.id)
          .eq('status', 'active');
        if (cancelled) return;
        for (const t of myTeams ?? []) {
          picked = byId(t.competition_id);
          if (picked) break;
        }
      }

      picked ??= visible.find((c) => c.is_default) ?? visible[0];

      setCompetitionId(picked.id);
      writeStoredId(picked.id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-reads the list without disturbing the active selection. The Admin panel
  // calls this after creating a competition or changing one's status, so the
  // switcher and the admin selector pick it up without a reload.
  const refreshCompetitions = useCallback(async () => {
    const visible = await fetchVisibleCompetitions(isAdmin);
    setCompetitions(visible);
    return visible;
  }, [isAdmin]);

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId) ?? null,
    [competitions, competitionId]
  );

  // `db` is only built once the id resolves; CompetitionGate keeps descendants
  // from rendering (and firing competition_id=eq.undefined) until then.
  //
  // Its identity changes only when competitionId does — and that same change
  // flips the `key` on LeagueProvider, remounting every consumer below. So a
  // hook may safely leave `db` out of its dependency array: it can never observe
  // a stale one.
  const db = useMemo(() => (competitionId == null ? null : createDb(competitionId)), [competitionId]);

  const value = useMemo(
    () => ({
      competition,
      competitionId,
      competitions,
      isArchived: competition?.status === 'archived',
      loading,
      db,
      refreshCompetitions,
      setCompetition(id) {
        if (id === competitionId || !competitions.some((c) => c.id === id)) return;
        setCompetitionId(id);
        writeStoredId(id);
        // Optimistic and non-blocking: the durable preference follows the user
        // across devices, but the UI never waits on it.
        if (user) {
          unscopedFrom('users')
            .update({ active_competition_id: id })
            .eq('id', user.id)
            .then(() => {});
        }
      },
    }),
    [competition, competitionId, competitions, loading, db, refreshCompetitions, user]
  );

  return <CompetitionContext.Provider value={value}>{children}</CompetitionContext.Provider>;
}

/**
 * Blocks rendering until the active competition is known. Without this a
 * descendant fires `competition_id=eq.undefined`, which PostgREST rejects with a
 * 400 that nearly every call site swallows (`const { data } = await ...`).
 */
export function CompetitionGate({ children }) {
  const { loading, competitionId } = useCompetition();
  const { user, loading: authLoading } = useAuth();
  const t = useT();

  // No session: let the routes render so they can redirect to the gateway.
  if (!authLoading && !user) return children;

  if (!loading && competitionId == null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral text-secondary px-6 text-center text-sm">
        {t('fantasy.competitionGate.noneAvailable')}
      </div>
    );
  }

  if (loading || competitionId == null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral text-primary">
        {t('common.loading')}
      </div>
    );
  }
  return children;
}

export function useCompetition() {
  const ctx = useContext(CompetitionContext);
  if (!ctx) throw new Error('useCompetition must be used inside CompetitionProvider');
  return ctx;
}
