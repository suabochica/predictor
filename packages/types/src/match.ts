export interface Match {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name?: string;
  actual_score_a?: number;
  actual_score_b?: number;
  status: 'upcoming' | 'live' | 'finished';
}
