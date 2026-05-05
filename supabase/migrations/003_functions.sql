-- Function to calculate player points for a matchday
CREATE OR REPLACE FUNCTION calculate_player_points(stat_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  stat RECORD;
  pts INTEGER := 0;
BEGIN
  SELECT * INTO stat FROM player_stats WHERE id = stat_id;

  -- Playing time
  IF stat.minutes_played >= 60 THEN
    pts := pts + 2;
  ELSIF stat.minutes_played >= 1 THEN
    pts := pts + 1;
  END IF;

  -- Goals (position-based)
  IF stat.goals > 0 THEN
    DECLARE
      pos TEXT;
      goal_pts INTEGER;
    BEGIN
      SELECT position INTO pos FROM players WHERE id = stat.player_id;
      CASE pos
        WHEN 'GK'  THEN goal_pts := 6;
        WHEN 'DEF' THEN goal_pts := 6;
        WHEN 'MID' THEN goal_pts := 5;
        WHEN 'FWD' THEN goal_pts := 4;
        ELSE goal_pts := 4;
      END CASE;
      pts := pts + (stat.goals * goal_pts);
    END;
  END IF;

  -- Assists
  pts := pts + (stat.assists * 3);

  -- Clean sheet (requires 60+ minutes)
  IF stat.clean_sheet AND stat.minutes_played >= 60 THEN
    DECLARE
      pos TEXT;
      cs_pts INTEGER;
    BEGIN
      SELECT position INTO pos FROM players WHERE id = stat.player_id;
      CASE pos
        WHEN 'GK'  THEN cs_pts := 4;
        WHEN 'DEF' THEN cs_pts := 4;
        WHEN 'MID' THEN cs_pts := 1;
        ELSE cs_pts := 0;
      END CASE;
      pts := pts + cs_pts;
    END;
  END IF;

  -- Saves (every 3)
  pts := pts + FLOOR(stat.saves / 3);

  -- Penalty save
  pts := pts + (stat.penalty_saves * 5);

  -- Negative points
  pts := pts + (stat.yellow_cards * -1);
  pts := pts + (stat.red_cards * -3);
  pts := pts + (stat.own_goals * -2);
  pts := pts + (stat.penalty_misses * -2);

  -- Goals conceded (GK/DEF only, every 2)
  DECLARE
    pos TEXT;
  BEGIN
    SELECT position INTO pos FROM players WHERE id = stat.player_id;
    IF pos IN ('GK', 'DEF') AND stat.goals_conceded > 0 THEN
      pts := pts + (FLOOR(stat.goals_conceded / 2) * -1);
    END IF;
  END;

  -- Bonus points
  pts := pts + stat.bonus_points;

  RETURN pts;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate and update total_points in player_stats
CREATE OR REPLACE FUNCTION refresh_player_points(p_matchday_id INTEGER)
RETURNS VOID AS $$
DECLARE
  stat RECORD;
BEGIN
  FOR stat IN SELECT id FROM player_stats WHERE matchday_id = p_matchday_id LOOP
    UPDATE player_stats
    SET total_points = calculate_player_points(stat.id)
    WHERE id = stat.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
