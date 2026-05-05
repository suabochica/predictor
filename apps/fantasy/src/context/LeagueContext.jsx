import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useAuth } from '@predictor/supabase';

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
    Promise.all([fetchTeam(), fetchActiveMatchday(), fetchActiveTransferWindow()]).finally(() =>
      setLoading(false)
    );
  }, [user]);

  async function fetchTeam() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setTeam(data);
  }

  async function fetchActiveMatchday() {
    const { data } = await supabase
      .from('matchdays')
      .select('*')
      .eq('is_active', true)
      .single();
    setActiveMatchday(data);
  }

  async function fetchActiveTransferWindow() {
    const { data } = await supabase
      .from('transfer_windows')
      .select('*')
      .eq('is_active', true)
      .single();
    setActiveTransferWindow(data);
  }

  const value = {
    team,
    setTeam,
    activeMatchday,
    activeTransferWindow,
    loading,
    refreshTeam: fetchTeam,
  };

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague() {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeague must be used inside LeagueProvider');
  return ctx;
}
