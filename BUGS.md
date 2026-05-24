# Fantasy App — Known Bugs

Bugs identified but not yet fixed. Each entry has enough context for a new Claude session to locate and fix it without needing prior conversation history.

---

## Bug 5 — `isGameLocked` doesn't auto-refresh when a match starts

🟢 **Fixed** on `refactor/simplify-ownership`

`now` changed from a static `Date.now()` call to `useState(Date.now())` backed by a `setInterval` that ticks every 30 seconds. `isGameLocked` now re-evaluates automatically as time passes.

---

## Bug 6 — No position validation on transfers

🟢 **Fixed** on `refactor/simplify-ownership`

`executeTransfer()` now computes `gksAfter` (squad GK count post-swap) and rejects the transfer if it drops to 0. A `positionViolation` derived value also disables the Confirm Transfer button in the UI before the user even clicks it.
