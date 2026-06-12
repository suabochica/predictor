import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

import { countries } from '../data/matches';

interface AdminPrediction {
  match_id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name: string | null;
  actual_score_a: number | null;
  actual_score_b: number | null;
  status: string;
  display_name: string;
  predicted_score_a: number;
  predicted_score_b: number;
}

interface MatchInfo {
  id: string;
  match_code: string;
  actual_score_a: number | null;
  actual_score_b: number | null;
  status: string;
}

interface ScoreFormState {
  scoreA: string;
  scoreB: string;
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-ES', {
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
  const [matchInfo, setMatchInfo] = useState<Record<string, MatchInfo>>({});
  const [scoreForms, setScoreForms] = useState<Record<string, ScoreFormState>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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
          matches!inner(id, match_code, team_a, team_b, match_date, group_name, actual_score_a, actual_score_b, status)
        `)
        .order('match_code', { foreignTable: 'matches' })
        .order('display_name', { foreignTable: 'users' });

      if (error) throw error;

      if (data) {
        const info: Record<string, MatchInfo> = {};
        const forms: Record<string, ScoreFormState> = {};

        const rows = (data as any[]).map((row: any) => {
          const code = row.matches.match_code;

          if (!info[code]) {
            info[code] = {
              id: row.matches.id,
              match_code: code,
              actual_score_a: row.matches.actual_score_a,
              actual_score_b: row.matches.actual_score_b,
              status: row.matches.status,
            };
            forms[code] = {
              scoreA: row.matches.actual_score_a?.toString() ?? '',
              scoreB: row.matches.actual_score_b?.toString() ?? '',
            };
          }

          return {
            match_id: row.matches.id,
            match_code: code,
            team_a: row.matches.team_a,
            team_b: row.matches.team_b,
            match_date: row.matches.match_date,
            group_name: row.matches.group_name,
            actual_score_a: row.matches.actual_score_a,
            actual_score_b: row.matches.actual_score_b,
            status: row.matches.status,
            display_name: row.users.display_name,
            predicted_score_a: row.predicted_score_a,
            predicted_score_b: row.predicted_score_b,
          };
        });

        setMatchInfo(info);
        setScoreForms(forms);
        setPredictions(rows);
      }
    } catch (err: any) {
      console.error('AdminTable fetchPredictions error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }

  function handleScoreChange(matchCode: string, field: 'scoreA' | 'scoreB', value: string) {
    if (!/^\d*$/.test(value)) return;
    setScoreForms((prev) => ({
      ...prev,
      [matchCode]: { ...prev[matchCode], [field]: value },
    }));
  }

  async function handleScoreSubmit(matchCode: string, matchId: string) {
    const form = scoreForms[matchCode];
    const scoreA = parseInt(form.scoreA, 10);
    const scoreB = parseInt(form.scoreB, 10);

    if (isNaN(scoreA) || isNaN(scoreB)) return;

    setSaving(matchCode);
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          actual_score_a: scoreA,
          actual_score_b: scoreB,
          status: 'finished',
        })
        .eq('id', matchId);

      if (error) throw error;

      setMatchInfo((prev) => ({
        ...prev,
        [matchCode]: { ...prev[matchCode], actual_score_a: scoreA, actual_score_b: scoreB, status: 'finished' },
      }));

      setSuccessMsg(`Resultado guardado: ${matchCode}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Error saving match result:', err?.message ?? err);
    } finally {
      setSaving(null);
    }
  }

  function hasScore(matchCode: string): boolean {
    const m = matchInfo[matchCode];
    return m != null && m.actual_score_a != null && m.actual_score_b != null;
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
          No se encontraron predicciones. Los usuarios aún no han enviado ninguna predicción.
        </p>
      </div>
    );
  }

  const matchesByDate = groupByDate(predictions);

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="rounded-sm border border-success/30 bg-success/10 px-4 py-2 text-body-sm text-success">
          {successMsg}
        </div>
      )}

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
                const alreadyScored = hasScore(code);
                const mi = matchInfo[code];
                const form = scoreForms[code];
                const isSaving = saving === code;
                const canSubmit = !alreadyScored && !isSaving && form != null
                  && form.scoreA.trim() !== '' && form.scoreB.trim() !== '';

                return (
                  <div key={code} className="mb-4">
                    <h3 className="font-heading text-body-md font-semibold text-primary mb-2">
                      {teamA?.flag} {teamA?.name || first.team_a}
                      {' vs '}
                      {teamB?.flag} {teamB?.name || first.team_b}
                      <span className="text-muted font-normal text-body-sm ml-2">
                        {formatTime(first.match_date)} · {first.group_name || 'N/D'}
                      </span>
                    </h3>

                    <div className="mb-3 rounded-sm border border-border bg-neutral/30 p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-label text-label-caps text-muted uppercase tracking-wider">
                          Resultado real:
                        </span>

                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={form?.scoreA ?? ''}
                          onChange={(e) => handleScoreChange(code, 'scoreA', e.target.value)}
                          disabled={alreadyScored || isSaving}
                          className="w-14 rounded-sm border border-border bg-surface px-2 py-1 text-center text-body-sm text-primary disabled:opacity-50"
                        />

                        <span className="text-muted text-body-sm font-semibold">-</span>

                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={form?.scoreB ?? ''}
                          onChange={(e) => handleScoreChange(code, 'scoreB', e.target.value)}
                          disabled={alreadyScored || isSaving}
                          className="w-14 rounded-sm border border-border bg-surface px-2 py-1 text-center text-body-sm text-primary disabled:opacity-50"
                        />

                        <button
                          type="button"
                          onClick={() => handleScoreSubmit(code, mi!.id)}
                          disabled={!canSubmit}
                          className="rounded-sm bg-success/15 px-3 py-1 font-label text-label-caps text-success transition-colors hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isSaving ? 'Guardando...' : 'Guardar'}
                        </button>

                        {alreadyScored && (
                          <span className="text-body-sm text-success font-medium">
                            Guardado
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-sm border border-border">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-neutral">
                          <tr>
                            <th className="px-4 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                              Usuario
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
