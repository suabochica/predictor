-- Add stadium and stage columns to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stadium TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'group' CHECK (stage IN ('group', 'round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'third_place', 'final'));
