import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

export function usePlayers(filters = {}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayers();
  }, [JSON.stringify(filters)]);

  async function fetchPlayers() {
    let query = supabase.from('players').select('*').order('current_price', { ascending: false });
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
      // Fetch ownership with a separate query rather than an embedded join:
      // PostgREST's nested embed returns empty for cross-team rosters here,
      // so we mirror the auction's working pattern (see AuctionContext).
      const { data: rosters } = await supabase
        .from('team_players')
        .select('player_id, teams(id, name, user_id)');
      const ownerByPlayer = new Map();
      (rosters ?? []).forEach((r) => {
        if (r.teams) {
          ownerByPlayer.set(r.player_id, {
            teamId: r.teams.id,
            teamName: r.teams.name,
            userId: r.teams.user_id,
          });
        }
      });
      result = result.map((p) => ({ ...p, owner: ownerByPlayer.get(p.id) ?? null }));
    }

    setPlayers(result);
    setLoading(false);
  }

  return { players, loading, refresh: fetchPlayers };
}
