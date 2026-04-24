export interface ScoringRule {
  rule_type: string;
  points: number;
  description: string;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  predictions_count: number;
}
