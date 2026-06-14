---
name: extract-match
description: Extract Opta match screenshots into upload-ready player-stats JSON for the fantasy Admin Opta upload, resolving names against DB rosters.
---

# /extract-match — Opta screenshots → upload-ready JSON

You are converting optaplayerstats.statsperform.com screenshots into a JSON file that can be uploaded via the fantasy Admin "Opta JSON Stats Upload" for the correct matchday.

---

## Step 0 — Gather inputs

You need from the user (ask for any that are missing):
- The screenshots (match header + per-team stats tables — often two horizontally-scrolled parts per team)
- **Both country names exactly as stored in `players.country`** (e.g. "Mexico", "South Africa") — these are passed to the roster script
- The **matchday number** (integer)

Do not proceed until you have all three.

---

## Step 1 — Halftime guard

Read the match header screenshot. If it shows "Half time", "HT", or every player's MP value is 45, **stop immediately** and tell the user:

> Stats must be from the **full-time** result page, not halftime. Please re-screenshot after the match ends.

---

## Step 2 — Fetch rosters

Run the roster script for both countries (reads `apps/fantasy/data/players_rows.csv` — no network call):

```bash
node apps/fantasy/data/scripts/fetch_roster.mjs "Country1" "Country2"
```

This prints a JSON array of `{ id, name, position, country }` objects **and** writes a filtered CSV of only these two teams' players to `apps/fantasy/data/.roster_tmp.csv`. Keep the JSON roster in memory and use `.roster_tmp.csv` as the reference file for name resolution in Step 4.

---

## Step 3 — Extract raw stats from screenshots

Opta tables are typically split into two horizontally-scrolled parts per team. Read **every player row** from both parts; merge rows by (player name, row rank/order). The two parts **overlap** on some columns — if an overlapping cell differs between parts, **flag the conflict** to the user and ask them to re-check instead of guessing.

Typical column layout (not exhaustive — read the actual headers):
- **Part 1**: `PTS MP G SOnT SOffT BS OG A P C Tk INT FW FC`
- **Part 2**: `SOffT BS OG A P C Tk INT FW FC O YC RC GC PW SAV PSAV`

Rules:
- Never invent or interpolate a value. If a cell is cut off or illegible, ask the user for that specific cell rather than guessing.
- Do not skip any visible player row, including substitutes.
- Copy player names exactly as shown (including diacritics, dots, hyphens).

---

## Step 4 — Resolve Opta names to DB full names

Opta uses abbreviated names like `J. Quiñones` or `R. Aït-Nouri`. The Admin upload matches by **normalized full-name equality**, so every output name must be the exact DB `players.name` string.

Resolution algorithm (apply per team — only search within that team's roster):

1. **Normalize** both the Opta name and each roster entry: strip NFD diacritics, lowercase, trim whitespace.
   - Example: `"Aït-Nouri"` → `"ait-nouri"`, `"Quiñones"` → `"quinones"`
2. **Parse** the Opta token as `<initial>. <surname(s)>` (the initial may be multi-char for double-barrelled firsts like `"J.L."`).
3. **Match**: surname token(s) normalized-equal AND first initial normalized-equal (first char of first name).
4. **Exactly 1 candidate** → resolved; use the DB `players.name` field (un-normalized).
5. **0 or ≥2 candidates** → list the candidates to the user and ask them to pick. **Never guess.**

After resolving all names, build the final player list using DB full names.

---

## Step 4b — Validate GC (goals conceded)

This check catches the most common extraction error: GC extracted as 0 for all players even when the opponent scored.

For each team:
- Expected GC = goals scored by the **opponent** (from `match.score`).
- If expected GC > 0 AND every player on this team has GC=0 → **stop and alert the user**:

  > ⚠️ GC validation failed for [Team]: score shows the opponent scored [N] but all [Team] players have GC=0. This likely means the GC column was not captured from the screenshots. Please re-check the GC column for [Team] and provide the correct values before I write the file.

Do NOT write the file or proceed until the user confirms the GC values or explicitly says the Opta table genuinely shows GC=0 for all players (rare edge case where the stat is unavailable).

If the match score shows 0–0, skip this check.

---

## Step 5 — Emit JSON

Write the output file to:
```
apps/fantasy/data/stats/<matchday>_<home>_vs_<away>.json
```
where `<home>` and `<away>` are the team names lowercased with spaces replaced by underscores (e.g. `mexico`, `south_africa`).

Use this exact schema (one object per player, all columns present):

```json
{
  "match": {
    "competition": "FIFA World Cup",
    "date": "YYYY-MM-DD",
    "home_team": "...",
    "away_team": "...",
    "score": { "home": 0, "away": 0 }
  },
  "players": [
    {
      "name": "<exact DB players.name>",
      "MP": 0,
      "G": 0,
      "A": 0,
      "YC": 0,
      "RC": 0,
      "OG": 0,
      "GC": 0,
      "SAV": 0,
      "PSAV": 0,
      "SOnT": 0,
      "SOffT": 0,
      "BS": 0,
      "Tk": 0,
      "INT": 0,
      "FW": 0,
      "FC": 0,
      "O": 0,
      "P": 0,
      "C": 0,
      "PW": 0,
      "PTS": 0.0
    }
  ]
}
```

Notes:
- `PTS` = the Opta rating (stored as reference; composite scoring ignores it and computes from the raw columns).
- `GC` = goals conceded while the player was on pitch, as shown in the table.
- Players not visible in the screenshots are omitted.
- All integer columns must be integers; `PTS` must be a float.

---

## Step 6 — Print review table

Before telling the user to upload, print a review table so they can eyeball the resolution:

```
Opta name            → DB name                    | MP  G  A  SOnT  Tk  INT  YC  RC
J. Quiñones          → Julián Quiñones             | 90  1  0   2    1    0    0   0
R. Aït-Nouri         → Rayan Aït-Nouri             | 67  0  1   0    3    1    1   0
...
```

Then tell the user:
> File written to `apps/fantasy/data/stats/<filename>`. Upload it in the fantasy Admin under **"Opta JSON Stats Upload"** for matchday `<N>`, then click **"Calcular posiciones"** with **Compuesto (FPL+)** active.
