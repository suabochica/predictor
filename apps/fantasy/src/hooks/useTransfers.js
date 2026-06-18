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

  // Count transfers used in the current window (keyed by matchday_id for new model).
  // Group stage pools across all group matchdays up to and including the active one.
  // Preseason transfers have matchday_id = null.
  const counted = activeTransferWindow?.counted_matchday_ids;
  const transfersUsedThisWindow = activeTransferWindow
    ? transfers.filter((t) =>
        activeTransferWindow.is_preseason
          ? t.matchday_id == null
          : counted?.includes(t.matchday_id)
      ).length
    : 0;

  // null = unlimited (preseason)
  const transfersRemaining =
    activeTransferWindow?.max_transfers != null
      ? Math.max(0, activeTransferWindow.max_transfers - transfersUsedThisWindow)
      : null;

  return { transfers, transfersUsedThisWindow, transfersRemaining, loading, refresh: fetchTransfers };
}
