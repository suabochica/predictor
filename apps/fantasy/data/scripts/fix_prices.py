#!/usr/bin/env python3
"""
Fix price=20 players in players_final.csv by cross-referencing players_import.csv.

Strategy:
  1. Manual overrides for nickname/common-name players (Gavi, Pedri, Rodri, Vitinha, etc.)
  2. Fuzzy word-overlap matching for systematic name differences (official FIFA full
     names vs. shortened common names, Arabic transliteration variants, etc.)

Run with --dry-run / -n to preview without writing.
"""

import csv, unicodedata, re, sys
from pathlib import Path

BASE       = Path(__file__).parent.parent / "csv"
FINAL_CSV  = BASE / "players_final.csv"
IMPORT_CSV = BASE / "players_import.csv"

# Manual overrides: nickname/common-name players whose first word bears no
# resemblance to their import name, so fuzzy matching can't find them.
# Key: (exact players_final.csv name, country_code)
# Value: exact players_import.csv name
MANUAL_OVERRIDES = {
    ("Pablo Paez Gavira",           "ESP"): "Gavi",
    ("Pedro González López",         "ESP"): "Pedri",
    ("Rodrigo Hernández Cascante",   "ESP"): "Rodri",
    ("Vitor Machado Ferreira",       "POR"): "Vitinha",
    ("Juan Camilo Hernandez Suarez", "COL"): "Cucho Hernández",
    ("Mahmoud Ahmed Ibrahim Hassan", "EGY"): "Trezeguet",
}

THRESHOLD = 0.4   # fraction of import-name words that must match


def deaccent(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")

def normalize(name):
    n = deaccent(name).lower()
    n = re.sub(r"['’`]", "", n)
    n = re.sub(r"\b[a-z]\b\.?", "", n)   # drop single-char initials (e.g. "F")
    return " ".join(n.split())

def strip_al(word):
    """Remove Arabic Al/El/Il/Ul prefix so 'Aldawsari'=='Dawsari'=='Al Dawsari'."""
    for p in ("al", "el", "il", "ul"):
        if word.startswith(p) and len(word) > len(p) + 2:
            return word[len(p):]
    return word

def get_words(name, min_len=3):
    """Normalize, strip Al-prefix, keep words >= min_len chars."""
    return [strip_al(w) for w in normalize(name).split() if len(w) >= min_len]

def word_match(w1, w2, prefix=3):
    """True if both words share a prefix of `prefix` chars (handles Samu/Samuel, etc.)"""
    p = min(prefix, len(w1), len(w2))
    return p >= 2 and w1[:p] == w2[:p]

def first_word_match(fn, im):
    fw, iw = get_words(fn), get_words(im)
    return bool(fw and iw and word_match(fw[0], iw[0]))

def score(final_name, import_name):
    """Fraction of import-name words that have a fuzzy match in final-name words."""
    fw = get_words(final_name)
    iw = get_words(import_name)
    if not iw:
        return 0.0
    matched = sum(1 for iw_w in iw if any(word_match(iw_w, fw_w) for fw_w in fw))
    return matched / len(iw)


def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    import_rows = []
    with open(IMPORT_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            import_rows.append(row)

    import_by_cc   = {}
    import_name_cc = {}
    for r in import_rows:
        import_by_cc.setdefault(r["country_code"], []).append(r)
        import_name_cc[(r["name"], r["country_code"])] = r

    final_rows = []
    with open(FINAL_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            final_rows.append(row)

    used    = set()   # (import_name, cc) already claimed — prevents double-assignment
    changes = []      # (final_row, import_row, method_label)

    for row in final_rows:
        if row["price"] != "20":
            continue
        name, cc = row["name"], row["country_code"]

        # 1. Manual override
        override = MANUAL_OVERRIDES.get((name, cc))
        if override:
            imp = import_name_cc.get((override, cc))
            if imp and (override, cc) not in used:
                changes.append((row, imp, "manual"))
                used.add((override, cc))
                continue

        # 2. Fuzzy match within the same country
        best_s, best_c = 0.0, None
        for c in import_by_cc.get(cc, []):
            if (c["name"], cc) in used:
                continue
            if not first_word_match(name, c["name"]):
                continue
            s = score(name, c["name"])
            if s > best_s:
                best_s, best_c = s, c

        if best_s >= THRESHOLD and best_c:
            changes.append((row, best_c, f"fuzzy({best_s:.2f})"))
            used.add((best_c["name"], cc))

    # ── Report ────────────────────────────────────────────────────────────────
    tag = "DRY RUN — " if dry_run else ""
    print(f"\n{tag}Prices to update: {len(changes)}\n")
    print(f"{'Final CSV name':<52} CC   {'Import name':<36} Old   New    Method")
    print("─" * 122)
    for r, imp, method in sorted(changes, key=lambda x: (x[0]["country_code"], x[0]["name"])):
        print(f"{r['name']:<52} {r['country_code']:<4} {imp['name']:<36} "
              f"{r['price']:>5} → {imp['price']:<6} {method}")

    still_20 = [r for r in final_rows
                if r["price"] == "20" and not any(c[0] is r for c in changes)]
    print(f"\nStill price=20 — genuine gaps in import ({len(still_20)} players):")
    for r in still_20:
        print(f"  {r['country_code']}  {r['name']}")

    if dry_run:
        print("\n(No file written — dry run. Remove --dry-run to apply.)")
        return

    for row, imp, _ in changes:
        row["price"] = imp["price"]

    with open(FINAL_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(final_rows)
    print(f"\nWrote {FINAL_CSV}")


if __name__ == "__main__":
    main()
