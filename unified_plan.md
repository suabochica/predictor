# Architecture Refactor Plan: Unified Predictor Platform

>  Prompt to execute the unified architecture refactor:

```txt
Read the unified_plan.md file at the root of the project and implement the architecture refactor.
                                                                                                                                                       
  Start with Phase 1 (Workspace & Shared Packages Setup) and proceed through all phases sequentially.                                                  
                                                                                                                                                       
  For each phase:                                                                                                                                      
  1. Create the necessary files and directories as specified
  2. Follow the patterns from the existing codebase (especially fantasy/src/lib/supabase.js and fantasy/src/context/AuthContext.jsx)                   
  3. Ensure all workspace dependencies are properly configured                                                                                         
                                                                                                                                                       
  Key constraints:                                                                                                                                     
  - Use pnpm workspaces for the monorepo structure      
  - All apps should use the shared packages (@predictor/supabase, @predictor/ui, @predictor/types)                                                     
  - Standardize on Tailwind CSS v4 across all apps                                                                                                     
  - The gateway app uses Astro with SSR for auth middleware                                                                                            
  - Both polla and fantasy apps use path-based routing (/polla/, /fantasy/)                                                                            
                                                                                                                                                       
  Run `pnpm install` after setting up the workspace structure to verify dependencies resolve correctly.                                                
                                                                                                                                                       
  ---                                                                                                                                                  
  Alternatively, if they want to execute phase by phase:
                                                                                                                                                       
  Read unified_plan.md and implement Phase 1 only. Create the pnpm workspace configuration and the three shared packages (supabase, types, ui). Do not
  proceed to Phase 2 until Phase 1 is complete and verified.                                                                                           

```                                                        

## Authentication Flow

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

---

## Context

This refactor consolidates three separate applications (frontend/polla, fantasy, backend) into a unified monorepo architecture with:
- **Single authentication** via Supabase Auth shared across all apps
- **Shared UI components** via a Tailwind-based component library
- **Unified backend** using Supabase (replacing FastAPI)
- **Gateway app** as the entry point for login and app selection

### Current State
- `frontend/` (Astro+React) - Polla app with localStorage "auth", plain CSS
- `fantasy/` (Vite+React) - Fantasy app with Supabase Auth, Tailwind v4
- `backend/` (FastAPI) - Hardcoded users, in-memory storage, no real auth

### Target State
```
predictor/
├── apps/
│   ├── gateway/       # Unified login + app selection
│   ├── polla/         # Migrated frontend
│   └── fantasy/       # Migrated fantasy
├── packages/
│   ├── ui/            # Shared Tailwind components
│   ├── supabase/      # Shared Supabase client + auth context
│   └── types/         # Shared TypeScript types
├── supabase/          # Unified migrations
└── netlify.toml       # Deployment config
```

---

## Phase 1: Workspace & Shared Packages Setup

### 1.1 Initialize pnpm Workspaces

**Create `pnpm-workspace.yaml`:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Create root `package.json`:**
```json
{
  "name": "predictor",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter '@predictor/*' dev",
    "build": "pnpm -r build",
    "dev:gateway": "pnpm --filter @predictor/gateway dev",
    "dev:polla": "pnpm --filter @predictor/polla dev",
    "dev:fantasy": "pnpm --filter @predictor/fantasy dev"
  }
}
```

### 1.2 Create `packages/supabase/`

**Files:**
- `packages/supabase/package.json`
- `packages/supabase/src/client.ts` - Browser Supabase client
- `packages/supabase/src/auth-context.tsx` - React auth context (migrate from `fantasy/src/context/AuthContext.jsx`)
- `packages/supabase/src/index.ts` - Exports

**Pattern (from `fantasy/src/lib/supabase.js`):**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Auth Context (from `fantasy/src/context/AuthContext.jsx`):**
```typescript
// Auth context provides:
// - user: Supabase auth user
// - profile: User profile from 'users' table
// - loading: boolean
// - isAdmin: boolean (from profile.is_admin)
// - signIn(email, password)
// - signUp(email, password, displayName)
// - signOut()
```

### 1.3 Create `packages/types/`

**Files:**
- `packages/types/package.json`
- `packages/types/src/user.ts`
- `packages/types/src/match.ts`
- `packages/types/src/prediction.ts`
- `packages/types/src/scoring.ts`
- `packages/types/src/index.ts`

