# ES/EN language selector — side plan

> **Status: IN PROGRESS — Phase 0 done 2026-09-02.** `UCL_TODO.md` was closed
> out the same day (H2H group-stage Phase A6), which is what unblocked this.
> Phase 0 (migration `069`, `packages/i18n` skeleton, `lang` in both
> middlewares + `<html lang>` everywhere, `LangProvider` mounted in
> `App.jsx`) is invisible by design — nothing renders differently yet.
> Phases 1–6 remain. **Do this one phase at a time; do not try to do the
> whole plan in one sitting** (~45–65 h total, see "Effort and the one-go
> call" below).
>
> Lives here (`apps/fantasy/I18N_PLAN.md`) alongside `UCL_TODO.md` so it is
> reachable from the repo.
>
> **To resume:** read this file top to bottom (the "Phases" section has the
> per-phase checklist), then start at Phase 1. All decisions in the table
> below are already settled with the user.

## Context

The three apps (`gateway`, `polla`, `fantasy`) are written in hardcoded Spanish
throughout — roughly **720 distinct strings / 3,300 words** — with no i18n
library installed anywhere. The user wants an ES/EN toggle: Spanish stays the
default, English is added alongside, and the whole UI switches.

This is a **side project around the in-flight UCL second-competition work**
(`apps/fantasy/UCL_TODO.md`). The user's actual question was whether it can be
done without compromising that plan. It can — on the sequencing condition below,
and with one shared file (`competitionCopy.js`) whose shape both projects touch.

### Decisions taken with the user (do not re-litigate)

| Decision | Choice |
|---|---|
| Surfaces | **All four**: fantasy player pages, fantasy admin panel, gateway, polla |
| Default language | **ES**; EN added alongside |
| Persistence | **`users` table column**, mirroring `066_users_active_competition.sql` |
| DB-stored Spanish | **Left as-is** — competition names, stage labels, matchday names, group names, SQL `RAISE` messages |
| Sequencing | **Finish UCL completely first**, then start i18n |
| Prose-heavy pages | **Parallel locale components**, not key extraction |
| English copy | **Claude writes all of it**; user reviews a short flagged list |

---

## Sequencing — why UCL finishes first

The UCL plan's pending verification (`UCL_TODO.md` item 5) compares the World Cup
UI against a baseline that is **12 screenshots + one admin PDF** in
`apps/fantasy/.phase0-baseline/`. A language switcher changes the header and
sidebar chrome on every one of those shots, and any reworded string breaks the
comparison outright. The `innerText` text-diff baseline the method doc describes
(`layer3_baseline.jsonl`) **was never actually captured**, so those screenshots
are the only surviving artifact.

So: create UCL → run the assertions → walk the admin panel → ship Phase 6's
migration `068` → re-capture the WC baseline → **then** Phase 0 below.

**Two hard couplings to record in `UCL_TODO.md` before starting:**
1. **Migration numbering** — `068` is reserved for the UCL tripwire. This plan
   claims **`069`**.
2. **`competitionCopy.js` gets a locale axis** (§3). The UCL plan still owes a
   `ucl-2026-27` entry in that file. Whichever lands second must use the final
   shape, or that entry gets written twice.

---

## Verified constraints

**All three apps are one browser origin in production.**
`apps/gateway/netlify.toml:12-15` rewrites `/polla/*` to the separate polla
Netlify site with `status = 200` — a server-side proxy, not a redirect — and
Netlify forwards the `Cookie` header through. Fantasy is served from the same
domain. **Proof this works: the Supabase session cookie already crosses this
boundary** and `apps/polla/src/middleware.ts` reads it server-side. One `path=/`
cookie is therefore readable by all three. In local dev the same holds for a
different reason — cookies ignore port, so `:4321`/`:4322`/`:4323` share a jar.

**Workspace packages are consumed as raw source.** `packages/supabase` and
`packages/ui` both point `main` at `./src/index.ts` with no build script, and
`apps/fantasy/vite.config.js` lists them in `optimizeDeps.exclude`. A new
`.ts`-source package works in Vite and both Astro apps with **zero build step** —
this is what makes a hand-rolled catalogue safe.

**The SSR/CSR split is the crux.** `polla` and `gateway` render Spanish
server-side; `polla/src/pages/predictions.astro` ships `<h1>Predicciones</h1>` in
the SSR template and both layouts hardcode `<html lang="es">`. localStorage is
invisible to SSR — hence a cookie, not localStorage.

**`packages/ui` components are prop-driven and render statically inside Astro**
(`Header.tsx` takes 9 props; neither layout uses a `client:` directive). They take
**label props**, never a hook — a hook would force a React provider into Astro
islands that have none.

**There is a precedent to copy for the client provider.**
`apps/fantasy/src/context/CompetitionContext.jsx` already implements this shape:
query-param override (line 27), a durable store, resolution once per user behind
a `resolvedFor` ref (lines 48-51), and an **optimistic non-blocking write-through**
to `users` the UI never awaits (lines 141-157). Mirror it.

### Risks that turned out not to exist
- No **accented** Spanish literal is used in a logic comparison anywhere
  (`===`/`!==`/`.includes`/`.startsWith` → 0 hits). Unaccented ones do exist —
  see risk A, which is the single most dangerous item in this plan.
- Position codes are English enums (`constants.js:8` `['GK','DEF','MID','FWD']`),
  and every comparison across `MyTeam`, `Market`, `Auction`, `AuctionContext`,
  `defaultLineup.js` uses those codes.
- `config/constants.js` holds zero strings — all numeric/enum.

### Pre-existing inconsistencies fixed in passing
- `apps/fantasy/index.html:2` says `lang="en"` while every string in it is
  Spanish.
- The app is **already mixed-language**: `AuctionContext.jsx:377,389` and ~12
  sites in `Admin.jsx` show English errors to users today.
- `packages/ui/src/components/Footer.tsx:19,23` hardcode `Mundial 2026 • 11 de
  junio – 19 de julio de 2026` and a Spanish `LAST_UPDATED` — WC-specific copy in
  the *shared* package, and a UCL bug too (wrong the moment UCL goes live). Store
  ISO dates, format at render.
- Date formatting is inconsistent: polla hardcodes `'es-ES'` (4 sites), fantasy
  passes no locale at all (13 sites).

---

## Design

### 1. Mechanism — hand-rolled catalogue in a new `packages/i18n`

The same strings must resolve in **four runtimes**: the Vite SPA, two Astro SSR
frontmatters, and prop-driven React components rendered statically inside Astro.

- **react-i18next** needs an `init()` singleton per runtime. Under Astro SSR that
  singleton lives in a Netlify Function reused across requests, so
  `changeLanguage()` on request A can bleed into request B. Avoiding that means
  per-request instances plus provider plumbing into every island.
- **Astro's built-in i18n** is routing-based (`/en/predictions`), exists only
  inside Astro so fantasy gets nothing, and collides with `base: '/polla/'`.
- **typesafe-i18n** adds codegen to three build targets, and fantasy is `.jsx` so
  most of the type payoff evaporates.

A `t()` over a nested object is ~40 lines, no init, no async, no build step,
identical in Node and browser. Both catalogues ship eagerly (≈60–90 KB raw for
~700 keys × 2 locales — smaller than the icon set), so there's no loading flash
and no split-chunk surprise in either bundler.

```
packages/i18n/
  package.json     name @predictor/i18n; main ./src/index.ts
                   exports { ".": "./src/index.ts", "./react": "./src/react.tsx" }
                   no dependencies; react as peerDependency only
  src/config.ts    LOCALES=['es','en'], DEFAULT_LOCALE='es',
                   COOKIE_NAME='predictor.lang', isLocale(), localeTag()
  src/translate.ts createT(lang) → { t, tPlural }
  src/format.ts    date/time/number presets
  src/resolve.ts   parseCookieHeader, fromAcceptLanguage,
                   resolveServerLang, resolveClientLang, writeLangCookie
  src/react.tsx    LangProvider / useLang / useT     (separate entry)
  src/catalogs/{es,en}/{common,gateway,polla,fantasy,admin}.ts
```

`index.ts` must **not** re-export `./react` — the Astro middlewares import from
`.` and run in a Netlify Function with no React; leaking that entry drags
`react`/`react-dom` into the cold path.

Catalogues are `.ts`, not `.json`: they take comments (`// matches DB enum — label
only`), take `as const`, and dodge JSON-import-attribute friction between Vite and
Astro.

**Placement — a new package, not inside `supabase` or `ui`.** Not `supabase`:
the middlewares and `.astro` frontmatter need `createT` without pulling
`@supabase/supabase-js`. Not `ui`: the dependency direction is wrong —
`Header`/`Footer`/`LoginForm` all contain copy, so `ui` *depends on* i18n, and
putting it there would force `apps/polla/src/middleware.ts` to import a React
component package. `packages/i18n` sits at the bottom of the graph next to
`@predictor/types`; `pnpm-workspace.yaml` already globs `packages/*`.

**Keys:** `namespace.section.leaf` — `fantasy.rules.calendar.intro`,
`admin.matchdays.deadlineColumn`, `common.nav.standings`. `t()` walks the dotted
path, falls back to the ES catalogue, then returns the key itself (visible, never
crashes) — and `console.warn`s on fallback when `import.meta.env.DEV`. **That
warning is the completeness audit for every phase.**

**Interpolation** is `{name}` placeholders via `String.replace`.
**Plurals** are `tPlural(key, n)` → `Intl.PluralRules` → `key.one`/`key.other`.
This replaces the **16 ad-hoc sites** that inline Spanish morphology —
`Auction.jsx:241,272,483`, `Negotiations.jsx:212`, and 8 in `Admin.jsx`, of which
`Admin.jsx:2903` chains three agreements in one sentence.

### 2. Prose pages — parallel locale components

Per the user's decision, the three prose-dense files do **not** get key
extraction: `Rules.jsx` (830 words), `gateway/src/pages/index.astro` (the
Premiación block), `polla/src/pages/rules.astro` (177 words). Each becomes
`X.es` / `X.en` picked by locale, sharing one data/props hook so numbers and
competition values are computed once.

This also disposes of the rich-text problem: those files are wall-to-wall
`<strong className="text-primary">` mid-sentence, and writing each language's
prose as prose keeps the markup where it belongs instead of inventing a
marker-splitting helper. Everything outside these three files is plain enough for
ordinary keys.

### 3. `competitionCopy.js` × locale — the crux

`apps/fantasy/src/config/competitionCopy.js` is a second copy-resolution layer
keyed by **competition slug**; i18n is keyed by **locale**. They compose as
**slug × locale, locale nested inside slug**, and the file stays where it is:

```js
BY_SLUG = { 'world-cup-2026': { es: {…}, en: {…} } }
FALLBACK = { es: {…}, en: {…} }
competitionCopy(competition, lang) →
  { ...FALLBACK[lang], ...(BY_SLUG[competition?.slug]?.[lang] ?? {}) }
```

46 lines → ~90, mechanical. Call sites `Bracket.jsx:7,160` and `Rules.jsx:3,24`
take a `lang` argument.

**Why locale nests inside slug:** `calendarRows`, `knockoutRealStages` and
`bracketSubtitles` are *facts about a real tournament*, not generic copy. Keeping
them under `'world-cup-2026'` means adding UCL later is one entry in one file;
hoisting them into the locale catalogues would scatter one tournament's facts
across two files in another package and make "add a competition" a four-file
edit.

Because `FALLBACK[lang]` is the merge base, a slug entry missing its `en` twin
degrades to **neutral English** ("the tournament") — never to Spanish stranded
inside an English sentence.

**The possessive.** `Rules.jsx:65` reads `La fantasy sigue el calendario
{copy.tournamentPossessive}` — Spanish glues article+preposition into the noun
phrase (`del Mundial`); English puts an attributive noun before the head (`the
World Cup calendar`). No shared template produces both. Parallel locale
components solve it directly: **each locale's component writes its own sentence,
and the slug×locale table supplies the noun phrase in the form that language
needs** — `tournament` (`el Mundial` / `the World Cup`) and `tournamentOf`
(`del Mundial` / `World Cup`). Same for `Rules.jsx:68,78,83,271,340`.

Note `calendarRows` and `bracketSubtitles` are **hardcoded app copy, so they
translate** ("Dieciseisavos de final del Mundial" → "World Cup round of 32").
Contrast `competitions.stage_labels`, which comes from the DB and does not.

### 4. Persistence, precedence, toggle

Migration **`069_users_language.sql`**, modelled line-for-line on `066` including
its comment explaining why no RLS work is needed:

```sql
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'es'
  CHECK (language IN ('es','en'));
```

`036_users_rls.sql`'s `users_update_self` already grants the write, and
`auth-context.tsx:52` does `select('*')` so the column lands in `profile` free.
Add `language: 'es' | 'en'` to `UserProfile` at
`packages/supabase/src/auth-context.tsx:5-12`.

**Precedence, highest first:** `?lang=` query param → `predictor.lang` cookie →
`profile.language` → `Accept-Language` (SSR) / `navigator.language` (client) →
`'es'`.

Cookie sits **above** the DB column deliberately: it means the two SSR apps never
need a DB round-trip to pick a language.

**Reconciliation is one rule** — *cookie present wins; cookie absent adopts the
DB*. Once `AuthProvider` resolves `profile`: if the cookie was absent, adopt
`profile.language` (write the cookie; in the Astro apps that's one soft reload,
guarded by a `resolvedFor` ref as in `CompetitionContext.jsx:48-51`); if present,
it wins and is written back to the DB. New device gets your preference; current
device never flickers.

**No localStorage.** The cookie does everything localStorage would *and* is
visible to SSR. A second client store is one more thing to desync. This diverges
from `CompetitionContext`, which predates any SSR requirement — say so in a
comment.

**Cookie:** `path=/` (never `/polla/`), `SameSite=Lax`, `Max-Age=31536000`, **not
HttpOnly** — the client must read and write it.

**`Astro.locals.lang`** is set in both middlewares **above the `PUBLIC_PATHS`
early return** — `/login`, `/register` and `/polla/register` are public and still
need translating. Read query param → cookie → `Accept-Language` → `'es'`,
validate with `isLocale`, assign, and if it came from the query param write the
cookie. Then the existing Supabase block runs unchanged. `App.Locals` gains
`lang` in both `env.d.ts` files; both layouts render `<html lang={Astro.locals.lang}>`.

> Deliberately rejected: adding `language` to the middlewares' existing
> `select('display_name, is_admin')`. It would work and cost no round-trip, but it
> creates a *second* server-side precedence path that can drift from the cookie.
> One source, one rule.

**Islands take `lang` as a prop** — `<PredictionForm client:load lang={lang} …>`
— and call `createT(lang)` themselves. Not context, not a cookie read on mount:
islands hydrate independently, and an effect-based cookie read would log a React
19 hydration mismatch and flash Spanish on first paint of every island. Props make
client and server render match by construction.

**Fantasy provider order** (`App.jsx:89-101`): `BrowserRouter > AuthProvider >
LangProvider > CompetitionProvider` — inside `AuthProvider` because it reads
`profile`, outside `CompetitionProvider` because `competitionCopy` consumers need
`lang`.

**Switcher UI — one component, two modes**, in
`packages/ui/src/components/Header.tsx`, which all three apps already render:
- **Astro (SSR)**: plain `<a href="?lang=en">` anchors. The middleware sets the
  cookie and the page returns translated — zero JS, zero hydration risk, and it
  reuses precedence rule #1. Build the hrefs from `Astro.url` so other query
  params survive. This matters because `Header` is rendered *without* a `client:*`
  directive, so anchors are the only option that doesn't force hydration.
- **Fantasy (SPA)**: buttons calling `onLangChange` → write cookie → set
  `document.documentElement.lang` → state update → fire-and-forget `users` update
  in the shape of `CompetitionContext.jsx:141-147`. **No reload.**

Optional second slot in fantasy: under the competition `<select>` at
`Sidebar.jsx:41-58`, mirrored at `MobileNav.jsx:76-92`.

### 5. Dates and numbers

`packages/i18n/src/format.ts`, with `localeTag('es')='es-ES'` and
`localeTag('en')=`**`'en-GB'`**. en-GB, not en-US — it keeps 24-hour time and
day-before-month, so an English reader in this league sees the same *shape* of
timestamp as everyone else. Deliberate call; flag it.

Presets named to match the existing option bags so replacement is mechanical:
`formatDateLong` (`PredictionForm.tsx:38`, `AdminTable.tsx:49`), `formatTime`
(`PredictionForm.tsx:47`, `AdminTable.tsx:58`), `formatDateTimeShort`
(`Admin.jsx:2166,2236` plus the bare `toLocaleString()` at `Negotiations.jsx:151,368`,
`Dashboard.jsx:91`, `Market.jsx:360`, `Admin.jsx:3015,3018,3112,3669`),
`formatDate` (`Negotiations.jsx:396`, `Market.jsx:688`), `formatClock`
(`Admin.jsx:1770`).

Plus **`formatDecimal`**, easily missed: `Rules.jsx:5`'s `money()` renders `0.3`
as `0,3`. The decimal comma is Spanish-only; EN must keep `0.3`.

---

## Phases

Each phase is independently shippable — the fallback chain renders Spanish for
anything untranslated, so partial completion is never broken, only unfinished.

**Phase 0 — Foundation (invisible) · 3–4 h.** Migration `069`;
`UserProfile.language`; `packages/i18n` skeleton with the ES `common` catalogue
and an empty EN; `lang` in both middlewares + both `env.d.ts`; `<html lang>` in
both layouts and `apps/fantasy/index.html`; `LangProvider` into `App.jsx`.

**Phase 1 — Switcher + `packages/ui` + all of gateway · 4–6 h.** Dual-mode
switcher in `Header.tsx`; translate `Header`, `Footer` (including the WC-specific
line), `LoginForm`; then the entire ~285-line gateway app, with `index.astro`'s
Premiación block as parallel locale components. **All architectural risk is spent
by the end of this phase.**

**Phase 2 — polla · 5–7 h.** Five `.astro` pages, `Sidebar.astro`, and the four
islands — `PredictionForm.tsx` (740, incl. `STAGE_LABELS:94-101` and both
`'es-ES'` sites), `KnockoutAdmin.tsx` (582, incl. `STAGES:29-36`),
`AdminTable.tsx` (444), `LeaderboardTable.tsx` (148). `rules.astro` as parallel
components. Every island gains a `lang` prop.

**Phase 3 — fantasy chrome + small pages · 4–6 h.** `Sidebar`, `MobileNav`,
`Layout`, `CompetitionGate` (`CompetitionContext.jsx:172,181`), `App.jsx:31`'s
`Cargando…`, `NotFound`, `Dashboard`, `Leaderboard`, `PointsBreakdownModal`,
`lib/statColumns.js`, and **`FilterBar.jsx` including the `'Todos'` sentinel fix
(risk A)**.

**Phase 4 — fantasy player pages · 10–14 h.** `MyTeam`, `Auction`, `Market`,
`Negotiations`, `History`, `Bracket`, plus `PlayerRow`, `BenchList`, `PlayerSlot`,
`AuctionPlayerRow`, `AuctionTimer`, `TeamLineupModal`. The remaining date helpers
land here. Read every `setError`/`throw` by hand — those strings live inside `{}`
and are undercounted by JSX-text greps.

**Phase 5 — `Rules.jsx` + `competitionCopy.js` · 6–8 h.** Parallel
`Rules.es`/`Rules.en` sharing one data hook, the slug × locale restructure, the
possessive rewrites, `COMPOSITE_STAT_LABELS:8-20`, the scoring tables.

**Phase 6 — `Admin.jsx` · 12–18 h.** 3,676 lines, 18 sections. Deliberately last:
admin-only, highest volume, and the file all three UCL Phase-5 commits touched.
**One `<Section>` per commit** so `git diff --stat` stays small.

**Phase 7 (optional, out of scope by decision) — SQL error messages.** 41 Spanish
strings returned by RPCs (`063:115,212,222,…`, `064:51,63,…`, `067:59-85`) reach
the UI verbatim via `Market.jsx:246`, `MyTeam.jsx:454`, `useNegotiation.js:210,217`.
A client-side Spanish-string → key map is ~2 h if English mode showing Spanish
errors turns out to grate; rewriting ~10 plpgsql functions to return error codes
is a day plus regression risk and is **not** recommended.

### Effort and the one-go call

**~45–65 h total. Do not do it in one go.** Phases 0–3 (~12–18 h) ship a complete,
honest toggle across the login flow, the dashboard, all of polla, and fantasy's
whole navigation surface — everything a new user touches in their first five
minutes. Phases 4–6 are grind with no design decisions left. If the motivation is
one English-speaking person joining the league, **Phases 0–4 are the real finish
line** and Phase 6 can stay open indefinitely.

---

## Verification

**Reusable toolkit:**
- `pnpm build` at root — the cross-app regression gate.
- `pnpm --filter @predictor/polla test` (Jest exists at `apps/polla/jest.config.js`).
- `pnpm --filter @predictor/fantasy lint` — compare to the **30 errors / 39
  warnings** baseline only. It never was clean; do not chase zero.
- **Missing-key audit** (more reliable than grepping): load each page at
  `?lang=en` with the console open; `createT`'s dev warn-on-fallback must be
  silent.
- **Leftover-Spanish tripwire:** `grep -rEn '[áéíóúñ¿¡]' <dir> --include='*.astro'
  --include='*.tsx' --include='*.jsx'`. Noisy but cheap.
- **SSR check:** `curl -s -H 'Cookie: predictor.lang=en' <url> | grep -E '<html lang|<h1'`
  — confirms the *first byte* is right, not corrected after hydration.
- **Catalogue parity:** dev-only ES/EN key-set walk in `catalogs/index.ts`.

**Phase-specific:**
- **Phase 0** — `curl` both with and without the cookie on `/login` → `en` / `es`.
  `?lang=en` on polla sets `predictor.lang` on path `/`. `select id, language from
  users` → all `'es'`.
- **Phase 1** — toggle on `/login`, then navigate gateway → `/polla/` →
  `/fantasy/` and confirm the language holds. **This is the cookie-crosses-the-
  Netlify-proxy proof and the single most important check in the plan.**
- **Phase 2** — a kickoff timestamp reads `Sat 13 Jun 2026, 15:00 GMT`, not
  `sábado, 13 de junio…`.
- **Phase 3** — toggle in fantasy flips instantly with **no reload**;
  `document.documentElement.lang` follows; sidebar and `MobileNav` still fit at
  375 px.
- **Phase 4** — place a bid, save a lineup, open a negotiation in EN and confirm
  the error copy is translated.
- **Phase 5** — read `/rules` end to end in both languages; then point at a
  competition slug with **no** `BY_SLUG` entry and confirm the fallback says "the
  tournament", never "del torneo".
- **Phase 6** — per section: exercise the mutation in EN and confirm the DB
  round-trip stores the same value it did in ES.
- **Cross-device, once at Phase 1** — toggle to EN, open a private window, log in,
  confirm EN loads from the DB column with no cookie present.

---

## Risks

**A. Spanish strings used as identifiers, not copy. The most dangerous item here
— and invisible to an accent-based grep.**
- `apps/fantasy/src/components/market/FilterBar.jsx:15,17,33,35` — **`'Todos'` is
  simultaneously the rendered label and the filter sentinel.** Translating the
  label silently breaks both the position and country filters. Fix in Phase 3:
  the sentinel becomes `''`/`null` in state; `'Todos'`/`'All'` becomes
  render-only.
- `Admin.jsx:1143` — `match.match_label === 'Final'` compares a **DB value**.
  Never translate.
- `Admin.jsx:2163` — `md.phase === 'knockout' ? 'Eliminatoria' : 'Liga'`: the
  condition is an enum (safe), the two outputs are copy (translate).
- `PredictionForm.tsx:94-101`, `KnockoutAdmin.tsx:29-36` — keyed by DB enum with
  copy values: translate values, never keys.
- `PredictionForm.tsx:103`, `AdminTable.tsx:332` — `group_name` is DB Spanish
  ("Grupo A"). Untranslated by decision.
- `Admin.jsx:296,3276,3502` — `stage_labels`/`WC_STAGES` feed `create_competition`.
  Form *labels* translate; the *values* must not.
- `Rules.jsx:101` displays `PT, DEF, MED, DEL` — Spanish *display* abbrevs that
  differ from the `POSITIONS` codes, so they are copy → `GK, DEF, MID, FWD`.
- `lib/statColumns.js` — translate `label`, keep `abbrev` (`TaP`, `FdJ`, `Atj`)
  as-is; they're compact headers learned positionally next to a translated
  tooltip. **The one judgement call worth confirming during Phase 3.**

**B. Hydration mismatch on `lang`** — mitigated by the props rule. One sentence to
hold onto: *islands never read the cookie; they take `lang` as a prop.*

**C. Cookie scope** — must be `path=/`. Verified explicitly by the Phase 1
navigation check.

**D. React leaking into the middleware bundle** — `index.ts` must not re-export
`./react`. Check the Netlify function bundle size after Phase 0.

**E. `Admin.jsx` scale** — 3,676 lines invites a find/replace that hits a DB field
name. Per-section commits.

**F. `competitionCopy` composition** — someone adds a slug entry and forgets the
`en` twin. The `FALLBACK[lang]` merge base makes that degrade to neutral English.

**G. Out of scope, noted** — `packages/ui/src/components/LoginForm.tsx:22` does
`setError(authError.message)`, surfacing raw Supabase **English** errors into a
Spanish UI today. Already inconsistent, unchanged by this work; mapping the common
auth error codes is a ~30 min Phase 1 add-on if wanted.

---

## Copy needing the user's eye

Short list, handed over at Phases 1 and 5 rather than left unwritten:
- App mode names **"Polla"** and **"Fantasy"** — kept as proper nouns.
- `gateway/src/pages/index.astro:42-74` — the prize rules. Fully translatable as
  written, but it hardcodes the World Cup, 12 participants and COP amounts, so it
  needs a *content* update for UCL regardless of language.
- `statColumns.js` abbrevs (risk A, last bullet).
- Any house term in `Rules.jsx` that is a league convention rather than a football
  term.
