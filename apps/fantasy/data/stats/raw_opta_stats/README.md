# Opta Stats → DB Name Mapping

## What this folder contains

| File | Purpose |
|------|---------|
| `*.ods` | Raw Opta match stats, one file per game |
| `players_rows_new_version.csv` | Full player DB export (id, name, country_code, …, **opta_name**) |
| `add_db_name_col.py` | Script that links Opta names → DB names |

## What the script does

1. Reads every `.ods` file in this folder.
2. For each player row in the **T1** and **T2** sheets it finds the matching full name in `players_rows_new_version.csv` using the abbreviated Opta format (`V. van Dijk` → `Virgil van Dijk`).
3. Appends a **`DB Name`** column to T1/T2 in the `.ods` file (last column).
4. Writes the reverse mapping back into `players_rows_new_version.csv` as a new **`opta_name`** column.

## How to add a new game

1. **Drop the `.ods` file** into this folder.  
   Name it anything (e.g. `ESP v FRA.ods`).

2. **Make sure the sheet structure matches one of these two formats:**

   **Standard** (used by most files):
   - Sheet `RES` — row 1 has: `T1 name | goals | - | goals | T2 name`
   - Sheet `T1` — player stats for team 1, first column = Opta name
   - Sheet `T2` — player stats for team 2, first column = Opta name

   **Custom** (used by `BRA v MOR.ods`):
   - No `RES` sheet; sheets are named after the country code (`BRA`, `Mro`, etc.)
   - If you add a file with this format, add the sheet-name → country-code mapping to `SHEET_TO_CODE` in `add_db_name_col.py`.

3. **Check the team name → country code mapping.**  
   Open `add_db_name_col.py` and look at `TEAM_TO_CODE`. If either team is missing, add an entry:
   ```python
   'Spain': 'ESP',
   'France': 'FRA',
   ```

4. **Run the script** (from this folder):
   ```bash
   cd apps/fantasy/data/stats/raw_opta_stats
   python3 add_db_name_col.py
   ```

5. **Review the output.** Lines marked `!!!` are players with no DB match (`NOT FOUND`). This usually means:
   - The player isn't in `players_rows_new_version.csv` (squad not imported yet)
   - The Opta name is unusual (e.g. `P. Okon-Engstler` vs DB `Paul Okon`) — fix manually in the cell

6. **The script is safe to re-run** on a file that already has a `DB Name` column — it will add a second one. To avoid that, delete the `DB Name` column from the sheet first, or only run it on new files.

## Asking Claude to do it

Just say:

> "There's a new game file `[filename].ods` in `raw_opta_stats/`. Please run `add_db_name_col.py` to add the DB Name column and update `players_rows_new_version.csv`."

If the team isn't in `TEAM_TO_CODE` yet, Claude will flag it and add the entry before running.
