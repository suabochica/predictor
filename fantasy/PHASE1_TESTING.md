# Phase 1 — Testing Guide

Phase 1 built the foundation: database schema, auth, routing, layout, dashboard, contexts, hooks, and lib utilities. Most of these have no dedicated tests yet. Work through this guide before or alongside Phase 2 testing.

---

## Pre-Test Setup

Same checklist as `PHASE2_TESTING.md` — migrations 001–003 run, seed run, `.env` filled in, dev server running. Phase 1 tests only need one user (admin optional for some scenarios).

---

## Test Scenarios

### 1. Registration

| Step | Action | Expected |
|---|---|---|
| 1.1 | Visit `/register`, submit with all fields filled | Redirected to `/dashboard` |
| 1.2 | Check Supabase `auth.users` table | New auth user row exists |
| 1.3 | Check Supabase `public.users` table | Row with correct `display_name`, `email`, `is_admin = false` |
| 1.4 | Submit registration with mismatched or short password | Error message shown, no redirect |
| 1.5 | Submit registration with an already-registered email | Supabase error shown inline |
| 1.6 | Register a second account, set `is_admin = true` in Supabase Table Editor | Admin badge appears in Header and Sidebar after login |

---

### 2. Login & Session

| Step | Action | Expected |
|---|---|---|
| 2.1 | Submit login with correct credentials | Redirected to `/dashboard`, Header shows display name |
| 2.2 | Submit login with wrong password | Error message shown, no redirect |
| 2.3 | After login, refresh the page | Session restored — no redirect to `/login`, user still logged in |
| 2.4 | Click Sign Out | Redirected to `/` or `/login`, Header shows Sign In CTA, Sidebar hidden |
| 2.5 | Press browser back after sign out | Protected pages redirect to `/login`, not accessible |

---

### 3. Route Guards

| Step | Action | Expected |
|---|---|---|
| 3.1 | While logged out, navigate directly to `/dashboard` | Redirected to `/login` |
| 3.2 | While logged out, navigate to `/auction`, `/my-team`, `/standings` | All redirect to `/login` |
| 3.3 | While logged in as non-admin, navigate to `/admin` | Redirected to `/dashboard` |
| 3.4 | Navigate to a non-existent route (e.g. `/foo`) | `NotFound` page renders with 404 message |

---

### 4. Header

| Step | Action | Expected |
|---|---|---|
| 4.1 | Load any page while logged out | Logo + app name visible; Sign In CTA button visible; no nav links, no display name |
| 4.2 | Load any page while logged in as non-admin | Display name shown; Sign Out button visible; no Admin badge |
| 4.3 | Load any page while logged in as admin | Amber "Admin" badge visible next to display name |
| 4.4 | On desktop: verify desktop nav links are visible | Auction, Standings, Market links present |
| 4.5 | On mobile (or narrow viewport): verify desktop nav is hidden | Desktop links not visible; MobileNav at bottom visible instead |

---

### 5. Sidebar (desktop only)

Resize viewport to ≥768px. Log in as a user who has a `teams` row.

| Step | Action | Expected |
|---|---|---|
| 5.1 | Observe sidebar on any protected page | Team name shown, budget shown (£105.0 if untouched) |
| 5.2 | Log in as user with no `teams` row | Sidebar shows no team name / blank budget — no crash |
| 5.3 | In Supabase, set an active matchday (`is_active = true` on a matchdays row) | "Matchday active" badge appears in sidebar |
| 5.4 | In Supabase, set a transfer window with `open_at <= NOW() <= close_at` | "Transfers open" badge appears in sidebar |
| 5.5 | Click each nav link | Active link highlights in emerald; admin link highlights in amber (admin only) |

---

### 6. MobileNav (mobile only)

Resize viewport to <768px.

| Step | Action | Expected |
|---|---|---|
| 6.1 | Observe bottom nav | 5 icons visible: Home, Team, Auction, Standings, Market |
| 6.2 | Navigate to `/auction` | Auction icon highlighted |
| 6.3 | Tap each icon | Navigates to correct route; tap targets are comfortably large |
| 6.4 | Scroll down on a long page | Bottom nav stays fixed, content not hidden behind it |

---

### 7. Dashboard

Log in as a user who has a `teams` row with default budget (£105.0) and no squad players yet.

| Step | Action | Expected |
|---|---|---|
| 7.1 | Navigate to `/dashboard` | Page loads without error |
| 7.2 | Budget card | Shows £105.0 (or current `budget_remaining`) |
| 7.3 | Squad size card | Shows 0 / 15 (no players won yet) |
| 7.4 | With no active matchday | No matchday alert shown |
| 7.5 | With no open transfer window | No transfer window alert shown |
| 7.6 | Set active matchday in Supabase, refresh dashboard | Matchday alert or badge appears |
| 7.7 | Quick action buttons | Clicking each navigates to the correct page |

---

### 8. LeagueContext

These verify the data layer behind the dashboard and sidebar.

| Step | Action | Expected |
|---|---|---|
| 8.1 | Log in and observe Network tab | `teams` and `matchdays` queries fire on mount |
| 8.2 | Manually update `budget_remaining` in Supabase, call `refreshTeam()` via browser console: `window.__leagueCtx?.refreshTeam()` (if exposed) or trigger by re-navigating | New budget value reflected |
| 8.3 | Log in with a user who has no `teams` row | App does not crash; budget shows blank or zero |
| 8.4 | Set `is_active = false` on all matchdays | `activeMatchday` is null; no matchday badge in sidebar |

