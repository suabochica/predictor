# Opta Points Tab Screenshot → JSON Extraction Prompt

Use this prompt when sending screenshots of the **Opta Points** tab to Claude.

---

## PROMPT

You are a data extraction assistant. I am sending you one or more screenshots from the **Opta Points** tab of an Opta player statistics page for a football match. Your job is to extract all visible data and return a single, well-structured JSON file.

Follow these rules exactly:

### 1. Match Metadata
Extract from the header of the page:
- `competition` (e.g. "FIFA World Cup")
- `date` in ISO format `YYYY-MM-DD`
- `time` in `HH:MM` format
- `venue`
- `attendance` as an integer (no commas)
- `referee`
- `home_team` and `away_team`
- `score` as `{ "home": N, "away": N }`

### 2. Column Legend
Include a `stats_columns` object mapping every column abbreviation to its full name. Standard Opta Points columns:

| Key   | Full name           |
|-------|---------------------|
| PTS   | Opta Points         |
| MP    | Minutes played      |
| G     | Goals               |
| SOnT  | Shots on target     |
| SOffT | Shots off target    |
| BS    | Blocked shots       |
| OG    | Own goals           |
| A     | Assists             |
| P     | Passes              |
| C     | Crosses             |
| Tk    | Tackles             |
| INT   | Interceptions       |
| FW    | Fouls won           |
| FC    | Fouls conceded      |
| O     | Offsides            |
| YC    | Yellow cards        |
| RC    | Red cards           |
| GC    | Goals conceded      |
| PW    | Penalties won       |
| SAV   | Saves               |
| PSAV  | Penalties saved     |

If the screenshot shows different or additional columns, add them accordingly.

### 3. Players Array
For every player row visible in the table, create an object with:
- `name`: exactly as shown (preserve diacritics, hyphens, dots)
- `team`: infer from visual cue — shirt icon (🟦) = starter, triangle icon (🔺) = substitute; team is determined by the "Serbia" / "Switzerland" filter tabs or the ranking context
- `pos`: position as shown (MF, FW, DF, GK, Sub)
- `rank`: integer rank as shown
- `PTS`: float (Opta Points score, can be negative)
- `MP`: integer (minutes played)
- All other stat columns as integers

### 4. Point Scoring Legend
Extract the footer legend at the bottom of the table into a `legend_footer` object. Each entry maps a column key to its point value string exactly as shown (e.g. `"GC": "Goals conceded (player=-1, gk=-6)"`).

### 5. Output Format
Return **only** valid JSON. No explanation, no markdown fences, no extra text. Use this structure:

```json
{
  "match": {
    "competition": "...",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "venue": "...",
    "attendance": 0,
    "referee": "...",
    "home_team": "...",
    "away_team": "...",
    "score": { "home": 0, "away": 0 }
  },
  "stats_columns": {
    "PTS": "Opta Points",
    "MP": "Minutes played",
    "G": "Goals"
  },
  "players": [
    {
      "name": "...",
      "team": "...",
      "pos": "...",
      "rank": 1,
      "PTS": 0.0,
      "MP": 0,
      "G": 0,
      "SOnT": 0,
      "SOffT": 0,
      "BS": 0,
      "OG": 0,
      "A": 0,
      "P": 0.0,
      "C": 0.0,
      "Tk": 0,
      "INT": 0,
      "FW": 0,
      "FC": 0,
      "O": 0,
      "YC": 0,
      "RC": 0,
      "GC": 0,
      "PW": 0,
      "SAV": 0,
      "PSAV": 0
    }
  ],
  "legend_footer": {
    "G": "Goals 10",
    "SOnT": "Shots on target 4"
  }
}
```

### 6. Multiple Screenshots
If I send more than one screenshot (e.g. the table continues across images), treat them as a single continuous table and combine all player rows in order, top to bottom.

### 7. Accuracy Rules
- `PTS` is a float and **can be negative** — copy the exact value shown.
- `P` (Passes) and `C` (Crosses) are displayed as floats (e.g. 28.0) — preserve the decimal.
- `pos` for substitutes is `"Sub"` regardless of their actual position.
- Do not skip any row, including players with negative points.
- If a cell is cut off or illegible, use `null`.
- Player names must be copied exactly as shown.
