import { useEffect, useState } from "react";
import { supabase } from "@predictor/supabase";
import { createT, type Locale } from "@predictor/i18n";
import { countries } from "../data/matches";

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

const STAGE_KEYS = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "third_place",
  "final",
] as const;

const STATUS_OPTIONS = ["upcoming", "live", "finished"] as const;

const countryOptions = Object.entries(countries).map(([code, data]) => ({
  code,
  label: `${data.flag} ${data.name} (${code})`,
}));

countryOptions.sort((a, b) => a.label.localeCompare(b.label));

function toLocalDatetime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

function newForm(match?: KnockoutMatch): MatchForm {
  return {
    match_code: match?.match_code ?? "",
    team_a: match?.team_a ?? "TBD",
    team_b: match?.team_b ?? "TBD",
    match_date: match?.match_date ? toLocalDatetime(match.match_date) : "",
    stadium: match?.stadium ?? "",
    status: match?.status ?? "upcoming",
    actual_score_a: match?.actual_score_a?.toString() ?? "",
    actual_score_b: match?.actual_score_b?.toString() ?? "",
  };
}

export default function KnockoutAdmin({ lang = "es" }: { lang?: Locale }) {
  const { t, tPlural } = createT(lang);
  const STAGES = STAGE_KEYS.map((key) => ({
    key,
    label: t(`polla.admin.knockout.stageLabels.${key}`),
  }));
  const [matches, setMatches] = useState<KnockoutMatch[]>([]);
  const [forms, setForms] = useState<Record<string, MatchForm>>({});
  const [predictionsByCode, setPredictionsByCode] = useState<
    Record<string, { display_name: string; predicted_score_a: number; predicted_score_b: number }[]>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const { data: matchData, error: matchErr } = await supabase
        .from("matches")
        .select("*")
        // Polla is World-Cup-only; pin the competition so fantasy's other
        // competitions can never appear here.
        .eq("competition_id", 1)
        .neq("stage", "group")
        .order("match_code", { ascending: true });

      if (matchErr) throw matchErr;

      const list: KnockoutMatch[] = (matchData ?? []).map((m: any) => ({
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
      const uuidToCode: Record<string, string> = {};
      for (const m of list) {
        formMap[m.id] = newForm(m);
        expanded[m.stage] = true;
        uuidToCode[m.id] = m.match_code;
      }
      setMatches(list);
      setForms(formMap);
      setExpandedStage(expanded);

      const { data: predData, error: predErr } = await supabase.rpc(
        "polla_get_all_predictions",
      );
      if (!predErr && predData) {
        const byCode: Record<
          string,
          {
            display_name: string;
            predicted_score_a: number;
            predicted_score_b: number;
          }[]
        > = {};
        for (const p of predData as any[]) {
          const code = p.match_code ?? uuidToCode[p.match_id];
          if (!code) continue;
          (byCode[code] ??= []).push({
            display_name: p.display_name,
            predicted_score_a: p.predicted_score_a,
            predicted_score_b: p.predicted_score_b,
          });
        }
        setPredictionsByCode(byCode);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? t("polla.admin.knockout.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(
    matchId: string,
    field: keyof MatchForm,
    value: string,
  ) {
    if (
      (field === "actual_score_a" || field === "actual_score_b") &&
      !/^\d*$/.test(value)
    )
      return;
    setForms((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  }

  async function handleSave(match: KnockoutMatch) {
    const form = forms[match.id];
    if (!form) return;

    if (!form.match_code.trim()) {
      setErrorMsg(t("polla.admin.knockout.codeRequired"));
      return;
    }

    setSaving(match.id);
    setErrorMsg(null);
    try {
      const scoreA = form.actual_score_a
        ? parseInt(form.actual_score_a, 10)
        : null;
      const scoreB = form.actual_score_b
        ? parseInt(form.actual_score_b, 10)
        : null;

      const { error } = await supabase
        .from("matches")
        .update({
          match_code: form.match_code.trim(),
          team_a: form.team_a || "TBD",
          team_b: form.team_b || "TBD",
          match_date: form.match_date
            ? fromLocalDatetime(form.match_date)
            : match.match_date,
          stadium: form.stadium || null,
          status: form.status,
          actual_score_a: scoreA,
          actual_score_b: scoreB,
        })
        .eq("id", match.id)
        .eq("competition_id", 1);

      if (error) throw error;

      setSuccessMsg(t("polla.admin.knockout.matchUpdated", { code: form.match_code }));
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setErrorMsg(err?.message ?? t("polla.admin.knockout.saveError"));
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(match: KnockoutMatch) {
    if (!confirm(t("polla.admin.knockout.confirmDelete", { code: match.match_code }))) return;

    setDeleting(match.id);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from("matches")
        .delete()
        .eq("id", match.id)
        .eq("competition_id", 1);

      if (error) throw error;

      setSuccessMsg(t("polla.admin.knockout.matchDeleted", { code: match.match_code }));
      setTimeout(() => setSuccessMsg(null), 3000);
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    } catch (err: any) {
      setErrorMsg(err?.message ?? t("polla.admin.knockout.deleteError"));
    } finally {
      setDeleting(null);
    }
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
          a.match_code.localeCompare(b.match_code),
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
                  {tPlural("polla.admin.knockout.matchCount", stageMatches.length)}
                </span>
              </h3>
              <svg
                className={`w-5 h-5 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-border px-4 py-3">
                {stageMatches.length === 0 && (
                  <p className="text-body-sm text-muted py-4 text-center">
                    {t("polla.admin.knockout.noMatches")}
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
                              {t("polla.admin.knockout.code")}
                            </label>
                            <input
                              type="text"
                              value={form.match_code}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "match_code",
                                  e.target.value,
                                )
                              }
                              placeholder="M73"
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              {t("polla.admin.knockout.date")}
                            </label>
                            <input
                              type="datetime-local"
                              value={form.match_date}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "match_date",
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              {t("polla.admin.knockout.stadium")}
                            </label>
                            <input
                              type="text"
                              value={form.stadium}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "stadium",
                                  e.target.value,
                                )
                              }
                              placeholder={t("polla.admin.knockout.stadium")}
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              {t("polla.admin.knockout.status")}
                            </label>
                            <select
                              value={form.status}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "status",
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              {t("polla.admin.knockout.teamA")}
                            </label>
                            <select
                              value={form.team_a}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "team_a",
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              <option value="TBD">{t("polla.admin.knockout.tbdOption")}</option>
                              {countryOptions.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-label-caps font-semibold text-muted uppercase tracking-wider mb-1">
                              {t("polla.admin.knockout.teamB")}
                            </label>
                            <select
                              value={form.team_b}
                              onChange={(e) =>
                                handleFormChange(
                                  match.id,
                                  "team_b",
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-body-sm text-primary focus:border-tertiary focus:outline-none"
                            >
                              <option value="TBD">{t("polla.admin.knockout.tbdOption")}</option>
                              {countryOptions.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                          <span className="font-label text-label-caps text-muted uppercase tracking-wider">
                            {t("polla.admin.knockout.result")}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={form.actual_score_a}
                            onChange={(e) =>
                              handleFormChange(
                                match.id,
                                "actual_score_a",
                                e.target.value,
                              )
                            }
                            disabled={isSaving}
                            className="w-14 rounded-sm border border-border bg-surface px-2 py-1 text-center text-body-sm text-primary disabled:opacity-50"
                          />
                          <span className="text-muted text-body-sm font-semibold">
                            -
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={form.actual_score_b}
                            onChange={(e) =>
                              handleFormChange(
                                match.id,
                                "actual_score_b",
                                e.target.value,
                              )
                            }
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
                              {isSaving ? t("polla.admin.knockout.saving") : t("polla.admin.knockout.save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(match)}
                              disabled={isSaving || isDeleting}
                              className="rounded-sm bg-error/10 px-3 py-1 font-label text-label-caps text-error transition-colors hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isDeleting ? t("polla.admin.knockout.deleting") : t("polla.admin.knockout.delete")}
                            </button>
                          </div>
                        </div>

                      {(() => {
                        const matchPreds = predictionsByCode[match.match_code] ?? [];
                        const teamA = countries[match.team_a];
                        const teamB = countries[match.team_b];
                        return matchPreds.length > 0 ? (
                          <div className="mt-3 overflow-hidden rounded-sm border border-border">
                            <table className="min-w-full divide-y divide-border">
                              <thead className="bg-neutral">
                                <tr>
                                  <th className="px-4 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                                    {t("polla.admin.knockout.user")}
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
                                    key={`${match.match_code}-${pred.display_name}`}
                                    className={
                                      i % 2 === 0 ? 'bg-surface' : 'bg-neutral/50'
                                    }
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
                          <div className="mt-3 rounded-sm border border-warning/30 bg-warning/10 px-4 py-2 text-body-sm text-warning">
                            {t("polla.admin.knockout.noPredictionsYet")}
                          </div>
                        );
                      })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
