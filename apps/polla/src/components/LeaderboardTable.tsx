import { useEffect, useState } from 'react';
import { supabase } from '@predictor/supabase';

import type { LeaderboardEntry, LeaderboardRow } from '../types';
import { users as fallbackUsers } from '../data/users';

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
    if (rank === 1) return 'bg-tertiary/15 border-tertiary/40';
    if (rank === 2) return 'bg-surface-hover border-border-strong';
    if (rank === 3) return 'bg-warning/15 border-warning/40';
    return 'border-transparent';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tertiary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {usingFallback && (
        <div className="mb-4 rounded-sm border border-warning/30 bg-warning/10 px-4 py-2 text-body-sm text-warning">
          Using offline data — live leaderboard unavailable.
        </div>
      )}

      <div className="overflow-hidden rounded-sm border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-neutral">
            <tr>
              <th className="px-4 py-3 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 py-3 text-left font-label text-label-caps text-muted uppercase tracking-wider">
                Player
              </th>
              <th className="px-4 py-3 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                Points
              </th>
              <th className="px-4 py-3 text-center font-label text-label-caps text-muted uppercase tracking-wider">
                Predictions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
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
                  className={`${rankStyles} ${isCurrentUser ? 'bg-success/10' : ''}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="text-lg">{getRankBadge(entry.rank)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-primary">
                        {entry.display_name}
                      </span>
                      {isCurrentUser && (
                        <span className="rounded-sm bg-success/15 px-2 py-0.5 font-label text-label-caps text-success">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-lg font-bold text-primary">
                    {entry.total_points}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-body-sm text-muted">
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
