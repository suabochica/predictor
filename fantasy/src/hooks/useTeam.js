import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLeague } from '../context/LeagueContext';

export function useTeam() {
  const { team } = useLeague();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) { setLoading(false); return; }
    fetchTeamPlayers();
  }, [team]);

  async function fetchTeamPlayers() {
    const { data } = await supabase
      .from('team_players')
      .select('*, players(*)')
      .eq('team_id', team.id);
    setPlayers(data ?? []);
    setLoading(false);
  }

  return { team, players, loading, refresh: fetchTeamPlayers };
}
