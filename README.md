# 🔮 Predictor

 Project to manage tournaments and teams predictions with score rules and a leaderboards.

 ## ✍ Prompt

 The initial prompt on claude was:

 ```txt
Claude in this repository we want to create a tournament score predictor whose use case will be the FIFA world cup 2026. In the frontend we will use JavaScript with TypeScript under the AstroJS meta framework, use pnpm as package manager and jest for unit testing. On the backend we will use Python with the FastAPI framework. We will enable a form to enter the scores, a section with the rules of how  the user get points and a leader board with the scores of the user. The app will be initially for 15 user so we can mock their information.
 ```

## 🛂 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                               │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ domain.com   │
     │   (root)     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐     No session      ┌──────────────┐
     │   Gateway    │ ──────────────────► │    Login     │
     │   App        │                     │    Page     │
     └──────┬───────┘                     └──────┬───────┘
            │                                    │
            │ Has session                        │ Auth success
            ▼                                    │
     ┌──────────────┐◄───────────────────────────┘
     │  Dashboard   │
     │ (App Select) │
     └──────┬───────┘
            │
            │ User chooses app
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌────────┐     ┌──────────┐
│ /polla │     │ /fantasy │
│  App   │     │   App    │
└────────┘     └──────────┘
    │               │
    │ Shared Supabase Session
    │               │
    └───────┬───────┘
            │
            ▼
     ┌──────────────┐
     │   Supabase   │
     │   (Auth + DB)│
     └──────────────┘
```

 ## 🧞 Commands

```bash
# Install dependencies
pnpm install

# Run all apps
pnpm dev

# Or individually
pnpm dev:gateway  # http://localhost:4321
pnpm dev:polla    # http://localhost:4322
pnpm dev:fantasy  # http://localhost:4323
```

## 📁 Supabase directories
```
supabase/                  ← Supabase platform directory (CLI-managed)
├── config.toml            → local Supabase project config
├── migrations/            → SQL migration files (001–015)
├── seed.sql               → seed data for local dev
└── test-data/             → test data scripts
packages/supabase/         ← Shared TS library (@predictor/supabase)
├── client.ts              → browser Supabase client
├── server-client.ts       → SSR client factory (Astro middleware)
├── auth-context.tsx       → React AuthContext + useAuth() hook
└── index.ts               → barrel export
```
`packages/supabase/` wraps `@supabase/supabase-js` and `@supabase/ssr` with reusable code for all apps. `supabase/` defines the actual database schema, migrations, and RLS policies.

 
 
 ## 🚀 Deployment

The project is deployed to **Netlify** using a single-site architecture with a proxy backend.

```
                         predictor-gateway.netlify.app
                         ┌────────────────────────────┐
                         │         Gateway SSR        │
                         │    (base: apps/gateway)    │
                         │                            │
                         │  /            → Gateway    │
                         │  /login       → Login page │
                         │  /polla/*     → Proxy ────►│ predictor-polla.netlify.app
                         │  /fantasy/*   → Static ───►│ (SSR backend for /polla)
                         │              SPA files  ──►│
                         └────────────────────────────┘
```

| Component | URL | Base Dir | Type |
|---|---|---|---|
| **Gateway** | `predictor-gateway.netlify.app` | `apps/gateway` | Astro SSR + static files |
| **Polla** | `predictor-polla.netlify.app` | `apps/polla` | Astro SSR (proxy backend) |
| **Fantasy** | *(served from gateway)* | — | Vite React SPA (built into gateway dist) |

[![Netlify Status](https://api.netlify.com/api/v1/badges/b7ceba57-01c6-4aae-9266-71f2ff50e452/deploy-status)](https://app.netlify.com/projects/predictor-gateway/deploys)

### Build

```bash
pnpm build  # builds all three apps
```

| App | Build Command | Output |
|---|---|---|
| Gateway | `pnpm --filter @predictor/fantasy build && pnpm build && cp -r ../fantasy/dist dist/fantasy` | `apps/gateway/dist/` (includes `dist/fantasy/`) |
| Polla | `pnpm build` | `apps/polla/dist/` |

### Environment Variables

| App | Variable | Purpose |
|---|---|---|
| Gateway | `PUBLIC_SUPABASE_URL` | Supabase project URL |
| Gateway | `PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| Polla | `PUBLIC_SUPABASE_URL` | Supabase project URL |
| Polla | `PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| Polla | `PUBLIC_GATEWAY_URL` | Gateway URL for auth redirects |

### Routing Strategy

| Path | Production | Dev |
|---|---|---|
| `/`, `/login`, `/register` | Gateway SSR | `localhost:4321` |
| `/polla/*` | 200 rewrite → `predictor-polla.netlify.app/polla/:splat` | Vite proxy → `localhost:4322` |
| `/fantasy/*` | SPA fallback → `dist/fantasy/index.html` | Vite proxy → `localhost:4323` |

## 🤖 AI Use

 The agent code that we are using:

 - [Code Claude](https://claude.ai)
 - [Opencode](https://opencode.ai/docs/)

The list of LLM used:

- cloude-sonnet
- DeepSeek V4 Pro (Go subscription required)

 The recommended IDE & Editor is: 
 
 - [VS Code](https://code.visualstudio.com/)