**Types to migrate (from `frontend/src/types/index.ts`):**
```typescript
// user.ts
export type UserRole = 'admin' | 'participant';
export interface User {
  id: string;  // UUID from Supabase
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
}

// match.ts
export interface Match {
  id: string;
  match_code: string;
  team_a: string;
  team_b: string;
  match_date: string;
  group_name?: string;
  actual_score_a?: number;
  actual_score_b?: number;
  status: 'upcoming' | 'live' | 'finished';
}

// prediction.ts
export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  predicted_score_a: number;
  predicted_score_b: number;
  points_earned: number;
}

// scoring.ts
export interface ScoringRule {
  rule_type: string;
  points: number;
  description: string;
}
```

### 1.4 Create `packages/ui/`

**Files:**
- `packages/ui/package.json`
- `packages/ui/src/index.ts`
- `packages/ui/src/styles/tokens.css`
- `packages/ui/src/components/Button.tsx`
- `packages/ui/src/components/Input.tsx`
- `packages/ui/src/components/Card.tsx`
- `packages/ui/src/components/Table.tsx`
- `packages/ui/src/components/Badge.tsx`

**Design tokens (from `fantasy/src/index.css`):**
```css
:root {
  --color-bg: #16171d;
  --color-text: #9ca3af;
  --color-text-heading: #f3f4f6;
  --color-border: #2e303a;
  --color-accent: #10b981;
}
```

---

## Phase 2: Gateway App

### 2.1 Create `apps/gateway/`

**Initialize:**
```bash
pnpm create astro@latest apps/gateway --template minimal
```

**Add dependencies:**
- `@astrojs/react`
- `@supabase/supabase-js`
- `@predictor/supabase` (workspace)
- `@predictor/ui` (workspace)
- `tailwindcss` + `@tailwindcss/vite`

**Configuration (`apps/gateway/astro.config.mjs`):**
```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  output: 'server',
});
```

### 2.2 Pages

| Page | Path | Purpose |
|------|------|---------|
| `index.astro` | `/` | Dashboard with app selection |
| `login.astro` | `/login` | Login form |
| `register.astro` | `/register` | Registration form |
| `auth/callback.astro` | `/auth/callback` | OAuth callback handler |

### 2.3 Auth Middleware

**`apps/gateway/src/middleware.ts`:**
- Check session server-side
- Redirect unauthenticated users to `/login`
- Inject user into `context.locals`

### 2.4 Components

- `AppCard.tsx` - Card component for app selection (Polla / Fantasy)
- `LoginForm.tsx` - Uses shared UI components + Supabase Auth

---

## Phase 3: Migrate Fantasy App

### 3.1 Move Files

```
fantasy/ → apps/fantasy/
```

### 3.2 Update Configuration

**`apps/fantasy/vite.config.js`:**
```javascript
export default defineConfig({
  base: '/fantasy/',  // Path-based routing
  plugins: [tailwindcss(), react()],
});
```

**`apps/fantasy/src/App.jsx`:**
```jsx
<BrowserRouter basename="/fantasy">
  {/* routes */}
</BrowserRouter>
```

### 3.3 Replace Dependencies

**Update `apps/fantasy/package.json`:**
```json
{
  "name": "@predictor/fantasy",
  "dependencies": {
    "@predictor/supabase": "workspace:*",
    "@predictor/ui": "workspace:*",
    "@predictor/types": "workspace:*"
  }
}
```

**Replace imports:**
- `import { supabase } from '../lib/supabase'` → `import { supabase } from '@predictor/supabase'`
- `import { useAuth } from '../context/AuthContext'` → `import { useAuth } from '@predictor/supabase'`

### 3.4 Delete Redundant Files

- `apps/fantasy/src/lib/supabase.js` (replaced by package)
- `apps/fantasy/src/context/AuthContext.jsx` (replaced by package)

---

## Phase 4: Migrate Polla App

### 4.1 Move Files

```
frontend/ → apps/polla/
```

### 4.2 Update Configuration

**`apps/polla/astro.config.mjs`:**
```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  base: '/polla/',
  output: 'server',
});
```

### 4.3 Update Dependencies

**`apps/polla/package.json`:**
```json
{
  "name": "@predictor/polla",
  "dependencies": {
    "@predictor/supabase": "workspace:*",
    "@predictor/ui": "workspace:*",
    "@predictor/types": "workspace:*"
  }
}
```

