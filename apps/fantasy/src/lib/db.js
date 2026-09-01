import { supabase } from '@predictor/supabase';

// Tables (and the one view) that carry a competition_id column — migrations
// 060-062. Reads get the filter, writes get the stamp.
const SCOPED = new Set([
  'players',
  'teams',
  'matchdays',
  'matches',
  'auction_state',
  'transfer_windows',
  'knockout_matches',
  'negotiation_windows',
  'proxy_targets',
  // Denormalized: queried globally by the client and needed for realtime
  // `filter:`, which only accepts columns of the subscribed table.
  'team_players',
  'fantasy_standings',
  'auction_bids',
  'player_tournament_totals',
  'group_fixtures',
]);

// Tables that are only ever reached through an already-scoped id
// (team_id / matchday_id / player_id / window_id) and so need no column.
const UNSCOPED = new Set([
  'users',
  'competitions',
  'lineups',
  'transfers',
  'player_stats',
  'negotiation_offers',
  'match_metadata',
  'predictions',
  'scoring_rules',
]);

/**
 * Escape hatch for the handful of reads that must deliberately span
 * competitions (the competition list itself, and "which competitions does this
 * user have a team in?"). Greppable on purpose — there should be very few.
 */
export function unscopedFrom(table) {
  return supabase.from(table);
}

function stamp(values, competitionId) {
  const withId = (row) =>
    row && row.competition_id === undefined ? { ...row, competition_id: competitionId } : row;
  return Array.isArray(values) ? values.map(withId) : withId(values);
}

/**
 * Query client bound to one competition. `db.from(table)` behaves like
 * `supabase.from(table)` except that on a scoped table every select/update/
 * delete gains `.eq('competition_id', id)` and every insert/upsert row gets the
 * id stamped in. The returned builders chain normally (.eq/.in/.order/.range/
 * .single/...), so call sites read the same as before.
 *
 * Not a Proxy: .select() returns a different builder class than .from(), so a
 * whole-chain Proxy would be subtle for no gain. Five entry points is the whole
 * surface we need.
 */
export function createDb(competitionId) {
  if (competitionId == null) {
    throw new Error('createDb(): competitionId is required — gate rendering until it resolves.');
  }

  return {
    competitionId,

    from(table) {
      if (UNSCOPED.has(table)) return supabase.from(table);
      if (!SCOPED.has(table)) {
        throw new Error(
          `db.from('${table}'): unknown table. Add it to SCOPED or UNSCOPED in src/lib/db.js.`
        );
      }

      const builder = supabase.from(table);
      return {
        select: (...args) => builder.select(...args).eq('competition_id', competitionId),
        update: (values, ...rest) =>
          builder.update(values, ...rest).eq('competition_id', competitionId),
        delete: (...args) => builder.delete(...args).eq('competition_id', competitionId),
        insert: (values, ...rest) => builder.insert(stamp(values, competitionId), ...rest),
        upsert: (values, ...rest) => builder.upsert(stamp(values, competitionId), ...rest),
      };
    },
  };
}
