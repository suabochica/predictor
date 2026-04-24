-- Enable RLS on sensitive tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_matches ENABLE ROW LEVEL SECURITY;

-- Teams: users manage their own team
CREATE POLICY "Users can view own team"
  ON teams FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own team"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own team"
  ON teams FOR UPDATE
  USING (auth.uid() = user_id);

-- Team players: users manage their own roster
CREATE POLICY "Users can manage own team players"
  ON team_players FOR ALL
  USING (
    team_id IN (SELECT id FROM teams WHERE user_id = auth.uid())
  );

-- Lineups: users manage their own lineups
CREATE POLICY "Users can manage own lineups"
  ON lineups FOR ALL
  USING (
    team_id IN (SELECT id FROM teams WHERE user_id = auth.uid())
  );

-- Auction bids: users manage their own bids; all authenticated can read
CREATE POLICY "Anyone can view bids"
  ON auction_bids FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own bids"
  ON auction_bids FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bids"
  ON auction_bids FOR UPDATE
  USING (auth.uid() = user_id);

-- Standings: everyone can view
CREATE POLICY "Anyone can view standings"
  ON fantasy_standings FOR SELECT
  TO authenticated
  USING (true);

-- Players: everyone can read; admins can write
CREATE POLICY "Anyone can view players"
  ON players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage players"
  ON players FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Player stats: everyone can read; admins can write
CREATE POLICY "Anyone can view player stats"
  ON player_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage player stats"
  ON player_stats FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Matchdays: everyone can read; admins can write
CREATE POLICY "Anyone can view matchdays"
  ON matchdays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage matchdays"
  ON matchdays FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Knockout matches: everyone can read; admins can write
CREATE POLICY "Anyone can view knockout matches"
  ON knockout_matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage knockout matches"
  ON knockout_matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Transfers: users manage own transfers
CREATE POLICY "Users can manage own transfers"
  ON transfers FOR ALL
  USING (
    team_id IN (SELECT id FROM teams WHERE user_id = auth.uid())
  );
