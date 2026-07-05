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
  stage: string;
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

interface AllMatch {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name: string | null;
  stage: string;
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
  const d = new Date(dateStr);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
}

function groupByDate<T extends { match_date: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const dk = dateKey(item.match_date);
    (acc[dk] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function groupByCode<T extends { match_code: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    (acc[item.match_code] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export default function AdminTable() {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [allMatches, setAllMatches] = useState<AllMatch[]>([]);
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
      const { data: dbMatches, error: matchErr } = await supabase
        .from('matches')
        .select(
          'id, match_code, team_a, team_b, match_date, group_name, stage, actual_score_a, actual_score_b, status',
        )
        .eq('stage', 'group')
        .order('match_date', { ascending: false });

      if (matchErr) throw matchErr;

      const { data: dbPredictions, error: predErr } = await supabase
        .rpc('polla_get_all_predictions');

      if (predErr) throw predErr;

      const info: Record<string, MatchInfo> = {};
      const forms: Record<string, ScoreFormState> = {};
      const matches: AllMatch[] = [];
      const uuidToCode: Record<string, string> = {};

      if (dbMatches) {
        for (const m of dbMatches as any[]) {
          info[m.match_code] = {
            id: m.id,
            match_code: m.match_code,
            actual_score_a: m.actual_score_a,
            actual_score_b: m.actual_score_b,
            status: m.status,
          };
          forms[m.match_code] = {
            scoreA: m.actual_score_a?.toString() ?? '',
            scoreB: m.actual_score_b?.toString() ?? '',
          };
          uuidToCode[m.id] = m.match_code;
          matches.push({
            id: m.id,
            match_code: m.match_code,
            team_a: m.team_a,
            team_b: m.team_b,
            match_date: m.match_date,
            group_name: m.group_name,
            stage: m.stage,
            actual_score_a: m.actual_score_a,
            actual_score_b: m.actual_score_b,
            status: m.status,
          });
        }
      }

      setMatchInfo(info);
      setScoreForms(forms);
      setAllMatches(matches);

      if (dbPredictions && dbPredictions.length > 0) {
        const rows: AdminPrediction[] = [];
        const codeSet = new Set(matches.map((m) => m.match_code));

        for (const p of dbPredictions as any[]) {
          const matchCode = p.match_code ?? uuidToCode[p.match_id];
          if (!matchCode) {
            console.warn('AdminTable: prediction missing match_code', p);
            continue;
          }

          if (!codeSet.has(matchCode)) {
            console.warn(
              'AdminTable: prediction match_code not in matches list',
              { matchCode, match_id: p.match_id },
            );
            continue;
          }

          const dbMatch = (dbMatches as any[]).find(
            (dm: any) => dm.match_code === matchCode,
          );
          if (!dbMatch) continue;

          rows.push({
            match_id: dbMatch.id,
            match_code: matchCode,
            team_a: dbMatch.team_a,
            team_b: dbMatch.team_b,
            match_date: dbMatch.match_date,
            group_name: dbMatch.group_name,
            stage: dbMatch.stage,
            actual_score_a: dbMatch.actual_score_a,
            actual_score_b: dbMatch.actual_score_b,
            status: dbMatch.status,
            display_name: p.display_name ?? 'Unknown',
            predicted_score_a: p.predicted_score_a,
            predicted_score_b: p.predicted_score_b,
          });
        }

        rows.sort((a, b) => {
          const dateCmp = new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
          if (dateCmp !== 0) return dateCmp;
          return a.match_code.localeCompare(b.match_code);
        });

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

  if (allMatches.length === 0) {
    return (
      <div className="rounded-sm border border-warning/30 bg-warning/10 px-6 py-8 text-center">
        <p className="text-warning text-body-md">
          No se encontraron partidos disponibles.
        </p>
      </div>
    );
  }

  const matchesByDate = groupByDate(allMatches);
  const predictionsByCode = groupByCode(predictions);

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="rounded-sm border border-success/30 bg-success/10 px-4 py-2 text-body-sm text-success">
          {successMsg}
        </div>
      )}

      {Object.entries(matchesByDate)
        .sort(([a], [b]) => {
          const today = new Date().toISOString().slice(0, 10);
          const aPast = a < today;
          const bPast = b < today;
          if (aPast && !bPast) return 1;
          if (!aPast && bPast) return -1;
          return a.localeCompare(b);
        })
        .map(([date, dateMatches]) => {
          const codes = dateMatches
            .map((m) => m.match_code)
            .sort((a, b) => {
              const matchA = matchInfo[a];
              const matchB = matchInfo[b];
              const aFinished = matchA?.status === 'finished';
              const bFinished = matchB?.status === 'finished';
              if (aFinished && !bFinished) return 1;
              if (!aFinished && bFinished) return -1;
              return a.localeCompare(b);
            });

          function renderMatch(code: string) {
            const match = dateMatches.find((m) => m.match_code === code)!;
            const matchPreds = predictionsByCode[code] ?? [];
            const teamA = countries[match.team_a];
            const teamB = countries[match.team_b];
            const alreadyScored = hasScore(code);
            const mi = matchInfo[code];
            const form = scoreForms[code];
            const isSaving = saving === code;
            const canSubmit = !alreadyScored && !isSaving && form != null
              && form.scoreA.trim() !== '' && form.scoreB.trim() !== '';

            return (
              <div key={code} className="mb-4">
                <h3 className="font-heading text-body-md font-semibold text-primary mb-2">
                  {teamA?.flag} {teamA?.name || match.team_a}
                  {' vs '}
                  {teamB?.flag} {teamB?.name || match.team_b}
                    <span className="text-muted font-normal text-body-sm ml-2">
                      {code} · {formatTime(match.match_date)} · {match.group_name || match.stage || 'N/D'}
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

                {matchPreds.length > 0 ? (
                  <div className="overflow-hidden rounded-sm border border-border">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-neutral">
                        <tr>
                          <th className="px-4 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                            Usuario
                          </th>
                          <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                            {teamA?.name || match.team_a}
                          </th>
                          <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider" />
                          <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                            {teamB?.name || match.team_b}
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
                ) : (
                  <div className="rounded-sm border border-warning/30 bg-warning/10 px-4 py-2 text-body-sm text-warning">
                    Aún no hay predicciones para este partido.
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={date} className="space-y-4">
              <h2 className="font-heading text-h2 font-semibold text-primary">
                {formatDateLabel(dateMatches[0].match_date)}
              </h2>

              {codes.map(renderMatch)}
            </div>
          );
        })}
    </div>
  );
}
