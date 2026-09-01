#!/usr/bin/env python3
"""
Process the raw UCL 2026/27 metadata dumps in apps/fantasy/data/UCL_metadata/
into files ready for the Admin Panel:

  UCLplayers_V2.txt             — UEFA gaming-API player list, all 36
                                   league-phase clubs (935 players; supersedes
                                   UCLplayers.txt/UCL2026teams.txt, which only
                                   covered 29 clubs snapshotted before the
                                   playoff round concluded — kept in the repo
                                   for history, no longer read here)
  uefa_champions_league_calendar.json — full 206-fixture ICS-derived calendar
                                   (qualifying + playoffs + 144 league-phase
                                   matches, all 36 clubs)

Team metadata (short_name, UEFA team id) is derived from the players file
itself (tId/cCode are consistent per team, verified 1:1 against the old
UCL2026teams.txt for the 29 overlapping clubs) rather than a separate teams
file, so there is one source of truth and no staleness gap.

Outputs (apps/fantasy/data/UCL_metadata/processed/):
  players_import.csv   — ready for "Importar jugadores CSV" (schema matches
                          data/scripts/generate_players_csv.py's WC output:
                          name,country,country_code,position,price,photo_url)
  teams.csv             — all 36 league-phase clubs with short_name + UEFA id
  matches_schedule.csv — the 144 league-phase fixtures, bucketed into Liga
                          MD1..MD8 by kickoff-date clustering

Read-only against the raw files; does not touch Supabase or the running app.
"""

import csv
import json
import os
from collections import defaultdict

BASE = os.path.join(os.path.dirname(__file__), "../UCL_metadata")
PLAYERS_FILE = os.path.join(BASE, "UCLplayers_V2.txt")
CALENDAR_FILE = os.path.join(BASE, "uefa_champions_league_calendar.json")
OUT_DIR = os.path.join(BASE, "processed")

SKILL_TO_POSITION = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}


def getval(v):
    """UEFA API fields are sometimes {"source": "...", "parsedValue": N}, sometimes a raw number."""
    if isinstance(v, dict):
        return v.get("parsedValue")
    return v


def load_players():
    with open(PLAYERS_FILE, encoding="utf-8") as f:
        raw = json.load(f)["data"]["value"]["playerList"]
    return raw


def teams_from_players(players):
    """Derive {team_name: {id, shortName}} from the player rows themselves —
    tId/cCode are consistent per team (verified), so no separate teams file
    is needed and there is no risk of it drifting out of sync."""
    teams = {}
    for p in players:
        teams.setdefault(p["tName"], {"id": p["tId"], "shortName": p["cCode"]})
    return teams


def load_calendar():
    with open(CALENDAR_FILE, encoding="utf-8") as f:
        return json.load(f)


def build_players_csv(players):
    rows = []
    skipped_inactive = 0
    unknown_skill = 0

    for p in players:
        if p.get("isActive") != 1:
            skipped_inactive += 1
            continue

        skill = p.get("skill")
        position = SKILL_TO_POSITION.get(skill)
        if not position:
            unknown_skill += 1
            continue

        team_name = p["tName"]
        country_code = p.get("cCode") or ""

        price = getval(p.get("value"))
        if price is None:
            continue

        rows.append({
            "name": p.get("pFName") or p.get("latinName") or p.get("pDName"),
            "country": team_name,
            "country_code": country_code,
            "position": position,
            "price": price,
            "photo_url": "",
        })

    out_path = os.path.join(OUT_DIR, "players_import.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "country", "country_code", "position", "price", "photo_url"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"players_import.csv: {len(rows)} rows written ({skipped_inactive} inactive/NIS skipped, {unknown_skill} unknown skill skipped)")
    return rows


def league_phase_teams(calendar):
    teams = set()
    for m in calendar["matches"]:
        if m["stage"] == "Fase liga":
            teams.add(m["home_team"])
            teams.add(m["away_team"])
    return teams


def build_teams_csv(teams_by_name, calendar, players_by_team):
    all_36 = sorted(league_phase_teams(calendar))
    rows = []
    missing = []
    for name in all_36:
        t = teams_by_name.get(name)
        has_players = name in players_by_team
        if not has_players:
            missing.append(name)
        rows.append({
            "name": name,
            "short_name": t["shortName"] if t else "",
            "uefa_team_id": t["id"] if t else "",
            "has_player_data": "yes" if has_players else "NO",
        })

    out_path = os.path.join(OUT_DIR, "teams.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "short_name", "uefa_team_id", "has_player_data"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"teams.csv: {len(rows)} clubs written ({len(missing)} missing player data: {', '.join(missing)})")


def build_matches_csv(calendar):
    matches = [m for m in calendar["matches"] if m["stage"] == "Fase liga"]
    matches.sort(key=lambda m: m["start_time_utc"])

    # Bucket by kickoff date into 8 clusters of 18 matches (MD1 spans 3 days,
    # MD2-7 span 2, MD8 is a single day — verified against the raw calendar).
    by_date = defaultdict(list)
    for m in matches:
        by_date[m["start_time_utc"][:10]].append(m)

    dates_sorted = sorted(by_date)
    matchdays = []
    bucket = []
    for d in dates_sorted:
        bucket.extend(by_date[d])
        if len(bucket) >= 18:
            matchdays.append(bucket)
            bucket = []
    if bucket:
        raise SystemExit(f"Leftover {len(bucket)} matches did not fill an 18-match matchday — recheck date clustering")
    if len(matchdays) != 8:
        raise SystemExit(f"Expected 8 matchdays, got {len(matchdays)} — recheck date clustering")

    rows = []
    for i, md_matches in enumerate(matchdays, start=1):
        for m in md_matches:
            rows.append({
                "matchday_label": f"Liga MD{i}",
                "date": m["start_time_utc"][:10],
                "kickoff_utc": m["start_time_utc"],
                "home_team": m["home_team"],
                "away_team": m["away_team"],
                "venue": m["venue"],
                "city": m["city"],
                "status": m["status"],
                "home_score": m["home_score"],
                "away_score": m["away_score"],
                "match_url": m["match_url"],
            })

    out_path = os.path.join(OUT_DIR, "matches_schedule.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "matchday_label", "date", "kickoff_utc", "home_team", "away_team",
            "venue", "city", "status", "home_score", "away_score", "match_url",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"matches_schedule.csv: {len(rows)} fixtures written across 8 matchdays (18 each)")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    players = load_players()
    teams_by_name = teams_from_players(players)
    calendar = load_calendar()

    rows = build_players_csv(players)
    players_by_team = defaultdict(list)
    for r in rows:
        players_by_team[r["country"]].append(r)

    build_teams_csv(teams_by_name, calendar, players_by_team)
    build_matches_csv(calendar)

    print(f"\nOutputs written to {OUT_DIR}")


if __name__ == "__main__":
    main()
