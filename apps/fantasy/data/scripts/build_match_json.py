#!/usr/bin/env python3
"""Build an upload-ready Opta match-stats JSON from two per-team stat CSVs.

The CSVs are the same shape as data/stats/korea_republic_player_stats.csv —
they already carry a `player_name` column holding the exact DB player name.

Two ways to run
---------------
1. Fill an existing placeholder by its MD1 number (reuses its teams/date/filename):

   python3 data/scripts/build_match_json.py \
       --match 6 --score 1-1 \
       --home-csv brazil.csv --away-csv morocco.csv

2. Fully explicit (no placeholder needed):

   python3 data/scripts/build_match_json.py \
       --home-team "Korea Republic" --away-team Czechia \
       --date 2026-06-12 --score 2-1 \
       --home-csv korea_republic_player_stats.csv \
       --away-csv czechia_player_stats.csv \
       --out data/stats/2_korea_republic_vs_czechia.json

Every player name is validated against the DB roster (data/players_rows.csv).
Unmatched names are reported and cause a non-zero exit so they never slip
through to an upload that would silently drop the player.
"""
import argparse
import csv
import glob
import json
import os
import re
import sys
import unicodedata
from collections import OrderedDict

# Repo-relative anchors so the script works from any cwd.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))        # apps/fantasy/data
STATS_DIR  = os.path.join(DATA_DIR, "stats")
ROSTER_CSV = os.path.join(DATA_DIR, "players_rows.csv")

# CSV column -> JSON key. Everything else (Player, Pos, Rank, OffT, player_id) is dropped.
STAT_COLS = ["MP", "G", "A", "YC", "RC", "OG", "GC", "SAV", "PSAV", "SOnT",
             "SOffT", "BS", "Tk", "INT", "FW", "FC", "O", "P", "C", "PW"]


def norm(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


def num(s):
    s = (s or "").strip()
    if s == "":
        return 0
    f = float(s)
    return int(f) if f.is_integer() else f


def slug(name):
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower().replace("'", "")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def load_roster():
    by_name = {}
    with open(ROSTER_CSV, newline="") as fh:
        for r in csv.DictReader(fh):
            by_name[norm(r["name"])] = r
    return by_name


def load_team_csv(path):
    players = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            name = (r.get("player_name") or r.get("Player") or "").strip()
            if not name:
                continue
            o = OrderedDict()
            o["name"] = name
            for col in STAT_COLS:
                o[col] = num(r.get(col, 0))
            o["PTS"] = round(float(r.get("PTS") or 0), 2)
            players.append(o)
    return players


def find_placeholder(n):
    matches = glob.glob(os.path.join(STATS_DIR, f"{n}_*.json"))
    if not matches:
        sys.exit(f"No placeholder file found for match {n} (looked for {n}_*.json in {STATS_DIR})")
    if len(matches) > 1:
        sys.exit(f"Ambiguous: multiple files match {n}_*.json: {matches}")
    return matches[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--home-csv", required=True)
    ap.add_argument("--away-csv", required=True)
    ap.add_argument("--score", required=True, help="Final score as HOME-AWAY, e.g. 2-1")
    ap.add_argument("--match", type=int, help="MD1 placeholder number to fill (reuses its teams/date/filename)")
    ap.add_argument("--home-team", help="Home team DB name (required if --match omitted)")
    ap.add_argument("--away-team", help="Away team DB name (required if --match omitted)")
    ap.add_argument("--date", help="Match date YYYY-MM-DD (required if --match omitted)")
    ap.add_argument("--competition", default="FIFA World Cup")
    ap.add_argument("--out", help="Output path (default: derived / placeholder path)")
    args = ap.parse_args()

    m = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", args.score)
    if not m:
        sys.exit(f"--score must look like 2-1, got {args.score!r}")
    score_home, score_away = int(m.group(1)), int(m.group(2))

    # Resolve metadata + output path, either from a placeholder or explicit flags.
    if args.match is not None:
        ph_path = find_placeholder(args.match)
        with open(ph_path) as fh:
            ph = json.load(fh)
        meta = ph["match"]
        home_team = args.home_team or meta["home_team"]
        away_team = args.away_team or meta["away_team"]
        date      = args.date      or meta["date"]
        out_path  = args.out or ph_path
    else:
        missing = [f for f, v in (("--home-team", args.home_team),
                                  ("--away-team", args.away_team),
                                  ("--date", args.date)) if not v]
        if missing:
            sys.exit(f"Without --match these are required: {', '.join(missing)}")
        home_team, away_team, date = args.home_team, args.away_team, args.date
        out_path = args.out or os.path.join(STATS_DIR, f"{slug(home_team)}_vs_{slug(away_team)}.json")

    players = load_team_csv(args.home_csv) + load_team_csv(args.away_csv)
    if not players:
        sys.exit("No players parsed from the CSVs.")

    # Validate every name against the DB roster.
    roster = load_roster()
    missing = [p["name"] for p in players if norm(p["name"]) not in roster]
    if missing:
        print(f"✗ {len(missing)} player(s) not found in DB roster:", file=sys.stderr)
        for n in missing:
            print(f"    {n}", file=sys.stderr)
        sys.exit("Fix names (use the DB spelling in the CSV's player_name column) and re-run.")

    doc = OrderedDict([
        ("match", OrderedDict([
            ("competition", args.competition),
            ("date", date),
            ("home_team", home_team),
            ("away_team", away_team),
            ("score", OrderedDict([("home", score_home), ("away", score_away)])),
        ])),
        ("players", players),
    ])

    with open(out_path, "w") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"✓ {os.path.relpath(out_path)} — {home_team} {score_home}-{score_away} {away_team}, "
          f"{len(players)} players, all matched.")


if __name__ == "__main__":
    main()
