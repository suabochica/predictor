# Phase 1 — Foundation

## What was built

This document explains everything set up in Phase 1 of the WC2026 Fantasy League app. The app lives in the `fantasy/` directory of this repo, on the `Fantasy` branch, coexisting with the original predictor project in `frontend/` and `backend/`.

---

## 1. Project Initialisation

**Tool:** Vite 8 + React 19

The project was bootstrapped with `npm create vite@latest fantasy --template react`. Vite was chosen per the spec (section 10.1) for its fast HMR and straightforward React support.

**Key config files:**

| File | Purpose |
|------|---------|
| `vite.config.js` | Registers `@tailwindcss/vite` and `@vitejs/plugin-react` plugins |
| `index.html` | HTML entry point, title set to "WC2026 Fantasy League" |
| `src/main.jsx` | React root — mounts `<App />` inside `StrictMode` |
| `.env.example` | Template for required environment variables |

---

## 2. Tailwind CSS

**Version:** Tailwind CSS v4 with the official Vite plugin (`@tailwindcss/vite`).

Setup is a single line in `src/index.css`:

```css
@import "tailwindcss";
```

No `tailwind.config.js` is needed with v4 — configuration is CSS-first. The visual theme throughout the app uses:
- `gray-950` / `gray-900` backgrounds (dark theme)
- `emerald-400` / `emerald-600` as the primary accent
- `amber-500` for admin-specific elements

---

## 3. Supabase Database Schema

Three migration files are in `supabase/migrations/`. Run these in order against your Supabase project.

### `001_initial_schema.sql` — All tables

| Table | Description |
|-------|-------------|
| `users` | Extends Supabase Auth — stores `display_name` and `is_admin` flag |
| `players` | All World Cup players with position, price, country, elimination status |
| `lockable_players` | View — players where `price <= 8.5M` |
| `teams` | One team per user, tracks `budget_remaining` (starts at 105M) |
| `team_players` | Junction — links players to teams with `slot_type` (locked/free) and `acquisition_price` |
| `lineups` | Per-matchday lineup: which 11 start, who is captain, bench order 1-4 |
| `auction_state` | Single-row table: auction status, current round, round duration, timestamps |
| `auction_bids` | All bids placed — includes `round_number`, `is_winning`, indexed by player and user |
| `matchdays` | The 7 fantasy matchdays (4 league + 3 knockout), each with a lineup deadline |
| `player_stats` | Per-player per-matchday stats (goals, assists, cards, saves, etc.) |
| `fantasy_standings` | Computed standings per matchday: points, rank, goals scored |
| `knockout_matches` | H2H matchups with both teams' points, captain points, goals, and winner |
| `transfer_windows` | 3 windows with open/close timestamps and max transfer counts |
| `transfers` | Log of every transfer made, with player in/out and price difference |

### `002_rls_policies.sql` — Row-Level Security

Every sensitive table has RLS enabled. Key policies:

- **Teams / lineups / team_players / transfers:** Users can only read and write their own data (`auth.uid() = user_id`).
- **Auction bids:** Anyone authenticated can read all bids (transparent auction per spec); users can only insert/update their own bids.
- **Players / matchdays / player_stats / knockout_matches:** Anyone authenticated can read; only admins can write.
- **Fantasy standings:** Anyone authenticated can read.

### `003_functions.sql` — PostgreSQL Functions

| Function | Description |
|----------|-------------|
| `calculate_player_points(stat_id)` | Computes total fantasy points for a single player's stats row using the scoring config (playing time, goals by position, assists, clean sheets, saves, cards, own goals, goals conceded) |
| `refresh_player_points(matchday_id)` | Loops all player_stats rows for a matchday and updates `total_points` by calling `calculate_player_points` |

---

## 4. React Router Setup

**Library:** `react-router-dom` v7

`App.jsx` wraps the entire app in `<BrowserRouter>` and defines all routes. Two guard components protect private routes:

