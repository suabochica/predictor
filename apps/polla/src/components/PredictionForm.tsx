import { useState, useCallback } from 'react';
import type { Match } from '../types';
import { countries, matches } from '../data/matches';

interface PredictionState {
  [matchId: string]: {
    score_a: number | null;
    score_b: number | null;
  };
}

function groupMatchesByDate(matchList: Match[]): Record<string, Match[]> {
  return matchList.reduce((acc, match) => {
    const date = match.match_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(match);
    return acc;
  }, {} as Record<string, Match[]>);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PredictionForm() {
  const [predictions, setPredictions] = useState<PredictionState>(() => {
    try {
      const stored = localStorage.getItem('worldCupPredictions');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [saved, setSaved] = useState(false);

  const handleScoreChange = useCallback(
    (matchId: string, team: 'a' | 'b', value: string) => {
      const numValue = value === '' ? null : parseInt(value, 10);
      if (numValue !== null && (numValue < 0 || numValue > 9)) {
        return;
      }
      setPredictions((prev) => {
        const next = {
          ...prev,
          [matchId]: {
            score_a: team === 'a' ? numValue : prev[matchId]?.score_a ?? null,
            score_b: team === 'b' ? numValue : prev[matchId]?.score_b ?? null,
          },
        };
        localStorage.setItem('worldCupPredictions', JSON.stringify(next));
        return next;
      });
      setSaved(false);
    },
    []
  );

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const matchesByDate = groupMatchesByDate(matches);
  const sortedDates = Object.keys(matchesByDate).sort();

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
            {formatDate(date)}
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    colSpan={2}
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Home
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Score
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400" />
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Score
                  </th>
                  <th
                    colSpan={2}
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
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
                  const prediction = predictions[match.match_id] || {};

                  return (
                    <tr
                      key={match.match_id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {teamA?.flag}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {teamA?.name || match.team_a}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          value={prediction.score_a ?? ''}
                          onChange={(e) =>
                            handleScoreChange(match.match_id, 'a', e.target.value)
                          }
                          className="w-16 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          placeholder="-"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                        -
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="9"
                          value={prediction.score_b ?? ''}
                          onChange={(e) =>
                            handleScoreChange(match.match_id, 'b', e.target.value)
                          }
                          className="w-16 rounded border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          placeholder="-"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {teamB?.flag}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {teamB?.name || match.team_b}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
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
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {saved ? '✓ Saved!' : 'Save Predictions'}
        </button>
      </div>
    </div>
  );
}
