import { useEffect, useState } from 'react';
import { supabase, useAuth } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';

export function useProxyTargets() {
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
    const { data } = await supabase
      .from('proxy_targets')
      .select('*, players(id, name, position, price, current_price)')
      .order('priority', { ascending: true });
    setTargets(data ?? []);
    setLoading(false);
  }

  async function addTarget(playerId, maxPrice) {
    const nextPriority = targets.length > 0 ? Math.max(...targets.map((t) => t.priority)) + 1 : 1;
    await supabase.from('proxy_targets').insert({
      player_id: playerId,
      priority: nextPriority,
      max_price: maxPrice,
    });
    await fetchTargets();
  }

  async function removeTarget(targetId) {
    await supabase.from('proxy_targets').delete().eq('id', targetId);
    await fetchTargets();
  }

  async function setMaxPrice(targetId, value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;
    await supabase.from('proxy_targets').update({ max_price: parsed }).eq('id', targetId);
    await fetchTargets();
  }

  async function reorder(orderedIds) {
    // Two-pass update avoids transient UNIQUE(user_id,priority) conflicts across
    // separate transactions: first shift all to a temporary high range, then assign final values.
    const offset = 1000;
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from('proxy_targets').update({ priority: offset + i + 1 }).eq('id', orderedIds[i]);
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from('proxy_targets').update({ priority: i + 1 }).eq('id', orderedIds[i]);
    }
    await fetchTargets();
  }

  async function toggleAutoBid(enabled) {
    if (!team) return;
    await supabase.from('teams').update({ auto_bid_enabled: enabled }).eq('id', team.id);
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
