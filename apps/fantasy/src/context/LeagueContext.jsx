import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useAuth } from '@predictor/supabase';
import { useCompetition } from './CompetitionContext';
import { LOCK_LEAD_MINUTES, TRANSFER_CAP_ROUND_ROBIN, TRANSFER_CAP_KNOCKOUT } from '../config/constants';

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const { user } = useAuth();
  const { db, competition, competitionId } = useCompetition();
  const [team, setTeam] = useState(null);
  const [activeMatchday, setActiveMatchday] = useState(null);
  const [activeTransferWindow, setActiveTransferWindow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([fetchTeam(), fetchMatchdayAndWindow()]).finally(() => setLoading(false));

    // The channel name must be unique per competition (a shared name collides) AND
    // the binding must carry a filter — renaming alone changes nothing, the server
    // still pushes every row change on the table.
    const channel = supabase
      .channel(`league-team-${competitionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
          filter: `competition_id=eq.${competitionId}`,
        },
        () => { fetchTeam(); }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  async function fetchTeam() {
    const { data } = await db
      .from('teams')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setTeam(data);
  }

  async function fetchMatchdayAndWindow() {
    const { data: matchdays } = await db.from('matchdays').select('*');

    if (!matchdays?.length) {
      setActiveMatchday(null);
      setActiveTransferWindow(null);
      return;
    }

    // Window timing is derived purely from real kickoff times (matches.match_date),
    // NOT from the admin's is_completed flag (that drives scoring only).
    const { data: matches } = await db
      .from('matches')
      .select('matchday_id, match_date');

    // Collect kickoff timestamps per matchday + the very first kickoff of the tournament.
    const kicksByMd = {};
    let firstKickoffOverall = null;
    for (const m of matches ?? []) {
      if (m.matchday_id == null || !m.match_date) continue;
      const t = new Date(m.match_date).getTime();
      (kicksByMd[m.matchday_id] ??= []).push(t);
      if (firstKickoffOverall == null || t < firstKickoffOverall) firstKickoffOverall = t;
    }

    const lead = LOCK_LEAD_MINUTES * 60 * 1000;
    const now = Date.now();

    // Canonical tournament order comes from matchdays.sequence (migration 060), not from
    // the shared SERIAL id — unscheduled matchdays stay in their correct position rather
    // than floating to the front/back by kickoff time.
    const ordered = [...matchdays].sort((a, b) => a.sequence - b.sequence);

    // A matchday's window closes 10 min before ITS last game. The active matchday is the
    // first one whose window hasn't closed yet (unscheduled matchdays count as still-open).
    const activeMd = ordered.find((md) => {
      const ks = kicksByMd[md.id];
      if (!ks) return true;
      return now < Math.max(...ks) - lead;
    });

    // Every window has closed → season over: no transfer window, last matchday for history.
    if (!activeMd) {
      setActiveMatchday(ordered[ordered.length - 1]);
      setActiveTransferWindow(null);
      return;
    }

    setActiveMatchday(activeMd);

    const activeKicks = kicksByMd[activeMd.id];
    const lastKickoffActive = activeKicks ? Math.max(...activeKicks) : null;

    // Preseason = no matches scheduled yet, or before the first WC game (minus lead).
    const isPreseason = firstKickoffOverall == null || now < firstKickoffOverall - lead;

    // Caps come from the competition row, not constants.js: the WC pools 2 x 3 league
    // matchdays = 6, while UCL's 8-matchday league phase would yield 16 under the same
    // formula. constants.js keeps its exports as create-competition-form defaults.
    const capLeague = competition?.transfer_cap_league ?? TRANSFER_CAP_ROUND_ROBIN;
    const capKnockout = competition?.transfer_cap_knockout ?? TRANSFER_CAP_KNOCKOUT;

    let maxTransfers = null;
    let countedMatchdayIds = null;
    if (!isPreseason) {
      if (activeMd.phase === 'league') {
        // League-phase allowances pool across every league matchday up to this one.
        countedMatchdayIds = ordered
          .filter(md => md.phase === 'league' && md.sequence <= activeMd.sequence)
          .map(md => md.id);
        maxTransfers = capLeague * countedMatchdayIds.length;
      } else {
        countedMatchdayIds = [activeMd.id];
        maxTransfers = capKnockout;
      }
    }

    // Preseason closes before the first game ever; regular windows close before the last game of the matchday.
    const windowCloseTs = isPreseason ? firstKickoffOverall : lastKickoffActive;
    const closesAt = windowCloseTs != null ? new Date(windowCloseTs - lead).toISOString() : null;

    setActiveTransferWindow({
      matchday_id: activeMd.id,
      window_number: activeMd.id,
      matchday_name: activeMd.name,
      wc_stage: activeMd.wc_stage,
      max_transfers: maxTransfers,
      is_preseason: isPreseason,
      closes_at: closesAt,
      counted_matchday_ids: countedMatchdayIds,
    });
  }

  const value = {
    team,
    setTeam,
    activeMatchday,
    activeTransferWindow,
    loading,
    refreshTeam: fetchTeam,
    refreshWindow: fetchMatchdayAndWindow,
  };

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague() {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeague must be used inside LeagueProvider');
  return ctx;
}
