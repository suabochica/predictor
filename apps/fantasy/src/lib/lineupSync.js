import { supabase } from '@predictor/supabase';

/**
 * After a squad swap (transfer or market), repoint the next not-completed matchday's
 * lineup rows and the null default from playerOutId → playerInId in the same slot.
 * Captaincy is carried automatically (is_captain is preserved from the outgoing row).
 * Completed matchdays are never touched.
 */
export async function repointLineupPlayer(teamId, playerOutId, playerInId) {
  const { data: nextMds } = await supabase
    .from('matchdays')
    .select('id')
    .eq('is_completed', false)
    .order('id', { ascending: true })
    .limit(1);

  const nextMatchdayId = nextMds?.[0]?.id ?? null;

  // Deduplicate: if nextMatchdayId is null we only update null once
  const targets = [...new Set([nextMatchdayId, null])];

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
