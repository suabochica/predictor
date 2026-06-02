# World Cup 2026 Fantasy — Major Rework Plan (v2)

> Canonical, accessible plan for the fantasy-app rework. All decisions are locked.
> **Execute one Stage per fresh session, stopping + committing after each (see §5).**

---

## 1. Context / Why

Coordinated rework of the **fantasy** app (`apps/fantasy`, Vite+React SPA) plus a new Spanish "how to play" page and a master-doc refresh. Goals:

1. Simplify lineup rules to a single constraint (exactly one GK).
2. Replace championship/relegation/losers brackets with a **real-WC-style single-elimination** knockout (losers eliminated, stay eliminated).
3. Show **tournament-total Opta stats + points aggregate** per player on market/transfers pages.
4. Drive **matchday activation + transfer-window timing automatically from real match kickoff times** (`matches` table); new per-matchday transfer model.
5. Add a **Spanish "How to Play" page**.
6. **Update `MASTER_DOCUMENT.md`** to the final design.

Delivered as a **multi-stage plan over several sessions** — one feature per session.

---

## 2. Current-State Findings (verified by reading the code)

- **Fantasy app**: `apps/fantasy/src`, JSX. Routes in `App.jsx`, basename `/fantasy`. Pages: Dashboard, MyTeam, Market, Standings, Bracket, Auction, Transfers, History, Admin.
- **Lineup**: `MyTeam.jsx` `canSave` requires 11 starters + exactly 1 GK + captain-is-starter **+ formation ∈ VALID_FORMATIONS** (`constants.js`). `lib/formations.js` + `lib/matchday.js` also encode formation rules. `lib/defaultLineup.js` builds default XI. Per-player rolling lock: `hooks/useMatchdayLocks.js` (kickoff − 10 min).
- **Transfers**: `Transfers.jsx` + `hooks/useTransfers.js`; `LeagueContext` exposes `activeTransferWindow` + `activeMatchday`. `executeTransfer` validates remaining/budget/≥1 GK, then `repointLineupPlayer` (`lib/lineupSync.js`). **Priority queue = decorative → delete.** Old model = 3 fixed windows 7/3/3.
- **Market**: `Market.jsx` + `components/market/PlayerRow.jsx` → `@predictor/ui` Table (Pos, Player, Country, Price, Owner, Action). No stats. `usePlayers.js` fetches `players` (+owner).
- **Bracket**: `lib/brackets.js` (`generateChampionshipBracket`, `generateRelegationBracket`, `resolveH2H`). `Admin.jsx` knockout section + `Bracket.jsx` + `hooks/useKnockout.js`. `knockout_matches.bracket IN ('championship','relegation','losers')`.
- **Scoring**: `lib/scoring.js` (`calculatePlayerPoints` FPL, `calculateOptaPoints`, `applyCaptainMultiplier`). Admin previews both; writes active one to `fantasy_standings`.
- **DB**: `players`, `teams(budget 105)`, `team_players` (exclusive), `matchdays`, `lineups` (matchday_id null = default), `matches` (polla; `team_a/team_b` TEXT must equal `players.country`; `stage`, `matchday_id`), `player_stats` (+Opta cols, UNIQUE(player_id,matchday_id)), `fantasy_standings`, `knockout_matches`, `transfer_windows`, `transfers`, `auction_state(scoring_system)`.
- **Docs**: `apps/fantasy/MASTER_DOCUMENT.md` v1.2 describes OLD design — rewrite at end.

---

## 3. Decisions LOCKED

