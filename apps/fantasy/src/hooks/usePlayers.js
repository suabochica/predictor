import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

export function usePlayers(filters = {}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayers();
  }, [JSON.stringify(filters)]);

  async function fetchPlayers() {
    let query = supabase.from('players').select('*').order('price', { ascending: false });
    if (filters.position) query = query.eq('position', filters.position);
    if (filters.maxPrice) query = query.lte('price', filters.maxPrice);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);
    if (filters.available) {
      const { data: owned } = await supabase.from('team_players').select('player_id');
      const ownedIds = (owned ?? []).map((tp) => tp.player_id);
      if (ownedIds.length > 0) {
        query = query.not('id', 'in', `(${ownedIds.join(',')})`);
      }
    }

    const { data } = await query;
    setPlayers(data ?? []);
    setLoading(false);
  }

  return { players, loading, refresh: fetchPlayers };
}
