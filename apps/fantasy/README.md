# ⚽ Fantasy

Fantasy league management for the FIFA World Cup 2026. Players build squads through auctions, manage lineups, and compete on a leaderboard.

## 🧰 Tech Stack

| Category | Library |
|---|---|
| Framework | [React](https://react.dev) 19 |
| Build | [Vite](https://vite.dev) 8 + `@vitejs/plugin-react` |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 + `@tailwindcss/vite` |
| Routing | `react-router-dom` 7 (client-side SPA, basename `/fantasy`) |
| Auth & DB | `@supabase/supabase-js` (browser client with SSR cookies) |
| Realtime | Supabase channels (`postgres_changes`) for live auction/squad updates |
| Shared | `@predictor/supabase`, `@predictor/types`, `@predictor/ui` |
| Linting | ESLint 9 + `eslint-plugin-react-hooks` |

## 📁 Folder Structure

```
src/
├── main.jsx                  # Entry point
├── App.jsx                   # Root: BrowserRouter + providers + routes
├── index.css                 # Tailwind entry
├── config/
│   └── constants.js          # Game constants (squad sizes, budget, formations)
├── context/
│   ├── AuctionContext.jsx     # Realtime auction state (bids, timer, channels)
│   └── LeagueContext.jsx      # Current league selection
├── hooks/
│   ├── useAuth.js            # Auth wrapper
│   ├── useAuction.js         # Auction bid/submit logic
│   ├── useKnockout.js        # Knockout bracket predictions
│   ├── usePlayers.js          # Player list with filters
│   ├── useRealtime.js         # Supabase realtime subscriptions
│   ├── useStandings.js        # Leaderboard data
│   ├── useTeam.js             # Squad + lineup management
│   └── useTransfers.js        # Transfer window logic
├── lib/
│   ├── brackets.js           # Knockout bracket structures
│   ├── defaultLineup.js      # Default lineup generation
│   ├── formations.js          # Formation/lineup validation
│   ├── matchday.js            # Matchday utilities
│   ├── scoring.js             # Points calculation engine
│   ├── utils.js               # General utilities
│   └── validation.js          # Squad/lineup validation
├── components/
│   ├── auction/
│   │   ├── AuctionPlayerRow.jsx
│   │   └── AuctionTimer.jsx
│   ├── layout/
│   │   ├── Layout.jsx         # App shell (sidebar + header + content)
│   │   ├── Header.jsx         # Top bar with user info
│   │   ├── Sidebar.jsx        # Desktop nav
│   │   └── MobileNav.jsx      # Mobile bottom nav
│   ├── market/
│   │   ├── FilterBar.jsx      # Player market filters
│   │   └── PlayerRow.jsx      # Player row in market view
│   └── team/
│       ├── LineupGrid.jsx     # Visual pitch formation
│       ├── BenchList.jsx      # Bench players
│       ├── FormationPicker.jsx
│       └── PlayerSlot.jsx
└── pages/
    ├── Dashboard.jsx          # Landing page
    ├── MyTeam.jsx             # Squad + lineup management
    ├── Market.jsx             # Player market (buy/release)
    ├── Auction.jsx            # Live auction room
    ├── Transfers.jsx          # Transfer window
    ├── Standings.jsx          # League leaderboard
    ├── Bracket.jsx            # Knockout predictions
    ├── History.jsx            # Match-by-match log
    ├── Admin.jsx              # Admin panel (auction, matchdays, scoring)
    └── NotFound.jsx           # 404 page
```
```
apps/fantasy/
├── vite.config.js            # Vite config (base /fantasy/, React plugin, Tailwind)
├── eslint.config.js          # ESLint config
├── package.json
├── index.html                # Vite entry HTML
├── public/                   # Static assets (flags, logos)
└── .env                      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

## 🧞 Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at `http://localhost:4323` |
| `pnpm build` | Production build to `dist/` |
| `pnpm lint` | Lint all source files |
| `pnpm preview` | Preview production build |

## 🛂 Auth

Uses `AuthProvider` from `@predictor/supabase` wrapping the entire app in `App.jsx`:

```
BrowserRouter basename="/fantasy"
  └─ AuthProvider           # Session + profile (useAuth hook)
       └─ LeagueProvider      # Current league
            └─ AuctionProvider # Realtime auction
                 └─ AppRoutes  # ProtectedRoute/AdminRoute guards
```

All pages and hooks import `supabase` directly from `@predictor/supabase` for REST queries and realtime subscriptions.

## 🚀 Deploy

No separate Netlify site — the SPA is built and copied into the gateway's `dist/fantasy/` during the gateway build step. The gateway's `netlify.toml` serves it via SPA fallback (`/fantasy/* → /fantasy/index.html`).
