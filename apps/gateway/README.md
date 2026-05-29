# 🚪 Gateway

Auth entry point and dashboard for the Predictor monorepo. Handles login, registration, and routes users to sub-apps.

## Tech Stack

| Category | Library |
|---|---|
| Framework | [Astro](https://astro.build) ^5 (SSR) |
| React | React 19 + `@astrojs/react` (islands) |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 + `@tailwindcss/vite` |
| Deployment | `@astrojs/netlify` ^6 (SSR adapter) |
| Auth & DB | `@supabase/ssr` (server), `@supabase/supabase-js` (browser) |
| Shared | `@predictor/supabase`, `@predictor/types`, `@predictor/ui` |

## Folder Structure

```
src/
├── middleware.ts            # Auth guard — redirects unauthenticated to /login
├── env.d.ts                # TypeScript declarations for Astro.locals
├── components/
│   ├── AppCard.tsx          # Dashboard card linking to /polla or /fantasy
│   └── RegisterForm.tsx     # Registration form (email + display_name)
├── layouts/
│   └── Layout.astro         # Base HTML shell
├── pages/
│   ├── index.astro          # Dashboard — AppCards + sign-out
│   ├── login.astro          # Login page (shared LoginForm)
│   ├── register.astro       # Register page
│   └── auth/
│       ├── callback.astro   # OAuth callback handler
│       └── signout.astro    # POST-only sign-out endpoint
└── styles/
    └── global.css           # Tailwind + @predictor/ui design tokens
```
```
apps/gateway/
├── astro.config.mjs         # React + Tailwind + Netlify adapter + dev proxies
├── netlify.toml             # Build command, env, proxy/SPA redirects
├── tsconfig.json
├── package.json
└── .env                     # PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at `http://localhost:4321` |
| `pnpm build` | Production build (SSR via Netlify adapter) |
| `pnpm preview` | Preview production build |

## Auth

Middleware (`src/middleware.ts`) guards all routes except `/login`, `/register`, and `/auth/callback`:

1. Creates Supabase SSR client from request cookies
2. Calls `supabase.auth.getSession()` to validate auth
3. Redirects to `/login` if no session
4. Populates `Astro.locals` with `user` and `displayName`

In dev, Vite proxies route `/polla` → `localhost:4322` and `/fantasy` → `localhost:4323`.
