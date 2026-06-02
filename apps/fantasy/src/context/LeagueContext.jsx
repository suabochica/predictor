import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useAuth } from '@predictor/supabase';
import { LOCK_LEAD_MINUTES, TRANSFER_CAP_ROUND_ROBIN, TRANSFER_CAP_KNOCKOUT } from '../config/constants';

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const { user } = useAuth();
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

    const channel = supabase
      .channel('league-team')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        () => { fetchTeam(); }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  async function fetchTeam() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setTeam(data);
  }

  async function fetchMatchdayAndWindow() {
    const { data: matchdays } = await supabase.from('matchdays').select('*');

    if (!matchdays?.length) {
      setActiveMatchday(null);
      setActiveTransferWindow(null);
      return;
    }

    // Window timing is derived purely from real kickoff times (matches.match_date),
    // NOT from the admin's is_completed flag (that drives scoring only).
    const { data: matches } = await supabase
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

    // Chronological order = by earliest kickoff; matchdays without a schedule sort last.
    const firstKick = (md) => (kicksByMd[md.id] ? Math.min(...kicksByMd[md.id]) : Infinity);
    const ordered = [...matchdays].sort((a, b) => firstKick(a) - firstKick(b));

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

    // Preseason = before the first WC game (minus lead) → unlimited transfers.
    const isPreseason = firstKickoffOverall != null && now < firstKickoffOverall - lead;

    let maxTransfers = null;
    if (!isPreseason) {
      const isGroup = activeMd.wc_stage?.toLowerCase().includes('group');
      maxTransfers = isGroup ? TRANSFER_CAP_ROUND_ROBIN : TRANSFER_CAP_KNOCKOUT;
    }

    // Window closes 10 min before this matchday's final kickoff.
    const closesAt =
      lastKickoffActive != null ? new Date(lastKickoffActive - lead).toISOString() : null;

    setActiveTransferWindow({
      matchday_id: activeMd.id,
      window_number: activeMd.id,
      matchday_name: activeMd.name,
      wc_stage: activeMd.wc_stage,
      max_transfers: maxTransfers,
      is_preseason: isPreseason,
      closes_at: closesAt,
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
