-- Polla: score calculation functions
-- Computes points_earned per prediction based on scoring_rules
-- Group stage: correct_result=5, correct_goals_team=2, correct_diff=1 (max 10)
-- Knockout:    correct_result_ko=10, correct_goals_ko=4, correct_diff_ko=2 (max 20)

CREATE OR REPLACE FUNCTION polla_calculate_points(
  predicted_a INTEGER,
  predicted_b INTEGER,
  actual_a    INTEGER,
  actual_b    INTEGER,
  match_stage TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_result_mult INTEGER;
  v_goals_mult  INTEGER;
  v_diff_mult   INTEGER;
  v_points      INTEGER := 0;
BEGIN
  IF match_stage = 'group' THEN
    v_result_mult := 5;
    v_goals_mult  := 2;
    v_diff_mult   := 1;
  ELSE
    v_result_mult := 10;
    v_goals_mult  := 4;
    v_diff_mult   := 2;
  END IF;

  -- Correct result (winner/draw)
  IF (actual_a > actual_b AND predicted_a > predicted_b)
     OR (actual_a < actual_b AND predicted_a < predicted_b)
     OR (actual_a = actual_b AND predicted_a = predicted_b) THEN
    v_points := v_points + v_result_mult;
  END IF;

  -- Correct goals team A
  IF actual_a = predicted_a THEN
    v_points := v_points + v_goals_mult;
  END IF;

  -- Correct goals team B
  IF actual_b = predicted_b THEN
    v_points := v_points + v_goals_mult;
  END IF;

  -- Correct goal difference
  IF (actual_a - actual_b) = (predicted_a - predicted_b) THEN
    v_points := v_points + v_diff_mult;
  END IF;

  RETURN v_points;
END;
$$;


-- Score all predictions for a single match
CREATE OR REPLACE FUNCTION polla_score_match(match_uuid UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH match_data AS (
    SELECT actual_score_a, actual_score_b, stage
    FROM matches
    WHERE id = match_uuid
      AND actual_score_a IS NOT NULL
      AND actual_score_b IS NOT NULL
  )
  UPDATE predictions
  SET points_earned = polla_calculate_points(
    predictions.predicted_score_a,
    predictions.predicted_score_b,
    match_data.actual_score_a,
    match_data.actual_score_b,
    match_data.stage
  )
  FROM match_data
  WHERE predictions.match_id = match_uuid;
END;
$$;


-- Score all finished matches that have actual scores set
CREATE OR REPLACE FUNCTION polla_score_all_finished_matches()
RETURNS SETOF uuid
LANGUAGE plpgsql
AS $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT id FROM matches
    WHERE actual_score_a IS NOT NULL
      AND actual_score_b IS NOT NULL
    ORDER BY match_date
  LOOP
    PERFORM polla_score_match(m.id);
    RETURN NEXT m.id;
  END LOOP;
END;
$$;
