# Supabase Setup Guide

Complete these steps before starting Phase 2 development.

---

## Step 1 — Create Supabase project and fill in `.env`

1. Go to **supabase.com** and sign in (or create a free account)
2. Click **"New project"**
3. Fill in:
   - **Name:** `wc2026-fantasy` (or whatever you like)
   - **Database password:** generate a strong one and save it somewhere safe
   - **Region:** pick the closest to you
4. Click **"Create new project"** — wait ~2 minutes for it to provision
5. Once the dashboard loads, go to **Project Settings** (gear icon, bottom-left sidebar)
6. Click **"Data API"** (under Configuration)
7. Copy the two values you need:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** — long JWT string under "Project API keys"
8. In your terminal, navigate to the fantasy folder and create your `.env`:
   ```bash
   cd fantasy
   cp .env.example .env
   ```
9. Open `fantasy/.env` and fill it in:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## Step 2 — Run the migrations and seed

Do these **in order**, one at a time. Each one needs its own query tab.

1. In the Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open `fantasy/supabase/migrations/001_initial_schema.sql` in your code editor, copy the entire contents, paste into the SQL editor, click **"Run"**
   - You should see: `Success. No rows returned`
4. Click **"New query"** again
5. Open `fantasy/supabase/migrations/002_rls_policies.sql`, copy, paste, run
6. Click **"New query"** again
7. Open `fantasy/supabase/migrations/003_functions.sql`, copy, paste, run
8. Click **"New query"** again
9. Open `fantasy/supabase/seed.sql`, copy, paste, run

**Verify it worked:** click **"Table Editor"** in the left sidebar — you should see all tables listed and the `matchdays` table should have 7 rows.

---

## Step 3 — Enable Realtime on the two tables

1. In the Supabase dashboard, click **"Database"** in the left sidebar
2. Click **"Replication"** (under Database)
3. In the **"Source"** section you will see a list of tables with toggle switches
4. Find `auction_bids` — toggle it **on**
5. Find `auction_state` — toggle it **on**
6. No save button needed — changes apply immediately

---

## Step 4 — Verify the app connects

1. From the `fantasy/` directory, start the dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5173` in your browser
3. Open the browser console — there should be **no errors** about missing Supabase env vars
4. The app should load the Home page without crashing

---

## Checklist

- [ ] Supabase project created
- [ ] Project URL and anon key copied into `fantasy/.env`
- [ ] `001_initial_schema.sql` run successfully
- [ ] `002_rls_policies.sql` run successfully
- [ ] `003_functions.sql` run successfully
- [ ] `seed.sql` run successfully
- [ ] Table Editor shows all tables with 7 rows in `matchdays`
- [ ] Realtime enabled for `auction_bids`
- [ ] Realtime enabled for `auction_state`
- [ ] `npm run dev` loads the app with no console errors
