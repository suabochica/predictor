#!/usr/bin/env python3
"""
Read DB Name → Opta name mappings from all ODS files (excluding today's)
and fill the opta_name column in players_rows.csv.
"""
import csv
import os
import time
from datetime import date

from odf.opendocument import load
from odf.table import Table, TableRow, TableCell
from odf.text import P

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, 'players_rows.csv')
TODAY = date.today()

SHEET_TO_CODE = {'BRA': 'BRA', 'Mro': 'MAR'}


def get_val(cell) -> str:
    ps = cell.getElementsByType(P)
    return ''.join(str(p) for p in ps) if ps else ''


def expand_row(row) -> list[str]:
    """Expand cells respecting number-columns-repeated attribute."""
    vals = []
    for cell in row.getElementsByType(TableCell):
        repeat = int(cell.getAttribute('numbercolumnsrepeated') or 1)
        val = get_val(cell)
        # Cap repeats to avoid huge trailing empty cells
        vals.extend([val] * min(repeat, 20))
    return vals


def extract_mapping_from_sheet(sheet) -> dict[str, str]:
    """Return {db_name: opta_name} from a sheet that has a 'DB Name' column."""
    rows = sheet.getElementsByType(TableRow)
    mapping = {}
    db_col = None

    for i, row in enumerate(rows):
        vals = expand_row(row)
        if not any(v.strip() for v in vals):
            continue

        if i == 0:
            # Header: find DB Name column
            for j, v in enumerate(vals):
                if v.strip() == 'DB Name':
                    db_col = j
                    break
            if db_col is None:
                print(f'  [WARN] No "DB Name" column found in sheet "{sheet.getAttribute("name")}"')
                return {}
            continue

        if db_col is None or db_col >= len(vals):
            continue

        opta_name = vals[0].strip()
        db_name = vals[db_col].strip()

        if opta_name and db_name and db_name != 'NOT FOUND':
            mapping[db_name] = opta_name

    return mapping


def process_file(fpath: str) -> dict[str, str]:
    """Return {db_name: opta_name} from all relevant sheets in an ODS file."""
    doc = load(fpath)
    sheets = doc.spreadsheet.getElementsByType(Table)
    sheet_names = [s.getAttribute('name') for s in sheets]
    mapping = {}

    if 'T1' in sheet_names or 'T2' in sheet_names:
        for s in sheets:
            sn = s.getAttribute('name')
            if sn in ('T1', 'T2'):
                mapping.update(extract_mapping_from_sheet(s))
    else:
        # Non-standard format like BRA v MOR
        for s in sheets:
            sn = s.getAttribute('name')
            if sn in SHEET_TO_CODE:
                mapping.update(extract_mapping_from_sheet(s))

    return mapping


def main():
    import sys
    csv_path = sys.argv[1] if len(sys.argv) > 1 else CSV_PATH

    # Collect ODS files not modified today
    today_mtime_threshold = time.mktime(TODAY.timetuple())
    ods_files = []
    for f in sorted(os.listdir(SCRIPT_DIR)):
        if not f.endswith('.ods'):
            continue
        fpath = os.path.join(SCRIPT_DIR, f)
        mtime = os.path.getmtime(fpath)
        mdate = date.fromtimestamp(mtime)
        if mdate >= TODAY:
            print(f'Skipping (today): {f}')
            continue
        ods_files.append(fpath)

    # Build combined DB Name → Opta name mapping
    full_mapping: dict[str, str] = {}
    for fpath in ods_files:
        fname = os.path.basename(fpath)
        print(f'Processing {fname}...')
        m = process_file(fpath)
        print(f'  {len(m)} mappings found')
        full_mapping.update(m)

    print(f'\nTotal unique DB name mappings: {len(full_mapping)}')

    # Read CSV, update opta_name column
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    # Ensure opta_name column exists
    if rows and 'opta_name' not in rows[0]:
        for row in rows:
            row['opta_name'] = ''

    updated = 0
    not_found = 0
    for row in rows:
        db_name = row['name']
        existing = row.get('opta_name', '').strip()
        if db_name in full_mapping:
            new_val = full_mapping[db_name]
            if existing and existing != new_val:
                print(f'  [OVERWRITE] {db_name}: "{existing}" → "{new_val}"')
            row['opta_name'] = new_val
            updated += 1
        else:
            if not existing:
                not_found += 1

    print(f'\nUpdated: {updated}, Not in any ODS: {not_found}')

    # Write back
    fieldnames = list(rows[0].keys()) if rows else []
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print('CSV saved.')


if __name__ == '__main__':
    main()
