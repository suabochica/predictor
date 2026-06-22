import { useEffect, useState, useCallback } from "react";
import { supabase } from "@predictor/supabase";
import { Button, BUTTON_PRIMARY_CLASSES } from "@predictor/ui";

import type { Match } from "../types";
import { countries } from "../data/matches";

interface DbMatch {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name: string | null;
  stadium: string | null;
  status: string;
  actual_score_a: number | null;
  actual_score_b: number | null;
}

interface PredictionState {
  [matchCode: string]: {
    score_a: number | null;
    score_b: number | null;
    points_earned?: number;
  };
}

interface ModalPrediction {
  display_name: string;
  predicted_score_a: number;
  predicted_score_b: number;
  points_earned: number;
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-ES", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Strip timezone suffix and keep just the date portion for grouping. */
function dateKey(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function isMatchLocked(match: Match): boolean {
  if (match.status !== "upcoming") return true;
  const matchTime = new Date(match.match_date).getTime();
  const lockTime = matchTime - 30 * 60 * 1000;
  return Date.now() >= lockTime;
}

function groupMatchesByDate(matchList: Match[]): Record<string, Match[]> {
  return matchList.reduce(
    (acc, match) => {
      const dk = dateKey(match.match_date);
      (acc[dk] ??= []).push(match);
      return acc;
    },
    {} as Record<string, Match[]>,
  );
}

function dbToMatch(row: DbMatch): Match {
  return {
    match_id: row.match_code,
    team_a: row.team_a,
    team_b: row.team_b,
    match_date: row.match_date,
    group: row.group_name ?? undefined,
    stadium: row.stadium ?? undefined,
    status: row.status as Match["status"],
    actual_score_a: row.actual_score_a ?? undefined,
    actual_score_b: row.actual_score_b ?? undefined,
  };
}

export default function PredictionForm({
  currentUser,
}: {
  currentUser?: string;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchUuidMap, setMatchUuidMap] = useState<Record<string, string>>({});
  const [predictions, setPredictions] = useState<PredictionState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [modalMatch, setModalMatch] = useState<Match | null>(null);
  const [modalPredictions, setModalPredictions] = useState<ModalPrediction[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      // ── Fetch matches ──────────────────────────────────────
      const { data: dbMatches, error: matchErr } = await supabase
        .from("matches")
        .select(
          "id, match_code, team_a, team_b, match_date, group_name, stadium, status, actual_score_a, actual_score_b",
        )
        .eq("stage", "group")
        .order("match_code")
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
            .from("predictions")
            .select(
              "match_id, predicted_score_a, predicted_score_b, points_earned",
            )
            .eq("user_id", currentUser)
            .abortSignal(controller.signal);

          if (!predErr && dbPreds) {
            const codeByUuid: Record<string, string> = {};
            for (const [code, uuid] of Object.entries(uuids))
              codeByUuid[uuid] = code;

            const initial: PredictionState = {};
            for (const p of dbPreds) {
              const code = codeByUuid[p.match_id];
              if (code) {
                initial[code] = {
                  score_a: p.predicted_score_a,
                  score_b: p.predicted_score_b,
                  points_earned: p.points_earned,
                };
              }
            }
            setPredictions(initial);
          }
        }
      }

      setUsingFallback(false);
    } catch (err: any) {
      console.error("PredictionForm loadData error:", err?.message ?? err);
      setUsingFallback(true);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  const handleScoreChange = useCallback(
    (matchCode: string, team: "a" | "b", value: string) => {
      const numValue = value === "" ? null : parseInt(value, 10);
      if (numValue !== null && (numValue < 0 || numValue > 9)) return;

      const match = matches.find((m) => m.match_id === matchCode);
      if (!match || isMatchLocked(match)) return;

      setPredictions((prev) => ({
        ...prev,
        [matchCode]: {
          score_a: team === "a" ? numValue : (prev[matchCode]?.score_a ?? null),
          score_b: team === "b" ? numValue : (prev[matchCode]?.score_b ?? null),
        },
      }));
      setSaved(false);
    },
    [matches],
  );

  async function handleSave() {
    if (!currentUser) return;
    setSaving(true);

    const rows = Object.entries(predictions)
      .filter(([matchCode, p]) => {
        if (p.score_a === null || p.score_b === null) return false;
        const match = matches.find((m) => m.match_id === matchCode);
        return match && !isMatchLocked(match);
      })
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
      const { error } = await supabase.from("predictions").upsert(rows, {
        onConflict: "user_id,match_id",
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save predictions:", err);
    } finally {
      setSaving(false);
    }
  }

  async function openPredictionsModal(match: Match) {
    setModalMatch(match);
    setModalLoading(true);
    setModalPredictions([]);

    const matchUuid = matchUuidMap[match.match_id];
    if (!matchUuid) {
      setModalLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        "polla_get_match_predictions",
        { p_match_id: matchUuid },
      );
      if (error) throw error;
      setModalPredictions((data as ModalPrediction[]) ?? []);
    } catch (err: any) {
      console.error(
        "Failed to fetch match predictions:",
        err?.message ?? err,
      );
    } finally {
      setModalLoading(false);
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
            ? "No se puede conectar a la base de datos. Ejecuta el script de importación o verifica tu conexión."
            : "No hay partidos de fase de grupos en la base de datos todavía. Ejecuta el script de importación para cargarlos:"}
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
  const modalTeamA = modalMatch ? countries[modalMatch.team_a] : undefined;
  const modalTeamB = modalMatch ? countries[modalMatch.team_b] : undefined;

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-4">
          <h2 className="font-heading text-h2 font-semibold text-primary">
            {formatDateLabel(date)}
          </h2>

          {/* Mobile cards */}

          <div className="sm:hidden space-y-2">
            {matchesByDate[date].map((match) => {
              const teamA = countries[match.team_a];
              const teamB = countries[match.team_b];
              const pred = predictions[match.match_id] || {};
              const isLocked = isMatchLocked(match);
              const hasActualScore =
                match.actual_score_a != null &&
                match.actual_score_b != null;

              return (
                <div
                  key={match.match_id}
                  className={`rounded-sm border border-border bg-surface ${
                    isLocked ? "opacity-50 cursor-pointer" : ""
                  }`}
                  onClick={
                    isLocked
                      ? () => openPredictionsModal(match)
                      : undefined
                  }
                  title={
                    isLocked
                      ? "Click para ver predicciones de todos los jugadores"
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
                    <span className="text-xs text-muted">
                      {formatTime(match.match_date)}
                    </span>
                    <span className="text-xs font-label text-muted">
                      Grupo {match.group}
                    </span>
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span>{teamA?.flag}</span>
                        <span className="text-sm font-medium text-primary truncate">
                          {teamA?.name || match.team_a}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          disabled={isLocked}
                          value={pred.score_a ?? ""}
                          onChange={(e) =>
                            handleScoreChange(
                              match.match_id,
                              "a",
                              e.target.value,
                            )
                          }
                          className="w-12 rounded-sm border border-border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                          placeholder="-"
                          title={
                            isLocked
                              ? "Las predicciones se bloquean 30 minutos antes del partido"
                              : undefined
                          }
                          aria-label={`Marcador de ${teamA?.name || match.team_a}`}
                        />
                        {hasActualScore && (
                          <span className="text-xs font-label font-semibold text-tertiary">
                            {match.actual_score_a}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span>{teamB?.flag}</span>
                        <span className="text-sm font-medium text-primary truncate">
                          {teamB?.name || match.team_b}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          disabled={isLocked}
                          value={pred.score_b ?? ""}
                          onChange={(e) =>
                            handleScoreChange(
                              match.match_id,
                              "b",
                              e.target.value,
                            )
                          }
                          className="w-12 rounded-sm border border-border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                          placeholder="-"
                          title={
                            isLocked
                              ? "Las predicciones se bloquean 30 minutos antes del partido"
                              : undefined
                          }
                          aria-label={`Marcador de ${teamB?.name || match.team_b}`}
                        />
                        {hasActualScore && (
                          <span className="text-xs font-label font-semibold text-tertiary">
                            {match.actual_score_b}
                          </span>
                        )}
                      </div>
                    </div>

                    {pred.points_earned != null && (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-tertiary">
                          +{pred.points_earned} pts
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}

          <div className="overflow-hidden rounded-sm border border-border max-sm:hidden">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-neutral">
                <tr>
                  <th className="px-2 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Hora
                  </th>
                  <th
                    colSpan={2}
                    className="px-3 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider"
                  >
                    Local
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Marcador
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider" />
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Marcador
                  </th>
                  <th
                    colSpan={2}
                    className="px-3 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider"
                  >
                    Visitante
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="px-3 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                    Puntos
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border bg-surface">
                {matchesByDate[date].map((match) => {
                  const teamA = countries[match.team_a];
                  const teamB = countries[match.team_b];
                  const pred = predictions[match.match_id] || {};
                  const isLocked = isMatchLocked(match);

                  const hasActualScore =
                    match.actual_score_a != null &&
                    match.actual_score_b != null;

                  return (
                    <tr
                      key={match.match_id}
                      className={`${isLocked ? "opacity-50 cursor-pointer" : "hover:bg-surface-hover"}`}
                      onClick={
                        isLocked
                          ? () => openPredictionsModal(match)
                          : undefined
                      }
                      title={
                        isLocked
                          ? "Click para ver predicciones de todos los jugadores"
                          : undefined
                      }
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
                        <div className="flex justify-end">
                          <input
                            type="number"
                            min="0"
                            max="9"
                            disabled={isLocked}
                            value={pred.score_a ?? ""}
                            onChange={(e) =>
                              handleScoreChange(
                                match.match_id,
                                "a",
                                e.target.value,
                              )
                            }
                            className="w-14 rounded-sm border border-border px-2 py-1 text-center text-body-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                            placeholder="-"
                            title={
                              isLocked
                                ? "Las predicciones se bloquean 30 minutos antes del partido"
                                : undefined
                            }
                            aria-label={`Marcador de ${teamA?.name || match.team_a}`}
                          />
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-1 py-2 text-center text-body-sm text-muted">
                        {hasActualScore ? (
                          <>
                            <span className="font-semibold text-tertiary">
                              {match.actual_score_a}
                            </span>
                            {" - "}
                            <span className="font-semibold text-tertiary">
                              {match.actual_score_b}
                            </span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>

                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          disabled={isLocked}
                          value={pred.score_b ?? ""}
                          onChange={(e) =>
                            handleScoreChange(
                              match.match_id,
                              "b",
                              e.target.value,
                            )
                          }
                          className="w-14 rounded-sm border border-border px-2 py-1 text-center text-body-sm focus:outline-none focus:ring-2 focus:ring-tertiary disabled:cursor-not-allowed disabled:bg-neutral"
                          placeholder="-"
                          title={
                            isLocked
                              ? "Las predicciones se bloquean 30 minutos antes del partido"
                              : undefined
                          }
                          aria-label={`Marcador de ${teamB?.name || match.team_b}`}
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
                      <td className="whitespace-nowrap px-2 py-2 text-center text-body-sm font-semibold">
                        {pred.points_earned != null ? (
                          <span className="text-tertiary">
                            {pred.points_earned}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {modalMatch && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModalMatch(null)}
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <h3 className="text-base font-semibold text-primary">
                  {modalTeamA?.flag} {modalTeamA?.name || modalMatch.team_a}
                  {" vs "}
                  {modalTeamB?.flag} {modalTeamB?.name || modalMatch.team_b}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {formatTime(modalMatch.match_date)} · Grupo{" "}
                  {modalMatch.group || "N/D"}
                </p>
              </div>
              <button
                onClick={() => setModalMatch(null)}
                className="text-muted hover:text-primary text-xl leading-none px-2 -mr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {modalLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-tertiary border-t-transparent" />
              </div>
            ) : modalPredictions.length === 0 ? (
              <p className="text-center text-muted text-body-sm p-6">
                No hay predicciones para este partido.
              </p>
            ) : (
              <table className="w-full">
                <thead className="bg-neutral border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                      Jugador
                    </th>
                    <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                      {modalTeamA?.name || modalMatch.team_a}
                    </th>
                    <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                      {modalTeamB?.name || modalMatch.team_b}
                    </th>
                    <th className="px-4 py-2 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {modalPredictions.map((pred) => (
                    <tr key={pred.display_name}>
                      <td className="whitespace-nowrap px-4 py-2 text-body-sm font-medium text-primary">
                        {pred.display_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-body-sm">
                        {pred.predicted_score_a}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-body-sm">
                        {pred.predicted_score_b}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-body-sm font-semibold text-tertiary">
                        {pred.points_earned != null ? pred.points_earned : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {modalMatch.actual_score_a != null &&
              modalMatch.actual_score_b != null && (
                <div className="border-t border-border px-5 py-3">
                  <span className="text-body-sm text-muted">
                    Resultado real:{" "}
                    <span className="font-semibold text-primary">
                      {modalMatch.actual_score_a} - {modalMatch.actual_score_b}
                    </span>
                  </span>
                </div>
              )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          class={BUTTON_PRIMARY_CLASSES}
          onClick={handleSave}
          disabled={saving || !currentUser}
        >
          {saving
            ? "Guardando..."
            : saved
              ? "✓ ¡Guardado!"
              : "Guardar predicciones"}
        </Button>
      </div>
    </div>
  );
}
