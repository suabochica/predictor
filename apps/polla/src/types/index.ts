// TypeScript type definitions for the frontend

export interface Match {
  match_id: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group?: string;
  stadium?: string;
  actual_score_a?: number;
  actual_score_b?: number;
  status: 'upcoming' | 'live' | 'finished';
}

/** Raw row shape from the Supabase matches table. */
export interface DbMatch {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name: string | null;
  stadium: string | null;
  status: string;
}

export interface Prediction {
  prediction_id: string;
  user_id: string;
  match_id: string;
  predicted_score_a: number;
  predicted_score_b: number;
  points_earned?: number;
  created_at: string;
}

export interface User {
  user_id: string;
  display_name: string;
  total_points: number;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  total_points: number;
  predictions_count: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  predictions_count: number;
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
