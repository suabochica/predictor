import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';
import { useCompetition } from '../context/CompetitionContext';

export function useTeam() {
  const { db } = useCompetition();
  const { team } = useLeague();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) { setLoading(false); return; }
    fetchTeamPlayers();

    // Keep the squad live: auction awards / transfers insert or delete team_players.
    const channel = supabase
      .channel(`team-players-${team.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_players', filter: `team_id=eq.${team.id}` },
        () => { fetchTeamPlayers(); }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [team]);

  async function fetchTeamPlayers() {
    const { data } = await db
      .from('team_players')
      .select('*, players(*)')
      .eq('team_id', team.id);
    setPlayers(data ?? []);
    setLoading(false);
  }

  return { team, players, loading, refresh: fetchTeamPlayers };
}