- **`ProtectedRoute`** — redirects to `/login` if not authenticated
- **`AdminRoute`** — redirects to `/dashboard` if authenticated but not an admin

### Route map

| Path | Component | Access |
|------|-----------|--------|
| `/` | `Home` | Public |
| `/login` | `Login` | Public |
| `/register` | `Register` | Public |
| `/dashboard` | `Dashboard` | Auth required |
| `/my-team` | `MyTeam` | Auth required |
| `/market` | `Market` | Auth required |
| `/auction` | `Auction` | Auth required |
| `/standings` | `Standings` | Auth required |
| `/bracket` | `Bracket` | Auth required |
| `/transfers` | `Transfers` | Auth required |
| `/history` | `History` | Auth required |
| `/admin` | `Admin` | Admin only |
| `*` | `NotFound` | Public |

---

## 5. Context Providers

Three React contexts wrap the app in `App.jsx` (in order: Auth → League → Auction).

### `AuthContext` (`src/context/AuthContext.jsx`)

Manages the Supabase Auth session. Provides:
- `user` — raw Supabase auth user
- `profile` — row from the `users` table (display_name, is_admin)
- `loading` — true while session is being restored on page load
- `isAdmin` — convenience boolean
- `signIn(email, password)`, `signUp(email, password, displayName)`, `signOut()`

Listens to `supabase.auth.onAuthStateChange` so sign-in state is always in sync.

### `LeagueContext` (`src/context/LeagueContext.jsx`)

Loads per-user league data on mount. Provides:
- `team` — the user's team row (name, budget_remaining)
- `activeMatchday` — the currently active matchday (if any)
- `activeTransferWindow` — the open transfer window (if any)
- `refreshTeam()` — re-fetches team data after mutations

### `AuctionContext` (`src/context/AuctionContext.jsx`)

Manages live auction state with Supabase Realtime. Provides:
- `auctionState` — current round, status, round duration, timestamps
- `bids` — all bids, updated live via `postgres_changes` subscription
- `getHighestBid(playerId)` — returns the current winning bid for a player in the active round

Subscribes to `INSERT` and `UPDATE` on `auction_bids` and `UPDATE` on `auction_state` for real-time updates.

---

## 6. Custom Hooks

| Hook | File | Description |
|------|------|-------------|
| `useAuth` | `hooks/useAuth.js` | Re-exports from AuthContext |
| `useAuction` | `hooks/useAuction.js` | Re-exports from AuctionContext |
| `useTeam` | `hooks/useTeam.js` | Fetches team_players with joined player data |
| `usePlayers` | `hooks/usePlayers.js` | Fetches players with optional filters (position, maxPrice, lockable, search) |
| `useStandings` | `hooks/useStandings.js` | Fetches fantasy_standings joined with team/user data, sorted by points |
| `useKnockout` | `hooks/useKnockout.js` | Fetches knockout_matches ordered by round |
| `useTransfers` | `hooks/useTransfers.js` | Fetches transfer history; computes transfers used and remaining in active window |
| `useRealtime` | `hooks/useRealtime.js` | Generic hook for subscribing to Supabase Realtime on any table |

---

## 7. Library Utilities (`src/lib/`)

| File | Exports | Description |
|------|---------|-------------|
| `supabase.js` | `supabase` | Initialised Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| `scoring.js` | `calculatePlayerPoints`, `applyCaptainMultiplier` | Client-side point calculation matching the scoring config |
| `formations.js` | `parseFormation`, `isValidFormation`, `validateLineup`, `canSubstitute` | Formation parsing and lineup validation (all 7 valid formations supported) |
| `brackets.js` | `generateChampionshipBracket`, `generateRelegationBracket`, `resolveH2H` | Seeding logic and H2H tiebreaker (points → captain → goals → seed) |
| `validation.js` | `validateBid`, `validateBudget`, `validateLockedPlayerSwap`, `validateTeamBudget` | Client-side validation with descriptive error messages |
| `utils.js` | `formatPrice`, `formatPoints`, `classNames`, `getPositionColor`, `sortByTotalPoints` | Shared formatting and utility helpers |

