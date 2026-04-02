import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
    if (filters.lockable) query = query.lte('price', 8.5);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    const { data } = await query;
    setPlayers(data ?? []);
    setLoading(false);
  }

  return { players, loading, refresh: fetchPlayers };
}
