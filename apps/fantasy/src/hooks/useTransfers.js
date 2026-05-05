import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { useLeague } from '../context/LeagueContext';

export function useTransfers() {
  const { team, activeTransferWindow } = useLeague();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) { setLoading(false); return; }
    fetchTransfers();
  }, [team]);

  async function fetchTransfers() {
    const { data } = await supabase
      .from('transfers')
      .select('*, player_out:players!transfers_player_out_id_fkey(name), player_in:players!transfers_player_in_id_fkey(name)')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false });
    setTransfers(data ?? []);
    setLoading(false);
  }

  const transfersUsedThisWindow = activeTransferWindow
    ? transfers.filter((t) => t.window_number === activeTransferWindow.window_number).length
    : 0;

  const transfersRemaining = activeTransferWindow
    ? activeTransferWindow.max_transfers - transfersUsedThisWindow
    : 0;

  return { transfers, transfersUsedThisWindow, transfersRemaining, loading, refresh: fetchTransfers };
}
