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

  const getRankBadge = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getRankClass = (rank: number): string => {
    if (rank === 1) return 'rank-gold';
    if (rank === 2) return 'rank-silver';
    if (rank === 3) return 'rank-bronze';
    return '';
  };

  return (
    <div className="leaderboard-container">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Points</th>
            <th>Exact Scores</th>
            <th>Correct Outcomes</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => {
            const isCurrentUser = currentUser === entry.user.user_id;
            return (
              <tr
                key={entry.user.user_id}
                className={`leaderboard-row ${getRankClass(entry.rank)} ${isCurrentUser ? 'current-user' : ''}`}
              >
                <td className="rank-cell">
                  <span className="rank-badge">{getRankBadge(entry.rank)}</span>
                </td>
                <td className="player-cell">
                  <span className="player-avatar">{entry.user.avatar}</span>
                  <span className="player-name">{entry.user.name}</span>
                  {isCurrentUser && <span className="you-badge">You</span>}
                </td>
                <td className="points-cell">
                  <span className="points-value">{entry.total_points}</span>
                </td>
                <td className="stats-cell">{entry.correct_scores}</td>
                <td className="stats-cell">{entry.correct_outcomes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}