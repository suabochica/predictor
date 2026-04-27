import { useMemo } from 'react';
import type { User, LeaderboardEntry } from '../types';
import { users } from '../data/users';

interface LeaderboardTableProps {
  currentUser?: number;
}

export default function LeaderboardTable({ currentUser }: LeaderboardTableProps) {
  const leaderboard: LeaderboardEntry[] = useMemo(() => {
    const sorted = [...users].sort((a, b) => b.total_points - a.total_points);

    return sorted.map((user, index) => ({
      rank: index + 1,
      user,
      total_points: user.total_points,
      correct_scores: 0,
      correct_outcomes: 0,
    }));
  }, []);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getRankStyles = (rank: number) => {
    if (rank === 1) return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600';
    if (rank === 2) return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600';
    if (rank === 3) return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700';
    return 'border-transparent';
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Rank</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Player</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Points</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Exact Scores</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Correct Outcomes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {leaderboard.map((entry) => {
            const isCurrentUser = currentUser === entry.user.user_id;
            const rankStyles = getRankStyles(entry.rank);
            return (
              <tr
                key={entry.user.user_id}
                className={`${rankStyles} ${isCurrentUser ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="text-lg">{getRankBadge(entry.rank)}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{entry.user.avatar}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{entry.user.name}</span>
                    {isCurrentUser && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">You</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-center text-lg font-bold text-gray-900 dark:text-gray-100">{entry.total_points}</td>
                <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{entry.correct_scores}</td>
                <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{entry.correct_outcomes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}