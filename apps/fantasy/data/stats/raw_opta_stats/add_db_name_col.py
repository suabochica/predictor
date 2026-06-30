#!/usr/bin/env python3
"""
Add a 'DB Name' column to T1/T2 sheets in each .ods stats file,
mapping Opta abbreviated player names to full names in players_rows.csv.
"""
import csv
import os
import sys
import unicodedata
from difflib import SequenceMatcher

from odf.opendocument import load
from odf.table import Table, TableRow, TableCell
from odf.text import P

# Map full team names (as they appear in the RES sheet) to country codes
TEAM_TO_CODE = {
    'Australia': 'AUS',
    'Türkiye': 'TUR',
    "Côte d'Ivoire": 'CIV',
    'Ecuador': 'ECU',
    'Germany': 'GER',
    'Curaçao': 'CUW',
    'Haiti': 'HAI',
    'Scotland': 'SCO',
    'Netherlands': 'NED',
    'Japan': 'JPN',
    'Qatar': 'QAT',
    'Switzerland': 'SUI',
    'Sweden': 'SWE',
    'Tunisia': 'TUN',
    'Spain': 'ESP',
    'Cabo Verde': 'CPV',
    'Belgium': 'BEL',
    'Egypt': 'EGY',
    'Saudi Arabia': 'KSA',
    'Uruguay': 'URU',
    'IR Iran': 'IRN',
    'New Zealand': 'NZL',
    'Korea Republic': 'KOR',
    'Korea Republic ': 'KOR',
    'Czechia': 'CZE',
    'France': 'FRA',
    'Senegal': 'SEN',
    'Argentina': 'ARG',
    'Algeria': 'ALG',
    'Iraq': 'IRQ',
    'Norway': 'NOR',
    'Austria': 'AUT',
    'Jordan': 'JOR',
    'Portugal': 'POR',
    'Congo DR': 'COD',
    'England': 'ENG',
    'Croatia': 'CRO',
    'Ghana': 'GHA',
    'Panama': 'PAN',
    'Uzbekistan': 'UZB',
    'Colombia': 'COL',
    'South Africa': 'RSA',
    'Bosnia-Herzegovina': 'BIH',
    'Bosnia And Herzegovina': 'BIH',
    'Canada': 'CAN',
    'Mexico': 'MEX',
    'United States': 'USA',
    'Morocco': 'MAR',
    'Brazil': 'BRA',
    'Paraguay': 'PAR',
}

# Non-standard sheet names → country code (for BRA v MOR format)
SHEET_TO_CODE = {
    'BRA': 'BRA',
    'Mro': 'MAR',
}


def normalize(s: str) -> str:
    """Lowercase, strip accents, and normalize Turkish dotless-i."""
    s = s.replace('ı', 'i').replace('İ', 'I')  # Turkish chars don't NFKD-decompose
    s = s.lower().strip()
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))


def parse_opta_name(opta_name: str):
    """Parse 'F. Last Name' → ('F', 'Last Name'), or (None, 'Full Name')."""
    opta_name = opta_name.strip()
    if '. ' in opta_name:
        parts = opta_name.split('. ', 1)
        return parts[0], parts[1].strip()
    return None, opta_name


def match_player(opta_name: str, players: list) -> tuple[str, str]:
    """Return (db_name, confidence) for the best DB match."""
    norm_query = normalize(opta_name.strip())
    for p in players:
        stored = p.get('opta_name', '').strip()
        if stored and normalize(stored) == norm_query:
            return p['name'], 'opta_direct'

    initial, last_part = parse_opta_name(opta_name)
    norm_last = normalize(last_part)
    opta_words = norm_last.split()
    norm_initial = normalize(initial) if initial else None

    exact = []
    fuzzy = []

    for p in players:
        ndb = normalize(p['name'])
        db_parts = ndb.split()

        if norm_initial:
            # Abbreviated format: "F. Last Name"
            if not db_parts[0].startswith(norm_initial):
                continue
            db_last = ' '.join(db_parts[1:]) if len(db_parts) > 1 else ndb
            if norm_last == db_last or ndb.endswith(norm_last) or norm_last in ndb:
                exact.append(p)
            else:
                ratio = SequenceMatcher(None, norm_last, db_last).ratio()
                if ratio > 0.75:
                    fuzzy.append((p, ratio))
        else:
            # Full name format: "First Last" or single name
            # 1. Exact match
            if ndb == norm_last:
                exact.append(p)
                continue
            # 2. Tail match: DB name == last N words of Opta name
            n = len(db_parts)
            if len(opta_words) >= n and opta_words[-n:] == db_parts:
                exact.append(p)
                continue
            # 3. Fuzzy fallback
            ratio = SequenceMatcher(None, norm_last, ndb).ratio()
            if ratio > 0.80:
                fuzzy.append((p, ratio))

    if len(exact) == 1:
        return exact[0]['name'], 'exact'
    if len(exact) > 1:
        best = max(exact, key=lambda p: SequenceMatcher(None, norm_last, normalize(p['name'])).ratio())
        return best['name'], 'multi'
    if fuzzy:
        best = max(fuzzy, key=lambda x: x[1])
        return best[0]['name'], f'fuzzy({best[1]:.2f})'
    return 'NOT FOUND', 'none'


