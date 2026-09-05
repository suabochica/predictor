# UCL auction — manual test runbook + teardown

**Written 2026-09-04, after commit `5a3a841`** (*fix(fantasy): Bind admin auction
sections to the admin selector*).

## What this is for

Commit `5a3a841` re-pointed Admin's auction sections at the **admin selector**
instead of the sidebar. That was the last blocker on running a UCL auction, so
this runbook does two jobs at once:

1. **Verify the fix** — the four bugs it closed are all silent (a no-op toggle,
   wrong-competition scoring, sections showing that shouldn't, a cold-load
   TypeError). None of them announce themselves; they have to be looked for.
2. **Exercise the deferred write path.** `apps/fantasy/UCL_TODO.md` deliberately
   deferred the post-068 write test of 8 of the 12 `competition_id` tables to
   "UCL's first real auction". This *is* that test — except it's a dry run, so
   Part D throws the rows away and leaves UCL clean for the real draft.

Migration 068 dropped `DEFAULT 1` from every `competition_id` column, so any
write path that still forgets to stamp it fails loudly with
`null value in column "competition_id"`. **That error is the single most
important thing to watch for in Part B.** If you see it, stop and write down
which button caused it.

---

## Ground rules

- **The World Cup is competition 1 and is a read-only archive.** Every SQL
  statement below resolves the competition by slug, never by a typed id. Do not
  "simplify" them to `= 2`.
- Part B needs **two browser profiles** (or one normal + one private window)
  logged in as two different accounts: your admin, and a real participant.
  Two tabs of the same profile share a session and will not work.
- Run the whole thing in one sitting if you can. Part D (teardown) assumes the
  only auction rows in UCL are the ones you just made.
- Nothing here needs a migration or a deploy. Run against `pnpm dev:fantasy`
  and the live Supabase DB, or against the deployed site — your call, but the
  DB is the same either way, so **the teardown matters regardless**.

---

# Part A — Preconditions (SQL, read-only)

Run these in the Supabase SQL editor before touching the UI.

### A1 · The two competitions resolve

```sql
SELECT id, slug, name, status, is_default, budget, max_squad_size,
       max_participants, min_bid_increment
FROM competitions
ORDER BY sort_order, id;
```

**Expect:** `world-cup-2026` (id 1, `archived`) and `ucl-2026-27` (`setup`).
If the UCL slug is different, change it in every query below — it is the key
this whole runbook hangs on.

### A2 · UCL inventory

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT
  (SELECT count(*) FROM players           WHERE competition_id = (SELECT id FROM c)) AS players,
  (SELECT count(*) FROM players           WHERE competition_id = (SELECT id FROM c)
                                            AND COALESCE(current_price, 0) = 0)      AS players_no_price,
  (SELECT count(*) FROM matchdays         WHERE competition_id = (SELECT id FROM c)) AS matchdays,
  (SELECT count(*) FROM teams             WHERE competition_id = (SELECT id FROM c)) AS teams,
  (SELECT count(*) FROM auction_state     WHERE competition_id = (SELECT id FROM c)) AS auction_state_rows;
```

**Required to proceed:**

| column | required | why |
| --- | --- | --- |
| `players` | **> 0** | a round with no roster tests nothing. Upload the UCL roster first (Admin → *Importar jugadores (CSV)*) |
| `players_no_price` | **0** | `usePlayers` sorts and filters on `current_price`; the CSV import sets it to `price`. Non-zero means something else inserted those rows |
| `matchdays` | ≥ 1 | *Completar subasta* activates the first one |
| `auction_state_rows` | **exactly 1** | `create_competition` seeds it. 0 → Admin bails out with "No se encontró estado de subasta"; 2+ → trap 2 from the UCL plan |

### A3 · The "must be empty" tables

This is the check that makes Part D safe to run. UCL has never held an auction,
so all of these must be **0**. If any is non-zero, stop — you have real data and
the teardown would delete it.

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT
  (SELECT count(*) FROM auction_bids       WHERE competition_id = (SELECT id FROM c)) AS bids,
  (SELECT count(*) FROM team_players       WHERE competition_id = (SELECT id FROM c)) AS team_players,
  (SELECT count(*) FROM fantasy_standings  WHERE competition_id = (SELECT id FROM c)) AS standings,
  (SELECT count(*) FROM proxy_targets      WHERE competition_id = (SELECT id FROM c)) AS pistas,
  (SELECT count(*) FROM knockout_matches   WHERE competition_id = (SELECT id FROM c)) AS knockout,
  (SELECT count(*) FROM negotiation_windows WHERE competition_id = (SELECT id FROM c)) AS neg_windows,
  (SELECT count(*) FROM transfer_windows   WHERE competition_id = (SELECT id FROM c)) AS transfer_windows,
  (SELECT count(*) FROM lineups
     WHERE team_id IN (SELECT id FROM teams WHERE competition_id = (SELECT id FROM c))) AS lineups;
```

