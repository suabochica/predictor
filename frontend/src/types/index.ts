// TypeScript type definitions for the frontend

export interface Match {
  match_id: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group?: string;
  actual_score_a?: number;
  actual_score_b?: number;
  status: 'upcoming' | 'live' | 'finished';
}

export interface Prediction {
  prediction_id: string;
  user_id: number;
  match_id: string;
  predicted_score_a: number;
  predicted_score_b: number;
  points_earned?: number;
  created_at: string;
}

export interface User {
  user_id: number;
  name: string;
  avatar: string;
  total_points: number;
}

export interface LeaderboardEntry {
  rank: number;
  user: User;
  total_points: number;
  correct_scores: number;
  correct_outcomes: number;
}

export interface ScoringRule {
  rule_type: string;
  points: number;
  description: string;
}

export type UserRole = 'admin' | 'participant';

export interface AuthUser {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: UserRole;
  name: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}
