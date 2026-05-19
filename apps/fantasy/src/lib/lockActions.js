import { supabase } from '@predictor/supabase';

export async function lockPlayer(teamId, playerInId, playerToUnlockId = null) {
  const { data, error } = await supabase.rpc('lock_player', {
    p_team_id: teamId,
    p_player_in: playerInId,
    p_player_to_unlock: playerToUnlockId,
  });
  if (error) throw error;
  return data; // { success, reason?, refunded_teams? }
}

export async function unlockPlayer(teamId, playerId) {
  const { data, error } = await supabase.rpc('unlock_player', {
    p_team_id: teamId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return data; // { success }
}
