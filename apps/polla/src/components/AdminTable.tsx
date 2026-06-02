import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

import { countries } from '../data/matches';

interface AdminPrediction {
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name: string | null;
  display_name: string;
  predicted_score_a: number;
  predicted_score_b: number;
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

function dateKey(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function groupByDate(preds: AdminPrediction[]): Record<string, AdminPrediction[]> {
  return preds.reduce((acc, p) => {
    const dk = dateKey(p.match_date);
    (acc[dk] ??= []).push(p);
    return acc;
  }, {} as Record<string, AdminPrediction[]>);
}

function groupByMatch(preds: AdminPrediction[]): Record<string, AdminPrediction[]> {
  return preds.reduce((acc, p) => {
    (acc[p.match_code] ??= []).push(p);
    return acc;
  }, {} as Record<string, AdminPrediction[]>);
}

export default function AdminTable() {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPredictions();
  }, []);

  async function fetchPredictions() {
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select(`
          match_id,
          predicted_score_a,
          predicted_score_b,
          users!inner(display_name),
          matches!inner(match_code, team_a, team_b, match_date, group_name)
        `)
        .order('match_code', { foreignTable: 'matches' })
        .order('display_name', { foreignTable: 'users' });

      if (error) throw error;

      if (data) {
        const rows = (data as any[]).map((row: any) => ({
          match_code: row.matches.match_code,
          team_a: row.matches.team_a,
          team_b: row.matches.team_b,
          match_date: row.matches.match_date,
          group_name: row.matches.group_name,
          display_name: row.users.display_name,
          predicted_score_a: row.predicted_score_a,
          predicted_score_b: row.predicted_score_b,
        }));
        setPredictions(rows);
      }
    } catch (err: any) {
      console.error('AdminTable fetchPredictions error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tertiary border-t-transparent" />
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="rounded-sm border border-warning/30 bg-warning/10 px-6 py-8 text-center">
        <p className="text-warning text-body-md">
          No predictions found. Users haven't submitted any predictions yet.
        </p>
      </div>
    );
  }

  const matchesByDate = groupByDate(predictions);

  return (
    <div className="space-y-6">
      {Object.entries(matchesByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, datePreds]) => {
          const byMatch = groupByMatch(datePreds);
          const matchCodes = Object.keys(byMatch).sort();

          return (
            <div key={date} className="space-y-4">
              <h2 className="font-heading text-h2 font-semibold text-primary">
                {formatDateLabel(date)}
              </h2>

              {matchCodes.map((code) => {
                const matchPreds = byMatch[code];
                const first = matchPreds[0];
                const teamA = countries[first.team_a];
                const teamB = countries[first.team_b];

                return (
                  <div key={code} className="mb-4">
                    <h3 className="font-heading text-body-md font-semibold text-primary mb-2">
                      {teamA?.flag} {teamA?.name || first.team_a}
                      {' vs '}
                      {teamB?.flag} {teamB?.name || first.team_b}
                      <span className="text-muted font-normal text-body-sm ml-2">
                        {formatTime(first.match_date)} · {first.group_name || 'N/A'}
                      </span>
                    </h3>

                    <div className="overflow-hidden rounded-sm border border-border">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-neutral">
                          <tr>
                            <th className="px-4 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                              User
                            </th>
                            <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                              {teamA?.name || first.team_a}
                            </th>
                            <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider" />
                            <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                              {teamB?.name || first.team_b}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-surface">
                          {matchPreds.map((pred, i) => (
                            <tr
                              key={`${code}-${pred.display_name}`}
                              className={i % 2 === 0 ? 'bg-surface' : 'bg-neutral/50'}
                            >
                              <td className="whitespace-nowrap px-4 py-2 text-body-sm font-medium text-primary">
                                {pred.display_name}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-center text-body-sm">
                                {pred.predicted_score_a}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-body-sm text-muted">
                                -
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-center text-body-sm">
                                {pred.predicted_score_b}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
