import { useEffect, useState } from 'react';
import { supabase, useAuth } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';
import { useCompetition } from '../context/CompetitionContext';

export function useProxyTargets() {
  const { db } = useCompetition();
  const { user } = useAuth();
  const { team } = useLeague();
  const [targets, setTargets] = useState([]);
  const [autoBidEnabled, setAutoBidEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !team) { setLoading(false); return; }
    setAutoBidEnabled(!!team.auto_bid_enabled);
    fetchTargets();

    const channel = supabase
      .channel(`proxy-targets-${team.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proxy_targets', filter: `user_id=eq.${user.id}` },
        () => { fetchTargets(); }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, team?.id]);

  // Sync autoBidEnabled from team when it refreshes (e.g. realtime UPDATE on teams)
  useEffect(() => {
    if (team) setAutoBidEnabled(!!team.auto_bid_enabled);
  }, [team?.auto_bid_enabled]);

  async function fetchTargets() {
    if (!user) { setLoading(false); return; }
    const { data } = await db
      .from('proxy_targets')
      .select('*, players(id, name, position, price, current_price)')
      .eq('user_id', user.id)
      .order('priority', { ascending: true });
    setTargets(data ?? []);
    setLoading(false);
  }

  async function addTarget(playerId, maxPrice) {
    if (!user) return;
    const nextPriority = targets.length > 0 ? Math.max(...targets.map((t) => t.priority)) + 1 : 1;
    await db.from('proxy_targets').insert({
      user_id: user.id,
      player_id: playerId,
      priority: nextPriority,
      max_price: maxPrice,
    });
    await fetchTargets();
  }

  async function removeTarget(targetId) {
    await db.from('proxy_targets').delete().eq('id', targetId);
    await fetchTargets();
  }

  async function setMaxPrice(targetId, value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;
    await db.from('proxy_targets').update({ max_price: parsed }).eq('id', targetId);
    await fetchTargets();
  }

  async function reorder(orderedIds) {
    // Single bulk upsert = one transaction. The UNIQUE(user_id, priority) constraint is
    // DEFERRABLE INITIALLY DEFERRED, so transient duplicates during the statement are
    // tolerated and only the final 1..N assignment is checked at commit. A per-row update
    // approach can't work here: each request is its own transaction (deferral doesn't help),
    // and a temporary high range would violate CHECK(priority BETWEEN 1 AND 30).
    const byId = new Map(targets.map((t) => [t.id, t]));
    const rows = orderedIds
      .map((id, i) => {
        const t = byId.get(id);
        if (!t) return null;
        return {
          id: t.id,
          user_id: t.user_id,
          player_id: t.player_id,
          max_price: t.max_price,
          priority: i + 1,
        };
      })
      .filter(Boolean);
    await db.from('proxy_targets').upsert(rows, { onConflict: 'id' });
    await fetchTargets();
  }

  async function toggleAutoBid(enabled) {
    if (!team) return;
    await db.from('teams').update({ auto_bid_enabled: enabled }).eq('id', team.id);
    setAutoBidEnabled(enabled);
  }

  return {
    targets,
    autoBidEnabled,
    loading,
    addTarget,
    removeTarget,
    reorder,
    setMaxPrice,
    toggleAutoBid,
    refresh: fetchTargets,
  };
}