1. **Lineup rule** → 11 starters, **exactly 1 GK**, any DEF/MID/FWD split. **Remove `VALID_FORMATIONS`.** Captain must be a starter.
2. **Knockout** → **single-elimination, no 3rd-place match.** Losers eliminated permanently. **Remove relegation + losers brackets.**
3. **Eliminated fantasy users' squads** → **stay owned/locked.** No release back to the pool. (Simplest; supply still holds — see §4.)
4. **Transfer model** → **preseason = unlimited; round-robin matchday window = 2 transfers; knockout matchday window = 5 transfers.** A player is non-transferable once their game kicks off; re-unlocked next window. **Priority queue removed.**
5. **Timing automation** → matchday activation + transfer-window open/close auto-derived from `matches.match_date`/`matchday_id`. **Scoring stays manual**: after each game the admin runs an **external Python script** to pull stats and upload `player_stats` rows, then presses "calculate standings" / marks matchdays complete. No stats API; do **not** auto-finalize scoring.
6. **Bracket size** → **top 8 qualify** (see §4 math). Round-robin = WC group stage; bottom 4 eliminated after it.
7. **Bracket alignment** → **Option A**: round-robin = WC group (MD1–3); fantasy QF→WC R32, SF→WC R16, **Final→WC quarter-finals**.
8. **"Has played" lock trigger** → **kickoff lock** (reuse `useMatchdayLocks`, 10-min lead) for both lineup edits and transfer eligibility.
9. **How-to-play page** → route **`/como-jugar`**, **Spanish-only** content.
10. **Market/Transfers stat columns** → inline compact = **GP, Min, G, A, Pts**; full Opta tail behind an expand/secondary view (mobile-aware).

---

## 4. Advancement / Player-Supply Math (the "is 8 best?" question)

**Resources.** 12 users × 15-player squads (11 must start). Exclusive ownership ⇒ ≤180 distinct players owned. Each real WC team fields ~14 point-scoring players (11 + ~3 subs). A player dies (`is_eliminated`) when their WC team is knocked out. **Eliminated users' squads stay locked** (decision §3.3), so they sit out of the available pool but also stop competing.

**Alive supply by WC stage** (alive teams × ~14):

| WC stage | Alive teams | ~Alive players | Max users at ×15 (= supply/15) |
|---|---|---|---|
| Group | 48 | ~672 | ~44 |
| Round of 32 | 32 | ~448 | ~29 |
| Round of 16 | 16 | ~224 | ~14 |
| Quarter-finals | 8 | ~112 | ~7 |
| Semi-finals | 4 | ~56 | ~3 |
| Final | 2 | ~28 | ~1 |

**Binding constraint:** `active_users × 15 ≤ alive_available`. Two observations:
- A **2-user fantasy final fits at WC quarter-finals (112) comfortably and at WC semis (56) tightly, but NOT at the WC final (28 < 30).** So the fantasy final must end **no later than WC semis**.
- Supply does **not** force cutting users at R32/R16 (448/224 easily hold 12). The cut to 8 is a **bracket-shape** choice: single-elim needs a power of 2.

**Why 8 (vs 4 / 6 / 12):**
- **12** isn't a power of 2 and breaks supply if carried to deep WC stages.
- **4** (SF+Final, 2 rounds): only 4 of 12 users reach knockout — 8 users' seasons end after the group stage. Poor engagement.
- **6**: not a power of 2 → needs byes/play-in. Messy seeding.
- **8** (QF/SF/Final, 3 rounds): 8 of 12 reach knockout, clean bracket, supply holds with large margin at every stage even with 10 eliminated squads locked away (worst case at WC-QF final: ~112 alive − ~25 locked-alive ≈ 87 available ≫ 30 needed).

**Conclusion: top 8 is the best number** — maximal inclusion among clean power-of-2 sizes, and supply-safe at every stage.

**Chosen alignment — Option A** (biggest supply cushion):

| Fantasy phase | Users | WC stage | Supply | Demand (×15) |
|---|---|---|---|---|
| Round-robin | 12 | Group MD1–3 | ~672 | 180 |
| QF (8→4) | 8 | Round of 32 | ~448 | 120 |
| SF (4→2) | 4 | Round of 16 | ~224 | 60 |
| Final (2→1) | 2 | **Quarter-finals** | ~112 | 30 |

