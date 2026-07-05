-- Unseal offers of resolved windows so everyone can see the post-mortem
-- (winners, prices, losing bids). Open windows stay sealed via the existing
-- negotiation_offers_select_own policy — this only widens 'resolved' windows.
CREATE POLICY negotiation_offers_select_resolved ON negotiation_offers
  FOR SELECT TO authenticated
  USING (
    window_id IN (SELECT id FROM negotiation_windows WHERE status = 'resolved')
  );
