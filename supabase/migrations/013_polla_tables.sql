-- Polla: match predictions tables

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT UNIQUE NOT NULL,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  group_name TEXT,
  actual_score_a INTEGER,
  actual_score_b INTEGER,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  predicted_score_a INTEGER NOT NULL CHECK (predicted_score_a >= 0),
  predicted_score_b INTEGER NOT NULL CHECK (predicted_score_b >= 0),
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

CREATE TABLE IF NOT EXISTS scoring_rules (
  id SERIAL PRIMARY KEY,
  rule_type TEXT UNIQUE NOT NULL,
  points INTEGER NOT NULL,
  description TEXT NOT NULL
);

INSERT INTO scoring_rules (rule_type, points, description) VALUES
  ('correct_result',    5,  'Correct result (winner or draw) — first round'),
  ('correct_result_ko', 10, 'Correct result (winner or draw) — knockout'),
  ('correct_goals_team', 2, 'Correct goals for one team — first round'),
  ('correct_goals_ko',   4, 'Correct goals for one team — knockout'),
  ('correct_diff',       1, 'Correct goal difference — first round'),
  ('correct_diff_ko',    2, 'Correct goal difference — knockout')
ON CONFLICT (rule_type) DO NOTHING;
