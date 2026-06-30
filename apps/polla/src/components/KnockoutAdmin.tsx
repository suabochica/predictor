import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';
import { countries } from '../data/matches';

interface KnockoutMatch {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  stadium: string | null;
  stage: string;
  status: string;
  actual_score_a: number | null;
  actual_score_b: number | null;
}

interface MatchForm {
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  stadium: string;
  status: string;
  actual_score_a: string;
  actual_score_b: string;
}

const STAGES: { key: string; label: string }[] = [
  { key: 'round_of_32', label: 'Dieciseisavos de final' },
  { key: 'round_of_16', label: 'Octavos de final' },
  { key: 'quarterfinal', label: 'Cuartos de final' },
  { key: 'semifinal', label: 'Semifinal' },
  { key: 'third_place', label: 'Tercer lugar' },
  { key: 'final', label: 'Final' },
];

const STATUS_OPTIONS = ['upcoming', 'live', 'finished'] as const;

const countryOptions = Object.entries(countries).map(([code, data]) => ({
  code,
  label: `${data.flag} ${data.name} (${code})`,
}));

countryOptions.sort((a, b) => a.label.localeCompare(b.label));

function toLocalDatetime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

function newForm(match?: KnockoutMatch): MatchForm {
  return {
    match_code: match?.match_code ?? '',
    team_a: match?.team_a ?? 'TBD',
    team_b: match?.team_b ?? 'TBD',
    match_date: match?.match_date ? toLocalDatetime(match.match_date) : '',
    stadium: match?.stadium ?? '',
    status: match?.status ?? 'upcoming',
    actual_score_a: match?.actual_score_a?.toString() ?? '',
    actual_score_b: match?.actual_score_b?.toString() ?? '',
  };
}

