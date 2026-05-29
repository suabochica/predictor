# 🗳️ Polla

Score prediction app for the FIFA World Cup 2026. Users submit match predictions and compete on a leaderboard.

## 🧰 Tech Stack

| Category | Library |
|---|---|
| Framework | [Astro](https://astro.build) ^5 (SSR, base `/polla/`) |
| React | React 19 + `@astrojs/react` (islands) |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 + `@tailwindcss/vite` |
| Deployment | `@astrojs/netlify` ^6 (SSR adapter) |
| Auth & DB | `@supabase/ssr` (server), `@supabase/supabase-js` (browser) |
| Testing | Jest 29 + `@testing-library/react` |
| Shared | `@predictor/supabase`, `@predictor/types`, `@predictor/ui` |

## 📁 Folder Structure

```
src/
├── middleware.ts            # Auth guard — redirects unauthenticated to gateway login
├── env.d.ts                # TypeScript declarations for Astro.locals
├── components/
│   ├── Header.astro         # Top bar with branding + sign-out
│   ├── Sidebar.astro        # Left nav: player card + nav links
│   ├── PredictionForm.tsx   # React island: enter/update match predictions
│   └── LeaderboardTable.tsx # React island: ranked player leaderboard
├── layouts/
│   └── Layout.astro         # Root shell: Header + Sidebar + main + Footer
├── pages/
│   ├── index.astro          # Dashboard — nav cards
│   ├── predictions.astro    # Prediction form page
│   ├── leaderboard.astro    # Leaderboard page
│   ├── rules.astro          # Scoring rules reference
│   └── auth/
│       └── signout.astro    # POST-only sign-out
├── data/
│   ├── matches.ts           # Country flag/name map + fallback data
│   └── users.ts             # Hardcoded fallback users for offline dev
├── styles/
│   └── global.css           # Tailwind + @predictor/ui design tokens
└── types/
    └── index.ts             # Match, Prediction, LeaderboardRow, ScoringRule
```
```
apps/polla/
├── astro.config.mjs         # React + Tailwind + Netlify adapter, base /polla/
├── netlify.toml             # Build command + static asset redirect
├── tsconfig.json
├── jest.config.cjs          # Jest configuration
├── package.json
├── scripts/
│   └── import-matches.mjs   # Script to seed matches table
├── __tests__/               # Unit tests
├── .env                     # PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_GATEWAY_URL
└── public/                  # Static assets
```

## 🧞 Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at `http://localhost:4322` |
| `pnpm build` | Production build (SSR) |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm import-matches` | Seed matches into Supabase |

## 🛂 Auth

Middleware (`src/middleware.ts`) guards all routes except `/polla/register` and `/polla/auth`:

1. Creates Supabase SSR client from request cookies
2. Validates session via `supabase.auth.getUser()`
3. Redirects to `PUBLIC_GATEWAY_URL/login` if unauthenticated
4. Populates `Astro.locals` with `user`, `displayName`, `isAdmin`, `leaderboardRank`, `totalPoints`
5. Leaderboard rank is fetched via `get_leaderboard()` RPC on each request
