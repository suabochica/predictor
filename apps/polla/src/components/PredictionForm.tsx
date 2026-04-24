import { useState, useEffect } from 'react';
import type { Match, Prediction } from '../types';
import { countries, matches } from '../data/matches';

interface PredictionState {
  [matchId: string]: {
    score_a: number | null;
    score_b: number | null;
  };
}

// Group matches by date
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

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
}

export default function PredictionForm() {
  const [predictions, setPredictions] = useState<PredictionState>(() => {
    // Load saved predictions from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('worldCupPredictions');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return {};
        }
      }
    }
    return {};
  });

  const [saved, setSaved] = useState(false);

  // Save to localStorage whenever predictions change
  useEffect(() => {
    localStorage.setItem('worldCupPredictions', JSON.stringify(predictions));
  }, [predictions]);

  const handleScoreChange = (matchId: string, team: 'a' | 'b', value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);

    // Validate range 0-9
    if (numValue !== null && (numValue < 0 || numValue > 9)) {
      return;
    }

    setPredictions(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        score_a: team === 'a' ? numValue : prev[matchId]?.score_a ?? null,
        score_b: team === 'b' ? numValue : prev[matchId]?.score_b ?? null,
      }
    }));
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const matchesByDate = groupMatchesByDate(matches);
  const sortedDates = Object.keys(matchesByDate).sort();

  return (
    <form onSubmit={handleSubmit} className="predictions-form">
      {sortedDates.map(date => (
        <div key={date} className="match-day">
          <h2 className="match-date-header">{formatDate(date)}</h2>
          <table className="matches-table">
            <thead>
              <tr>
                <th colSpan={2}>Home</th>
                <th>Score</th>
                <th>-</th>
                <th>Score</th>
                <th colSpan={2}>Away</th>
                <th>Group</th>
              </tr>
            </thead>
            <tbody>
              {matchesByDate[date].map(match => {
                const teamA = countries[match.team_a];
                const teamB = countries[match.team_b];
                const prediction = predictions[match.match_id] || {};

                return (
                  <tr key={match.match_id} className="match-row">
                    <td className="flag-cell">{teamA?.flag}</td>
                    <td className="team-name">{teamA?.name || match.team_a}</td>
                    <td className="score-cell">
                      <input
                        type="number"
                        min="0"
                        max="9"
                        value={prediction.score_a ?? ''}
                        onChange={(e) => handleScoreChange(match.match_id, 'a', e.target.value)}
                        className="score-input"
                        placeholder="-"
                      />
                    </td>
                    <td className="vs-cell">-</td>
                    <td className="score-cell">
                      <input
                        type="number"
                        min="0"
                        max="9"
                        value={prediction.score_b ?? ''}
                        onChange={(e) => handleScoreChange(match.match_id, 'b', e.target.value)}
                        className="score-input"
                        placeholder="-"
                      />
                    </td>
                    <td className="flag-cell">{teamB?.flag}</td>
                    <td className="team-name">{teamB?.name || match.team_b}</td>
                    <td className="group-cell">{match.group}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div className="form-actions">
        <button type="submit" className="save-button">
          {saved ? '✓ Saved!' : 'Save Predictions'}
        </button>
      </div>
    </form>
  );
}