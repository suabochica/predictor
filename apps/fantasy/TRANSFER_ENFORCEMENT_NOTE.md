# Note for Dev Team — Transfer Cap Enforcement

> **Status:** Open for discussion. No action taken yet — current behavior left as-is (client-side only) by decision (2026-06-02).
> **Context:** Raised during Stage 3 review of the fantasy rework (`REWORK_PLAN.md`). Per-matchday transfer caps (preseason = unlimited, group window = 2, knockout window = 5) are derived from `matches.match_date` in `LeagueContext.jsx`.

---

## How transfers are tracked today

- **`transfers` table = the per-user log.** One row per transfer: `team_id, matchday_id, window_number, player_out_id, player_in_id, price_difference`.
- The window a transfer belongs to is stamped onto each row via `matchday_id` at insert time (`Transfers.jsx` → `executeTransfer`). Preseason transfers get `matchday_id = null`.
- "Transfers used this window" is computed by **querying that log** (`hooks/useTransfers.js`):
  ```js
  transfersUsedThisWindow = transfers.filter(t =>
    is_preseason ? t.matchday_id == null
                 : t.matchday_id === activeTransferWindow.matchday_id
  ).length
  ```
- The `transfer_windows` table is **not** involved and is effectively dead post-Stage-3 (window metadata is now synthesized from `matchdays` + `matches`). It is config-shaped (one row per window), so it could never hold per-(team × window) counts anyway. Candidate for removal in a cleanup pass.

## The gap

Enforcement of the cap (and the kickoff lock, and the budget check) is **100% client-side** — guards live only in `Transfers.jsx` (`transfersRemaining`, `executeTransfer` early-return, `confirmDisabled`). The database does **not** enforce the cap:

- RLS (`002_rls_policies.sql`) only restricts a user to rows where `team_id` is theirs — it says nothing about *how many*.
- The insert is a raw client `supabase.from('transfers').insert(...)`. Anyone with the anon key (shipped in the bundle) can bypass the cap, transfer a locked player, or overspend.
- The count-then-insert is **not atomic** → a double-submit or two tabs can both pass the `<= 0` check and both insert (e.g. 3 transfers in a 2-cap window).

**Contrast:** auction bids *are* server-enforced via the `place_bid` RPC (`AuctionContext.jsx`) — budget/squad/GK checks run in Postgres. Transfers have no equivalent, which is an inconsistency a future reader will likely trip on.

## Options & tradeoffs

### A. Client-side only (current)
- **Pros:** zero new work; simple (all logic in React); instant UX feedback; easy to tweak caps/copy without a migration.
- **Cons:** not actually enforced — it's a suggestion; race conditions (non-atomic count→insert); enforces a stale cap if the window rolls while the page is open; inconsistent with the server-enforced auction.

### B. Server-side RPC (`execute_transfer`, mirrors `place_bid`)
- **Pros:** real enforcement (cap + lock + budget + ≥1-GK in one transaction); atomic / race-free (`SELECT ... FOR UPDATE` the team row); recomputes the window server-side so no stale cap; consistent with the auction pattern.
- **Cons:** ~40–60 lines of `SECURITY DEFINER` PL/pgSQL + a migration; rule logic duplicated (client for UX hints, server for truth) and can drift; iterating a rule now means pushing SQL; coarser error feedback after a round-trip.

## Discussion points

1. **Threat model.** Private league among trusted people? The anon key already exposes *every* client-only rule in the app — is the transfer cap the one thing worth hardening, or do we accept parity with the rest?
2. **Accidental double-submit** is the realistic risk even with trusted users — cheaply mitigated by the existing `transferring` button-disable plus a guard; doesn't require the full RPC.
3. **Consistency:** the auction already set the RPC precedent. Do we want transfers to match for coherence?
4. If we go with B, it's **cleanly separable** — can be its own follow-up stage and doesn't block the rest of the rework.

## Tentative recommendation

Ship client-side for now (done). Revisit the `execute_transfer` RPC as a standalone hardening stage **if** (a) the league isn't fully trusted, or (b) we want server/auction parity. Keep client checks regardless — as UX hints, not as the source of truth.

## Related cleanup (separate from this decision)

- `transfer_windows` table + its `is_active` admin toggles in `Admin.jsx` are now vestigial (timing is derived from `matchdays`/`matches`). Remove in a cleanup pass.
- Window is recomputed only on mount/`refreshWindow()` — it won't roll live across a boundary until refresh (same limitation as the kickoff locks).
