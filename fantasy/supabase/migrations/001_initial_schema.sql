-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Players table
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT,
  position TEXT CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  price DECIMAL(4,1) NOT NULL,
  is_eliminated BOOLEAN DEFAULT false,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-calculated lockable status view
CREATE VIEW lockable_players AS
SELECT *, (price <= 8.5) AS is_lockable FROM players;

-- Teams table
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  budget_remaining DECIMAL(5,1) DEFAULT 105.0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Team Players table
CREATE TABLE team_players (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  is_locked BOOLEAN NOT NULL,
  acquisition_price DECIMAL(4,1) NOT NULL,
  slot_type TEXT CHECK (slot_type IN ('locked', 'free')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, player_id)
);

-- Matchdays table
CREATE TABLE matchdays (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  wc_stage TEXT NOT NULL,
  start_date DATE,
  deadline TIMESTAMP,
  is_active BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lineups table
CREATE TABLE lineups (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  matchday_id INTEGER REFERENCES matchdays(id),
  player_id INTEGER REFERENCES players(id),
  is_starting BOOLEAN DEFAULT false,
  is_captain BOOLEAN DEFAULT false,
  bench_order INTEGER,
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, matchday_id, player_id)
);

-- Auction State table
CREATE TABLE auction_state (
  id SERIAL PRIMARY KEY,
  status TEXT CHECK (status IN ('pending', 'active', 'paused', 'completed')),
  current_round INTEGER DEFAULT 0,
  round_duration_seconds INTEGER DEFAULT 180,
  round_started_at TIMESTAMP,
  last_bid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auction Bids table
CREATE TABLE auction_bids (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  player_id INTEGER REFERENCES players(id),
  bid_amount DECIMAL(4,1) NOT NULL,
  round_number INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  is_winning BOOLEAN DEFAULT false
);

CREATE INDEX idx_bids_player ON auction_bids(player_id);
CREATE INDEX idx_bids_user ON auction_bids(user_id);

-- Player Stats table
CREATE TABLE player_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  matchday_id INTEGER REFERENCES matchdays(id),
  minutes_played INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  saves INTEGER DEFAULT 0,
  penalty_saves INTEGER DEFAULT 0,
  penalty_misses INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  own_goals INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  game_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(player_id, matchday_id)
);

-- Fantasy Standings table
CREATE TABLE fantasy_standings (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  matchday_id INTEGER REFERENCES matchdays(id),
  matchday_points INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  rank INTEGER,
  goals_scored INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, matchday_id)
);

-- Knockout Matches table
CREATE TABLE knockout_matches (
  id SERIAL PRIMARY KEY,
  round INTEGER NOT NULL,
  bracket TEXT CHECK (bracket IN ('championship', 'relegation', 'losers')),
  match_label TEXT,
  team_a_id INTEGER REFERENCES teams(id),
  team_b_id INTEGER REFERENCES teams(id),
  team_a_points INTEGER,
  team_b_points INTEGER,
  team_a_captain_points INTEGER,
  team_b_captain_points INTEGER,
  team_a_goals INTEGER,
  team_b_goals INTEGER,
  winner_id INTEGER REFERENCES teams(id),
  placement TEXT,
  matchday_id INTEGER REFERENCES matchdays(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transfer Windows table
CREATE TABLE transfer_windows (
  id SERIAL PRIMARY KEY,
  window_number INTEGER NOT NULL,
  max_transfers INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT false,
  opens_at TIMESTAMP,
  closes_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transfers table
CREATE TABLE transfers (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  window_number INTEGER NOT NULL,
  player_out_id INTEGER REFERENCES players(id),
  player_in_id INTEGER REFERENCES players(id),
  transfer_type TEXT CHECK (transfer_type IN ('locked_swap', 'free_slot')),
  price_difference DECIMAL(4,1),
  created_at TIMESTAMP DEFAULT NOW()
);
