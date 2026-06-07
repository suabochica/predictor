import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

export function usePlayers(filters = {}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayers();
  }, [JSON.stringify(filters)]);

  async function fetchPlayers() {
    const selectFields = filters.withOwner
      ? '*, team_players(team_id, teams(id, name, user_id))'
      : '*';

    let query = supabase.from('players').select(selectFields).order('current_price', { ascending: false });
    if (filters.position) query = query.eq('position', filters.position);
    if (filters.maxPrice) query = query.lte('current_price', filters.maxPrice);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);
    if (filters.available) {
      const { data: owned } = await supabase.from('team_players').select('player_id');
      const ownedIds = (owned ?? []).map((tp) => tp.player_id);
      if (ownedIds.length > 0) {
        query = query.not('id', 'in', `(${ownedIds.join(',')})`);
      }
    }

    const { data } = await query;
    let result = data ?? [];

    if (filters.withOwner) {
      result = result.map((p) => {
        const tp = p.team_players?.[0];
        return {
          ...p,
          owner: tp?.teams
            ? { teamId: tp.teams.id, teamName: tp.teams.name, userId: tp.teams.user_id }
            : null,
        };
      });
    }

    setPlayers(result);
    setLoading(false);
  }

  return { players, loading, refresh: fetchPlayers };
}
