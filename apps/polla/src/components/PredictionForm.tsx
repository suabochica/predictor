import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@predictor/supabase';
import type { Match, DbMatch } from '../types';
import { countries } from '../data/matches';

interface PredictionState {
  [matchCode: string]: {
    score_a: number | null;
    score_b: number | null;
  };
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Strip timezone suffix and keep just the date portion for grouping. */
function dateKey(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function groupMatchesByDate(matchList: Match[]): Record<string, Match[]> {
  return matchList.reduce((acc, match) => {
    const dk = dateKey(match.match_date);
    (acc[dk] ??= []).push(match);
    return acc;
  }, {} as Record<string, Match[]>);
}

function dbToMatch(row: DbMatch): Match {
  return {
    match_id: row.match_code,
    team_a: row.team_a,
    team_b: row.team_b,
    match_date: row.match_date,
    group: row.group_name ?? undefined,
    stadium: row.stadium ?? undefined,
    status: row.status as Match['status'],
  };
}

export default function PredictionForm({ currentUser }: { currentUser?: string }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchUuidMap, setMatchUuidMap] = useState<Record<string, string>>({});
  const [predictions, setPredictions] = useState<PredictionState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // ── Fetch matches ──────────────────────────────────────
      const { data: dbMatches, error: matchErr } = await supabase
        .from('matches')
        .select('id, match_code, team_a, team_b, match_date, group_name, stadium, status')
        .eq('stage', 'group')
        .order('match_code');

      if (matchErr) throw matchErr;

      if (dbMatches && dbMatches.length > 0) {
        const rows = dbMatches as DbMatch[];
        const uuids: Record<string, string> = {};
        for (const r of rows) uuids[r.match_code] = r.id;
        setMatchUuidMap(uuids);
        setMatches(rows.map(dbToMatch));

        // ── Fetch existing predictions ───────────────────────
        if (currentUser) {
          const { data: dbPreds, error: predErr } = await supabase
            .from('predictions')
            .select('match_id, predicted_score_a, predicted_score_b')
            .eq('user_id', currentUser);

          if (!predErr && dbPreds) {
            const codeByUuid: Record<string, string> = {};
            for (const [code, uuid] of Object.entries(uuids)) codeByUuid[uuid] = code;

            const initial: PredictionState = {};
            for (const p of dbPreds) {
              const code = codeByUuid[p.match_id];
              if (code) {
                initial[code] = { score_a: p.predicted_score_a, score_b: p.predicted_score_b };
              }
            }
            setPredictions(initial);
          }
        }
      }

      setUsingFallback(false);
      setLoading(false);
      return;
    } catch {
      setUsingFallback(true);
      setLoading(false);
    }
  }

  const handleScoreChange = useCallback(
    (matchCode: string, team: 'a' | 'b', value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (numValue !== null && (numValue < 0 || numValue > 9)) return;

      setPredictions((prev) => ({
        ...prev,
        [matchCode]: {
          score_a: team === 'a' ? numValue : prev[matchCode]?.score_a ?? null,
          score_b: team === 'b' ? numValue : prev[matchCode]?.score_b ?? null,
        },
      }));
      setSaved(false);
    },
    [],
  );

  async function handleSave() {
    if (!currentUser) return;
    setSaving(true);

    const rows = Object.entries(predictions)
      .filter(([, p]) => p.score_a !== null && p.score_b !== null)
      .map(([matchCode, p]) => ({
        user_id: currentUser,
        match_id: matchUuidMap[matchCode],
        predicted_score_a: p.score_a as number,
        predicted_score_b: p.score_b as number,
      }));

    if (rows.length === 0) {
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase.from('predictions').upsert(rows, {
        onConflict: 'user_id,match_id',
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save predictions:', err);
    } finally {
      setSaving(false);
    }
  }

  const matchesByDate = groupMatchesByDate(matches);
  const sortedDates = Object.keys(matchesByDate).sort();

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // ── Empty / offline ───────────────────────────────────────
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-50/50 px-6 py-8 text-center dark:bg-amber-900/20">
        <p className="text-amber-700 dark:text-amber-300">
          {usingFallback
            ? 'Unable to connect to database. Run the import script or check your connection.'
            : 'No group stage matches in the database yet. Run the import script to populate them:'}
        </p>
        {!usingFallback && (
          <code className="mt-3 block text-sm text-amber-600 dark:text-amber-400">
            pnpm import-matches
          </code>
        )}
      </div>
    );
  }

  // ── Table ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
            {formatDateLabel(date)}
          </h2>

          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Time
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Home
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Score
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400" />
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Score
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Away
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Group
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {matchesByDate[date].map((match) => {
                  const teamA = countries[match.team_a];
                  const teamB = countries[match.team_b];
                  const pred = predictions[match.match_id] || {};
                  const isLocked = match.status !== 'upcoming';

                  return (
                    <tr
                      key={match.match_id}
                      className={`${isLocked ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <td className="whitespace-nowrap px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(match.match_date)}
                      </td>

                      <td className="whitespace-nowrap px-1 py-2 text-right">
                        {teamA?.flag}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {teamA?.name || match.team_a}
                      </td>

                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          disabled={isLocked}
                          value={pred.score_a ?? ''}
                          onChange={(e) => handleScoreChange(match.match_id, 'a', e.target.value)}
                          className="w-14 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800"
                          placeholder="-"
                        />
                      </td>

                      <td className="whitespace-nowrap px-1 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                        -
                      </td>

                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          disabled={isLocked}
                          value={pred.score_b ?? ''}
                          onChange={(e) => handleScoreChange(match.match_id, 'b', e.target.value)}
                          className="w-14 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800"
                          placeholder="-"
                        />
                      </td>

                      <td className="whitespace-nowrap px-1 py-2">
                        {teamB?.flag}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {teamB?.name || match.team_b}
                      </td>

                      <td className="whitespace-nowrap px-2 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                        {match.group}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !currentUser}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Predictions'}
        </button>
      </div>
    </div>
  );
}
