#!/usr/bin/env python3
"""
Generate a players CSV ready for the Admin Panel CSV Player Import.

Usage:
  python generate_players_csv.py              # full export (status=playing only)
  python generate_players_csv.py --test 10    # first N players only
"""

import json
import csv
import sys
import os

PLAYERS_FILE = os.path.join(os.path.dirname(__file__), "../raw/players.json")
TEAMS_FILE   = os.path.join(os.path.dirname(__file__), "../csv/WC2026 teams")
OUT_FILE     = os.path.join(os.path.dirname(__file__), "../csv/players_import.csv")
TEST_FILE    = os.path.join(os.path.dirname(__file__), "../csv/players_import_test.csv")

def build_name(p):
    if p.get("knownName"):
        return p["knownName"].strip()
    first = (p.get("firstName") or "").strip()
    last  = (p.get("lastName")  or "").strip()
    return f"{first} {last}".strip()

def main():
    test_limit = None
    if "--test" in sys.argv:
        idx = sys.argv.index("--test")
        test_limit = int(sys.argv[idx + 1]) if idx + 1 < len(sys.argv) else 10

    with open(PLAYERS_FILE, encoding="utf-8") as f:
        raw = f.read().strip()
    # Fix truncated file: remove trailing comma before closing bracket
    if raw.endswith(","):
        raw = raw[:-1] + "\n]"
    players = json.loads(raw)

    with open(TEAMS_FILE, encoding="utf-8") as f:
        teams = json.load(f)

    # Build id → {name, abbr} map
    team_map = {t["id"]: {"name": t["name"], "abbr": t["abbr"]} for t in teams}

    # Filter to playing only
    playing = [p for p in players if p.get("status") == "playing"]
    print(f"Total players: {len(players)}, status=playing: {len(playing)}")

    if test_limit:
        playing = playing[:test_limit]
        out_path = TEST_FILE
        print(f"TEST MODE: writing first {test_limit} players to {out_path}")
    else:
        out_path = OUT_FILE
        print(f"Writing all {len(playing)} players to {out_path}")

    rows = []
    missing_teams = set()

    for p in playing:
        squad_id = p.get("squadId")
        team = team_map.get(squad_id)
        if not team:
            missing_teams.add(squad_id)
            continue

        rows.append({
            "name":         build_name(p),
            "country":      team["name"],
            "country_code": team["abbr"],
            "position":     p.get("position", ""),
            "price":        p.get("price", ""),
            "photo_url":    "",
        })

    if missing_teams:
        print(f"WARNING: {len(missing_teams)} players had unknown squadId(s): {sorted(missing_teams)}")

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name","country","country_code","position","price","photo_url"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done — {len(rows)} rows written.")

    # Preview first 5 rows
    print("\nPreview (first 5):")
    for r in rows[:5]:
        print(f"  {r['name']}, {r['country']} ({r['country_code']}), {r['position']}, £{r['price']}")

if __name__ == "__main__":
    main()
