# Unified Architecture Refactor — Migration Progress

Reference plan: `unified_plan.md`

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Workspace & Shared Packages | ✅ Done |
| 2 | Gateway App | ✅ Done |
| 3 | Migrate Fantasy App | ✅ Done |
| 4 | Migrate Polla App | ✅ Done |
| 5 | Supabase Schema Extension | ✅ Done |
| 6 | Netlify Deployment Config | ✅ Done |
| 7 | Testing & Cleanup | ✅ Done |

---

## What Was Done

### Phase 1 — Workspace & Shared Packages
- Created `pnpm-workspace.yaml` (root)
- Created root `package.json` with `dev`, `build`, `dev:gateway`, `dev:polla`, `dev:fantasy` scripts
- Created `packages/supabase/` — shared Supabase browser client + React AuthContext + SSR server client factory
- Created `packages/types/` — shared TypeScript types (User, Match, Prediction, ScoringRule, LeaderboardEntry)
- Created `packages/ui/` — shared Tailwind components (Button, Input, Card, Badge, Table) + design tokens CSS

### Phase 2 — Gateway App (`apps/gateway/`)
- Astro SSR app on port 4321
- `src/middleware.ts` — checks Supabase session server-side, redirects unauthenticated to `/login`
- Pages: `index.astro` (dashboard), `login.astro`, `register.astro`, `auth/callback.astro`, `auth/signout.astro`
- Components: `AppCard.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`
- Layout: `Layout.astro` (imports `@predictor/ui/styles`)

### Phase 3 — Fantasy App (`apps/fantasy/`)
- `git mv fantasy apps/fantasy`
- `package.json` → renamed to `@predictor/fantasy`, added workspace deps, dev port 4323
- `vite.config.js` → added `base: '/fantasy/'`, `optimizeDeps.include` for workspace packages
- `src/App.jsx` → `BrowserRouter basename="/fantasy"`, imports from `@predictor/supabase`
- All files: replaced `from '../lib/supabase'` / `from '../context/AuthContext'` → `from '@predictor/supabase'`
- Deleted: `src/lib/supabase.js`, `src/context/AuthContext.jsx`
- `src/hooks/useAuth.js` now re-exports from `@predictor/supabase`

### Phase 4 — Polla App (`apps/polla/`)
- `git mv frontend apps/polla`
- `package.json` → renamed to `@predictor/polla`, added workspace deps + Tailwind + @supabase/ssr
- `astro.config.mjs` → added Tailwind vite plugin, `base: '/polla/'`, `output: 'server'`
- Added `src/env.d.ts` (App.Locals.user type)
- Added `src/middleware.ts` — Supabase SSR session check, redirects unauthenticated to `/`
- `src/components/LoginForm.tsx` → replaced backend API + localStorage auth with `supabase.auth.signInWithPassword`
- All pages converted to Tailwind utilities (removed CSS imports and inline `<style>` blocks)
- Added `src/pages/auth/signout.astro` (POST handler)
- Deleted: `src/styles/home.css`, `leaderboard.css`, `login.css`, `predictions.css`, `rules.css`
- `src/layouts/Layout.astro` → updated to import Tailwind, dark background

### Phase 5 — Supabase Schema
- `git mv apps/fantasy/supabase supabase` (moved to project root)
- Created `supabase/migrations/013_polla_tables.sql` — matches, predictions, scoring_rules tables
- Created `supabase/migrations/014_polla_rls.sql` — RLS policies for matches & predictions
- Created `supabase/migrations/015_leaderboard_view.sql` — leaderboard aggregation view

---

## What Remains

### Phase 6 — Netlify Deployment (`netlify.toml`)
Create at project root:
```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  PNPM_VERSION = "9"

# Polla SPA fallback
[[redirects]]
  from = "/polla/*"
  to = "/polla/index.html"
  status = 200

# Fantasy SPA fallback
[[redirects]]
  from = "/fantasy/*"
  to = "/fantasy/index.html"
  status = 200
```

### Phase 7 — Testing & Cleanup

1. **Run `pnpm install`** from project root to verify all workspace deps resolve.

2. **Update `CLAUDE.md`** — replace the entire file to reflect the new monorepo structure:
   - New structure: `apps/gateway`, `apps/polla`, `apps/fantasy`, `packages/*`, `supabase/`
   - New commands: `pnpm dev:gateway` (port 4321), `pnpm dev:polla` (port 4322), `pnpm dev:fantasy` (port 4323)
   - Remove references to `backend/`, `frontend/`, old FastAPI commands
   - Note env vars: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`

3. **Verify `.env` files** — each app needs:
   ```
   PUBLIC_SUPABASE_URL=...
   PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Note: `apps/fantasy` currently has a `.env` using `VITE_SUPABASE_URL`. The shared
   `packages/supabase/src/client.ts` already supports both `PUBLIC_` and `VITE_` prefixes,
   but to standardize you should update `apps/fantasy/.env` to use `PUBLIC_SUPABASE_URL`.

4. **Test auth flow**: Register → Login on gateway → see dashboard → navigate to /polla/ or /fantasy/

5. **Optional cleanup**: `rm -rf backend/` (Phase 7.2)

---

## Key Files Created

```
predictor/
├── pnpm-workspace.yaml
├── package.json
├── netlify.toml                  ← PENDING
├── CLAUDE.md                     ← NEEDS UPDATE
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   ├── migrations/
│   │   ├── 001–012 (fantasy, existing)
│   │   ├── 013_polla_tables.sql
│   │   ├── 014_polla_rls.sql
│   │   └── 015_leaderboard_view.sql
│   └── test-data/
├── packages/
│   ├── supabase/src/{client.ts, auth-context.tsx, server-client.ts, index.ts}
│   ├── types/src/{user.ts, match.ts, prediction.ts, scoring.ts, index.ts}
│   └── ui/src/{components/*.tsx, styles/tokens.css, index.ts}
├── apps/
│   ├── gateway/   (Astro SSR, port 4321)
│   ├── polla/     (Astro SSR, port 4322, base /polla/)
│   └── fantasy/   (Vite+React, port 4323, base /fantasy/)
```

---

## Prompt to Resume

```
Read MIGRATION_PROGRESS.md and continue the unified architecture refactor from where it left off.
Phase 6 (netlify.toml) and Phase 7 (pnpm install, CLAUDE.md update, cleanup) remain.
```