**Write this row down.** Part D's verification compares against it.

### A4 · World Cup baseline

```bash
# in psql, or paste the file into the SQL editor
apps/fantasy/.phase0-baseline/layer1_checksums_v2.sql
```

Diff the output against `apps/fantasy/.phase0-baseline/layer1_baseline.txt`.
**It must match before you start** — otherwise you can't tell whether a
mismatch afterwards was you or was already there.

---

# Part B — The test

## B1 · Admin panel, selector = World Cup (regression)

Sidebar competition: **Mundial 2026**. Admin selector (*Administrando*):
**Mundial 2026**.

- [ ] No orange divergence banner.
- [ ] Panel matches `apps/fantasy/.phase0-baseline/13_14_admin.pdf`: status badge
      reads **`completed`**, auction controls present, *Participantes* shows the
      "Subasta completada" note, **Cuadro eliminatorio** and **Negociación de
      traspasos** both render.

This is the regression check for the whole change. If anything moved here, stop.

## B2 · Switch the selector to UEFA Champions League (diverged)

Sidebar stays on **Mundial 2026**. Selector → **UEFA Champions League**.

Before the fix, all of this was hidden behind a "Cambia la competencia de la app"
stub. Now expect:

- [ ] Orange divergence banner still shown, now reading "…aquí abajo **—subasta
      incluida—** afecta a la primera".
- [ ] The "Control de subasta … Cambia la competencia de la app" **stub is gone**.
- [ ] Real auction controls render. Status badge **`pending`**, Ronda **`—`**,
      Duración de ronda = UCL's own value from A1, and the button says
      **"Iniciar subasta"** (not Pausar/Reanudar).
- [ ] *Participantes* shows **no** "Subasta completada" note.
- [ ] **Cuadro eliminatorio** and **Negociación de traspasos** are **gone**
      (they were rendering off the World Cup's `completed` auction).

## B3 · The silent no-op — scoring system

Still diverged (sidebar WC, selector UCL).

- [ ] *Sistema de puntuación* shows UCL's own value, not the World Cup's.
- [ ] Click the **other** option and save.
- [ ] Switch the selector to Mundial 2026 and back to UCL. **The new value
      stuck.** Confirm in SQL:

```sql
SELECT c.slug, a.status, a.current_round, a.scoring_system, a.round_duration_seconds
FROM auction_state a JOIN competitions c ON c.id = a.competition_id
ORDER BY c.id;
```

- [ ] UCL's `scoring_system` changed; **the World Cup's did not.**

Before the fix this UPDATE matched zero rows and reported success. Set it back
to whatever you actually want for UCL before moving on.

## B4 · The cold-load crash

- [ ] With the selector on UCL, **hard-reload** the page (Ctrl+Shift+R).
- [ ] DevTools console is clean. Specifically **no
      `TypeError: Cannot read properties of null (reading 'scoring_system')`**.
- [ ] Network tab shows **no** request containing `competition_id=eq.undefined`
      or `=eq.null`.

This one only ever surfaced on a cold load, which is why it survived review.

## B5 · Two realtime channels, no collision

- [ ] Keep Admin open on UCL. In the **second browser profile**, open
      `/fantasy/auction` (sidebar on the World Cup for now).
- [ ] In each profile: DevTools → Network → WS → the Supabase socket → Messages.
- [ ] Admin's frames join topic **`realtime:auction-admin-<UCL id>`**; the
      participant's join **`realtime:auction-app-1`**. Two distinct topics,
      neither showing a `CHANNEL_ERROR` / `phx_error`.

Both instances used to be called `auction-bids-<id>`; on the same competition
they would silently share a topic.

## B6 · Promote UCL and enrol participants

From here on you are writing real rows.

- [ ] Admin → **Competencias** → set UCL's status from `setup` to **`active`**.
      Participants cannot see a `setup` competition in the sidebar switcher, so
      nothing below works until this is done.
- [ ] Selector on UCL → *Participantes* → **Agregar a la liga** for your admin
      account and at least **one** other real account (two others is better —
      contested rounds need two bidders).
- [ ] Each new row shows `Presupuesto` = UCL's `budget` from A1 (**not** 105.0
      unless that's genuinely UCL's number, and **not** `£NaN` — `£NaN` is trap 1
      from the UCL plan resurfacing).

