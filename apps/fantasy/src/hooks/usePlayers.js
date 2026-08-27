import { useEffect, useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';

export function usePlayers(filters = {}) {
  const { db } = useCompetition();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayers();
  }, [JSON.stringify(filters)]);

  async function fetchPlayers() {
    let ownedIds = [];
    if (filters.available) {
      const { data: owned } = await db.from('team_players').select('player_id');
      ownedIds = (owned ?? []).map((tp) => tp.player_id);
    }

    function buildQuery() {
      let q = db.from('players').select('*').order('current_price', { ascending: false });
      if (filters.position) q = q.eq('position', filters.position);
      if (filters.maxPrice) q = q.lte('current_price', filters.maxPrice);
      if (filters.search) q = q.ilike('name', `%${filters.search}%`);
      if (filters.available && ownedIds.length > 0) {
        q = q.not('id', 'in', `(${ownedIds.join(',')})`);
      }
      return q;
    }

    const PAGE = 1000;
    let from = 0;
    let result = [];
    while (true) {
      const { data, error } = await buildQuery().range(from, from + PAGE - 1);
      if (error || !data) break;
      result = result.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (filters.withOwner) {
      // Fetch ownership with a separate query rather than an embedded join:
      // PostgREST's nested embed returns empty for cross-team rosters here,
      // so we mirror the auction's working pattern (see AuctionContext).
      const { data: rosters } = await db
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