---

## 8. Scoring Configuration (`src/config/scoring.json`)

Admin-editable JSON file that drives both client-side calculations and the PostgreSQL function:

```json
{
  "minutes":            { "1-59": 1, "60+": 2 },
  "goals":              { "GK": 6, "DEF": 6, "MID": 5, "FWD": 4 },
  "assists":            3,
  "clean_sheet":        { "GK": 4, "DEF": 4, "MID": 1, "FWD": 0 },
  "saves_per_3":        1,
  "penalty_save":       5,
  "penalty_miss":       -2,
  "yellow_card":        -1,
  "red_card":           -3,
  "own_goal":           -2,
  "goals_conceded_per_2": -1,
  "captain_multiplier": 2
}
```

---

## 9. Layout Components (`src/components/layout/`)

### `Header.jsx`
- Sticky top bar (`z-50`, `bg-gray-900`)
- Left: logo + app name (hidden on mobile)
- Centre: desktop navigation links (hidden on mobile, handled by MobileNav)
- Right: user display name, Admin badge (amber, admin-only), Sign out button
- Unauthenticated: shows a Sign In CTA button

### `Sidebar.jsx`
- Desktop-only (`hidden md:flex`), 224px wide
- Shows team name and budget remaining at the top
- Status badges for active matchday and open transfer window
- NavLink list with active state highlighting (emerald for main nav, amber for admin)
- Admin section separated by a divider, only shown when `isAdmin` is true

### `MobileNav.jsx`
- Mobile-only (`md:hidden`), fixed to bottom of screen
- 5 primary actions: Home, Team, Auction, Standings, Market
- Touch-friendly: minimum 44px width, 56px height per tap target
- Active route highlighted in emerald

### `Layout.jsx`
- Wraps all pages
- Renders `Header` + optional `Sidebar` (authenticated only) + `<main>` + `MobileNav`
- Bottom padding on mobile (`pb-20`) prevents content from being hidden behind MobileNav

---

## 10. Pages

### Fully implemented
- **`Home.jsx`** — Public landing page with sign-in / register CTAs
- **`Login.jsx`** — Email + password sign-in form with error display
- **`Register.jsx`** — Sign-up form with display name, email, password
- **`Dashboard.jsx`** — Post-login home: phase status, budget card, squad size card, transfer window alert, quick action grid

### Stub pages (future phases)
MyTeam, Market, Auction, Standings, Bracket, Transfers, History, Admin — each renders a placeholder heading. These will be fleshed out in Phases 2–7.

---

## 11. Supporting Files

| File | Description |
|------|-------------|
| `supabase/seed.sql` | Seeds matchdays (all 7), auction_state (pending), and 3 transfer windows |
| `data/sample_players.csv` | 25 sample players with realistic prices for development/testing |
| `.env.example` | Documents the two required env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| `supabase/config.toml` | Local Supabase CLI config (ports, auth settings) for running Supabase locally |

---

## 12. Getting Started

```bash
# 1. Install dependencies
cd fantasy
npm install

# 2. Set up environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project

# 3. Run migrations
# Paste supabase/migrations/001_initial_schema.sql into Supabase SQL Editor
# Then 002_rls_policies.sql
# Then 003_functions.sql
# Then supabase/seed.sql (optional, for dev data)

# 4. Start dev server
npm run dev
# App runs at http://localhost:5173
```

---

## What's Next — Phase 2 (Auction System)

- Auction room UI (player cards, bid panel, timer)
- Realtime bid subscription (wired in AuctionContext, UI to be built)
- Bid placement with validation (budget, max 10 simultaneous, min increment 0.3M)
- Round progression logic and "no new bids" end condition
- Winning bid assignment → locked players added to teams