def get_val(cell) -> str:
    ps = cell.getElementsByType(P)
    return ''.join(str(p) for p in ps) if ps else ''


def process_sheet(sheet, players: list, sheet_label: str) -> tuple[list, dict]:
    """Add 'DB Name' column to sheet. Returns (unmatched, {db_name: opta_name})."""
    rows = sheet.getElementsByType(TableRow)
    unmatched = []
    matched_pairs = {}

    for i, row in enumerate(rows):
        cells = row.getElementsByType(TableCell)
        if not cells:
            continue

        # Collect all values (respecting repeat counts) to check if row is empty
        all_vals = []
        for c in cells:
            repeat = int(c.getAttribute('numbercolumnsrepeated') or 1)
            all_vals.extend([get_val(c)] * min(repeat, 5))
        stripped = [v for v in all_vals if v]
        if not stripped:
            continue

        if i == 0:
            # Header row
            db_cell = TableCell()
            db_cell.addElement(P(text='DB Name'))
        else:
            opta_name = stripped[0]
            db_name, confidence = match_player(opta_name, players)
            db_cell = TableCell()
            db_cell.addElement(P(text=db_name))
            mark = ' !!!' if confidence in ('none',) else ''
            print(f'  [{sheet_label}] {opta_name!r:28} -> {db_name!r} ({confidence}){mark}')
            if confidence == 'none':
                unmatched.append(opta_name)
            elif db_name != 'NOT FOUND':
                matched_pairs[db_name] = opta_name.strip()

        row.addElement(db_cell)

    return unmatched, matched_pairs


def process_file(fname: str, players_by_code: dict) -> dict:
    """Returns {db_name: opta_name} for all matched players in this file."""
    print(f'\n=== {fname} ===')
    doc = load(fname)
    sheets = doc.spreadsheet.getElementsByType(Table)
    sheet_names = [s.getAttribute('name') for s in sheets]
    all_pairs = {}

    if 'RES' in sheet_names:
        # Standard format: RES / T1 / T2
        team1 = team2 = None
        for s in sheets:
            if s.getAttribute('name') == 'RES':
                rows = s.getElementsByType(TableRow)
                if len(rows) > 1:
                    cells = rows[1].getElementsByType(TableCell)
                    vals = [get_val(c) for c in cells]
                    team1 = vals[0].strip() if vals else None
                    team2 = vals[4].strip() if len(vals) > 4 else None

        code1 = TEAM_TO_CODE.get(team1, 'UNKNOWN')
        code2 = TEAM_TO_CODE.get(team2, 'UNKNOWN')
        print(f'  T1: {team1} → {code1} | T2: {team2} → {code2}')

        for s in sheets:
            sn = s.getAttribute('name')
            if sn == 'T1':
                un, pairs = process_sheet(s, players_by_code.get(code1, []), 'T1')
                all_pairs.update(pairs)
                if un:
                    print(f'  !! UNMATCHED T1: {un}')
            elif sn == 'T2':
                un, pairs = process_sheet(s, players_by_code.get(code2, []), 'T2')
                all_pairs.update(pairs)
                if un:
                    print(f'  !! UNMATCHED T2: {un}')
    else:
        # Non-standard format (e.g., BRA v MOR uses sheet names 'BRA' / 'Mro')
        for s in sheets:
            sn = s.getAttribute('name')
            code = SHEET_TO_CODE.get(sn)
            if code:
                print(f'  Sheet: {sn} → {code}')
                un, pairs = process_sheet(s, players_by_code.get(code, []), sn)
                all_pairs.update(pairs)
                if un:
                    print(f'  !! UNMATCHED {sn}: {un}')
            else:
                print(f'  Skipping unknown sheet: {sn}')

    doc.save(fname)
    print(f'  Saved.')
    return all_pairs


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, 'players_rows_new_version.csv')

    all_csv_rows: list = []
    players_by_code: dict = {}
    with open(csv_path) as f:
        all_csv_rows = list(csv.DictReader(f))
    for row in all_csv_rows:
        players_by_code.setdefault(row['country_code'], []).append(row)

    # Optional: pass specific filenames as arguments to avoid re-processing old files
    if len(sys.argv) > 1:
        ods_files = [os.path.join(script_dir, a) if not os.path.isabs(a) else a for a in sys.argv[1:]]
    else:
        ods_files = sorted(
            os.path.join(script_dir, f) for f in os.listdir(script_dir)
            if f.endswith('.ods') and os.path.isfile(os.path.join(script_dir, f))
        )

    all_new_pairs: dict = {}
    for fname in ods_files:
        all_new_pairs.update(process_file(fname, players_by_code))

    # Write back new opta_name mappings that weren't already in the CSV
    updated = 0
    for row in all_csv_rows:
        if row['name'] in all_new_pairs and not row.get('opta_name', '').strip():
            row['opta_name'] = all_new_pairs[row['name']]
            updated += 1
    if updated:
        print(f'\nWriting {updated} new opta_name entries to {os.path.basename(csv_path)}...')
        fieldnames = list(all_csv_rows[0].keys()) if all_csv_rows else []
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_csv_rows)
        print('CSV updated.')

    print('\nDone.')


if __name__ == '__main__':
    main()
