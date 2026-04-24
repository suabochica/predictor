# 🏆 FIFA World Cup 2026 Fantasy League

## Master Document v1.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [League Structure](#2-league-structure)
3. [Squad Building](#3-squad-building)
4. [Auction System](#4-auction-system)
5. [Matchday Management](#5-matchday-management)
6. [Scoring System](#6-scoring-system)
7. [League Stage](#7-league-stage-matchdays-1-4)
8. [Transfer Windows](#8-transfer-windows)
9. [Knockout Stage](#9-knockout-stage-fantasy-rounds-1-3)
10. [Technical Architecture](#10-technical-architecture)
11. [Data Management](#11-data-management)
12. [User Interface](#12-user-interface-screens)
13. [Development Phases](#13-development-phases)
14. [File Structure](#14-file-structure)
15. [Getting Started](#15-getting-started)

---

## 1. Project Overview

A custom private fantasy football league for the FIFA World Cup 2026, designed for a small group of friends (max 12 players). Features a unique blind auction system for player locking, H2H knockout brackets, and simplified management.

### Key Differentiators from Standard Fantasy

| Feature | Standard Fantasy | Our Version |
|---------|-----------------|-------------|
| Player Acquisition | Free market | Blind auction for locked players |
| Squad Ownership | Shared pool | 8-10 exclusive locked players per user |
| Competition Format | League only | League stage + H2H Knockouts |
| Transfer System | Anytime | Structured windows with priority order |

---

## 2. League Structure

### 2.1 Participants

- **Maximum players:** 12
- **Minimum players:** 8 (recommended for balanced brackets)
- **Access:** Private, invite-only (admin sends invites)

### 2.2 Fantasy Timeline

| Phase | World Cup Stage | Dates (2026) | Fantasy Activity |
|-------|----------------|--------------|------------------|
| Pre-Tournament | Before kickoff | Before June 11 | Auction + Squad Completion |
| League Stage MD1 | Group Stage MD1 | June 11-14 | Points accumulation |
| League Stage MD2 | Group Stage MD2 | June 15-18 | Points accumulation |
| League Stage MD3 | Group Stage MD3 | June 19-26 | Points accumulation |
| League Stage MD4 | Round of 32 | June 28-30 | Final league standings |
| Transfer Window 1 | - | June 30 - July 1 | 7 transfers max, inverse order |
| Knockout Round 1 | Round of 16 | July 1-3 | H2H matches begin |
| Transfer Window 2 | - | July 3-4 | 3 transfers max |
| Knockout Round 2 | Quarter-finals | July 5-6 | H2H continues |
| Transfer Window 3 | - | July 6-7 | 3 transfers max |
| Knockout Round 3 | Semi-finals | July 9-10 | Finals + all placement matches |
| End of Fantasy | Final + 3rd Place | July 18-19 | Watch party - no fantasy scoring |

---

## 3. Squad Building

### 3.1 Squad Composition

- **Total squad size:** 15 players
- **Locked players:** 8-10 players (acquired via auction, ≤8.5M each)
- **Free slots:** 5-7 players (open market, any price)

### 3.2 Formation Requirements

| Position | Required in Squad | On Field | On Bench |
|----------|-------------------|----------|----------|
| Goalkeepers (GK) | 2 | 1 | 1 |
| Defenders (DEF) | 5 | 3-5 | 0-2 |
| Midfielders (MID) | 5 | 3-5 | 0-2 |
| Forwards (FWD) | 3 | 1-3 | 0-2 |
| **Total** | **15** | **11** | **4** |

### 3.3 Valid Formations

- 3-4-3
- 3-5-2
- 4-3-3
- 4-4-2
- 4-5-1
- 5-3-2
- 5-4-1

### 3.4 Budget

| Item | Amount |
|------|--------|
| Base budget | 100M |
| Auction cushion | 5M |
| **Total budget** | **105M** |

**Rules:**
- Locked players must be ≤8.5M base price each
- Free slots can be any price
- Team must remain ≤105M at all times

---

## 4. Auction System

### 4.1 Eligibility

- Only players priced **≤8.5M** are available for auction/locking
- Players **>8.5M** can only be acquired via free slots (post-auction)
- Each locked player is **exclusive** to one user for the entire tournament

### 4.2 Auction Format: Timed Blind Auction

#### Setup (Admin Responsibilities)

1. Set auction start date/time
2. Set round duration (default: 3 minutes)
3. Upload player database with prices
4. Announce auction to all participants

#### Mechanics

| Rule | Detail |
|------|--------|
| Simultaneous bids | Up to 10 players at a time |
| Minimum bid | Player's base price |
| Bid increment | 0.3M minimum |
| Visibility | Transparent - shows WHO bid and amounts |
| Round refresh | Every 3 minutes (configurable) |
| Notifications | Users notified when outbid |

#### Each Round

1. Users place/update bids on up to 10 players
2. Timer counts down (3 minutes)
3. Round ends - system reveals:
   - Current highest bid per player
   - Which user placed each bid
4. Outbid users can raise or switch targets
5. Next round begins

#### Auction End Condition

- Auction ends when a full round passes with **no new bids**
- Or when admin manually closes auction

#### Tie-Breaking

If two users bid the same amount on the same player:
- **First bidder wins** (timestamp-based)
- System tracks exact bid timestamps

### 4.3 Post-Auction: Squad Completion

After auction closes:

1. Each user receives their won players (8-10 locked players)
2. Remaining budget calculated automatically
3. Users shop for free slot players from remaining pool
4. **Free slot acquisition = open shopping** (not draft order)
5. Multiple users can own the same free-slot player
6. Deadline: Before first World Cup match kicks off

**Important:** Same player cannot be in both locked AND free slots for the same user.

---

## 5. Matchday Management

### 5.1 Lineup Selection

- Select 11 starters from 15-player squad
- Select 1 captain (earns **2x points**)
- Order bench players 1-4 for auto-substitution priority

### 5.2 Lineup Change Rules

#### Before Matchday Starts
- Full freedom to change any player
- Change captain freely
- Rearrange bench order

#### After Matchday Starts (Rolling Lockout)
- **Can change:** Players whose specific game has NOT kicked off yet
- **Cannot change:** Players whose game has already started
- **Captain:** Can be changed to a player whose game hasn't started
- **Bench order:** Can be adjusted for players not yet playing

**Example Scenario:**
> France plays at 3:00 PM, Germany plays at 6:00 PM
> 
> At 4:00 PM (France game in progress):
> - ❌ Cannot substitute French players
> - ✅ Can substitute German players
> - ✅ Can change captain to a German player (if French captain underperforming)
> - ✅ Can reorder bench if German players are on bench

### 5.3 Auto-Substitution Rules

If a starting player scores **0 points** (did not play at all):

1. System checks bench in order (1st, 2nd, 3rd, 4th)
2. First eligible player subs in if:
   - Same position, OR
   - Different position but formation remains valid
3. Substituted player's points count instead

**Captain Exception:** If captain doesn't play, they score 0 points (doubled = 0). Captain is NOT auto-substituted. Plan wisely!

### 5.4 Default Lineup

If user sets no lineup:
- Previous matchday lineup carries over
- If no previous lineup exists, system creates default:
  - Highest-priced players start
  - Most expensive player = captain

---

## 6. Scoring System

### 6.1 Base Scoring

All values are **admin-editable** via configuration file.

#### Playing Time

| Minutes Played | Points |
|----------------|--------|
| 1-59 minutes | 1 |
| 60+ minutes | 2 |

#### Goals Scored

| Position | Points per Goal |
|----------|-----------------|
| Forward | 4 |
| Midfielder | 5 |
| Defender | 6 |
| Goalkeeper | 6 |

#### Assists

| Action | Points |
|--------|--------|
| Assist | 3 |

#### Clean Sheets

*Requires 60+ minutes played and 0 goals conceded by team*

| Position | Points |
|----------|--------|
| Goalkeeper | 4 |
| Defender | 4 |
| Midfielder | 1 |
| Forward | 0 |

#### Goalkeeping

| Action | Points |
|--------|--------|
| Every 3 saves | 1 |
| Penalty save | 5 |

#### Negative Points

| Action | Points |
|--------|--------|
| Yellow card | -1 |
| Red card | -3 |
| Own goal | -2 |
| Penalty miss | -2 |
| Every 2 goals conceded (GK/DEF only) | -1 |

### 6.2 Captain Bonus

- Captain earns **2x multiplier** on all points
- Must be selected before player's game kicks off

### 6.3 Scoring Configuration File

Location: `/src/config/scoring.json`

```json
{
  "minutes": {
    "1-59": 1,
    "60+": 2
  },
  "goals": {
    "GK": 6,
    "DEF": 6,
    "MID": 5,
    "FWD": 4
  },
  "assists": 3,
  "clean_sheet": {
    "GK": 4,
    "DEF": 4,
    "MID": 1,
    "FWD": 0
  },
  "saves_per_3": 1,
  "penalty_save": 5,
  "penalty_miss": -2,
  "yellow_card": -1,
  "red_card": -3,
  "own_goal": -2,
  "goals_conceded_per_2": -1,
  "captain_multiplier": 2
}
```

---

## 7. League Stage (Matchdays 1-4)

### 7.1 Format

- All 12 fantasy managers compete
- Classic league format (total points accumulation)
- 4 matchdays count toward standings:
  - Group Stage Matchday 1
  - Group Stage Matchday 2
  - Group Stage Matchday 3
  - Round of 32

### 7.2 Standings Calculation

**Primary:** Total points accumulated across 4 matchdays

**Tiebreaker:** Most goals scored by owned players

### 7.3 After League Stage

Once Round of 32 scores are finalized:

1. Final standings locked
2. **Top 8** → Championship Bracket
3. **Bottom 4** → Relegation Bracket

---

## 8. Transfer Windows

### 8.1 Overview

| Window | Timing | Max Transfers | Order |
|--------|--------|---------------|-------|
| Window 1 | After R32, before R16 | 7 | Inverse ranking |
| Window 2 | After R16, before QF | 3 | Inverse ranking |
| Window 3 | After QF, before SF | 3 | Inverse ranking |

### 8.2 Transfer Window 1 (Main Window)

| Rule | Detail |
|------|--------|
| Maximum transfers | 7 |
| Selection order | 12th place picks first → 1st place picks last |
| Format | Free agent pickup (claim, not auction) |
| Locked player trades | Allowed |
| Budget constraint | Team must stay ≤105M |

### 8.3 Transfer Windows 2-3 (Mini Windows)

| Rule | Detail |
|------|--------|
| Maximum transfers | 3 per window |
| Selection order | Inverse ranking within current bracket |
| Format | Free agent pickup |
| Locked player trades | Allowed |

### 8.4 Locked Player Swap Rules

You CAN trade a locked player, but only for another **lockable player (≤8.5M)**:

| Scenario | Result |
|----------|--------|
| Swap 7.0M locked → 6.5M player | +0.5M to free budget |
| Swap 7.0M locked → 8.0M player | -1.0M from free budget |
| Swap 7.0M locked → 9.0M player | ❌ Not allowed (>8.5M) |

**Budget Rule:** Team must remain ≤105M after all transfers complete.

### 8.5 Eliminated World Cup Players

If a locked player's national team is eliminated from the World Cup:

**Option A:** Keep the player
- Player earns 0 points for remaining matchdays
- No budget impact

**Option B:** Use a transfer
- Replace with available player (following locked/free rules)
- Counts against transfer limit

---

## 9. Knockout Stage (Fantasy Rounds 1-3)

### 9.1 Bracket Seeding

After league stage standings are finalized:

**Championship Bracket (Top 8):**

| Seed | Matchup |
|------|---------|
| Match A | 1st vs 8th |
| Match B | 4th vs 5th |
| Match C | 2nd vs 7th |
| Match D | 3rd vs 6th |

**Relegation Bracket (Bottom 4):**

| Seed | Matchup |
|------|---------|
| Match X | 9th vs 12th |
| Match Y | 10th vs 11th |

### 9.2 H2H Scoring Rules

| Rule | Detail |
|------|--------|
| Points counted | Only matchday points (not cumulative season) |
| Winner | Higher matchday score advances |
| League stage points | Irrelevant for knockout advancement |

### 9.3 H2H Tiebreaker

If both managers score **identical matchday points**, winner determined by:

1. **Captain score** - Higher captain points wins
2. **Goals scored** - Total goals by owned players that matchday
3. **League stage standing** - Higher seed advances

### 9.4 Complete Bracket Structure

#### Championship Bracket (8 Players)

```
ROUND 1 (R16 Matchday)
══════════════════════

Match A: 1st ────┐
                 ├─── Winner A
Match A: 8th ────┘

Match B: 4th ────┐
                 ├─── Winner B
Match B: 5th ────┘

Match C: 2nd ────┐
                 ├─── Winner C
Match C: 7th ────┘

Match D: 3rd ────┐
                 ├─── Winner D
Match D: 6th ────┘


ROUND 2 (QF Matchday)
═════════════════════

SEMI-FINALS:
Winner A ────┐
             ├─── Finalist 1
Winner B ────┘

Winner C ────┐
             ├─── Finalist 2
Winner D ────┘

LOSERS BRACKET (5th-8th):
Loser A ────┐
            ├─── 5th/6th Match
Loser B ────┘

Loser C ────┐
            ├─── 7th/8th Match
Loser D ────┘


ROUND 3 (SF Matchday)
═════════════════════

FINALS:
Finalist 1 ────┐
               ├─── 🏆 CHAMPION
Finalist 2 ────┘
               └─── 2nd Place

3RD PLACE MATCH:
SF Loser 1 ────┐
               ├─── 3rd Place
SF Loser 2 ────┘
               └─── 4th Place

5TH PLACE MATCH:
5/6 Winner ────── 5th Place
5/6 Loser  ────── 6th Place

7TH PLACE MATCH:
7/8 Winner ────── 7th Place
7/8 Loser  ────── 8th Place
```

#### Relegation Bracket (4 Players)

```
ROUND 1 (R16 Matchday)
══════════════════════

Match X: 9th ────┐
                 ├─── Winner X
Match X: 12th ───┘

Match Y: 10th ───┐
                 ├─── Winner Y
Match Y: 11th ───┘


ROUND 2 (QF Matchday)
═════════════════════

9TH PLACE MATCH:
Winner X ────┐
             ├─── 9th Place
Winner Y ────┘
             └─── 10th Place

11TH PLACE MATCH:
Loser X ────┐
            ├─── 11th Place
Loser Y ────┘
            └─── 12th Place


ROUND 3 (SF Matchday)
═════════════════════
(Final placements already determined in Round 2)
Relegation players can still set lineups for fun/pride
```

### 9.5 Knockout Round Summary

| Round | WC Stage | Championship Matches | Relegation Matches | Total H2H |
|-------|----------|---------------------|-------------------|-----------|
| Round 1 | R16 | 4 | 2 | 6 |
| Round 2 | QF | 4 (2 SF + 2 losers) | 2 | 6 |
| Round 3 | SF | 4 (Final + 3rd + 5th + 7th) | 0* | 4 |

*Relegation placements determined in Round 2

### 9.6 Final Standings

All 12 positions determined by knockout results:

| Place | Determined By |
|-------|---------------|
| 1st | Championship Final Winner |
| 2nd | Championship Final Loser |
| 3rd | 3rd Place Match Winner |
| 4th | 3rd Place Match Loser |
| 5th | 5th Place Match Winner |
| 6th | 5th Place Match Loser |
| 7th | 7th Place Match Winner |
| 8th | 7th Place Match Loser |
| 9th | 9th Place Match Winner |
| 10th | 9th Place Match Loser |
| 11th | 11th Place Match Winner |
| 12th | 11th Place Match Loser |

---

## 10. Technical Architecture

### 10.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Backend/DB | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| Realtime | Supabase Realtime |
| Hosting | Vercel |
| Repository | GitHub (monorepo) |

### 10.2 Why Supabase?

- ✅ Free tier sufficient for 12 users
- ✅ PostgreSQL for complex queries
- ✅ Built-in authentication
- ✅ Realtime subscriptions (perfect for auction)
- ✅ Row-level security
- ✅ Easy integration with React

### 10.3 Database Schema

#### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Players Table

```sql
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

-- Auto-calculated lockable status
CREATE VIEW lockable_players AS
SELECT *, (price <= 8.5) AS is_lockable FROM players;
```

#### Teams Table

```sql
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  budget_remaining DECIMAL(5,1) DEFAULT 105.0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
```

#### Team Players Table

```sql
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
```

#### Lineups Table

```sql
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
```

#### Auction Bids Table

```sql
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
```

#### Auction State Table

```sql
CREATE TABLE auction_state (
  id SERIAL PRIMARY KEY,
  status TEXT CHECK (status IN ('pending', 'active', 'paused', 'completed')),
  current_round INTEGER DEFAULT 0,
  round_duration_seconds INTEGER DEFAULT 180,
  round_started_at TIMESTAMP,
  last_bid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Matchdays Table

```sql
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
```

#### Player Stats Table

```sql
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
```

#### Fantasy Standings Table

```sql
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
```

#### Knockout Matches Table

```sql
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
```

#### Transfers Table

```sql
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
```

#### Transfer Windows Table

```sql
CREATE TABLE transfer_windows (
  id SERIAL PRIMARY KEY,
  window_number INTEGER NOT NULL,
  max_transfers INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT false,
  opens_at TIMESTAMP,
  closes_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 10.4 Row-Level Security (RLS)

```sql
-- Users can only read their own data
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own team"
  ON teams FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own team"
  ON teams FOR UPDATE
  USING (auth.uid() = user_id);

-- Everyone can view standings
CREATE POLICY "Anyone can view standings"
  ON fantasy_standings FOR SELECT
  TO authenticated
  USING (true);

-- Admin policies
CREATE POLICY "Admins can do anything"
  ON players FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );
```

### 10.5 Realtime Subscriptions

Used for:
- Live auction bid updates
- Transfer window activity
- Standings updates (optional)

```javascript
// Example: Subscribe to auction bids
const subscription = supabase
  .channel('auction-bids')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'auction_bids' },
    (payload) => {
      // Update UI with new bid
    }
  )
  .subscribe();
```

---

## 11. Data Management

### 11.1 Player Database Import

**CSV Format:**

```csv
name,country,country_code,position,price
Kylian Mbappé,France,FRA,FWD,11.0
Jude Bellingham,England,ENG,MID,10.5
Pedri,Spain,ESP,MID,8.0
Serge Dest,USA,USA,DEF,6.0
```

**Required columns:**
- `name` - Player full name
- `country` - Country name
- `position` - GK, DEF, MID, or FWD
- `price` - Decimal value (e.g., 8.5)

**Optional columns:**
- `country_code` - 3-letter code
- `photo_url` - Player image URL

### 11.2 Matchday Stats Import

**CSV Format:**

```csv
player_name,minutes,goals,assists,clean_sheet,saves,penalty_saves,penalty_misses,yellow,red,own_goals,goals_conceded,game_time
Kylian Mbappé,90,2,1,0,0,0,0,0,0,0,0,2026-06-11T18:00:00Z
Manuel Neuer,90,0,0,1,5,0,0,0,0,0,0,2026-06-11T15:00:00Z
```

**Required columns:**
- `player_name` - Must match database exactly
- `minutes` - Minutes played (0-120+)
- All stat columns (use 0 if not applicable)
- `game_time` - ISO timestamp of when game started (for lockout logic)

**Points Calculation:**
System automatically calculates total points based on scoring config.

### 11.3 Data Sources for Scraping

| Source | Use Case | URL |
|--------|----------|-----|
| FotMob | Match stats, lineups | fotmob.com |
| SofaScore | Live stats, detailed data | sofascore.com |
| Transfermarkt | Player values, squad lists | transfermarkt.com |
| ESPN | Match reports | espn.com/soccer |

### 11.4 Testing Data

For development, use Euro 2024 player data with adjusted prices:
- Scale prices to fit 8.5M threshold
- Use historical match stats
- Sample data included in `/data/` folder

---

## 12. User Interface Screens

### 12.1 Public Pages

| Page | Description |
|------|-------------|
| Landing | Login/Register forms |
| Rules | League rules summary |

### 12.2 User Dashboard

| Page | Features |
|------|----------|
| My Team | Lineup builder, captain select, bench order |
| Player Market | Browse players, filters, buy for free slots |
| Standings | League table, points breakdown |
| Bracket | Visual knockout bracket |
| Auction Room | Real-time bidding interface |
| Transfers | Transfer window interface |
| History | Past matchday scores |

### 12.3 Admin Dashboard

| Page | Features |
|------|----------|
| League Settings | Edit league name, invite users |
| Players | Upload/edit player database |
| Matchdays | Create matchdays, upload stats |
| Auction | Start/pause/end auction, monitor bids |
| Scoring | Edit scoring config |
| Transfers | Open/close windows, view activity |
| Manual Adjustments | Point corrections if needed |

### 12.4 Mobile Responsiveness

**Priority actions on mobile:**
- ✅ Set lineup / swap players
- ✅ Select captain
- ✅ Place auction bids
- ✅ View standings
- ✅ Make transfers

**Approach:**
- Tailwind CSS responsive classes
- Mobile-first design
- Touch-friendly buttons (min 44px)
- Swipe gestures for player cards

---

## 13. Development Phases

### Phase 1: Foundation (Week 1)

- [ ] Initialize GitHub repository
- [ ] Setup Vite + React + Tailwind
- [ ] Create Supabase project
- [ ] Configure environment variables
- [ ] Implement authentication (email/password)
- [ ] Create database schema (migrations)
- [ ] Basic layout components (Header, Sidebar)
- [ ] Admin: CSV upload for players

### Phase 2: Auction System (Week 2)

- [ ] Auction room UI design
- [ ] Real-time bid subscription
- [ ] Bid placement logic
- [ ] Budget validation (105M limit)
- [ ] Max 10 players validation
- [ ] Auction timer component
- [ ] Round progression logic
- [ ] "No new bids" end condition
- [ ] Winning bid assignment
- [ ] Locked player assignment to teams

### Phase 3: Squad Management (Week 3)

- [ ] Post-auction free slot shopping
- [ ] Player market with filters
- [ ] Team builder interface
- [ ] Drag-and-drop lineup
- [ ] Formation validation
- [ ] Captain selection
- [ ] Bench ordering
- [ ] Budget tracking display

### Phase 4: Matchday & Scoring (Week 4)

- [ ] Matchday creation (admin)
- [ ] Stats CSV upload
- [ ] Point calculation engine
- [ ] Auto-substitution logic
- [ ] Rolling lockout (per-game)
- [ ] Standings calculation
- [ ] Matchday results view
- [ ] Points breakdown modal

### Phase 5: Knockout System (Week 5)

- [ ] Bracket seeding logic
- [ ] Bracket visualization component
- [ ] H2H matchup cards
- [ ] Tiebreaker implementation
- [ ] Bracket advancement
- [ ] Losers bracket logic
- [ ] Final standings display

### Phase 6: Transfer Windows (Week 6)

- [ ] Transfer window state management
- [ ] Inverse order queue logic
- [ ] Transfer interface
- [ ] Locked player swap validation
- [ ] Budget recalculation
- [ ] Transfer history log
- [ ] Admin: Open/close windows

### Phase 7: Polish & Testing (Week 7)

- [ ] Mobile responsiveness audit
- [ ] Error handling & validation
- [ ] Loading states & skeletons
- [ ] Empty states
- [ ] Toast notifications
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation

### Phase 8: Deployment (Week 8)

- [ ] Vercel deployment setup
- [ ] Environment variables configuration
- [ ] Domain setup (optional)
- [ ] Final testing in production
- [ ] User onboarding guide
- [ ] Admin guide

---

## 14. File Structure

```
worldcup-fantasy/
├── README.md
├── MASTER_DOCUMENT.md
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── .gitignore
│
├── public/
│   ├── favicon.ico
│   └── logo.svg
│
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Loading.jsx
│   │   │   ├── Badge.jsx
│   │   │   ├── Input.jsx
│   │   │   └── Toast.jsx
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Layout.jsx
│   │   │   └── MobileNav.jsx
│   │   │
│   │   ├── auction/
│   │   │   ├── AuctionRoom.jsx
│   │   │   ├── PlayerBidCard.jsx
│   │   │   ├── BidPanel.jsx
│   │   │   ├── AuctionTimer.jsx
│   │   │   ├── MyBids.jsx
│   │   │   └── AuctionHistory.jsx
│   │   │
│   │   ├── team/
│   │   │   ├── TeamBuilder.jsx
│   │   │   ├── LineupGrid.jsx
│   │   │   ├── PlayerSlot.jsx
│   │   │   ├── BenchList.jsx
│   │   │   ├── FormationPicker.jsx
│   │   │   └── CaptainBadge.jsx
│   │   │
│   │   ├── market/
│   │   │   ├── PlayerMarket.jsx
│   │   │   ├── PlayerList.jsx
│   │   │   ├── PlayerCard.jsx
│   │   │   ├── FilterBar.jsx
│   │   │   └── PlayerModal.jsx
│   │   │
│   │   ├── standings/
│   │   │   ├── LeagueTable.jsx
│   │   │   ├── StandingsRow.jsx
│   │   │   └── PointsBreakdown.jsx
│   │   │
│   │   ├── knockout/
│   │   │   ├── BracketView.jsx
│   │   │   ├── MatchCard.jsx
│   │   │   ├── ChampionshipBracket.jsx
│   │   │   ├── RelegationBracket.jsx
│   │   │   └── LosersBracket.jsx
│   │   │
│   │   ├── transfers/
│   │   │   ├── TransferCenter.jsx
│   │   │   ├── TransferQueue.jsx
│   │   │   ├── PlayerSwap.jsx
│   │   │   └── TransferHistory.jsx
│   │   │
│   │   └── admin/
│   │       ├── AdminDashboard.jsx
│   │       ├── PlayerUpload.jsx
│   │       ├── StatsUpload.jsx
│   │       ├── MatchdayManager.jsx
│   │       ├── AuctionControl.jsx
│   │       ├── TransferWindowControl.jsx
│   │       └── ScoringConfig.jsx
│   │
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── MyTeam.jsx
│   │   ├── Market.jsx
│   │   ├── Standings.jsx
│   │   ├── Bracket.jsx
│   │   ├── Auction.jsx
│   │   ├── Transfers.jsx
│   │   ├── History.jsx
│   │   ├── Admin.jsx
│   │   └── NotFound.jsx
│   │
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useTeam.js
│   │   ├── useAuction.js
│   │   ├── usePlayers.js
│   │   ├── useStandings.js
│   │   ├── useKnockout.js
│   │   ├── useTransfers.js
│   │   └── useRealtime.js
│   │
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── scoring.js
│   │   ├── validation.js
│   │   ├── formations.js
│   │   ├── brackets.js
│   │   └── utils.js
│   │
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   ├── LeagueContext.jsx
│   │   └── AuctionContext.jsx
│   │
│   └── config/
│       ├── scoring.json
│       └── constants.js
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_functions.sql
│   ├── seed.sql
│   └── config.toml
│
└── data/
    ├── sample_players.csv
    ├── sample_stats.csv
    └── euro2024_players.csv
```

---

## 15. Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier)
- Vercel account (free tier)
- GitHub account

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/[username]/worldcup-fantasy.git
cd worldcup-fantasy

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env

# 4. Add your Supabase credentials to .env
# VITE_SUPABASE_URL=your-project-url
# VITE_SUPABASE_ANON_KEY=your-anon-key

# 5. Run Supabase migrations (if using local Supabase)
npx supabase db push

# 6. Start development server
npm run dev

# 7. Open http://localhost:5173
```

### Environment Variables

```env
# .env.example
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_NAME=World Cup Fantasy
```

### Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# or use: vercel env add
```

---

## Summary

| Feature | Implementation |
|---------|----------------|
| League Size | 12 players max |
| Squad Size | 15 (8-10 locked + 5-7 free) |
| Budget | 105M total |
| Auction | Timed blind, 0.3M increment, transparent bidding |
| Scoring | UEFA-style, admin-editable config |
| League Stage | 4 matchdays, total points |
| Knockouts | 3 rounds, H2H matchday points only |
| Tiebreaker | Captain → Goals → League rank |
| Transfer Windows | 1 big (7) + 2 small (3 each), inverse order |
| Lineup Changes | Rolling lockout per game |
| Tech Stack | React + Supabase + Vercel |

---

## Document Info

| Item | Value |
|------|-------|
| Version | 1.0 |
| Created | March 2025 |
| Last Updated | March 2025 |
| Status | ✅ Ready for Development |

---

## Appendix A: Quick Reference Card

### Auction Rules
- Budget: 105M
- Lockable: ≤8.5M players only
- Bid increment: 0.3M
- Max simultaneous bids: 10
- Round duration: 3 minutes

### Squad Rules
- 15 players total
- 8-10 locked + 5-7 free
- Formation: 1 GK, 3-5 DEF, 3-5 MID, 1-3 FWD
- Captain gets 2x points

### Knockout Tiebreaker
1. Captain score
2. Goals by owned players
3. League stage rank

### Transfer Limits
- Window 1: 7 transfers
- Window 2: 3 transfers
- Window 3: 3 transfers

---

*End of Master Document*
