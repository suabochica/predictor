-- RLS policies for polla tables

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Matches: any authenticated user can read, only admins can write
CREATE POLICY "matches_select" ON matches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "matches_admin_all" ON matches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- Predictions: users see and manage only their own
CREATE POLICY "predictions_select_own" ON predictions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "predictions_insert_own" ON predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_update_own" ON predictions
  FOR UPDATE USING (auth.uid() = user_id);