```sql
SELECT t.id, t.name, t.budget_remaining, t.status, t.auto_bid_enabled
FROM teams t JOIN competitions c ON c.id = t.competition_id
WHERE c.slug = 'ucl-2026-27' ORDER BY t.id;
```

- [ ] No `null value in column "competition_id"` error. (`teams` is one of the
      8 deferred tables.)

## B7 · Participant side — pista

In the participant profile:

- [ ] The sidebar switcher now lists **UEFA Champions League**. Select it.
      (If it doesn't appear, hard-reload — the list is fetched once per session.)
- [ ] `/fantasy/auction` shows the UCL roster with UCL prices.
- [ ] Add 3–5 players to the **Lista de Pujas Automáticas** with max prices, and
      turn the auto-bid toggle **on**.

```sql
SELECT pt.priority, p.name, pt.max_price
FROM proxy_targets pt
  JOIN players p       ON p.id = pt.player_id
  JOIN competitions c  ON c.id = pt.competition_id
WHERE c.slug = 'ucl-2026-27' ORDER BY pt.user_id, pt.priority;
```

- [ ] Rows land with the UCL competition id (`proxy_targets` — deferred table #2).
- [ ] **Their World Cup pista is untouched** — 062 made the priority uniqueness
      per-competition, so priority 1 can exist in both:

```sql
SELECT c.slug, count(*) FROM proxy_targets pt
  JOIN competitions c ON c.id = pt.competition_id GROUP BY c.slug;
```

## B8 · Start a round

Admin, selector on UCL:

- [ ] **Iniciar subasta**. Status badge flips to `active`, Ronda → **1**, the
      timer starts.
- [ ] SQL confirms **only UCL's** `auction_state` moved (re-run B3's query — the
      World Cup row must still read `completed`).
- [ ] The participant's `/fantasy/auction` page reacts **without a reload** —
      that's the realtime binding from B5 doing its job.

## B9 · Bids

- [ ] Participant bids on a player. It appears in Admin's **Pujas en vivo**
      within a second or two.
- [ ] Admin bids on the **same** player from the admin account, higher.
- [ ] Both bid on a **second** player where only one of them bids.
- [ ] Try an illegal bid — below the current high, or above your budget. It is
      refused with a message, not a stack trace.

```sql
SELECT b.round_number, p.name, u.display_name, b.bid_amount, b.is_winning
FROM auction_bids b
  JOIN players p      ON p.id = b.player_id
  JOIN users u        ON u.id = b.user_id
  JOIN competitions c ON c.id = b.competition_id
WHERE c.slug = 'ucl-2026-27' ORDER BY b.round_number, p.name, b.bid_amount DESC;
```

- [ ] Every row carries the UCL competition id (`auction_bids` — deferred #3).
      `place_bid_internal` derives it from the player row server-side, so this
      is the check that that derivation works for a non-WC competition.

## B10 · The 90-second auto-bid ticker

The ticker is the part that changed behaviour: it now follows the **admin
selector**, not the sidebar.

- [ ] Leave Admin open on UCL, sidebar still on the World Cup, and wait past
      **90 seconds** from the round start.
- [ ] Auto-bids appear **for UCL**, from the pista you set in B7, honouring the
      max prices. Nothing at all happens to the World Cup.
- [ ] It fires **once** per round, not on a loop.

## B11 · Resolve

- [x] **Resolver ronda**. Uncontested player is awarded — but only after the fix
      below; the first attempt awarded nothing and said nothing. Round 1 had no
      contested player, so carry-over was proven separately in round 2.
- [x] Winner's *Presupuesto* in *Participantes* drops by exactly the bid.
- [x] `Siguiente ronda` → Ronda 2, and the carried-over player now has a
      **minimum bid above the previous high** on the participant's screen.
- [x] Place one bid in round 2, then use **Terminar ronda** (end early) — the
      timer reads 0 for everyone and bidding stops without resolving.

**Carry-over verified (round 2 → 3).** Erling Haaland, listed £11.0, drew 2 bids
and was correctly flagged *Disputado* / *Contested* on both the admin panel and
the participant's browse page. Resolving round 2 awarded nothing for him (right)
and wrote the `is_carryover` bid into round 3 at the top bid, £11.3 to Sergio
Benítez. Round 3 then shows him on the participant's *My bids* list with the
`↔ R2` badge, *Leading*, and the browse row reads `floor £11.3` — i.e. the next
bid must **exceed** the previous high, not match it. Resolving round 3 with no
rival bid awards him at £11.3, which is the designed end of the carry-over path.
Budgets reconcile exactly: Sergio £105.0 − 9.5 (Lautaro, round 1) = £95.5M, with
*Effective £84.2M* = 95.5 − 11.3 while the bid is active.

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT t.name AS team, p.name AS player, tp.acquisition_price,
       p.price AS list_price, p.current_price
FROM team_players tp
  JOIN teams t   ON t.id = tp.team_id
  JOIN players p ON p.id = tp.player_id
WHERE tp.competition_id = (SELECT id FROM c) ORDER BY t.name, p.name;
```

- [x] `team_players` rows carry the UCL id (deferred #4), `acquisition_price`
      equals the winning bid, and `players.current_price` was rewritten to the
      winning bid (that's expected — Part D resets it).

### B11 caught a real bug (2026-09-05) — fixed and re-verified ✅

Round 1 resolved to **nothing**: the round advanced 1 → 2 with no error, but no
`team_players` row was written, no bid was marked `is_winning`, and no budget
moved. Cause: `resolveRound()`'s own bid fetch still asked for
`players(name, position, price)` — the one embed the c535b2f sweep missed.
Migration 061 gave `auction_bids` a second FK to `players`
(`auction_bids_player_competition_fkey`), so PostgREST rejects the unqualified
embed as ambiguous (HTTP 300). The error was discarded by `?? []`, the loop ran
over zero bids, and `{ errors: [] }` told Admin "nobody bid — safe to advance".
The confirm modal's preview looked right because it reads the provider's `bids`
state, which *was* using the hinted query.

Fixed in `AuctionContext.jsx`: FK hint added, and every discarded read/write
error in `resolveRound()` now lands in `errors` (which blocks the advance)
instead of vanishing. The general lesson for this runbook: these reads
destructure only `data`, so **any `?? []` sitting on a discarded error can turn
a failed query into a confident no-op**. If a step "succeeds" while changing
nothing, suspect that shape first.

The fix was verified against the exact data that failed by rewinding the auction
to round 1 (the four round-1 bids were still intact) and re-resolving:

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
DELETE FROM auction_bids
WHERE competition_id = (SELECT id FROM c) AND round_number > 1;
```

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
UPDATE auction_state
SET current_round = 1,
    round_started_at = now() - make_interval(secs => round_duration_seconds + 1)
WHERE competition_id = (SELECT id FROM c);
```

The expired `round_started_at` is what stops the 90s auto-bid ticker from
refiring and adding bids to the rewound round.

- [x] Reloaded Admin on **localhost** (the fix was uncommitted at the time —
      resolving from the Netlify deploy would have reproduced the no-op),
      **Resolver y siguiente ronda →** awarded all 4.
- [x] Julián Álvarez £10.0, Lamine Yamal £10.0, Vinícius Júnior £9.5 to Lucas
      Stucky; Lautaro Martínez £9.5 to Sergio Benítez.
- [x] Budgets: Lucas £105.0 → **£75.5M** (−29.5), squad 3/15 with the
      *Needs ≥1 GK* warning showing correctly.
- [ ] Re-place the round-2 bids on the contested player and continue at B12.

## B12 · Complete the auction (optional but recommended)

This is the heaviest write path — `auto_complete_squads` + default lineups +
matchday activation. Only do it if you're willing to run the full teardown.

- [x] **Completar subasta**. Expect warnings listing teams under the squad size
      — that's correct for a two-player dry run, not a failure.
- [x] Status badge → `completed`. Admin shows *Subasta completada. No hay más
      acciones disponibles.* **Cuadro eliminatorio** and **Negociación de
      traspasos** now appear for UCL (correctly this time — off UCL's own state).
- [x] The first UCL matchday flips to **activa**.

**Passed 2026-09-05.** `auto_complete_squads` filled both teams to **15/15** and
default lineups were built for both: 11/11 starters, exactly one GK each, 4 on
the bench, a captain assigned, and the header reads **"Lineup for: Liga MD1"** —
the `matchdays.phase` taxonomy naming UCL's league phase instead of falling back
to World Cup group-stage copy. Remaining budgets £23.0M and £12.0M.

**Do not raise the odd-looking formations as a bug.** The default XIs came out
`2-2-6` and `0-8-2` (zero defenders, two DEFs on the bench). That is the
designed output, not a UCL-specific fault: `lib/defaultLineup.js:13` reserves
one GK and then fills the XI with the most expensive **outfielders regardless of
position**, and the only formation rule anywhere in the app — client side and in
migration 049's `save_lineup` guard — is "exactly one GK starts". There is no
min-DEF / max-FWD constraint, and the World Cup behaved the same way.

```sql
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT
  (SELECT count(*) FROM lineups
     WHERE team_id IN (SELECT id FROM teams WHERE competition_id = (SELECT id FROM c))) AS lineups,
  (SELECT count(*) FROM matchdays WHERE competition_id = (SELECT id FROM c) AND is_active) AS active_mds;
```

## B13 · Scoring is scoped (the wrong-numbers bug)

- [x] Selector on UCL, sidebar still on the World Cup. Run **Calcular
      posiciones** for the active UCL matchday.
- [x] It uses **UCL's** `scoring_system` (the one you set in B3), not the World
      Cup's. With no player stats uploaded it should write zeros or refuse —
      either is fine; what matters is where the rows land:

**No stats upload is needed for this step.** `calculateTeamMatchdayPoints`
(`lib/matchday.js:21`) scores a starter with no stats row as 0 rather than
throwing or skipping, and `hasStats` gates only the auto-recompute-after-upload
path (`Admin.jsx:379`), never the manual flow. Zero-point rows prove placement
just as well as real ones — and placement is what the wrong-numbers bug was
about. The cost is that FPL and composite both yield 0, so the numbers alone
can't show which `scoring_system` ran; the *SISTEMA ACTIVO* label above the
preview is what evidences that. This step also exercises the null-lineup
carry-forward-and-stamp path, since B12 wrote its lineups with
`matchday_id: null`.

```sql
SELECT c.slug, count(*) FROM fantasy_standings fs
  JOIN competitions c ON c.id = fs.competition_id GROUP BY c.slug;
```

- [x] Rows appear under `ucl-2026-27` only. **The World Cup count is unchanged
      from A3/A4.**

**Passed 2026-09-05:** `ucl-2026-27` = 2, `world-cup-2026` = 72 (the Phase 0
baseline count). Preview showed *SISTEMA ACTIVO: COMPUESTO (FPL+)* — UCL's own
setting, not the World Cup's FPL — both teams listed with no "no lineup found"
errors, 0 / 0.0 / 0.0.

Cosmetic, not a bug: the *Jornada* dropdown reads "Liga MD1 — Liga MD1" because
the matchday's `name` and `wc_stage` were both given that string at creation.
Nothing reads `wc_stage` for UCL any more (`matchdays.phase` replaced it), so
it is purely a label — worth avoiding when creating the real UCL matchdays.

## B14 · World Cup regression

- [ ] Re-run `apps/fantasy/.phase0-baseline/layer1_checksums_v2.sql` and diff
      against `layer1_baseline.txt`. Every World Cup table identical.
- [ ] Switch the sidebar to Mundial 2026 and click through Dashboard, Mi Equipo,
      Mercado, Clasificación, Bracket, Historial. Nothing changed.

---

# Part C — What to do if something fails

| symptom | what it means |
| --- | --- |
| `null value in column "competition_id"` | a write path still isn't stamping. **Note which button caused it** — this is exactly the tripwire 068 was built for |
| `£NaN` in *Participantes* | trap 1: the `users(teams(...))` embed flipped to an array |
| "No se encontró estado de subasta" for UCL | A2's `auction_state_rows` wasn't 1 |
| Admin auction section shows World Cup data while header says UCL | the fix regressed — check the `AuctionProvider` wrapper in `Admin.jsx` |
| Participant can't see UCL in the switcher | status is still `setup` (B6), or the session cached the old list — hard-reload |

---

# Part D — Teardown

Run **after** you're done testing and **before** the real draft. Everything is
resolved by slug and confined to UCL; no statement can reach competition 1.

## D1 · Level A — wipe the auction, keep the league (recommended)

Deletes every row the dry run created and resets everything it mutated. Keeps
the participants you enrolled in B6, so the real draft starts with the league
already assembled.

```sql
BEGIN;

-- 1. Lineups first — UNSCOPED (no competition_id of their own), reachable only
--    through teams.
DELETE FROM lineups
WHERE team_id IN (SELECT id FROM teams WHERE competition_id
                  = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27'));

DELETE FROM transfers
WHERE team_id IN (SELECT id FROM teams WHERE competition_id
                  = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27'));

-- Also UNSCOPED, reachable only through matchdays. A no-op unless you uploaded
-- stats during the dry run (B13 needs none), but it must be here: player_stats
-- is keyed by matchday_id, not competition_id, so anything uploaded to a UCL
-- matchday would otherwise survive the teardown and land in the real draft's
-- first scoring run. `player_tournament_totals` is a VIEW over this table
-- (migration 043) — it needs no delete of its own and clears with this one.
DELETE FROM player_stats
WHERE matchday_id IN (SELECT id FROM matchdays WHERE competition_id
                      = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27'));

DELETE FROM negotiation_offers
WHERE window_id IN (SELECT id FROM negotiation_windows WHERE competition_id
                    = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27'));

DELETE FROM negotiation_windows
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

DELETE FROM knockout_matches
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

DELETE FROM fantasy_standings
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

DELETE FROM team_players
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

DELETE FROM auction_bids
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

-- Drop the test pistas too. Participants re-enter them before the real draft;
-- leaving stale max prices in place is worse than making them redo it.
DELETE FROM proxy_targets
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

-- 2. Reset the mutated rows.

-- Budgets back to the competition's configured starting budget.
UPDATE teams t
SET budget_remaining = comp.budget,
    auto_bid_enabled = false,
    status           = 'active'
FROM competitions comp
WHERE comp.id = t.competition_id AND comp.slug = 'ucl-2026-27';

-- resolveRound rewrote current_price to the winning bid; the CSV import's
-- invariant is current_price = price.
UPDATE players
SET current_price = price,
    is_eliminated = false
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

-- Auction back to a virgin pending state. scoring_system is left ALONE —
-- set it deliberately in the Admin UI, don't have a teardown script guess.
UPDATE auction_state
SET status           = 'pending',
    current_round    = 0,
    round_started_at = NULL
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

-- B12 activated the first matchday.
UPDATE matchdays
SET is_active    = false,
    is_completed = false
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');

-- Inspect the verification below BEFORE committing.
-- COMMIT;
-- ROLLBACK;
```

Run **D3** while the transaction is still open, then `COMMIT;`.

> Every statement repeats the slug sub-select rather than sharing one CTE (a
> `WITH` binds only to the single statement that follows it). That's deliberate:
> each statement is independently safe to copy out and run on its own.

## D2 · Level B — also remove the test teams

Only if you enrolled accounts you do **not** want in the real league. Run D1
first (it clears everything that references `teams`), then:

```sql
BEGIN;
DELETE FROM teams
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'ucl-2026-27');
-- verify with D3, then:
-- COMMIT;
```

If this errors with a foreign-key violation, something still references those
teams — find it rather than cascading:

```sql
SELECT 'transfers' src, count(*) FROM transfers WHERE team_id IN
  (SELECT id FROM teams WHERE competition_id = (SELECT id FROM competitions WHERE slug='ucl-2026-27'))
UNION ALL SELECT 'fantasy_standings', count(*) FROM fantasy_standings WHERE team_id IN
  (SELECT id FROM teams WHERE competition_id = (SELECT id FROM competitions WHERE slug='ucl-2026-27'))
UNION ALL SELECT 'negotiation_offers', count(*) FROM negotiation_offers WHERE bidder_team_id IN
  (SELECT id FROM teams WHERE competition_id = (SELECT id FROM competitions WHERE slug='ucl-2026-27'));
```

## D3 · Teardown verification

```sql
-- (a) Back to the A3 baseline — every count must be 0.
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT
  (SELECT count(*) FROM auction_bids        WHERE competition_id = (SELECT id FROM c)) AS bids,
  (SELECT count(*) FROM team_players        WHERE competition_id = (SELECT id FROM c)) AS team_players,
  (SELECT count(*) FROM fantasy_standings   WHERE competition_id = (SELECT id FROM c)) AS standings,
  (SELECT count(*) FROM proxy_targets       WHERE competition_id = (SELECT id FROM c)) AS pistas,
  (SELECT count(*) FROM knockout_matches    WHERE competition_id = (SELECT id FROM c)) AS knockout,
  (SELECT count(*) FROM negotiation_windows WHERE competition_id = (SELECT id FROM c)) AS neg_windows,
  (SELECT count(*) FROM lineups
     WHERE team_id IN (SELECT id FROM teams WHERE competition_id = (SELECT id FROM c))) AS lineups,
  (SELECT count(*) FROM player_stats
     WHERE matchday_id IN (SELECT id FROM matchdays WHERE competition_id = (SELECT id FROM c))) AS player_stats;

-- (b) Auction state is virgin; the World Cup row is untouched.
SELECT c.slug, a.status, a.current_round, a.round_started_at, a.scoring_system
FROM auction_state a JOIN competitions c ON c.id = a.competition_id ORDER BY c.id;

-- (c) Every UCL player is back at list price, nobody eliminated.
WITH c AS (SELECT id FROM competitions WHERE slug = 'ucl-2026-27')
SELECT count(*) FILTER (WHERE current_price <> price) AS wrong_price,
       count(*) FILTER (WHERE is_eliminated)          AS eliminated
FROM players WHERE competition_id = (SELECT id FROM c);

-- (d) Budgets are full.
SELECT t.name, t.budget_remaining, comp.budget AS should_be
FROM teams t JOIN competitions comp ON comp.id = t.competition_id
WHERE comp.slug = 'ucl-2026-27' AND t.budget_remaining <> comp.budget;
```

- (a) all zeros, matching what you wrote down at A3. `player_stats` is the one
  column A3 didn't capture (it was added to the teardown later) — it must be 0
  regardless, since UCL has never had a stats upload
- (b) UCL `pending` / `0` / `NULL`; World Cup still `completed`
- (c) both columns 0
- (d) **no rows**

Then re-run `layer1_checksums_v2.sql` one last time and diff against
`layer1_baseline.txt`. The World Cup must be byte-identical to where it started.

---

# Part E — Starting the real game

After a green Part D:

1. **UCL status stays `active`** — you set it in B6 and the real draft needs it.
2. **Roster**: confirm the final UCL player list is loaded and priced
   (re-run A2; `players_no_price` must be 0).
3. **Matchdays**: create the real ones, with the right *Tipo de jornada*
   (`league` vs `knockout`) — 061's trigger refuses to guess for a non-WC
   competition.
4. **Auction config**: set `Duración de ronda` and *Sistema de puntuación* on
   the UCL `auction_state` deliberately (B3 proved the toggle now persists).
5. **Participants**: enrol the real managers; check every budget reads UCL's
   number and none reads `£NaN`.
6. **Pistas**: tell participants to re-enter their auto-bid lists — D1 deleted
   the test ones.
7. **Iniciar subasta.**

---

## Known gaps this runbook does not cover

- `set_teams_eliminated` (`Admin.jsx`, migration 053) takes team ids with **no
  competition argument** and never validates they belong to one competition.
  Reached from the knockout section, so it matters for UCL later — deliberately
  out of scope for the auction fix.
- Transfers and negotiations on UCL. Those are the remaining half of the
  deferred 8-table write-path exercise; they get their real test at UCL's first
  transfer window.
- Admins still bypass the archived-write guard on the World Cup via the
  pre-existing "Admins can manage all teams" policy (pre-existing, deliberate).
