# Opta Match Stats Screenshot → JSON Extraction

This workflow has been superseded by the **`/extract-match`** Claude Code skill.

## How to use

1. Run `/extract-match` in Claude Code (from the project root).
2. Paste your full-time Opta screenshots when prompted.
3. Provide both country names (as stored in `players.country`) and the matchday number.
4. Claude resolves Opta short names to DB full names, writes the JSON to `apps/fantasy/data/stats/`, and prints a review table.
5. Upload the file in the fantasy Admin under **"Opta JSON Stats Upload"** for the correct matchday.

The skill file is at `.claude/skills/extract-match/SKILL.md`.
