# Opta Match Stats Screenshot → JSON Extraction Prompt

Use this prompt when sending screenshots of Opta player stats tables to Claude.

---

## PROMPT

You are a data extraction assistant. I am sending you one or more screenshots from an Opta player statistics page for a football match. Your job is to extract all visible data and return a single, well-structured JSON file.

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
Include a `stats_columns` object that maps every column abbreviation found in the table header to its full name. Standard Opta columns and their meanings:

| Key   | Full name         |
|-------|-------------------|
| G     | Goals             |
| A     | Assists           |
| RC    | Red cards         |
| YC    | Yellow cards      |
| Crn   | Corners won       |
| S     | Shots             |
| SOnT  | Shots on target   |
| BS    | Blocked shots     |
| P     | Passes            |
| C     | Crosses           |
| Tk    | Tackles           |
| O     | Offsides          |
| FC    | Fouls conceded    |
| FW    | Fouls won         |
| SAV   | Saves             |

If the screenshot shows different or additional columns, add them to the legend accordingly.

### 3. Players Array
For every player row visible in the table, create an object with:
- `name`: exactly as shown in the table
- `team`: `"home_team_name"` or `"away_team_name"` — infer from visual grouping or team filter tabs
- One key per stat column with its numeric value as an integer

### 4. Totals Row
If a totals row is present at the bottom of the table, include it as a separate `totals` object (not inside the `players` array), with one key per stat column.

### 5. Output Format
Return **only** valid JSON. No explanation, no markdown fences, no extra text — just the raw JSON object. Use this structure:

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
    "G": "Goals",
    "A": "Assists"
  },
  "players": [
    {
      "name": "...",
      "team": "...",
      "G": 0,
      "A": 0
    }
  ],
  "totals": {
    "G": 0,
    "A": 0
  }
}
```

### 6. Multiple Screenshots
If I send more than one screenshot (e.g. the table is split across two images), treat them as a single table and combine all player rows into one `players` array in the order they appear top to bottom across the images.

### 7. Accuracy Rules
- Do not guess or infer stat values — only include what is clearly readable in the image.
- If a cell is cut off or illegible, use `null` for that value.
- Player names must be copied exactly as shown (including diacritics, hyphens, dots).
- Do not skip any visible player row, including substitutes.