---

## 5. Multi-Stage Implementation Plan — one block per session

**Execution rules (apply to every stage):**
- Each stage is a self-contained block built in its **own fresh context session**.
- At the end of each stage: **STOP** — run the stage's verification (§7), report results to the user, and **wait for the user's OK**. Do not roll into the next stage automatically.
- After the user confirms the block is good, **commit that block** on the working branch with a clear `feat:`/`refactor:` message, then end the session. The next session starts from the committed state.
- Migrations are numbered sequentially after the latest existing one; never edit an applied migration.

---

- **Stage 0 — Persist plan + decisions.** ✅ This document. Update memory pointer to supersede `project_lineup_subs.md` with the v2 decisions + path to this file. **Commit:** `docs: add fantasy rework plan (REWORK_PLAN.md)`.

- **Stage 1 — Lineup rule simplification.** Drop `VALID_FORMATIONS`; keep 11 + exactly-1-GK + captain-is-starter. Edit `MyTeam.jsx` (`canSave`, swap/empty-slot handlers), `lib/formations.js`, `lib/matchday.js`, `defaultLineup.js`. No DB change.
  - **Stop & commit:** verify per §7, then `refactor(fantasy): single-GK lineup rule, drop fixed formations`.

- **Stage 2 — Tournament stat aggregates.** New Postgres **view** `player_tournament_totals` (SUM over `player_stats` by player_id: GP [count minutes>0], minutes, goals, assists, … total_points/opta_points). Join via `usePlayers`/new hook. Add columns (GP/Min/G/A/Pts + expandable Opta tail) to `Market.jsx` `PlayerRow` + Transfers list (mobile-aware). New migration.
  - **Stop & commit:** verify view + UI, then `feat(fantasy): tournament stat totals on market/transfers`.

- **Stage 3 — Auto matchday + transfer-window timing.** Derive active matchday + window from `matches.match_date`/`matchday_id` in `LeagueContext`. Preseason unlimited; round-robin window = 2, knockout window = 5; reuse `useMatchdayLocks` to block transferring any player (out or in) whose game kicked off. Relink `transfer_windows`↔matchdays. Remove priority queue. Edits: migration + `LeagueContext.jsx` + `Transfers.jsx` + `useTransfers.js`.
  - **Stop & commit:** verify timing/locks/caps, then `feat(fantasy): auto matchday + transfer-window timing`.

- **Stage 4 — Single-elim bracket.** Rewrite `lib/brackets.js` (8-team single-elim, no losers/relegation/3rd-place), `Admin.jsx` seeding/advancement, `Bracket.jsx`, `hooks/useKnockout.js`. Migration to relax `knockout_matches.bracket` check. Wire fantasy rounds → WC-stage matchdays per Option A (QF@R32, SF@R16, Final@QF).
  - **Stop & commit:** verify seed/advance/elimination, then `feat(fantasy): single-elimination knockout bracket`.

- **Stage 5 — Spanish "How to Play" page.** New `pages/ComoJugar.jsx` (route `/como-jugar`, Spanish-only), full rules. Nav entry in `Sidebar.jsx` + `MobileNav.jsx`.
  - **Stop & commit:** verify page + nav, then `feat(fantasy): Spanish ¿Cómo jugar? page`.

- **Stage 6 — Update `MASTER_DOCUMENT.md`** to final design; bump version.
  - **Stop & commit:** `docs(fantasy): update MASTER_DOCUMENT to reworked design`.

---

## 6. Verification (per stage)
- `pnpm dev:fantasy` (http://localhost:4323/fantasy/) — exercise each changed page.
- `cd apps/polla && pnpm test` for shared utils touched.
- Migrations: `supabase db push`; verify the new view returns sane aggregates.
- Bracket: seed from standings, advance rounds, confirm losers disappear and no losers/relegation rows created.
- Transfers: preseason unlimited, per-window cap, player locks at kickoff, unlocks next window.
