# UCL second competition — TODO

**Written 2026-08-28. Updated 2026-08-31** after a walkthrough session (steps
1–3 done, step 4 partially done, plus a new player/team/schedule data-import
pipeline). Lives here (`apps/fantasy/UCL_TODO.md`) rather than in
`~/.claude/plans/` so it is reachable from the repo; the plan and handoffs it
references are still in `~/.claude/plans/`.

- Master plan: `/home/lucas/.claude/plans/in-the-fantasy-part-humming-dahl.md`
- Phase 5 handoff: `/home/lucas/.claude/plans/ucl-competition-phase5-handoff.md`
- Phase 4 handoff: `/home/lucas/.claude/plans/ucl-competition-phase4-handoff.md`
- Deferred side project, starts only after this file is closed out:
  `apps/fantasy/I18N_PLAN.md` (ES/EN language selector)

---

## Status

**Phases 0–5 are code-complete and committed on `main`** (head `4c0ae14`).
**Migrations 060–067 are all applied to the live DB** (067 applied 2026-08-28).

**`ucl-2026-27` now exists** (created 2026-08-31, slug/name/short-label/stage
labels set correctly, `status='setup'`, WC keeps `is_default`). Steps 1–4
are now all done and verified clean against the live DB — matchdays (all 8
Liga rounds), CSV player import (841 rows), add-a-participant, and `.ods`
upload all passed through the real admin UI. Both open pipeline items
(price scale, thin squads) are also resolved.

**Working tree is NOT clean** — see "Uncommitted work" below before doing
anything destructive (`git stash`/`reset`/`checkout`).

Phase 6 is still blocked on step 4 finishing.

---

## Uncommitted work (as of 2026-09-01)

Both fixes below **are now committed** (`2b0d4a1`, `c535b2f`) — confirmed via
`git log`. Only the data pipeline and this TODO file remain. `git status`
shows:

- `?? apps/fantasy/UCL_TODO.md` — this file (never committed).
- `?? apps/fantasy/data/UCL_metadata/` — raw UEFA data dumps + new `processed/` outputs, see "UCL data pipeline" below.
- `?? apps/fantasy/data/scripts/generate_ucl_data.py` — new processing script.
- `M apps/polla/.astro/settings.json` — pre-existing build noise (Astro's
  `lastUpdateCheck` timestamp), unrelated, do not commit.

Commit the data pipeline (script + outputs, one commit) and this TODO
(separate commit) — step 4 is fully done so there's no reason to hold them
back any longer.

### Bug found + fixed: stray "Subasta completada" message — ✅ committed 2b0d4a1
While walking the admin selector on UCL, **Participantes de la liga** showed
"Subasta completada. Los nuevos inscritos accederán a jugadores no ganados
vía el mercado libre." — wrong, UCL hasn't had an auction. Root cause:
`isCompleted` (`Admin.jsx:1597`) reads `auctionState`, which `useAuction()`
binds to the **sidebar's** competition (still Mundial 2026), not the admin
selector — same divergence the "Control de subasta" notice already handles
correctly at `Admin.jsx:1735`. Fixed by adding the same `auctionInSync` guard
at `Admin.jsx:1664`. Confirmed via code read that the actual write path
(`handleAddToLeague`, `Admin.jsx:274-281`) was never affected — it already
correctly uses `adminCompetition?.budget`, not the sidebar's. Cosmetic bug
only; still not re-verified live in the browser (should show up gone next
time you view that section), but the fix is committed.

### UCL data pipeline (new, not part of the original plan)
Lucas dropped raw UEFA data into `apps/fantasy/data/UCL_metadata/`:
- `UCLplayers_V2.txt` — UEFA gaming-API player list, all 36 league-phase clubs
  (935 players). Supersedes `UCLplayers.txt` + `UCL2026teams.txt` (both only
  covered 29 clubs, snapshotted before the playoff round finished) — those
  two are now stale, kept for history, no longer read by the script.
- `uefa_champions_league_calendar.json` — full 206-fixture ICS calendar
  (qualifying rounds + playoffs + 144 "Fase liga" matches, all 36 clubs).

New script `apps/fantasy/data/scripts/generate_ucl_data.py` (read-only,
touches no DB) turns these into `apps/fantasy/data/UCL_metadata/processed/`:
- `players_import.csv` — 841 active players, schema
  `name,country,country_code,position,price,photo_url` (same as the WC's
  `generate_players_csv.py` output) — ready to paste into **Importar
  jugadores CSV**. `country` = club name, matched verbatim against the
  calendar's team names, so it'll line up with `matches_schedule.csv`.
  Position mapping (UEFA `skill` 1→GK/2→DEF/3→MID/4→FWD) verified against
  known players (Courtois/Neuer=GK, van Dijk/Rüdiger=DEF, Bellingham=MID,
  Mbappé/Haaland/Kane=FWD). No duplicate name+country pairs.
