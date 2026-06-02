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
    const { data: matchdays } = await supabase
      .from('matchdays')
      .select('*')
      .order('start_date', { ascending: true });

    if (!matchdays?.length) {
      setActiveMatchday(null);
      setActiveTransferWindow(null);
      return;
    }

    // Active matchday = first not-completed matchday
    const nextMd = matchdays.find((md) => !md.is_completed) ?? null;
    setActiveMatchday(nextMd);

    if (!nextMd) {
      setActiveTransferWindow(null);
      return;
    }

    // Fetch earliest match for this matchday to show first lock time
    const { data: mdMatches } = await supabase
      .from('matches')
      .select('match_date')
      .eq('matchday_id', nextMd.id)
      .order('match_date', { ascending: true })
      .limit(1);

    const firstKickoff = mdMatches?.[0]?.match_date ?? null;
    const closesAt = firstKickoff
      ? new Date(new Date(firstKickoff).getTime() - LOCK_LEAD_MINUTES * 60 * 1000).toISOString()
      : null;

    // Preseason = no matchday has been completed by the admin yet → unlimited transfers
    const isPreseason = !matchdays.some((md) => md.is_completed);

    let maxTransfers = null;
    if (!isPreseason) {
      const isGroup = nextMd.wc_stage?.toLowerCase().includes('group');
      maxTransfers = isGroup ? TRANSFER_CAP_ROUND_ROBIN : TRANSFER_CAP_KNOCKOUT;
    }

    setActiveTransferWindow({
      matchday_id: nextMd.id,
      window_number: nextMd.id,
      matchday_name: nextMd.name,
      wc_stage: nextMd.wc_stage,
      max_transfers: maxTransfers,
      is_preseason: isPreseason,
      first_kickoff: firstKickoff,
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
