export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  predicted_score_a: number;
  predicted_score_b: number;
  points_earned: number;
  created_at?: string;
}