- `teams.csv` — all 36 clubs with short_name + UEFA team id, derived directly
  from the player rows (`tId`/`cCode` verified consistent per team, and
  cross-checked 1:1 against the old teams file for the 29 overlapping clubs).
- `matches_schedule.csv` — the 144 "Fase liga" fixtures bucketed into `Liga
  MD1`…`Liga MD8` by kickoff-date clustering (18 matches each) — labels match
  the stage labels typed into the competition form in step 1.

**Open items on this pipeline:**
- [x] **Price scale decision — RESOLVED 2026-09-01, no multiplier needed.**
      UCL: `budget=105`, `max_squad_size=15`; UEFA raw `value` range 4–11, avg
      ~5.1. WC (for comparison): `budget=105`, `max_squad_size=15`, price
      range 3.5–10.5, avg 4.9. Nearly identical scale on identical
      budget/squad-size — import `players_import.csv` unscaled.
- [x] **Thin squads on 4 clubs — DECIDED 2026-09-01: import now, top up
      later.** Active/total counts lopsided for the most recently-qualified
      (playoff-round) clubs — Fenerbahçe 3/23, LASK 7/23, Bodø/Glimt 8/24,
      Sabah 12/23 (every other club ~100%). Fenerbahçe's 3 active rows are
      2 DEF + 1 FWD — zero GK, zero MID. Known consequence accepted: until
      topped up, any Opta/`.ods` stats for a non-imported player on these 4
      clubs will silently fail to match (same "Player not found" shape as
      the pagination bugs in `project_opta_upload_pagination_fix`).
- [ ] Neither CSV has been run through the actual admin importer yet — this
      is exactly step 4's "Importar jugadores CSV against UCL in isolation"
      test below, now unblocked by having real data to import.
- [ ] `matches_schedule.csv` has no consumer yet — nothing currently reads it
      into `matches`/`matchdays`. `apps/polla/scripts/import-matches.mjs` and
      `sync-schedule.mjs` are WC-specific (hardcoded Wikipedia scrape /
      curated WC CSV) and, per Phase 6 below, don't scope writes by
      `competition_id` yet anyway — don't wire this schedule in before Phase
      6 lands, or it becomes another unscoped write to fix twice.

---

## Lucas — manual, in order

### 1. Create the competition — ✅ DONE 2026-08-31
- [x] Name `UEFA Champions League 2026/27`, short label `Champions 26/27`,
      slug `ucl-2026-27`.
- [x] Stage labels replaced with UCL's own (confirmed via screenshot: Liga
      MD1…MD8, Play-off, Round of 16, Quarterfinals, Semifinals, Final).
- [x] `transfer_cap_league` — Lucas set this (value not recorded here; check
      the competitions row if it matters for a later step).
- [x] Left at `status='setup'` — confirmed via SQL query 3 below (only
      `world-cup-2026` visible to non-admins).
- [x] "Por defecto" untouched — confirmed via SQL query 1 below
      (`wc_still_default=1`, `bad_default=0`).

### 2. Run the Phase 4 assertions — ✅ DONE 2026-08-31, all clean
Ran `apps/fantasy/.phase0-baseline/phase4_assertions.sql` (5 queries) against
the live DB. Results:
1. `ucl_rows=1, bad_status=0, bad_default=0, wc_still_default=1` ✅
2. **Trap-2 check** — WC and UCL both show exactly 1 `auction_state` row ✅
   (the trap that breaks the admin panel/`AuctionContext` did not fire)
3. Only `world-cup-2026` (status `archived`) shown as non-`setup` ✅
4. WC counts match `layer1_baseline.txt` exactly: players=1229, matchdays=6,
   teams=12, standings=72, team_players=90 ✅
5. All `competition_id <> 1` counts are 0 — nothing leaked into UCL yet ✅

### 3. Re-run the Layer 1 checksums — ✅ DONE 2026-08-31, byte-identical
Ran both `layer1_checksums_v2.sql` (all 9 tables) and the original
`layer1_checksums.sql` (for comparison) against the live DB.
- v2: byte-identical to `layer1_baseline.txt` on all 9 tables — zero data
  drift on the WC archive.
- Original: the 3 tables with no new columns (`lineups`, `player_stats`,
  `transfers`) matched the baseline checksum exactly; the 6 tables that
  gained `competition_id` (+`phase`/`sequence` on `matchdays`) showed
  different checksums as expected (schema change, not data drift) — row
  counts on those 6 were unchanged from baseline, confirming no row-level
  edits.

