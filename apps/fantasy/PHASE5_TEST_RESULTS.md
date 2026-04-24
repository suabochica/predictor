# Phase 5 — Knockout Bracket Test Results

**Date:** 2026-04-24
**Tester:** Manual QA
**Build:** Phase 5

---

## Summary

| Scenario | Status |
|----------|--------|
| 1. Admin — Section Visibility | ✅ PASS |
| 2. Admin — Seed Bracket | ⚠️ PARTIAL (2 bugs) |
| 3. Admin — Round 1 State Display | ✅ PASS |
| 4. Admin — Calculate Round 1 | ⚠️ PARTIAL (2 bugs) |
| 5. Admin — Calculate Round 2 | ⚠️ PARTIAL (2 bugs) |
| 6. Admin — Calculate Round 3 | ✅ PASS |
| 7. Bracket Page — Pre-Seeded State | ✅ PASS |
| 8. Bracket Page — Round 1 Active | ✅ PASS |
| 9. Bracket Page — After Round 1 | ✅ PASS |
| 10. Bracket Page — After Round 2 | ✅ PASS |
| 11. Bracket Page — All Rounds Complete | ⚠️ PARTIAL (1 redesign needed) |
| 12. Edge Cases | ✅ PASS (needs deeper SQL verification) |

---

## Failures & Issues

---

### FAIL — Phase 5 / Scenario 2 — Admin: Seed Bracket

**Step:** 2.1
**Action:** Open Admin with 8+ teams in standings; check championship seeding preview heading
**Expected:** Seeding preview appears under "Championship (Top 8)" heading
**Actual:** Preview appears but the heading reads "Top 9" instead of "Championship (Top 8)" — the word "championship" is missing from the label
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  Likely a string/label rendering issue in `Admin.jsx`. The section header text needs to be corrected to "Championship (Top 8)".

---

### FAIL — Phase 5 / Scenario 2 — Admin: Seed Bracket

**Step:** 2.3
**Action:** With 12 teams, check that "Relegation (Bottom 4)" section appears in the seeding preview
**Expected:** "Relegation (Bottom 4)" section heading is visible with the relegation matchup preview
**Actual:** The relegation section heading text ("Relegation") is missing — section appears without the label
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  Likely the same label/heading issue as step 2.1. The relegation preview section header string is either empty or not rendered in `Admin.jsx`.

---

### FAIL — Phase 5 / Scenario 4 — Admin: Calculate Round 1

**Step:** 4.4 (sub-issue)
**Action:** After calculating Round 1, inspect `knockout_matches` rows in Supabase for the championship bracket
**Expected:** All columns populated including `placement_text` (or equivalent placement field) for championship rows
**Actual:** The `placement_text` column is not populated for championship bracket Round 1 rows after calculation. All other fields (`winner_id`, `team_a_points`, `team_b_points`, `team_a_captain_points`, `team_b_captain_points`, `team_a_goals`, `team_b_goals`, `matchday_id`) are correctly populated.
**Console errors:**
  None observed
**Network response (if relevant):**
  N/A
**Notes:**
  `placement_text` may only be intended for later rounds / final placements. Needs clarification: if `placement_text` should remain null for non-final rounds, update the test spec. If it should be set (e.g. "QF-A"), the calculate logic in `brackets.js` needs a fix.

---

### FAIL — Phase 5 / Scenario 4 — Admin: Calculate Round 1

**Step:** 4.7 (sub-issue)
**Action:** After calculating Round 1 and Round 2 rows are created, observe the Admin UI
**Expected:** No unexpected UI elements; only documented bracket sections visible
**Actual:** Two "undefined." boxes appear at the bottom of the Admin page. Their origin is unclear — possibly orphaned React state, a missing team name lookup, or an unmapped placeholder row being rendered.
**Console errors:**
  Not captured — recommend checking DevTools for `undefined` prop warnings or missing data bindings
**Network response (if relevant):**
  N/A
**Notes:**
  The boxes appear after Round 2 match rows are created. Likely caused by a component iterating over `knockout_matches` rows where `team_a_id` or `team_b_id` is null (placement-only rows like 5th/7th Place that are pre-created with `winner_id` but no opponent). The render logic should guard against null team IDs.

---

### FAIL — Phase 5 / Scenario 5 — Admin: Calculate Round 2

