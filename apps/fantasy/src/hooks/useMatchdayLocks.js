import { useState, useEffect } from 'react';
import { supabase } from '@predictor/supabase';
import { LOCK_LEAD_MINUTES } from '../config/constants';

export function useMatchdayLocks(matchdayId) {
  const [kickoffByCountry, setKickoffByCountry] = useState({});

  useEffect(() => {
    if (!matchdayId) { setKickoffByCountry({}); return; }
    supabase
      .from('matches')
      .select('team_a, team_b, match_date')
      .eq('matchday_id', matchdayId)
      .then(({ data }) => {
        const map = {};
        for (const row of data ?? []) {
          const kickoff = new Date(row.match_date).getTime();
          if (!map[row.team_a] || kickoff < map[row.team_a]) map[row.team_a] = kickoff;
          if (!map[row.team_b] || kickoff < map[row.team_b]) map[row.team_b] = kickoff;
        }
        setKickoffByCountry(map);
      });
  }, [matchdayId]);

  function lockTimeFor(country) {
    const kickoff = kickoffByCountry[country];
    return kickoff !== undefined ? kickoff - LOCK_LEAD_MINUTES * 60 * 1000 : null;
  }

  return { lockTimeFor, kickoffByCountry };
}
