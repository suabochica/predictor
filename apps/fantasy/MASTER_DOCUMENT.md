# FIFA World Cup 2026 Fantasy League

## Master Document v2.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [League Structure](#2-league-structure)
3. [Squad Building](#3-squad-building)
4. [Auction System](#4-auction-system)
5. [Matchday Management](#5-matchday-management)
6. [Scoring System](#6-scoring-system)
7. [League Stage](#7-league-stage-matchdays-1-3)
8. [Transfer Windows](#8-transfer-windows)
9. [Knockout Stage](#9-knockout-stage-fantasy-rounds-1-3)
10. [Technical Architecture](#10-technical-architecture)
11. [Data Management](#11-data-management)
12. [User Interface](#12-user-interface-screens)
13. [Development Stages](#13-development-stages)
14. [File Structure](#14-file-structure)
15. [Getting Started](#15-getting-started)

---

## 1. Project Overview

A custom private fantasy football league for the FIFA World Cup 2026, designed for a small group of friends (max 12 players). Features a unique blind auction system for player acquisition, single-elimination knockout brackets, and automated matchday/transfer-window timing.

### Key Differentiators from Standard Fantasy

| Feature | Standard Fantasy | Our Version |
|---------|-----------------|-------------|
| Player Acquisition | Free market | Blind auction + open market, all exclusive |
| Squad Ownership | Shared pool | Every player exclusively owned by one team |
| Competition Format | League only | League stage + single-elimination knockouts |
| Transfer System | Anytime | Per-matchday windows, auto-timed from kickoffs |
| Lineup Rule | Formation-based | 11 starters + exactly 1 GK — any outfield split |

---

## 2. League Structure

### 2.1 Participants

- **Maximum players:** 12
- **Minimum players:** 8 (recommended for balanced brackets)
- **Access:** Private, invite-only (admin sends invites)

### 2.2 Fantasy Timeline

| Phase | World Cup Stage | Fantasy Activity |
|-------|----------------|------------------|
| Pre-Tournament | Before Group MD1 | Auction + squad completion (unlimited transfers) |
| League Stage MD1 | Group Stage MD1 | Points accumulation, 2-transfer window |
| League Stage MD2 | Group Stage MD2 | Points accumulation, 2-transfer window |
| League Stage MD3 | Group Stage MD3 | Final league standings, 2-transfer window |
| Knockout QF (Round 1) | WC Round of 32 | Top 8 bracket begins, 5-transfer window |
| Knockout SF (Round 2) | WC Round of 16 | Semi-finals, 5-transfer window |
| Knockout Final (Round 3) | WC Quarter-finals | Championship final |

Transfer windows open automatically between matchdays; exact open/close times are derived from real match kickoff times in the `matches` table.

---

## 3. Squad Building

### 3.1 Squad Composition

- **Total squad size:** 15 players
- **All players exclusively owned** — once a player is on your squad, no other team can acquire them
- Players can be acquired via the blind auction or the open market

### 3.2 Lineup Rule

| Constraint | Rule |
|------------|------|
| Starters | Exactly 11 |
| Goalkeeper | Exactly 1 GK must start |
| Outfield split | Any DEF/MID/FWD combination |
| Captain | Must be one of the 11 starters |
| Bench | 4 players (remaining squad) |

There are no fixed valid formations — any split of defenders, midfielders, and forwards is allowed as long as exactly one goalkeeper starts.

### 3.3 Budget

| Item | Amount |
|------|--------|
| Base budget | 100M |
| Auction cushion | 5M |
| **Total budget** | **105M** |

**Rules:**
- Any player can be acquired at any price (no price threshold)
- Team must remain ≤105M at all times

---

## 4. Auction System

### 4.1 Eligibility

- **All players** are available for auction regardless of price
- Every player won at auction is **exclusively owned** by the winning team — they disappear from the auction list immediately
- Players not won at auction remain available on the open market

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
| Visibility | Transparent — shows WHO bid and amounts |
| Round refresh | Every 3 minutes (configurable) |
| Notifications | Users notified when outbid |

#### Each Round

1. Users place/update bids on up to 10 players
2. Timer counts down (3 minutes)
3. Round ends — system reveals current highest bid + user per player
4. Outbid users can raise or switch targets
5. Next round begins

#### Auction End Condition

- Auction ends when a full round passes with **no new bids**
- Or when admin manually closes auction

#### Tie-Breaking

If two users bid the same amount on the same player: **first bidder wins** (timestamp-based).

### 4.3 Post-Auction: Squad Completion

After auction closes:

1. Each user receives their won players (exclusively owned, price locked in)
2. Remaining budget calculated automatically
3. Users shop the open market for remaining squad spots — only globally unowned players appear
4. Market acquisition is open (not draft order), but each player can only be owned by one team
5. Deadline: before first World Cup match kicks off
6. **Preseason transfers are unlimited** — freely swap any owned player for any unowned player before MD1 starts

---

## 5. Matchday Management

### 5.1 Lineup Selection

- Select 11 starters from 15-player squad
- Exactly 1 GK must be in the starting XI
- Select 1 captain (earns **2x points**); captain must be a starter
- Remaining 4 players sit on the bench

### 5.2 Lineup Change Rules

#### Before Matchday Starts
- Full freedom to change any player
- Change captain freely
- Rearrange bench order

#### After Matchday Starts (Rolling Lockout)
- **Can change:** Players whose specific game has NOT kicked off yet (lockout begins 10 minutes before kickoff)
- **Cannot change:** Players whose game has already started
- **Captain:** Can be changed to a player whose game hasn't started

**Example Scenario:**
> France plays at 3:00 PM, Germany plays at 6:00 PM
>
> At 4:00 PM (France game in progress):
> - Cannot substitute French players
> - Can substitute German players
> - Can change captain to a German player

### 5.3 Auto-Substitution Rules

If a starting player scores **0 points** (did not play at all):

1. System checks bench in order (1st, 2nd, 3rd, 4th)
2. First eligible player subs in if same position, OR different position but still exactly 1 GK in starting XI
3. Substituted player's points count instead

**Captain Exception:** If captain doesn't play, they score 0 points (doubled = 0). Captain is NOT auto-substituted.

### 5.4 Default Lineup

If user sets no lineup:
- Previous matchday lineup carries over
- If no previous lineup exists, system creates default: highest-priced players start, most expensive = captain

---

## 6. Scoring System

### 6.1 Base Scoring (FPL-style)

All values are **admin-editable** via configuration file.

#### Playing Time

| Minutes Played | Points |
|----------------|--------|
| 1–59 minutes | 1 |
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
  "minutes": { "1-59": 1, "60+": 2 },
  "goals": { "GK": 6, "DEF": 6, "MID": 5, "FWD": 4 },
  "assists": 3,
  "clean_sheet": { "GK": 4, "DEF": 4, "MID": 1, "FWD": 0 },
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

### 6.4 Alternative: Opta Scoring System

A second scoring system based on Opta Points format. Admin can toggle which system is active.

Location: `/src/config/opta_scoring.json`

| Key | Event | Points |
|-----|-------|--------|
| G | Goal | 10 |
| SOnT | Shot on target | 4 |
| SOffT | Shot off target | 2 |
| BS | Blocked shot | 2 |
| OG | Own goal | -5 |
| A | Assist | 6 |
| P | Pass | 0.2 |
| C | Cross | 0.2 |
| Tk | Tackle | 2 |
| INT | Interception | 2 |
| FW | Foul won | 1 |
| FC | Foul conceded | -1 |
| O | Offside | -1 |
| YC | Yellow card | -2 |
| RC | Red card | -5 |
| PW | Penalty won | 4 |
| GC_player | Goal conceded (non-GK) | -1 per goal |
| GC_gk | Goal conceded (GK) | -6 per goal |
| SAV_gk | Save (GK only) | 5 |
| PSAV_gk | Penalty save (GK only) | 5 |

Captain 2× multiplier applies to both systems.

### 6.5 Scoring System Selection

Admin can switch between "current" (FPL-style) and "opta" modes via the Admin dashboard. The active system is stored in `auction_state.scoring_system`. When calculating standings, Admin previews both systems side-by-side before confirming which set of points to write to the DB.

**Scoring stays manual:** after each matchday the admin runs an external Python script to pull stats and upload `player_stats` rows, then presses "calculate standings" in the admin UI.

---

## 7. League Stage (Matchdays 1–3)

### 7.1 Format

- All 12 fantasy managers compete simultaneously
- Classic league format (total points accumulation)
- 3 matchdays aligned with the WC Group Stage:
  - Group Stage Matchday 1
  - Group Stage Matchday 2
  - Group Stage Matchday 3

### 7.2 Standings Calculation

**Primary:** Total points accumulated across 3 matchdays

**Tiebreaker:** Most goals scored by owned players

### 7.3 After League Stage

Once Group Stage MD3 scores are finalized:

1. Final standings locked
2. **Top 8 → Knockout Stage** (single-elimination bracket)
3. **Bottom 4 → Eliminated** (no relegation bracket; their squads stay owned and locked, they simply stop competing)

---

## 8. Transfer Windows

### 8.1 Overview

Transfer windows open automatically between matchdays. Timing is derived from real match kickoff times in the `matches` table — no manual admin action needed to open/close windows.

| Phase | Max Transfers per Window | Timing |
|-------|--------------------------|--------|
| Preseason | Unlimited | Before Group MD1 opens |
| Round-robin (MD1–3) | 2 | Between matchdays |
| Knockout (QF/SF/Final) | 5 | Between matchday rounds |

### 8.2 Transfer Rules

- Any player in your squad can be transferred out for any globally unowned player
- No price restriction on incoming player — only the 105M total budget cap applies
- Budget impact is the difference between the outgoing player's acquisition price and the incoming player's current price

| Scenario | Result |
|----------|--------|
| Swap 7.0M player → 6.5M player | +0.5M to budget |
| Swap 7.0M player → 9.0M player | -2.0M from budget |

**Budget Rule:** Team must remain ≤105M after all transfers complete.

### 8.3 Per-Player Transfer Lock

A player becomes **non-transferable** (in or out) once their World Cup game kicks off (10-minute lead). They are re-unlocked at the start of the next transfer window.

This means within a single matchday window, you can freely transfer players from teams that haven't played yet, but not players whose games have already started.

### 8.4 Eliminated World Cup Players

If a player's national team is eliminated from the World Cup, they earn 0 points for remaining matchdays. You can use a transfer to replace them (counts against the window limit), or keep them.

---

## 9. Knockout Stage (Fantasy Rounds 1–3)

### 9.1 Bracket Overview

**8-team single-elimination. No relegation bracket. No losers bracket. No 3rd-place match.** Losers are eliminated and stay eliminated.

| Fantasy Round | WC Stage | Users | Advancing |
|---------------|----------|-------|-----------|
| QF (Round 1) | WC Round of 32 | 8 | Top 4 |
| SF (Round 2) | WC Round of 16 | 4 | Top 2 |
| Final (Round 3) | WC Quarter-finals | 2 | Champion |

### 9.2 Bracket Seeding

After league stage standings are finalized, the top 8 are seeded:

| Match | Matchup |
|-------|---------|
| Match A | 1st vs 8th |
| Match B | 4th vs 5th |
| Match C | 2nd vs 7th |
| Match D | 3rd vs 6th |

### 9.3 H2H Scoring Rules

| Rule | Detail |
|------|--------|
| Points counted | Only the current matchday's points (not cumulative season) |
| Winner | Higher matchday score advances |

### 9.4 H2H Tiebreaker

If both managers score **identical matchday points**:

1. **Captain score** — higher captain points wins
2. **Goals scored** — total goals by owned players that matchday
3. **League stage standing** — higher seed advances

### 9.5 Bracket Structure

```
ROUND 1 (QF — WC Round of 32)
══════════════════════════════

Match A: 1st ────┐
                 ├─── Winner A ───┐
Match A: 8th ────┘                │
                                  ├─── ROUND 2
Match B: 4th ────┐                │
                 ├─── Winner B ───┘
Match B: 5th ────┘

Match C: 2nd ────┐
                 ├─── Winner C ───┐
Match C: 7th ────┘                │
                                  ├─── ROUND 2
Match D: 3rd ────┐                │
                 ├─── Winner D ───┘
Match D: 6th ────┘


ROUND 2 (SF — WC Round of 16)
══════════════════════════════

Winner A ────┐
             ├─── Finalist 1
Winner B ────┘

Winner C ────┐
             ├─── Finalist 2
Winner D ────┘


ROUND 3 (Final — WC Quarter-finals)
═════════════════════════════════════

Finalist 1 ────┐
               ├─── Champion
Finalist 2 ────┘
```

---

## 10. Technical Architecture

### 10.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Backend/DB | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| Realtime | Supabase Realtime |
| Hosting | Netlify (monorepo) |
| Repository | GitHub (monorepo) |

### 10.2 Database Schema

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
  current_price NUMERIC NOT NULL,  -- ratcheted auction price; persists after auction
  is_eliminated BOOLEAN DEFAULT false,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
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
  acquisition_price DECIMAL(4,1) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, player_id),
  UNIQUE(player_id)  -- global exclusivity: one team per player
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
  scoring_system TEXT DEFAULT 'current' CHECK (scoring_system IN ('current', 'opta')),
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

#### Matches Table

```sql
-- Lives in polla schema; used by fantasy for timing
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  match_date TIMESTAMP WITH TIME ZONE,
  stage TEXT,
  matchday_id INTEGER REFERENCES matchdays(id),
  ...
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
  -- Opta-specific columns (migration 020)
  shots_on_target  INTEGER DEFAULT 0,
  shots_off_target INTEGER DEFAULT 0,
  blocked_shots    INTEGER DEFAULT 0,
  tackles          INTEGER DEFAULT 0,
  interceptions    INTEGER DEFAULT 0,
  fouls_won        INTEGER DEFAULT 0,
  fouls_conceded   INTEGER DEFAULT 0,
  offsides         INTEGER DEFAULT 0,
  passes           NUMERIC(8,1) DEFAULT 0,
  crosses          NUMERIC(8,1) DEFAULT 0,
  penalties_won    INTEGER DEFAULT 0,
  opta_points      NUMERIC(8,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(player_id, matchday_id)
);
```

#### Player Tournament Totals View

Aggregates stats across all scored matchdays per player. Used on Market and Transfers pages.

```sql
CREATE OR REPLACE VIEW player_tournament_totals AS
SELECT
  player_id,
  COUNT(*) FILTER (WHERE minutes_played > 0)         AS gp,
  COALESCE(SUM(minutes_played), 0)::integer           AS minutes,
  COALESCE(SUM(goals), 0)::integer                    AS goals,
  COALESCE(SUM(assists), 0)::integer                  AS assists,
  COALESCE(SUM(total_points), 0)::integer             AS total_points,
  SUM(opta_points)                                    AS opta_points,
  -- additional Opta fields: shots_on_target, blocked_shots, tackles,
  --   interceptions, fouls_won, penalties_won, saves, penalty_saves, clean_sheets
  ...
FROM player_stats
GROUP BY player_id;
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
  bracket TEXT CHECK (bracket IN ('championship')),  -- single-elim only
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
  matchday_id INTEGER REFERENCES matchdays(id),
  player_out_id INTEGER REFERENCES players(id),
  player_in_id INTEGER REFERENCES players(id),
  price_difference DECIMAL(4,1),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Transfer Windows Table

```sql
CREATE TABLE transfer_windows (
  id SERIAL PRIMARY KEY,
  window_number INTEGER NOT NULL,
  matchday_id INTEGER REFERENCES matchdays(id),
  max_transfers INTEGER,           -- NULL = unlimited (preseason)
  is_active BOOLEAN DEFAULT false,
  opens_at TIMESTAMP,
  closes_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Match Metadata Table

```sql
CREATE TABLE match_metadata (
  id SERIAL PRIMARY KEY,
  matchday_id INTEGER REFERENCES matchdays(id) ON DELETE CASCADE,
  competition TEXT,
  match_date DATE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  score_home INTEGER,
  score_away INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(matchday_id, home_team, away_team)
);
```

### 10.3 Migrations

| Migration | Purpose |
|-----------|---------|
| 001 | Initial schema |
| 002 | RLS policies |
| 003 | Functions |
| 004–012 | Auction RLS, admin policies, transfer window RLS |
| 013 | Polla tables (matches, predictions, scoring_rules) |
| 014 | Polla RLS |
| 015 | Leaderboard view |
| 016 | Lock system (adds `current_price` to players) |
| 017 | Match enhancements |
| 018 | Leaderboard access |
| 019 | Simplify ownership (global `UNIQUE(player_id)`, removes is_locked) |
| 020 | Opta stats (Opta columns, match_metadata, scoring_system) |
| 021 | Auction constraints (bid increment, GK cap validation) |
| 022 | Auction visibility |
| 023 | Match–matchday link (`matches.matchday_id`) |
| 024 | Auction bids admin policy |
| 025 | `place_bid` budget/squad/GK validation |
| 026 | Realtime publication |
| 027 | Place bid round guard |
| 028 | `player_tournament_totals` view |
| 029 | Transfer window matchday link (`transfer_windows.matchday_id`, `transfers.matchday_id`) |
| 030 | Single-elim bracket (drops relegation/losers constraint) |

### 10.4 Row-Level Security (RLS)

All tables have RLS enabled. Key policies:
- Users can read/write their own team, lineups, bids, and transfers
- Standings and knockout matches are readable by all authenticated users
- Admin users have full access to all tables

### 10.5 Realtime Subscriptions

Used for:
- Live auction bid updates
- Transfer window activity
- Standings updates (optional)

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

**Required columns:** `name`, `country`, `position`, `price`

**Optional columns:** `country_code`, `photo_url`

### 11.2 Opta JSON Stats Upload

Upload path using Opta Points JSON format. Each player entry includes:
- `name`, `team`, `position`
- All Opta stat fields: `G`, `A`, `SOnT`, `SOffT`, `BS`, `Tk`, `INT`, `FW`, `FC`, `O`, `P`, `C`, `PW`, `YC`, `RC`, `PTS`
- Match metadata: `competition`, `match_date`, `home_team`, `away_team`, `score_home`, `score_away`

Upserts into `player_stats` (all Opta columns + `opta_points`) and stores match context in `match_metadata`.

### 11.3 Tournament Stat Totals

The `player_tournament_totals` view aggregates GP, minutes, goals, assists, total_points, and opta_points across all scored matchdays. This view powers the **GP / Min / G / A / Pts** columns on the Market and Transfers pages, with an expandable Opta detail section.

---

## 12. User Interface Screens

### 12.1 Public Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Login/Register forms |
| Rules | `/rules` | League rules summary |
| ¿Cómo jugar? | `/como-jugar` | Full Spanish-language how-to-play guide |

### 12.2 User Dashboard

| Page | Features |
|------|----------|
| My Team | Lineup builder, captain select, bench — single-GK rule enforced |
| Player Market | Browse players, GP/Min/G/A/Pts columns, expandable Opta stats |
| Standings | League table, points breakdown |
| Bracket | Visual single-elimination knockout bracket |
| Auction Room | Real-time bidding interface |
| Transfers | Transfer window interface with per-player kickoff locks |
| History | Past matchday scores |

### 12.3 Admin Dashboard

| Section | Features |
|---------|----------|
| Players | CSV player import (name, country, position, price) |
| Matchdays | Create matchdays, upload stats via Opta JSON |
| Auction | Start/pause/end auction, monitor bids, configurable timer |
| Scoring | Toggle active scoring system (FPL-style vs Opta), preview standings comparison |
| Transfers | View transfer activity per window; windows open/close automatically |
| Knockout | Seed bracket from standings, advance rounds |

### 12.4 Mobile Responsiveness

**Priority actions on mobile:**
- Set lineup / swap players
- Select captain
- Place auction bids
- View standings
- Make transfers

**Approach:** Tailwind CSS responsive classes, mobile-first design, touch-friendly buttons (min 44px).

---

## 13. Development Stages

### Stage 0 — Plan & Decisions ✅ Complete

- Documented rework decisions in `REWORK_PLAN.md`

### Stage 1 — Lineup Rule Simplification ✅ Complete

- Dropped `VALID_FORMATIONS` and `FormationPicker` — no fixed formation constraints
- `canSave` rule: 11 starters + exactly 1 GK + captain-is-starter
- Swap/slot handlers enforce the single-GK constraint inline

### Stage 2 — Tournament Stat Aggregates ✅ Complete

- Migration 028: `player_tournament_totals` view
- New `usePlayerTotals` hook joins totals to player list
- Market `PlayerRow` + Transfers list: compact GP/Min/G/A/Pts columns + expandable Opta detail

### Stage 3 — Auto Matchday + Transfer-Window Timing ✅ Complete

- `LeagueContext` derives active matchday and transfer window directly from `matches.match_date` / `matchday_id`
- Transfer caps: preseason = unlimited, round-robin = 2, knockout = 5 (constants in `constants.js`)
- Per-player transfer lock at kickoff − 10 min (reuses `useMatchdayLocks`)
- Priority queue removed
- Migration 029: `matchday_id` on `transfer_windows` and `transfers`

### Stage 4 — Single-Elimination Bracket ✅ Complete

- `lib/brackets.js` rewritten: 8-team single-elim, no losers/relegation/3rd-place
- `Admin.jsx` knockout section: seed + advance only championship bracket
- `Bracket.jsx` + `useKnockout.js` display single-elim tree
- Migration 030: `knockout_matches.bracket` constrained to `('championship')`

### Stage 5 — Spanish "¿Cómo jugar?" Page ✅ Complete

- `pages/ComoJugar.jsx` at route `/como-jugar`, Spanish-only content
- Nav entry in `Sidebar.jsx` + `MobileNav.jsx`

### Stage 6 — Master Document Update ✅ Complete

- `MASTER_DOCUMENT.md` rewritten to v2.0 reflecting the reworked design

---

## 14. File Structure

```
apps/fantasy/                   (Vite + React SPA, base /fantasy/)
├── MASTER_DOCUMENT.md
├── REWORK_PLAN.md
├── package.json
├── vite.config.js
├── eslint.config.js
├── index.html
│
├── public/
│   └── favicon.ico
│
├── src/
│   ├── main.jsx
│   ├── App.jsx                 (routing — React Router v7)
│   ├── index.css
│   │
│   ├── components/
│   │   ├── auction/
│   │   │   └── AuctionTimer.jsx
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Layout.jsx
│   │   │   └── MobileNav.jsx
│   │   │
│   │   ├── market/
│   │   │   ├── PlayerRow.jsx
│   │   │   └── FilterBar.jsx
│   │   │
│   │   └── team/
│   │       ├── LineupGrid.jsx
│   │       ├── PlayerSlot.jsx
│   │       └── BenchList.jsx
│   │
│   ├── pages/
│   │   ├── Admin.jsx           (players, matchdays, auction, knockout, transfers, scoring)
│   │   ├── Auction.jsx
│   │   ├── Bracket.jsx
│   │   ├── ComoJugar.jsx       (Spanish how-to-play, route /como-jugar)
│   │   ├── Dashboard.jsx
│   │   ├── History.jsx
│   │   ├── Market.jsx
│   │   ├── MyTeam.jsx
│   │   ├── NotFound.jsx
│   │   ├── Standings.jsx
│   │   └── Transfers.jsx
│   │
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useAuction.js
│   │   ├── useKnockout.js
│   │   ├── useMatchdayLocks.js  (per-player kickoff lock, 10-min lead)
│   │   ├── usePlayers.js
│   │   ├── usePlayerTotals.js   (tournament-total stats from player_tournament_totals)
│   │   ├── useRealtime.js
│   │   ├── useStandings.js
│   │   ├── useTeam.js
│   │   └── useTransfers.js
│   │
│   ├── lib/
│   │   ├── brackets.js          (8-team single-elim generation + advancement)
│   │   ├── defaultLineup.js
│   │   ├── lineupSync.js        (repointLineupPlayer on transfer)
│   │   ├── matchday.js          (applyAutoSubs, calculateTeamMatchdayPoints)
│   │   ├── scoring.js           (calculatePlayerPoints + calculateOptaPoints)
│   │   ├── validation.js
│   │   └── utils.js
│   │
│   ├── context/
│   │   ├── LeagueContext.jsx    (active matchday + transfer window, auto-derived from matches)
│   │   └── AuctionContext.jsx
│   │
│   └── config/
│       ├── scoring.json         (FPL-style scoring weights)
│       ├── opta_scoring.json    (Opta scoring weights)
│       └── constants.js         (TRANSFER_CAP_ROUND_ROBIN=2, TRANSFER_CAP_KNOCKOUT=5, LOCK_LEAD_MINUTES=10)
│
└── data/
    └── sample_players.csv

supabase/migrations/
    ├── 001_initial_schema.sql
    ├── 002_rls_policies.sql
    ├── 003_functions.sql
    ├── 004–012_*.sql
    ├── 013_polla_tables.sql
    ├── 014_polla_rls.sql
    ├── 015_leaderboard_view.sql
    ├── 016_lock_system.sql
    ├── 017_match_enhancements.sql
    ├── 018_leaderboard_access.sql
    ├── 019_simplify_ownership.sql
    ├── 020_opta_stats.sql
    ├── 021_auction_constraints.sql
    ├── 022_auction_visibility.sql
    ├── 023_match_matchday_link.sql
    ├── 024_auction_bids_admin_policy.sql
    ├── 025_place_bid_validation.sql
    ├── 026_realtime_publication.sql
    ├── 027_place_bid_round_guard.sql
    ├── 028_tournament_totals_view.sql
    ├── 029_transfer_window_matchday.sql
    └── 030_single_elim_bracket.sql
```

---

## 15. Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Supabase account (free tier)
- Netlify account (free tier)

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/[username]/worldcup-fantasy.git
cd worldcup-fantasy

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
# apps/fantasy/.env:
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# 4. Apply migrations
supabase db push

# 5. Start fantasy app dev server
pnpm dev:fantasy

# 6. Open http://localhost:4323/fantasy/
```

### Deployment to Netlify

The monorepo deploys as a single Netlify site via `netlify.toml` at the project root.

```bash
pnpm build
# Push to GitHub for auto-deploy, or use Netlify CLI
```

---

## Summary

| Feature | Implementation |
|---------|----------------|
| League Size | 12 players max |
| Squad Size | 15 (all exclusively owned) |
| Budget | 105M total |
| Auction | Timed blind, 0.3M increment, transparent bidding |
| Lineup Rule | 11 starters + exactly 1 GK — any outfield split |
| Scoring | FPL-style or Opta — admin toggles; preview before committing |
| League Stage | 3 matchdays (Group Stage), total points |
| Knockouts | 8-team single-elim, 3 rounds, H2H matchday points only |
| Tiebreaker | Captain → Goals → League rank |
| Transfer Windows | Preseason=unlimited, round-robin=2, knockout=5; auto-timed from kickoffs |
| Player Lock | Kicked off 10 min before game; re-unlocked next window |
| Tournament Stats | GP/Min/G/A/Pts on Market & Transfers (player_tournament_totals view) |
| How to Play | /como-jugar (Spanish) |
| Tech Stack | React 19 + Supabase + Netlify (monorepo) |

---

## Document Info

| Item | Value |
|------|-------|
| Version | 2.0 |
| Created | March 2025 |
| Last Updated | June 2026 |
| Status | Active — rework complete (Stages 0–6 done) |

---

*End of Master Document*
