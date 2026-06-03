# Schedule → Matchday Sync + WC Round-Structure Fix — Plan & Rationale

## Why this work exists

Fantasy transfer/lineup windows are now derived from real match **kickoff times**
(`matches.match_date`) keyed by `matches.matchday_id` (see
`apps/fantasy/src/context/LeagueContext.jsx`). But every row in the live `matches`
table has `matchday_id = NULL`, so no window can resolve. The user added
`apps/fantasy/data/csv/fifa_world_cup_2026_schedule.csv` (authoritative schedule, with a
`matchday` column) to attach matchdays and correct kickoff times.

Separately, the fantasy round mapping changed and must be corrected everywhere.

### New fantasy ↔ WC mapping (canonical)

| Fantasy stage           | WC stage          | `matches.stage` | `matchdays.wc_stage` |
|-------------------------|-------------------|-----------------|----------------------|
| Round-robin MD1/MD2/MD3 | Group Stage       | `group`         | `Group Stage MD1/2/3`|
| Fantasy Quarter-finals  | Round of 32       | `round_of_32`   | `Round of 32`        |
| Fantasy Semi-finals     | Round of 16       | `round_of_16`   | `Round of 16`        |
| Fantasy Final           | WC Quarter-finals | `quarterfinal`  | `Quarter-finals`     |
| (off-season, no fantasy)| Semis / 3rd / Final | `semifinal`/`third_place`/`final` | — (matchday_id NULL) |

The OLD code assumed the round-robin **included** the Round of 32 (i.e. **4** league
matchdays). It must become **3** group matchdays, with R32/R16/WC-QF as the three
knockout matchdays.

## Key facts discovered (from the DB export `apps/fantasy/data/csv/matches_rows.csv`)

1. **All 104 matches already exist** in the DB (`M01`–`M104`), including knockout rows
   (teams `= 'TBD'`, `stage` already correct). Nothing needs to be inserted — we only set
   `matchday_id` and fix `match_date`.
2. **`match_code` ≠ CSV `Match_Number`.** e.g. DB `M08` = Qatar–Switzerland, which is CSV
   row 5. So a numeric join is impossible.
3. **Group-stage times are correct for 8 of 12 groups** (A, B, E, F, H, J, K, L) but
   **wrong for groups C, D, G, I** — those DB kickoff times do not equal the CSV's
   Eastern time. (Discovered in a dry run: a `(group_name, kickoff-instant)` join matched
   only 48/72 group rows.)
4. **Knockout DB times are placeholders** and unreliable; knockout `team_a/team_b` are
   `TBD`. Per-stage counts line up exactly for a sorted zip: R32 16/16, R16 8/8, QF 4/4,
   SF 2/2, 3rd 1/1, Final 1/1.

## Intended join logic (and why)

Because times are partly wrong (that's what we're fixing) and `match_code` doesn't align,
the join must be **time-independent**:

- **Group rows (real teams):** join CSV → DB by the **unordered team pair**
  (each pairing occurs exactly once in the group stage, so it's a perfect key). This needs
  a CSV-full-name → DB-3-letter-code map (e.g. `South Korea→KOR`, `Czech Republic→CZE`,
  `DR Congo→COD`, `Ivory Coast→CIV`, `United States→USA`). Then set `matchday_id` from the
  CSV `matchday` (1/2/3) and overwrite `match_date` from the CSV.
  > Note: the originally-coded `(group_name, instant)` join was abandoned precisely because
  > it presupposes the DB times are already correct — false for groups C/D/G/I.

- **Knockout rows (TBD teams):** identity is meaningless until teams resolve, and all rows
  of a stage share one fantasy matchday, so pair **per stage by sorted chronological
  order** (a zip). This yields the correct *set* of kickoff times per matchday — all the
  window math needs. `matchday_id` comes from the DB `stage`
  (`round_of_32`→`Round of 32`, `round_of_16`→`Round of 16`, `quarterfinal`→`Quarter-finals`;
  `semifinal`/`third_place`/`final`→`NULL`).

- **Timezone:** the CSV `Time_ET` column is US Eastern; all of Jun–Jul 2026 is EDT
  (`-04:00`), with no DST boundary. Instant = `YYYY-MM-DDTHH:MM:00-04:00`.

## Intended changes

### A. Sync script — `apps/polla/scripts/sync-schedule.mjs` (+ `pnpm sync-schedule`)
Reuses the `import-matches.mjs` env/service-role pattern. Loads matchdays, validates the 6
required `wc_stage` labels exist (fail loudly otherwise), then writes `matchday_id` +
`match_date` per the join logic above. Idempotent. Prints a summary + any unmatched rows.

### B. Matchdays normalization
- **Migration `031_normalize_fantasy_matchdays.sql`** — removes the obsolete WC
  `Semi-finals` matchday (clearing FK references first) so the table holds exactly the 6
  fantasy matchdays.
- **`supabase/seed.sql`** — fresh-DB parity: 6 matchdays with the exact `wc_stage` labels
  the script keys off; transfer_windows caps set to 5 (display-only; authoritative caps live
  in `constants.js`).

### C. Round-structure code (4 → 3 league matchdays)
- **`apps/fantasy/src/pages/Standings.jsx`** — league stage = the 3 group matchdays:
  `filter(wc_stage includes 'group')`, `length >= 3`, a derived `groupMatchdays.slice(0,3)`;
  per-matchday columns use 3 (grid `repeat(3,…)`, `[1,2,3]`); "Matchdays X / 6" denominator.
  (Also fixes a latent bug: the old `!includes('knockout')` filter matched *every* matchday.)
- **`apps/fantasy/src/pages/Admin.jsx`** — `WINDOW_DEFAULTS`/`EMPTY_TW_FORM` relabeled to the
  new mapping (knockout cap 5); "league stage (4 matchdays)" → "(3 matchdays)".
- **No change needed:** `LeagueContext.jsx` (caps via `includes('group')`), `Bracket.jsx`
  (already "3 matchdays" with correct WC subtitles), `lib/brackets.js` (rank-based),
  `hooks/useStandings.js`.

## Verification (intended)
1. Apply migration 031; confirm exactly the 6 `wc_stage` labels remain.
2. `cd apps/polla && SUPABASE_SERVICE_ROLE_KEY=… pnpm sync-schedule` → group 72/72,
   knockout R32 16 / R16 8 / QF 4, no unmatched. Re-run → identical (idempotent).
3. DB: `select count(*) from matches where matchday_id is not null` → 100.
4. App: Standings shows 3 MD columns + "/ 6"; "League stage complete" appears once all 3
   group matchdays are completed; LeagueContext resolves windows from the populated kickoffs.

## Open item (must resolve before the script is correct)
The group join must switch from `(group_name, instant)` to the **team-pair** key with a
verified full-name → 3-letter-code mapping (groups C/D/G/I exposed the time-dependency
flaw). Knockout sorted-zip + counts already validated.
