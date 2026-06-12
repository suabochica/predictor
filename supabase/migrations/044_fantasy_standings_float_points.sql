-- Composite (FPL+) scoring produces fractional points (e.g. 5.3), but
-- fantasy_standings stored points as INTEGER, so Postgres rounded them to 5.
-- Widen the point columns to numeric(8,1) so saved standings keep one decimal.
ALTER TABLE fantasy_standings
  ALTER COLUMN matchday_points TYPE numeric(8,1),
  ALTER COLUMN total_points    TYPE numeric(8,1);