---

### 9. usePlayers Hook Filters

Navigate to `/auction` with auction active (or test via browser console). The player grid uses `usePlayers()`.

| Step | Action | Expected |
|---|---|---|
| 9.1 | Load `/auction` | All players appear in the grid |
| 9.2 | Click "GK" filter tab | Only goalkeepers shown |
| 9.3 | Click "DEF" | Only defenders shown |
| 9.4 | Click "All" | Full player list restored |
| 9.5 | In Supabase, verify at least one player has `price <= 8.5` | That player appears when filtering by lockable (not exposed in UI yet — verify via hook directly in Phase 3) |

---

### 10. RLS Policies (Phase 1 tables)

Use the browser console (`supabase` client) or Supabase API to verify these.

| Step | Attempt | Expected result |
|---|---|---|
| 10.1 | As User A, read `teams` | Only User A's team returned |
| 10.2 | As User A, try `supabase.from('teams').select('*').eq('user_id', '<User B UUID>')` | Returns empty array (RLS filters it out) |
| 10.3 | As User A, try to insert into `team_players` with a `team_id` belonging to User B | RLS error |
| 10.4 | As any authenticated user, read `players` | All players returned |
| 10.5 | As non-admin, try `supabase.from('players').insert({ name: 'Fake', ... })` | RLS error |
| 10.6 | As admin, insert a player | Succeeds |
| 10.7 | As any authenticated user, read `fantasy_standings` | All standings returned |
| 10.8 | As any authenticated user, read `matchdays` | All matchdays returned |

---

### 11. Database Functions (SQL Editor)

Run these directly in the Supabase SQL Editor. Requires at least one `player_stats` row — insert one manually if needed.

**Setup:**
```sql
-- Insert a test stat row (adjust IDs to match your data)
INSERT INTO player_stats (
  player_id, matchday_id,
  minutes_played, goals, assists,
  yellow_cards, red_cards, own_goals,
  clean_sheet, saves, goals_conceded,
  total_points
) VALUES (1, 1, 90, 1, 1, 0, 0, 0, true, 0, 0, 0);
```

| Step | Query | Expected result |
|---|---|---|
| 11.1 | `SELECT calculate_player_points(<stat_id>);` | Returns a numeric total. For a MID with 90 min (2pts) + 1 goal (5pts) + 1 assist (3pts) + clean sheet (1pt) = **11** |
| 11.2 | `SELECT calculate_player_points(<stat_id>);` for a GK with 60 min, 4 saves, clean sheet | 2 (60+ min) + 4 (clean sheet GK) + 1 (saves ÷ 3, rounded down) = **7** |
| 11.3 | `SELECT refresh_player_points(<matchday_id>);` | Returns void/success; check `player_stats.total_points` updated for all players in that matchday |
| 11.4 | Add a yellow card to the stat row (`yellow_cards = 1`), re-run `calculate_player_points` | Score reduced by 1 |
| 11.5 | Add a red card (`red_cards = 1`, `yellow_cards = 0`), re-run | Score reduced by 3 |

---

### 12. Lib Utilities — Pure Function Tests

These functions have no UI yet. Test them via browser console on the running dev server (`window` doesn't expose them directly — import and test via a temporary `console.log` in any component, or write a quick Jest test).

#### `scoring.js` — `calculatePlayerPoints(stats, position)`

| Input | Expected output |
|---|---|
| GK, 90 min, clean sheet, 3 saves | 2 + 4 + 1 = 7 |
| FWD, 60 min, 2 goals, 1 assist | 2 + 8 + 3 = 13 |
| DEF, 45 min, 1 own goal | 1 + (-2) = -1 |
| MID, 90 min, yellow card | 2 + (-1) = 1 |
| Any, captain = true, base = 10 | `applyCaptainMultiplier(10)` → 20 |

#### `formations.js`

| Call | Expected |
|---|---|
| `isValidFormation('4-3-3')` | `true` |
| `isValidFormation('5-5-0')` | `false` |
| `parseFormation('4-3-3')` | `{ DEF: 4, MID: 3, FWD: 3 }` |
| `validateLineup(lineup, '4-3-3')` with correct counts | passes |
| `validateLineup(lineup, '4-3-3')` with 2 GKs starting | fails |

#### `validation.js`

| Call | Expected |
|---|---|
| `validateBid(9.0, 8.5, 105.0)` — bid above listed price | passes |
| `validateBid(8.0, 8.5, 105.0)` — bid below listed price | fails with message |
| `validateBudget(110.0, 105.0)` — bid exceeds budget | fails |
| `validateBudget(50.0, 105.0)` | passes |

#### `utils.js`

| Call | Expected |
|---|---|
| `formatPrice(9.5)` | `'£9.5'` |
| `formatPoints(123)` | `'123 pts'` (or similar) |
| `sortByTotalPoints([{pts:5},{pts:10}])` | `[{pts:10},{pts:5}]` |

---

### 13. Hooks Deferred to Phase 3

These hooks exist and are wired up but have no UI yet. They should be tested when the corresponding pages are built:

| Hook | Test in Phase 3 page |
|---|---|
| `useTeam` | `/my-team` — verify team players load with position/price |
| `useStandings` | `/standings` — verify sorted leaderboard |
| `useKnockout` | `/bracket` — verify matches load ordered by round |
| `useTransfers` | `/transfers` — verify history and remaining transfers computed correctly |
| `useRealtime` | Generic — verify subscription fires on DB change (covered partially by auction Realtime tests) |