export default function KnockoutAdmin() {
  const [matches, setMatches] = useState<KnockoutMatch[]>([]);
  const [forms, setForms] = useState<Record<string, MatchForm>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .neq('stage', 'group')
        .order('match_code', { ascending: true });

      if (error) throw error;

      const list: KnockoutMatch[] = (data ?? []).map((m: any) => ({
        id: m.id,
        match_code: m.match_code,
        team_a: m.team_a,
        team_b: m.team_b,
        match_date: m.match_date,
        stadium: m.stadium,
        stage: m.stage,
        status: m.status,
        actual_score_a: m.actual_score_a,
        actual_score_b: m.actual_score_b,
      }));

      const formMap: Record<string, MatchForm> = {};
      const expanded: Record<string, boolean> = {};
      for (const m of list) {
        formMap[m.id] = newForm(m);
        expanded[m.stage] = true;
      }
      setMatches(list);
      setForms(formMap);
      setExpandedStage(expanded);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Error al cargar partidos');
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(matchId: string, field: keyof MatchForm, value: string) {
    if ((field === 'actual_score_a' || field === 'actual_score_b') && !/^\d*$/.test(value)) return;
    setForms((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  }

  async function handleSave(match: KnockoutMatch) {
    const form = forms[match.id];
    if (!form) return;

    if (!form.match_code.trim()) {
      setErrorMsg('El código del partido es obligatorio');
      return;
    }

    setSaving(match.id);
    setErrorMsg(null);
    try {
      const scoreA = form.actual_score_a ? parseInt(form.actual_score_a, 10) : null;
      const scoreB = form.actual_score_b ? parseInt(form.actual_score_b, 10) : null;

      const { error } = await supabase
        .from('matches')
        .update({
          match_code: form.match_code.trim(),
          team_a: form.team_a || 'TBD',
          team_b: form.team_b || 'TBD',
          match_date: form.match_date ? fromLocalDatetime(form.match_date) : match.match_date,
          stadium: form.stadium || null,
          status: form.status,
          actual_score_a: scoreA,
          actual_score_b: scoreB,
        })
        .eq('id', match.id);

      if (error) throw error;

      setSuccessMsg(`Partido ${form.match_code} actualizado`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchMatches();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Error al guardar');
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(match: KnockoutMatch) {
    if (!confirm(`¿Eliminar partido ${match.match_code}?`)) return;

    setDeleting(match.id);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('matches')
        .delete()
        .eq('id', match.id);

      if (error) throw error;

      setSuccessMsg(`Partido ${match.match_code} eliminado`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  }

  async function handleAdd(stage: string) {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        match_code: '',
        team_a: 'TBD',
        team_b: 'TBD',
        match_date: new Date().toISOString(),
        stadium: null,
        stage,
        status: 'upcoming',
      })
      .select()
      .single();

    if (error || !data) {
      setErrorMsg(error?.message ?? 'Error al crear partido');
      return;
    }

    const newMatch: KnockoutMatch = {
      id: data.id,
      match_code: data.match_code,
      team_a: data.team_a,
      team_b: data.team_b,
      match_date: data.match_date,
      stadium: data.stadium,
      stage: data.stage,
      status: data.status,
      actual_score_a: null,
      actual_score_b: null,
    };

    setMatches((prev) => [...prev, newMatch]);
    setForms((prev) => ({ ...prev, [newMatch.id]: newForm(newMatch) }));
    setExpandedStage((prev) => ({ ...prev, [stage]: true }));
  }

  function toggleStage(stage: string) {
    setExpandedStage((prev) => ({ ...prev, [stage]: !prev[stage] }));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tertiary border-t-transparent" />
      </div>
    );
  }

  const matchesByStage: Record<string, KnockoutMatch[]> = {};
  for (const m of matches) {
    (matchesByStage[m.stage] ??= []).push(m);
  }

  return (
    <div className="space-y-8">
      {successMsg && (
        <div className="rounded-sm border border-success/30 bg-success/10 px-4 py-2 text-body-sm text-success">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-sm border border-error/30 bg-error/10 px-4 py-2 text-body-sm text-error">
          {errorMsg}
        </div>
      )}

      {STAGES.map(({ key, label }) => {
        const stageMatches = (matchesByStage[key] ?? []).sort((a, b) =>
          a.match_code.localeCompare(b.match_code)
        );
        const isExpanded = expandedStage[key] !== false;

        return (
          <div key={key} className="rounded-sm border border-border bg-surface">
            <button
              type="button"
              onClick={() => toggleStage(key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral/50 transition-colors"
            >
              <h3 className="font-heading text-body-md font-semibold text-primary">
                {label}
                <span className="text-muted font-normal text-body-sm ml-2">
                  {stageMatches.length} partido{stageMatches.length !== 1 ? 's' : ''}
                </span>
              </h3>
              <svg
                className={`w-5 h-5 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-border px-4 py-3">
                {stageMatches.length === 0 && (
                  <p className="text-body-sm text-muted py-4 text-center">
                    No hay partidos en esta fase.
                  </p>
                )}

                <div className="space-y-4">
                  {stageMatches.map((match) => {
                    const form = forms[match.id];
                    if (!form) return null;
                    const isSaving = saving === match.id;
                    const isDeleting = deleting === match.id;

                    return (
                      <div
                        key={match.id}
                        className="rounded-sm border border-border bg-neutral/30 p-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Código
                            </label>
                            <input
                              type="text"
                              value={form.match_code}
                              onChange={(e) => handleFormChange(match.id, 'match_code', e.target.value)}
                              placeholder="M73"
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Fecha
                            </label>
                            <input
                              type="datetime-local"
                              value={form.match_date}
                              onChange={(e) => handleFormChange(match.id, 'match_date', e.target.value)}
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Estadio
                            </label>
                            <input
                              type="text"
                              value={form.stadium}
                              onChange={(e) => handleFormChange(match.id, 'stadium', e.target.value)}
                              placeholder="Estadio"
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Estado
                            </label>
                            <select
                              value={form.status}
                              onChange={(e) => handleFormChange(match.id, 'status', e.target.value)}
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Equipo A
                            </label>
                            <select
                              value={form.team_a}
                              onChange={(e) => handleFormChange(match.id, 'team_a', e.target.value)}
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              <option value="TBD">— TBD —</option>
                              {countryOptions.map((c) => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              Equipo B
                            </label>
                            <select
                              value={form.team_b}
                              onChange={(e) => handleFormChange(match.id, 'team_b', e.target.value)}
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              <option value="TBD">— TBD —</option>
                              {countryOptions.map((c) => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                          <span className="font-label text-label-caps text-muted uppercase tracking-wider">
                            Resultado:
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={form.actual_score_a}
                            onChange={(e) => handleFormChange(match.id, 'actual_score_a', e.target.value)}
                            disabled={isSaving}
                            className="w-14 rounded-sm border border-border bg-surface px-2 py-1 text-center text-body-sm text-primary disabled:opacity-50"
                          />
                          <span className="text-muted text-body-sm font-semibold">-</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={form.actual_score_b}
                            onChange={(e) => handleFormChange(match.id, 'actual_score_b', e.target.value)}
                            disabled={isSaving}
                            className="w-14 rounded-sm border border-border bg-surface px-2 py-1 text-center text-body-sm text-primary disabled:opacity-50"
                          />

                          <div className="flex gap-2 ml-auto">
                            <button
                              type="button"
                              onClick={() => handleSave(match)}
                              disabled={isSaving || isDeleting}
                              className="rounded-sm bg-success/15 px-3 py-1 font-label text-label-caps text-success transition-colors hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(match)}
                              disabled={isSaving || isDeleting}
                              className="rounded-sm bg-error/10 px-3 py-1 font-label text-label-caps text-error transition-colors hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isDeleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => handleAdd(key)}
                    className="w-full rounded-sm border-2 border-dashed border-border hover:border-tertiary px-4 py-3 text-body-sm text-muted hover:text-primary transition-colors"
                  >
                    + Agregar partido
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
