-- 033_proxy_targets.sql
-- Adds proxy bidding support: the `proxy_targets` table lets users pre-rank up to 30
-- players with a max price before the auction opens. The `auto_bid_enabled` flag on
-- teams controls whether the admin-browser auto-bid pass should fire for this user.

ALTER TABLE teams ADD COLUMN auto_bid_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE proxy_targets (
  id          bigserial PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id   integer     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  priority    integer     NOT NULL CHECK (priority BETWEEN 1 AND 30),
  max_price   numeric     NOT NULL CHECK (max_price > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, player_id),
  UNIQUE (user_id, priority) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX proxy_targets_user_priority_idx ON proxy_targets (user_id, priority);

ALTER TABLE proxy_targets ENABLE ROW LEVEL SECURITY;

-- Users manage their own pista
CREATE POLICY proxy_targets_user_all ON proxy_targets
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins may read all pistas (for run_auto_bids)
CREATE POLICY proxy_targets_admin_select ON proxy_targets
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin));

-- Add to realtime so the pista panel stays live
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE proxy_targets;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