### 4. Phase 5 walk-through (admin selector on UCL) — ✅ DONE 2026-09-01
Structural walkthrough of all sections done via screenshots with the admin
selector on UCL: divergence banner correct, Competencias list matches step
1, every list correctly empty (no partidos, no ventanas, no jugadores — "No
se encontraron jugadores. Ejecuta el seed SQL"), bracket/negotiation sections
correctly gated on prerequisites. Found + fixed one bug along the way (see
"Bug found + fixed" above).

**Still not actually done — only the empty forms were viewed, nothing was
submitted:**
- [x] **Create a UCL matchday** — ✅ 2026-09-01, all 8 Liga matchdays created
      via SQL editor (not the admin form — see caveat below), straight from
      `matches_schedule.csv` (deadline = 15 min before each MD's earliest
      kickoff, UTC). Verified: `competition_id=2` on all 8 (not the WC's `1`),
      `sequence` came back exactly `1..8` (061's trigger), `phase='league'`
      explicit on every row (required — the trigger RAISES without it for any
      competition but the WC). SQL + verify query at
      `/tmp/claude-1000/.../scratchpad/create_ucl_matchdays.sql` (scratchpad,
      not in the repo — recreate from this file's git history if needed).
      RLS caveat closed 2026-09-01: created a 9th throwaway matchday ("RLS
      test — delete me") through the real admin UI while logged in as admin
      with the selector on UCL — insert succeeded, confirming RLS lets an
      authenticated admin write `matchdays` for a non-default competition.
      Deleted via SQL editor afterward; 8 Liga matchdays are the only rows
      left for `competition_id=2`.
- [x] **Importar jugadores CSV against UCL in isolation** — ✅ 2026-09-01.
      Imported `players_import.csv` (841 rows) via the real admin importer
      with the selector on UCL: result was **841 jugadores creados, 0
      omitidos, 0 errores** — exact match, no dedup false-positives against
      the (empty) UCL player set.
- [x] **Add a participant** — ✅ 2026-09-01. Added Lucas Stucky to UCL via
      the real admin UI: new team's `budget_remaining=105.0`, and confirmed
      via SQL (`teams` joined to `competitions`) it's genuinely pulled from
      `ucl-2026-27`'s own `budget` column (also 105 — coincidence, Lucas set
      it that way), not the hardcoded `TOTAL_BUDGET` fallback constant. Team
      left in place (empty squad) — legitimate test data, not cleaned up.
- [x] **Upload one `.ods`** — ✅ 2026-09-01. Built a synthetic 2-sheet `.ods`
      (real MD1 fixture AEK Athens 2–1 LASK, 2 real players per side from the
      CSV import) since the season hasn't started — no real Opta data exists
      yet. Uploaded via the real admin UI against Liga MD1: **4/4 filas de
      estadísticas guardadas**, 0 "Player not found" errors, and standings
      recompute correctly skipped Lucas Stucky's team ("no lineup found —
      skipped", expected for an empty squad). Verified via SQL:
      `match_metadata.competition = 'UEFA Champions League 2026/27'` — not
      "FIFA World Cup". Cleaned up afterward: deleted the 4 `player_stats`
      rows + the `match_metadata` row (0 remaining, confirmed); imported
      players and the participant team were left in place.

**Step 4 is now fully done** — structural walkthrough, all 4 write tests
(matchday, RLS-via-UI, participant, `.ods`), and the CSV import all passed.

While the admin selector diverges from the sidebar, the **auction sections are
hidden behind a notice** — expected Phase 4 deferral, not a bug.

### 5. Re-run the Layer 3 capture on the WC — IN PROGRESS 2026-09-01, 1 real bug found + fixed
- [x] Captured 9 of 14 states (dashboard, my-team, market, negotiations,
      auction, leaderboard, bracket, history, rules) with DevTools console open
      and diffed pixel-for-pixel against `layer3_screenshots/`. 8 of 9 matched
      the baseline exactly. **History did not** — see below.
- [ ] Still need: `/my-team` `PointsBreakdownModal`, `/leaderboard`
      `TeamLineupModal`, `/bracket` lineup modal, and `/admin` sections 1–8 /
      9–16 (vs `13_14_admin.pdf`) — not yet re-captured. Do these before
      calling step 5 fully closed; Admin in particular hits query shapes none
      of the 9 captured pages exercised.

**Bug found + fixed:** `/history` showed "Posiciones aún no calculadas para
esta jornada" for Matchday 1 instead of the real per-team table the baseline
had (`09_history.png`). Root cause: migration `061_competition_id_columns.sql`
added composite FKs (`fantasy_standings_team_competition_fkey`,
`team_players_team_competition_fkey`, `auction_bids_player_competition_fkey`)
for the realtime-filter denormalization, but never dropped the original
single-column FKs from migration 001 (`fantasy_standings_team_id_fkey`,
`team_players_team_id_fkey`, `auction_bids_player_id_fkey`). Two FK paths
between the same table pair makes PostgREST reject any embedded-resource
`.select()` naming `teams(...)` from `fantasy_standings`/`team_players`, or
`players(...)` from `auction_bids`, as ambiguous — **HTTP 300**, not data.
Not a UCL-specific bug or part of the 127-site rename; it's been silently
broken since 061 was applied on `main`, affecting the WC too.

Fixed by disambiguating with PostgREST's `table!constraint_name(...)` hint
(no migration, no schema change) in 5 call sites:
- `pages/History.jsx:32` — confirmed broken via the empty MD1 table; confirmed
  fixed, table matches baseline exactly again.
- `hooks/usePlayers.js:54-56` (Market's "Dueño" column) — confirmed broken via
  console (`300` on the `team_players?...teams(...)` request); confirmed fixed,
  Dueño now shows real owner names.
- `context/AuctionContext.jsx:93-97` (`fetchPlayerOwners`, live "already owned"
  detection during an auction) — same shape, not yet exercised live (WC
  auction is over) but same root cause, same fix applied.
- `context/AuctionContext.jsx:80-83` (`fetchBids`) — same root cause via the
  `auction_bids↔players` duplicate FK; not queried by any page in this pass
  (only `proxy_targets`, which is unaffected, backs the visible bid list), same
  fix applied.
- `pages/Admin.jsx:97` (`handleCompleteAuction`'s auto-lineup step, reverse
  embed direction) — would have broken the moment a UCL auction completes;
  same fix applied, not yet re-tested (no auction to complete against).

Verified the constraint names against the live DB via
`SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype='f' AND
conrelid IN ('fantasy_standings'::regclass,'team_players'::regclass,
'auction_bids'::regclass)` — all three plain single-column names matched
before editing. Build passes. **✅ Committed as `c535b2f`** — 4 files
(`History.jsx`, `usePlayers.js`, `AuctionContext.jsx`, `Admin.jsx`).

---

## Claude — dev work left

### Phase 6 — migration `068` (gated on steps 1–5 above)
- [ ] `ALTER COLUMN competition_id DROP DEFAULT` on every table, as a write-path
      tripwire. Numbering shifted by one back in Phase 3, so it is 068, not 067.
      **`069` is now claimed** by the deferred i18n plan
      (`apps/fantasy/I18N_PLAN.md`) for `users.language` — do not take it.
- [ ] Phase 6's real risk sits **outside** `apps/fantasy/src` and is easy to
      miss: `supabase/seed.sql:7,16,21` insert into `matchdays`,
      `auction_state` and `transfer_windows` with no `competition_id`, and
      `apps/polla/scripts/import-matches.mjs` + `sync-schedule.mjs` both write
      to `matches`. All of these break the moment the default is dropped.
- [ ] Exercise every write path in both competitions; anything still writing
      unscoped now fails NOT NULL instead of silently landing in the WC archive.
      One small commit per fix.
- Running this before UCL exists tests nothing. UCL now exists, but step 4's
  write tests still need to happen first — do not start Phase 6 mid-step-4.

### `ucl-2026-27` entry in `competitionCopy.js`
- ⚠️ **Coupled to the deferred i18n plan** (`apps/fantasy/I18N_PLAN.md`, §3):
      that plan restructures this file to **slug × locale**
      (`BY_SLUG[slug][lang]`, with a per-locale `FALLBACK` merge base). Whichever
      project lands second must write the entry in the final shape — otherwise
      the `ucl-2026-27` entry gets written twice. If UCL goes first (the agreed
      order), just be aware the entry will be re-nested one level later.
- [ ] Needs Lucas's input, not code. The slug-keyed copy holds the one thing the
      `competitions` row cannot express: which *fantasy* round rides on which
      *real* UCL stage (Rules calendar table, Rules knockout column, Bracket
      subtitles). Until the 2026/27 format is known, UCL renders neutral
      fallbacks — correct, just vague. Once known this is ~15 lines.

### Deferrals — deliberate, still open
- [ ] Admin auction sections do not follow the admin selector. Would need an
      optional `competitionId` prop on `AuctionProvider`, mounted a second time
      only while diverged.
- [ ] Admins bypass the archived-write guard via the pre-existing "Admins can
      manage all teams" policy — the WC is not truly frozen for an admin.
- [ ] `lib/validation.js` still imports `TOTAL_BUDGET` with no callers; left for
      the post-tournament dead-file cleanup.

---

## Standing note

`pnpm --filter @predictor/fantasy lint` reports **30 errors / 39 warnings** and
**never was clean**. Do not chase it. 19 warnings say `missing dependency: 'db'`
and are safe by construction (`db`'s identity changes only with `competitionId`,
which flips `key` on `LeagueProvider` and remounts every consumer).
