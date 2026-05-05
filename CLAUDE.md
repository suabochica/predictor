# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FIFA World Cup 2026 Score Predictor — pnpm monorepo containing three apps:

- **gateway** — Astro SSR app, authentication entry point (login/register/dashboard)
- **polla** — Astro SSR app, score prediction & leaderboard (`/polla/` base path)
- **fantasy** — Vite + React SPA, fantasy league management (`/fantasy/` base path)

### Tech Stack

- **Apps**: AstroJS (gateway, polla) + Vite/React (fantasy), TypeScript/JavaScript
- **Auth & DB**: Supabase (SSR session via `@supabase/ssr`, browser client via `@supabase/supabase-js`)
- **Shared packages**: `@predictor/supabase`, `@predictor/types`, `@predictor/ui`
- **Package Manager**: pnpm (workspace)
- **Testing**: Jest (polla unit tests)

## Project Structure

```
/
├── pnpm-workspace.yaml
├── package.json               # Root scripts: dev, build, dev:gateway, dev:polla, dev:fantasy
├── netlify.toml
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/            # 001–015 (013–015 are polla tables/RLS/leaderboard view)
├── packages/
│   ├── supabase/src/          # Shared Supabase client, AuthContext, server-client factory
│   ├── types/src/             # Shared TS types (User, Match, Prediction, ScoringRule, etc.)
│   └── ui/src/                # Shared Tailwind components + design tokens
└── apps/
    ├── gateway/               # Astro SSR — port 4321, no base path
    │   ├── src/middleware.ts  # Session guard
    │   ├── src/pages/         # index, login, register, auth/callback, auth/signout
    │   └── src/components/    # AppCard, LoginForm, RegisterForm
    ├── polla/                 # Astro SSR — port 4322, base /polla/
    │   ├── src/middleware.ts  # Session guard → redirect to /
    │   ├── src/pages/         # index, predictions, leaderboard, rules, auth/signout
    │   └── src/components/    # LoginForm, MatchCard, LeaderboardTable, etc.
    └── fantasy/               # Vite + React — port 4323, base /fantasy/
        └── src/               # React components, hooks, pages
```

## Commands

All commands run from the **project root** unless noted.

```bash
# Install all workspace dependencies
pnpm install

# Start all apps in parallel
pnpm dev

# Start individual apps
pnpm dev:gateway    # http://localhost:4321
pnpm dev:polla      # http://localhost:4322/polla/
pnpm dev:fantasy    # http://localhost:4323/fantasy/

# Build all apps
pnpm build

# Run polla unit tests (from apps/polla/)
cd apps/polla && pnpm test

# Run tests in watch mode
cd apps/polla && pnpm test -- --watch
```

## Environment Variables

Each app needs a `.env` file. All three share the same Supabase project.

### `apps/gateway/.env` and `apps/polla/.env` (Astro — PUBLIC_ prefix)
```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

### `apps/fantasy/.env` (Vite — VITE_ prefix)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The shared `packages/supabase/src/client.ts` supports both prefixes automatically.

## Auth Flow

1. User visits `/` (gateway) — middleware checks Supabase session
2. Unauthenticated → redirect to `/login`
3. After login, gateway dashboard shows links to `/polla/` and `/fantasy/`
4. Each sub-app has its own middleware that redirects unauthenticated users back to `/`

## Shared Packages

### `@predictor/supabase`
- `supabase` — browser Supabase client
- `AuthContext`, `useAuth` — React auth state
- `createServerSupabaseClient(cookies)` — SSR client factory for Astro middleware

### `@predictor/types`
- `User`, `Match`, `Prediction`, `ScoringRule`, `LeaderboardEntry`

### `@predictor/ui`
- `Button`, `Input`, `Card`, `Badge`, `Table` — Tailwind components
- `@predictor/ui/styles` — design tokens CSS (import in layouts)

## Database (Supabase)

Migrations live in `supabase/migrations/`:
- `001–012` — Fantasy league tables (teams, players, auctions, transfers, etc.)
- `013_polla_tables.sql` — matches, predictions, scoring_rules
- `014_polla_rls.sql` — RLS policies for polla tables
- `015_leaderboard_view.sql` — leaderboard aggregation view

Apply migrations: `supabase db push` (requires Supabase CLI linked to project).

## Netlify Deployment

`netlify.toml` at project root configures a single-site deploy:
- Build command: `pnpm build`
- Gateway (Astro SSR) is the primary app
- `/polla/*` and `/fantasy/*` redirects handle sub-app routing

> **Note**: SSR apps (gateway, polla) require `@astrojs/netlify` adapter for production Netlify deploys.
