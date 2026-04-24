-- ============================================================
-- Phase 6 Test Data — Step 7: 64 Lockable Players (4.0–8.0M)
-- ============================================================
-- Inserts 64 real-world players all priced ≤8.0M so that:
--   • They qualify as lockable (price ≤ 8.5 threshold)
--   • They can be assigned as auction-won squad players
--   • Transfer window locked-swap tests work correctly
--
-- Pre-condition: none. Safe to run on any database state.
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING.
--
-- Positions: 10 GK + 18 DEF + 18 MID + 18 FWD = 64 players
-- ============================================================

INSERT INTO players (name, country, country_code, position, price) VALUES

  -- ── Goalkeepers (10) — 4.5–7.0M ──────────────────────────────
  ('Mike Maignan',             'France',      'FRA', 'GK',  7.0),
  ('Emiliano Martínez',        'Argentina',   'ARG', 'GK',  7.0),
  ('Gianluigi Donnarumma',     'Italy',       'ITA', 'GK',  7.0),
  ('Jordan Pickford',          'England',     'ENG', 'GK',  6.5),
  ('Yann Sommer',              'Switzerland', 'SUI', 'GK',  6.5),
  ('Diogo Costa',              'Portugal',    'POR', 'GK',  6.5),
  ('Guglielmo Vicario',        'Italy',       'ITA', 'GK',  6.0),
  ('Brice Samba',              'Congo',       'COD', 'GK',  5.5),
  ('Matz Sels',                'Belgium',     'BEL', 'GK',  5.0),
  ('Predrag Rajković',         'Serbia',      'SRB', 'GK',  4.5),

  -- ── Defenders (18) — 5.0–7.5M ─────────────────────────────────
  ('Jules Koundé',             'France',      'FRA', 'DEF', 7.5),
  ('Dayot Upamecano',          'France',      'FRA', 'DEF', 7.5),
  ('William Saliba',           'France',      'FRA', 'DEF', 7.5),
  ('Rúben Dias',               'Portugal',    'POR', 'DEF', 7.5),
  ('Lisandro Martínez',        'Argentina',   'ARG', 'DEF', 7.0),
  ('Cristian Romero',          'Argentina',   'ARG', 'DEF', 7.0),
  ('João Cancelo',             'Portugal',    'POR', 'DEF', 7.0),
  ('Kyle Walker',              'England',     'ENG', 'DEF', 7.0),
  ('Pau Cubarsí',              'Spain',       'ESP', 'DEF', 6.5),
  ('Dani Carvajal',            'Spain',       'ESP', 'DEF', 6.5),
  ('Ben White',                'England',     'ENG', 'DEF', 6.5),
  ('Pedro Porro',              'Portugal',    'POR', 'DEF', 6.5),
  ('Ferdi Kadioglu',           'Turkey',      'TUR', 'DEF', 6.0),
  ('Ezri Konsa',               'England',     'ENG', 'DEF', 6.0),
  ('Destiny Udogie',           'Italy',       'ITA', 'DEF', 6.0),
  ('Borna Sosa',               'Croatia',     'CRO', 'DEF', 5.5),
  ('Jeremie Frimpong',         'Netherlands', 'NED', 'DEF', 5.5),
  ('Mitchell van den Berg',    'Netherlands', 'NED', 'DEF', 5.0),

  -- ── Midfielders (18) — 5.0–8.0M ───────────────────────────────
  ('Florian Wirtz',            'Germany',     'GER', 'MID', 8.0),
  ('Jamal Musiala',            'Germany',     'GER', 'MID', 8.0),
  ('Martin Ødegaard',          'Norway',      'NOR', 'MID', 8.0),
  ('Bernardo Silva',           'Portugal',    'POR', 'MID', 8.0),
  ('Luka Modrić',              'Croatia',     'CRO', 'MID', 7.5),
  ('Declan Rice',              'England',     'ENG', 'MID', 7.5),
  ('Vitinha',                  'Portugal',    'POR', 'MID', 7.5),
  ('Nico Williams',            'Spain',       'ESP', 'MID', 7.5),
  ('Dani Olmo',                'Spain',       'ESP', 'MID', 7.5),
  ('Alexis Mac Allister',      'Argentina',   'ARG', 'MID', 7.5),
  ('Enzo Fernández',           'Argentina',   'ARG', 'MID', 7.5),
  ('Teun Koopmeiners',         'Netherlands', 'NED', 'MID', 7.5),
  ('Khvicha Kvaratskhelia',    'Georgia',     'GEO', 'MID', 7.5),
  ('Takefusa Kubo',            'Japan',       'JPN', 'MID', 7.0),
  ('Dominik Szoboszlai',       'Hungary',     'HUN', 'MID', 7.0),
  ('Daichi Kamada',            'Japan',       'JPN', 'MID', 6.5),
  ('Granit Xhaka',             'Switzerland', 'SUI', 'MID', 6.0),
  ('Brajan Gruda',             'Germany',     'GER', 'MID', 5.0),

  -- ── Forwards (18) — 5.5–8.0M ───────────────────────────────────
  ('Antoine Griezmann',        'France',      'FRA', 'FWD', 8.0),
  ('Bukayo Saka',              'England',     'ENG', 'FWD', 8.0),
  ('Lautaro Martínez',         'Argentina',   'ARG', 'FWD', 8.0),
  ('Marcus Rashford',          'England',     'ENG', 'FWD', 7.5),
  ('Gabriel Martinelli',       'Brazil',      'BRA', 'FWD', 7.5),
  ('Cody Gakpo',               'Netherlands', 'NED', 'FWD', 7.5),
  ('Kai Havertz',              'Germany',     'GER', 'FWD', 7.5),
  ('Leroy Sané',               'Germany',     'GER', 'FWD', 7.5),
  ('Romelu Lukaku',            'Belgium',     'BEL', 'FWD', 7.0),
  ('Ángel Di María',           'Argentina',   'ARG', 'FWD', 7.0),
  ('Richarlison',              'Brazil',      'BRA', 'FWD', 7.0),
  ('Ferran Torres',            'Spain',       'ESP', 'FWD', 7.0),
  ('Álvaro Morata',            'Spain',       'ESP', 'FWD', 7.0),
  ('Gabriel Jesus',            'Brazil',      'BRA', 'FWD', 6.5),
  ('Donyell Malen',            'Netherlands', 'NED', 'FWD', 6.5),
  ('Olivier Giroud',           'France',      'FRA', 'FWD', 6.5),
  ('Memphis Depay',            'Netherlands', 'NED', 'FWD', 6.0),
  ('Taiwo Awoniyi',            'Nigeria',     'NGA', 'FWD', 5.5)

ON CONFLICT DO NOTHING;

-- ── Quick check ───────────────────────────────────────────────
-- SELECT position, COUNT(*) AS n, MIN(price) AS min_p, MAX(price) AS max_p
-- FROM players
-- WHERE price <= 8.0
-- GROUP BY position ORDER BY position;
--
-- Expected after seeding (includes lockable players from 00_seed_players):
--   DEF: 23  FWD: 20  GK: 15  MID: 23
