import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useT } from '@predictor/i18n/react';
import { useLeague } from '../context/LeagueContext';
import { TRANSFER_CAP_KNOCKOUT } from '../config/constants';
import { useCompetition } from '../context/CompetitionContext';

export function useNegotiation() {
  const t = useT();
  const { db, competition, competitionId } = useCompetition();
  const { team } = useLeague();
  const [negWindow, setNegWindow] = useState(null);
  const [pool, setPool] = useState([]);
  const [counts, setCounts] = useState({});
  const [myOffers, setMyOffers] = useState([]);
  const [transfersUsed, setTransfersUsed] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOpen = !!negWindow && negWindow.status === 'open' && new Date(negWindow.closes_at) > new Date();

  const fetchWindow = useCallback(async () => {
    const { data } = await db
      .from('negotiation_windows')
      .select('*')
      .order('id', { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  }, []);

  // Pool = players of eliminated fantasy teams whose country is still alive,
  // derived live (never snapshotted) — matches submit/resolve RPC checks.
  const fetchPool = useCallback(async () => {
    const { data: elimTeams } = await db.from('teams').select('id, name').eq('status', 'eliminated');
    if (!elimTeams?.length) return [];
    const teamIds = elimTeams.map((t) => t.id);
    const { data: rows } = await db
      .from('team_players')
      .select('team_id, player_id, players(*)')
      .in('team_id', teamIds);
    const byTeam = new Map(elimTeams.map((t) => [t.id, { teamId: t.id, teamName: t.name, players: [] }]));
    for (const row of rows ?? []) {
      if (!row.players || row.players.is_eliminated) continue;
      byTeam.get(row.team_id)?.players.push(row.players);
    }
    return [...byTeam.values()].filter((g) => g.players.length > 0);
  }, []);

  const fetchCounts = useCallback(async (windowId) => {
    if (!windowId) return {};
    const { data } = await supabase.rpc('get_negotiation_offer_counts', { p_window_id: windowId });
    const map = {};
    for (const row of data ?? []) map[row.target_player_id] = Number(row.offer_count);
    return map;
  }, []);

  const fetchMyOffers = useCallback(
    async (windowId) => {
      if (!windowId || !team) return [];
      const { data } = await db
        .from('negotiation_offers')
        .select(
          '*, target:players!negotiation_offers_target_player_id_fkey(name, position, country, country_code, current_price), offered:players!negotiation_offers_offered_player_id_fkey(name, position, country, country_code, current_price)'
        )
        .eq('window_id', windowId)
        .eq('bidder_team_id', team.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    [team?.id]
  );

  const fetchResolvedWindows = useCallback(async () => {
    const { data } = await db
      .from('negotiation_windows')
      .select('*')
      .eq('status', 'resolved')
      .order('id', { ascending: false });
    return data ?? [];
  }, []);

  const fetchHistoryOffers = useCallback(async (windowIds) => {
    if (!windowIds.length) return [];
    const { data } = await db
      .from('negotiation_offers')
      .select(
        '*, target:players!negotiation_offers_target_player_id_fkey(name, position, country, country_code, current_price), offered:players!negotiation_offers_offered_player_id_fkey(name, position, country, country_code, current_price), bidder:teams!negotiation_offers_bidder_team_id_fkey(id, name)'
      )
      .in('window_id', windowIds)
      .in('status', ['won', 'lost'])
      .order('created_at', { ascending: true });
    return data ?? [];
  }, []);

  const fetchHistory = useCallback(async () => {
    const windows = await fetchResolvedWindows();
    if (!windows.length) return [];
    const offers = await fetchHistoryOffers(windows.map((w) => w.id));
    const offersByWindow = new Map();
    for (const o of offers) {
      if (!offersByWindow.has(o.window_id)) offersByWindow.set(o.window_id, []);
      offersByWindow.get(o.window_id).push(o);
    }
    const toEntry = (o) => {
      const total = Number((Number(o.offered?.current_price ?? 0) + Number(o.cash)).toFixed(1));
      return { teamName: o.bidder?.name ?? t('fantasy.common.teamFallback', { id: o.bidder_team_id }), offered: o.offered, cash: Number(o.cash), total };
    };
    return windows.map((w) => {
      const windowOffers = offersByWindow.get(w.id) ?? [];
      const byTarget = new Map();
      for (const o of windowOffers) {
        if (!byTarget.has(o.target_player_id)) byTarget.set(o.target_player_id, { target: o.target, won: null, lost: [] });
        const group = byTarget.get(o.target_player_id);
        if (o.status === 'won') group.won = toEntry(o);
        else group.lost.push(toEntry(o));
      }
      const sales = [...byTarget.values()]
        .filter((g) => g.won)
        .map((g) => ({
          target: g.target,
          winner: g.won,
          losers: g.lost.sort((a, b) => b.total - a.total),
        }));
      return { windowId: w.id, fantasyRound: w.fantasy_round, resolvedAt: w.resolved_at, sales };
    });
  }, [fetchResolvedWindows, fetchHistoryOffers, t]);

  const fetchTransfersUsed = useCallback(
    async (matchdayId) => {
      if (!matchdayId || !team) return 0;
      const { count } = await db
        .from('transfers')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('matchday_id', matchdayId);
      return count ?? 0;
    },
    [team?.id]
  );

  const refresh = useCallback(async () => {
    const w = await fetchWindow();
    setNegWindow(w);
    const open = !!w && w.status === 'open' && new Date(w.closes_at) > new Date();
    const [poolData, countsData, offersData, used, historyData] = await Promise.all([
      open ? fetchPool() : Promise.resolve([]),
      open ? fetchCounts(w.id) : Promise.resolve({}),
      w ? fetchMyOffers(w.id) : Promise.resolve([]),
      open ? fetchTransfersUsed(w.matchday_id) : Promise.resolve(0),
      fetchHistory(),
    ]);
    setPool(poolData);
    setCounts(countsData);
    setMyOffers(offersData);
    setTransfersUsed(used);
    setHistory(historyData);
    setLoading(false);
  }, [fetchWindow, fetchPool, fetchCounts, fetchMyOffers, fetchTransfersUsed, fetchHistory]);

  useEffect(() => {
    if (!team) {
      setLoading(false);
      return;
    }
    refresh();

    const channel = supabase
      .channel(`negotiation-window-rt-${competitionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'negotiation_windows',
          filter: `competition_id=eq.${competitionId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [team?.id]);

  // Offers are sealed (RLS own-rows-only) so they aren't realtime-published;
  // counts are the only live signal of others' activity — poll while open.
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(async () => {
      setCounts(await fetchCounts(negWindow.id));
    }, 30000);
    return () => clearInterval(id);
  }, [isOpen, negWindow?.id, fetchCounts]);

  const activeOffers = myOffers.filter((o) => o.status === 'active');
  const committedCash = activeOffers.reduce((sum, o) => sum + Number(o.cash), 0);
  const committedPlayerIds = new Set(activeOffers.map((o) => o.offered_player_id));
  // Negotiation windows only ever open in the knockout phase, so the knockout cap
  // is the right one — sourced from the competition row (submit_negotiation_offer
  // reads the same column server-side).
  const capKnockout = competition?.transfer_cap_knockout ?? TRANSFER_CAP_KNOCKOUT;
  const offersRemaining = isOpen
    ? Math.max(0, capKnockout - transfersUsed - activeOffers.length)
    : 0;

  async function submitOffer(targetPlayerId, offeredPlayerId, cash) {
    if (!negWindow) return { error: t('fantasy.negotiations.errors.noWindowOpen') };
    const { data, error } = await supabase.rpc('submit_negotiation_offer', {
      p_window_id: negWindow.id,
      p_target_player_id: targetPlayerId,
      p_offered_player_id: offeredPlayerId,
      p_cash: cash,
    });
    const rpcError = error?.message ?? data?.error;
    if (!rpcError) await refresh();
    return { error: rpcError ?? null };
  }

  async function withdrawOffer(offerId) {
    const { data, error } = await supabase.rpc('withdraw_negotiation_offer', { p_offer_id: offerId });
    const rpcError = error?.message ?? data?.error;
    if (!rpcError) await refresh();
    return { error: rpcError ?? null };
  }

  return {
    window: negWindow,
    isOpen,
    pool,
    counts,
    myOffers,
    committedCash,
    committedPlayerIds,
    offersRemaining,
    history,
    loading,
    submitOffer,
    withdrawOffer,
    refresh,
  };
}
