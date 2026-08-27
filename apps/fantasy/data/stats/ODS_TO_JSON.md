# ODS → JSON: Match Stats Pipeline

Full process for converting Opta `.ods` export files into upload-ready JSON files for the fantasy Admin stats upload.

---

## File locations

| What | Where |
|------|-------|
| Raw Opta `.ods` files | `apps/fantasy/data/stats/raw_opta_stats/` |
| DB name mapping script | `apps/fantasy/data/stats/raw_opta_stats/add_db_name_col.py` |
| Player DB export | `apps/fantasy/data/stats/raw_opta_stats/players_rows_new_version.csv` |
| Output JSON files | `apps/fantasy/data/stats/<N>_<home>_vs_<away>.json` |
| NOT FOUND import CSV | `apps/fantasy/data/csv/players_import_not_found.csv` |

---

## ODS sheet structure (Opta export)

**Standard format** (most files):
- Sheet `RES` — row 1: `T1 name | goals | - | goals | T2 name`
- Sheet `T1` — player stats for home team
- Sheet `T2` — player stats for away team

**Non-standard format** (e.g. `BRA v MOR.ods`):
- No `RES` sheet — sheets named after country codes (e.g. `BRA`, `Mro`)
- Score is derived from the GK's `GC` column

**Column order in T1/T2:**
`Name | Pos. | Rank | PTS | MP | G | SOnT | SOffT | BS | OG | A | P | C | Tk | INT | FW | FC | O | YC | RC | GC | PW | SAV | PSAV | (blank) | DB Name`

The `DB Name` column (last column) is added by `add_db_name_col.py` and maps Opta abbreviated names (`V. van Dijk`) to the full DB name (`Virgil van Dijk`).

---

## Step-by-step process

### 1. Drop the `.ods` file into `raw_opta_stats/`

Name it `T1 v T2.ods` (e.g. `ESP v FRA.ods`). It must follow the standard sheet structure above.

### 2. Update `add_db_name_col.py` if needed

Open the script and check `TEAM_TO_CODE`. If either team name (as it appears in the `RES` sheet) is missing, add it:
```python
'Spain': 'ESP',
'France': 'FRA',
```
For non-standard files (no `RES` sheet), also update `SHEET_TO_CODE`.

### 3. Refresh `players_rows.csv`

Export the current player list from the DB and replace `players_rows.csv`. The script uses this file to resolve Opta names to DB names.

### 4. Run the DB name mapping script

```bash
cd apps/fantasy/data/stats/raw_opta_stats
python3 add_db_name_col.py
```

Review the output — lines marked `!!!` are `NOT FOUND` players (not in `players_rows.csv`).

### 5. Create the placeholder JSON if it doesn't exist

In `apps/fantasy/data/stats/`, create `<N>_<home>_vs_<away>.json`:
```json
{
  "match": {
    "competition": "FIFA World Cup",
    "date": "2026-06-XX",
    "home_team": "Spain",
    "away_team": "France",
    "score": { "home": null, "away": null }
  },
  "_placeholder": true,
  "players": []
}
```

### 6. Ask Claude to generate the JSON (see prompt below)

### 7. Handle NOT FOUND players

Claude will produce a `players_import_not_found.csv` with the missing players. Options:
- **Add them to the DB** via the Admin player import, then re-run the pipeline
- **Manually fix** the name in the `.ods` `DB Name` cell and re-run step 6 only

---

## Prompt to give Claude

```
There are new Opta .ods files in `apps/fantasy/data/stats/raw_opta_stats/` for games <N> to <M>:
- `T1 v T2.ods` → game <N> (<home> vs <away>)
- ...

The `add_db_name_col.py` script has already been run and the `DB Name` column (last column in T1/T2 sheets) is populated.
The placeholder JSON files already exist in `apps/fantasy/data/stats/`.

Please:
1. Read each .ods file (RES sheet for the score; T1/T2 sheets for player stats using the DB Name column as `name`)
2. Fill in the score and player array in each JSON file
3. For any player whose DB Name is `NOT FOUND`, use the Opta name as fallback and flag them
4. Create `apps/fantasy/data/csv/players_import_not_found.csv` with columns: name, country, country_code, position, price — listing all NOT FOUND players (leave position and price empty if unknown)

GC (goals conceded) is already in the Opta data — read it directly from column GC, do not recalculate.
```

---

## Notes

- **GC is in the Opta data** — it reflects whether the player was on the pitch when the goal was conceded, so late substitutes may have GC=0 even if their team conceded. Do not override it with the final score.
- **Position mapping** from Opta to DB format: `GK→GK`, `DF→DEF`, `MF→MID`, `FW→FWD`. Opta uses `Sub` for substitutes — this is not a position, leave it blank.
- **`add_db_name_col.py` is safe to re-run**, but it will add a duplicate `DB Name` column. Delete the existing one from the sheet first if re-running on an already-processed file.
- **BRA v MOR** is the only known non-standard file (no `RES` sheet). If another file arrives without a `RES` sheet, add its sheet names to `SHEET_TO_CODE` in the script and derive the score from each team's GK `GC` value: T1 GK GC = away goals, T2 GK GC = home goals.
