import { supabase } from '@predictor/supabase';

/**
 * After a squad swap, repoint the time-active matchday's lineup rows and the
 * null default from playerOutId → playerInId in the same slot.
 * Captaincy is preserved from the outgoing row. Pass the time-active matchday id
 * from LeagueContext.activeMatchday — do NOT derive it from is_completed (score clock).
 */
export async function repointLineupPlayer(teamId, playerOutId, playerInId, targetMatchdayId) {
  // Deduplicate: if targetMatchdayId is null we only update null once
  const targets = [...new Set([targetMatchdayId ?? null, null])];

  for (const matchdayId of targets) {
    let selectQuery = supabase
      .from('lineups')
      .select('*')
      .eq('team_id', teamId)
      .eq('player_id', playerOutId);
    selectQuery = matchdayId !== null
      ? selectQuery.eq('matchday_id', matchdayId)
      : selectQuery.is('matchday_id', null);

    const { data: rows } = await selectQuery;
    if (!rows || rows.length === 0) continue;

    const row = rows[0];

    let delQuery = supabase
      .from('lineups')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerOutId);
    delQuery = matchdayId !== null
      ? delQuery.eq('matchday_id', matchdayId)
      : delQuery.is('matchday_id', null);
    await delQuery;

    await supabase.from('lineups').insert({
      team_id: teamId,
      player_id: playerInId,
      matchday_id: matchdayId,
      is_starting: row.is_starting,
      is_captain: row.is_captain,
      bench_order: row.bench_order,
    });
  }
}
