# Local Test Setup & Running Guide

## What You Need Open

| Window | What |
|---|---|
| **Terminal** | Dev server |
| **Browser Window 1** | App + DevTools |
| **Browser Window 2** | Incognito / second profile (for multi-user tests) |
| **Supabase Dashboard** | Table Editor + SQL Editor |
| **PHASE1_TESTING.md** | Reference |
| **PHASE2_TESTING.md** | Reference |

---

## Step 1 — Install & Configure (once only)

```bash
cd /home/lucas/VSCode_Projects/predictor/fantasy
npm install
```

If `.env` doesn't exist yet:
```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project → Settings → API.

---

## Step 2 — Start the Dev Server

```bash
npm run dev
```

App runs at `http://localhost:5173`. Leave this terminal open for the entire session. Watch it for build errors — if you see a red error here, that's the first thing to report.

---

## Step 3 — Open the Browser

Open `http://localhost:5173` in Chrome or Firefox.

**Open DevTools immediately** (`F12` or `Cmd+Option+I`):
- Go to the **Console** tab — keep this visible at all times
- Go to the **Network** tab → filter by `Fetch/XHR` — useful for seeing Supabase API calls and their responses

For multi-user tests (Phase 2 scenarios 5.x, 6.x): open a second window in **Incognito** (`Ctrl+Shift+N`) or a separate browser profile so you can be logged in as two different users simultaneously.

---

## Step 4 — Open Supabase Dashboard

Go to your Supabase project dashboard and keep two tabs open:
- **Table Editor** — for reading and editing rows during tests
- **SQL Editor** — for the Phase 1 function tests (scenarios 11.x)

---

## Step 5 — Verify Pre-Test Checklist

Before running any scenario, confirm these in the Supabase Table Editor:

- [ ] `auction_state` has exactly one row with `status = 'pending'`
- [ ] `players` table has rows (if empty, seed player data first)
- [ ] At least one user exists with `is_admin = true`
- [ ] At least one regular user exists with `is_admin = false`
- [ ] Both users have a row in the `teams` table

If a user is missing a `teams` row, run this in the SQL Editor for each user:

```sql
INSERT INTO teams (user_id, name, budget_remaining)
VALUES ('<paste-user-uuid-here>', 'Test Team', 105.0);
```

Find the user UUID in Table Editor → `auth.users` or `public.users`.

---

## Step 6 — Run the Tests

Work through `PHASE1_TESTING.md` first (scenarios 1–13), then `PHASE2_TESTING.md` (scenarios 1–9). Go row by row — each table tells you exactly what to do and what to expect.

### RLS Tests (Phase 1, scenario 10)

These require calling Supabase directly from the browser console. First, temporarily expose the client:

1. Open `src/lib/supabase.js` and add this line at the bottom:
   ```js
   window.__supabase = supabase;
   ```
2. Save the file — the dev server will hot-reload.
3. Run queries in the DevTools console, for example:
   ```js
   const { data, error } = await window.__supabase.from('teams').select('*');
   console.log(data, error);
   ```
4. **Remove `window.__supabase = supabase`** from `supabase.js` when you are done with scenario 10.

### Lib Utility Tests (Phase 1, scenario 12)

These are pure JS functions with no UI yet. To test them:

1. Open any loaded component (e.g. `src/pages/Dashboard.jsx`).
2. Import the function at the top and add a temporary `console.log`:
   ```js
   import { calculatePlayerPoints } from '../lib/scoring';
   console.log(calculatePlayerPoints({ minutes_played: 90, goals: 1 }, 'MID'));
   ```
3. Save — check the output in the DevTools Console.
4. **Remove all temporary imports and `console.log` calls** when done.

---

## Step 7 — Wrap Up

When all tests are done:

- Stop the dev server: `Ctrl+C` in the terminal
- Reset any Supabase rows changed during testing:
  - `auction_state` → set `status = 'pending'`, `current_round = 0`, clear `round_started_at`
  - Delete any test bids from `auction_bids`
  - Delete any test rows from `team_players` added during resolution tests
- Remove any temporary code added for testing (`window.__supabase`, `console.log`)

---

## How to Report a Failure

When something doesn't behave as expected, tell me:

**1. Test number** — e.g. `Phase 2 / Scenario 7.4`

**2. What you did** — copy the Action from the table

**3. What you expected** — copy the Expected from the table

**4. What actually happened** — describe the actual behaviour (wrong redirect, blank screen, wrong data, nothing happening)

**5. Console errors** — copy the full error text from the DevTools Console. Red errors are the most important. Paste verbatim, for example:

```
POST https://xxx.supabase.co/rest/v1/auction_bids 403 Forbidden
Error: new row violates row-level security policy for table "auction_bids"
```

**6. Network response (if relevant)** — for Supabase API failures, click the failing request in the Network tab → Response tab, and paste the response body.

That is all that's needed to diagnose and fix any issue.