### 4.4 Replace Auth System

**Remove localStorage auth:**
- Delete `localStorage.getItem('worldCupUser')` checks
- Delete `LoginForm.tsx` backend fetch call

**Implement Supabase Auth:**
- Use `useAuth()` from `@predictor/supabase`
- Server-side auth checks in `.astro` pages via middleware

### 4.5 Convert CSS to Tailwind

**Delete CSS files:** `apps/polla/src/styles/*.css`

**Replace with:**
- Tailwind utilities inline
- Shared UI components (`<Button>`, `<Input>`, `<Card>`, `<Table>`)

---

## Phase 5: Supabase Schema Extension

### 5.1 Move Existing Migrations

```
fantasy/supabase/ → supabase/
```

### 5.2 Create New Migrations

**Existing users table (from `001_initial_schema.sql`):**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**`008_polla_tables.sql`:**
```sql
-- Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT UNIQUE NOT NULL,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  group_name TEXT,
  actual_score_a INTEGER,
  actual_score_b INTEGER,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  predicted_score_a INTEGER NOT NULL,
  predicted_score_b INTEGER NOT NULL,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

-- Scoring rules
CREATE TABLE scoring_rules (
  id SERIAL PRIMARY KEY,
  rule_type TEXT UNIQUE NOT NULL,
  points INTEGER NOT NULL,
  description TEXT NOT NULL
);

INSERT INTO scoring_rules (rule_type, points, description) VALUES
  ('exact_score', 3, 'Exact score prediction'),
  ('correct_winner', 1, 'Correct winner or draw');
```

**`009_polla_rls.sql`:**
```sql
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matches" ON matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users view own predictions" ON predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own predictions" ON predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage matches" ON matches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
```

**`010_leaderboard_view.sql`:**
```sql
CREATE VIEW leaderboard AS
SELECT 
  u.id as user_id,
  u.display_name,
  COALESCE(SUM(p.points_earned), 0) as total_points,
  COUNT(p.id) as predictions_count
FROM users u
LEFT JOIN predictions p ON u.id = p.user_id
GROUP BY u.id, u.display_name
ORDER BY total_points DESC;
```

---

## Phase 6: Netlify Deployment

### 6.1 Create `netlify.toml`

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

# SPA fallbacks
[[redirects]]
  from = "/fantasy/*"
  to = "/fantasy/index.html"
  status = 200

[[redirects]]
  from = "/polla/*"
  to = "/polla/index.html"
  status = 200
```

### 6.2 Environment Variables (Netlify UI)

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

---

## Phase 7: Testing & Cleanup

### 7.1 Test Scenarios

1. **Auth flow:** Register → Login → Dashboard → App selection
2. **Session persistence:** Navigate between gateway, polla, fantasy
3. **RLS policies:** Users see only their own predictions
4. **Leaderboard:** Correct points calculation

### 7.2 Remove Backend

```bash
rm -rf backend/
```

### 7.3 Update Documentation

Update `CLAUDE.md` with new structure and commands.

---

## Critical Files to Modify

| File | Action |
|------|--------|
| `pnpm-workspace.yaml` | Create |
| `package.json` (root) | Create |
| `packages/supabase/src/client.ts` | Create (based on `fantasy/src/lib/supabase.js`) |
| `packages/supabase/src/auth-context.tsx` | Create (based on `fantasy/src/context/AuthContext.jsx`) |
| `packages/types/src/*.ts` | Create (based on `frontend/src/types/index.ts`) |
| `packages/ui/src/components/*.tsx` | Create |
| `apps/gateway/` | Create new app |
| `apps/fantasy/` | Move from `fantasy/`, update imports |
| `apps/polla/` | Move from `frontend/`, convert to Tailwind |
| `supabase/` | Move from `fantasy/supabase/`, add migrations |
| `netlify.toml` | Create |
| `CLAUDE.md` | Update |

---

## Verification

### Build & Run Locally
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

### Test Auth Flow
1. Visit gateway → redirected to login
2. Login with email/password
3. See dashboard with app cards
4. Click "Polla" → navigate to `/polla/`
5. Click "Fantasy" → navigate to `/fantasy/`
6. Session persists across apps

### Test Supabase
1. Check migrations applied: `supabase db push`
2. Verify RLS policies work
3. Test prediction CRUD operations