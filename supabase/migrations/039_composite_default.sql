ALTER TABLE auction_state ALTER COLUMN scoring_system SET DEFAULT 'opta';
UPDATE auction_state SET scoring_system = 'opta';
COMMENT ON COLUMN auction_state.scoring_system IS '''current'' = FPL, ''opta'' = Composite (FPL base + performance bonuses) — default';
