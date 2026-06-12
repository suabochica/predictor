import { useState, useEffect } from 'react';
import { supabase } from '@predictor/supabase';
import { LOCK_LEAD_MINUTES } from '../config/constants';

// Keys are FIFA 3-letter codes from matches.team_a/team_b (e.g. 'MEX', 'RSA').
// Callers must pass player.country_code, NOT player.country.
export function useMatchdayLocks(matchdayId) {
  const [kickoffByCode, setKickoffByCode] = useState({});

  useEffect(() => {
    if (!matchdayId) { setKickoffByCode({}); return; }
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
        setKickoffByCode(map);
      });
  }, [matchdayId]);

  function lockTimeFor(countryCode) {
    const kickoff = kickoffByCode[countryCode];
    return kickoff !== undefined ? kickoff - LOCK_LEAD_MINUTES * 60 * 1000 : null;
  }

  return { lockTimeFor, kickoffByCode };
}
