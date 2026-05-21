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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      // ── Fetch matches ──────────────────────────────────────
      const { data: dbMatches, error: matchErr } = await supabase
        .from('matches')
        .select('id, match_code, team_a, team_b, match_date, group_name, stadium, status')
        .eq('stage', 'group')
        .order('match_code')
        .abortSignal(controller.signal);

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
            .eq('user_id', currentUser)
            .abortSignal(controller.signal);

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
    } catch (err: any) {
      console.error('PredictionForm loadData error:', err?.message ?? err);
      setUsingFallback(true);
    } finally {
      clearTimeout(timeout);
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tertiary border-t-transparent" />
      </div>
    );
  }

  // ── Empty / offline ───────────────────────────────────────
  if (matches.length === 0) {
    return (
      <div className="rounded-sm border border-warning/30 bg-warning/10 px-6 py-8 text-center">
        <p className="text-warning text-body-md">
          {usingFallback
            ? 'Unable to connect to database. Run the import script or check your connection.'
            : 'No group stage matches in the database yet. Run the import script to populate them:'}
        </p>
        {!usingFallback && (
          <code className="mt-3 block text-body-sm text-warning font-label">
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
          <h2 className="font-heading text-h2 font-semibold text-primary">
            {formatDateLabel(date)}
          </h2>

          <div className="overflow-hidden rounded-sm border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-neutral">
                <tr>
                  <th className="px-2 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Time
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                    Home
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider" />
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Score
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                    Away
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Group
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border bg-surface">
                {matchesByDate[date].map((match) => {
                  const teamA = countries[match.team_a];
                  const teamB = countries[match.team_b];
                  const pred = predictions[match.match_id] || {};
                  const isLocked = match.status !== 'upcoming';

                  return (
                    <tr
                      key={match.match_id}
                      className={`${isLocked ? 'opacity-50' : 'hover:bg-surface-hover'}`}
                    >
                      <td className="whitespace-nowrap px-2 py-2 text-center text-body-sm text-muted">
                        {formatTime(match.match_date)}
                      </td>

                      <td className="whitespace-nowrap px-1 py-2 text-right">
                        {teamA?.flag}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-body-sm font-medium text-primary">
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
                          className="w-14 rounded-sm border border-border px-2 py-1 text-center text-body-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                          placeholder="-"
                          aria-label={`${teamA?.name || match.team_a} score`}
                        />
                      </td>

                      <td className="whitespace-nowrap px-1 py-2 text-center text-body-sm text-muted">
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
                          className="w-14 rounded-sm border border-border px-2 py-1 text-center text-body-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                          placeholder="-"
                          aria-label={`${teamB?.name || match.team_b} score`}
                        />
                      </td>

                      <td className="whitespace-nowrap px-1 py-2">
                        {teamB?.flag}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-body-sm font-medium text-primary">
                        {teamB?.name || match.team_b}
                      </td>

                      <td className="whitespace-nowrap px-2 py-2 text-center text-body-sm text-muted">
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
          className="rounded-sm bg-tertiary px-5 py-3 font-label text-label-md font-medium text-on-tertiary hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Predictions'}
        </button>
      </div>
    </div>
  );
}