**Step:** 5.4
**Action:** After calculating Round 2, check the 5th Place row in `knockout_matches`
**Expected:** `winner_id` pre-set to winner of the 5/6 Match; `team_a_points` and `team_b_points` are null (no match played — placement-only row)
**Actual:** The 5th Place row appears to retain/display data from the previous round's match (5/6 Match) rather than showing a clean placement-only row. The winner is already awarded but the row is visually confusing — it shows the same matchup as the 5/6 Match with a winner highlight, instead of being a distinct placement row.
**Console errors:**
  Not captured
**Network response (if relevant):**
  N/A
**Notes:**
  The data in Supabase may be correct but the Bracket page is rendering the 5th Place card as if it were a live match result rather than a placement-only row. See related issue in Step 5.5 and the Bracket page redesign note (Step 10.3).

---

### FAIL — Phase 5 / Scenario 5 — Admin: Calculate Round 2

**Step:** 5.5
**Action:** After calculating Round 2, check the 7th Place row
**Expected:** Same pattern as 5th Place — winner pre-set, no scores
**Actual:** Same issue as 5.4 — 7th Place row is not working properly. Displays same match data from the prior round rather than a clean placement card.
**Console errors:**
  Not captured
**Network response (if relevant):**
  N/A
**Notes:**
  Confirmed same root cause as 5.4. Both 5th and 7th Place placement-only rows are broken.

---

### REDESIGN REQUEST — Phase 5 / Scenario 10–11 — Bracket Page: 5th/7th Place Cards & Final Standings

**Step:** 10.3 / 10.4 / 11.3–11.7
**Action:** View Round 3 column on Bracket page; view Final Standings section after all rounds complete
**Expected (10.3–10.4):** 5th Place and 7th Place show team names with winner highlighted in white (no score numbers since no match played)
**Actual (10.3–10.4):** 5th and 7th Place cards in the Round 3 column are visually confusing — no clear distinction between a placement-only row and an actual played match. The card style and layout needs to differentiate these two types.

**Expected (11.3–11.7):** Final Standings section shows cards for 1st, 3rd, 5th, 7th, 9th, 11th placements with a clean layout
**Actual (11.3–11.7):** The Final Standings section works functionally but the layout is considered poor UX. Requested redesign:
- Replace the current card grid with a clean ranked table showing all 12 teams with their final placement
- Add a **podium component** (top of the section) prominently showing 1st, 2nd, and 3rd place teams
- Add a separate section for last-place / relegation finisher
- The current approach of only showing placement match winners (omitting runners-up like 2nd, 4th, 6th, 8th, 10th, 12th) is confusing and incomplete

**Console errors:**
  None
**Network response (if relevant):**
  N/A
**Notes:**
  This is flagged as a Known Limitation in the Phase 5 spec ("Phase 7 polish") but the severity warrants earlier attention. The 5th/7th card confusion may be blocking clear comprehension of results even for internal testing.

---

## Passed Scenarios (summary)

| Step Range | Scenario | Result |
|------------|----------|--------|
| 1.1–1.3 | Admin Section Visibility | ✅ All pass |
| 2.2, 2.5–2.8 | Seed Bracket (partial) | ✅ Pass |
| 3.1–3.4 | Round 1 State Display | ✅ All pass |
| 4.1–4.6, 4.8–4.11 | Calculate Round 1 (partial) | ✅ Pass |
| 5.1, 5.3, 5.6–5.8 | Calculate Round 2 (partial) | ✅ Pass |
| 6.1–6.5 | Calculate Round 3 | ✅ All pass |
| 7.1–7.5 | Bracket Pre-Seeded State | ✅ All pass |
| 8.1–8.3 | Bracket Round 1 Active | ✅ All pass |
| 9.1–9.5 | Bracket After Round 1 | ✅ All pass |
| 10.1–10.5 | Bracket After Round 2 | ✅ All pass |
| 11.1–11.2 | Bracket All Rounds Complete (partial) | ✅ Pass |
| 12.1–12.5 | Edge Cases | ✅ Pass (pending deeper SQL verification) |

---

## Pending / Deferred

| Item | Notes |
|------|-------|
| 2.4 — 8–11 teams relegation visibility | Not tested (12-team setup used throughout) |
| 12.1–12.5 deep SQL verification | Edge cases passed visually; recommend re-running with manually crafted SQL inputs to force each tiebreaker scenario |
| `placement_text` intent for Round 1 championship rows | Needs spec clarification before classifying as bug vs expected null |
