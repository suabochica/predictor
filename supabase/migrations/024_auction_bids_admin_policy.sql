-- 024_auction_bids_admin_policy.sql
-- Allow admins to insert/update any auction_bids row.
-- resolveRound() runs as the logged-in admin and must (a) insert carry-over bids
-- owned by the top bidder for the next round, and (b) flag winning bids — both
-- target other users' rows, which the own-bid-only policies (002) block.
-- Additive: the existing "Users can insert/update own bids" policies stay, so
-- normal users still place their own bids (Postgres ORs permissive policies).

CREATE POLICY "Admins can insert any bid"
  ON auction_bids FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

CREATE POLICY "Admins can update any bid"
  ON auction_bids FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
