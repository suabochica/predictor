import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

import type { LeaderboardEntry, LeaderboardRow } from '../types';
import { users as fallbackUsers } from '../data/users';

const AVATARS = ['👨‍💻', '👩‍🎨', '🏀', '📚', '⚽', '🎵', '🎮', '🌟', '🚀', '💃', '🎸', '🎨', '🏆', '🌹'];

function avatarForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

export default function LeaderboardTable({ currentUser }: { currentUser?: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  async function fetchLeaderboard() {
    try {
      const { data, error } = await supabase.rpc('get_leaderboard');

      if (error) throw error;

      if (data && data.length > 0) {
        const rows = data as LeaderboardRow[];
        setEntries(
          rows.map((row, i) => ({
            rank: i + 1,
            user_id: row.user_id,
            display_name: row.display_name,
            total_points: row.total_points,
            predictions_count: row.predictions_count,
          }))
        );
        setUsingFallback(false);
        setLoading(false);
        return;
      }
    } catch {
      // Supabase unavailable — use fallback
    }

    const sorted = [...fallbackUsers].sort((a, b) => b.total_points - a.total_points);
    setEntries(
      sorted.map((user, i) => ({
        rank: i + 1,
        user_id: user.user_id,
        display_name: user.display_name,
        total_points: user.total_points,
        predictions_count: 0,
      }))
    );
    setUsingFallback(true);
    setLoading(false);
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getRankStyles = (rank: number) => {
    if (rank === 1) return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600';
    if (rank === 2) return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600';
    if (rank === 3) return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700';
    return 'border-transparent';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {usingFallback && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-50/50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          Using offline data — live leaderboard unavailable.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Player
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Points
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Predictions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No players yet. Be the first to submit predictions!
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const isCurrentUser = currentUser === entry.user_id;
              const rankStyles = getRankStyles(entry.rank);
              return (
                <tr
                  key={entry.user_id}
                  className={`${rankStyles} ${isCurrentUser ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="text-lg">{getRankBadge(entry.rank)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{avatarForName(entry.display_name)}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {entry.display_name}
                      </span>
                      {isCurrentUser && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-lg font-bold text-gray-900 dark:text-gray-100">
                    {entry.total_points}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    {entry.predictions_count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
