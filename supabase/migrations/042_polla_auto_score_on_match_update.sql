-- Auto-score predictions when match actual scores are set or updated

CREATE OR REPLACE FUNCTION polla_trigger_score_on_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.actual_score_a IS NOT NULL
     AND NEW.actual_score_b IS NOT NULL
     AND (OLD.actual_score_a IS DISTINCT FROM NEW.actual_score_a
          OR OLD.actual_score_b IS DISTINCT FROM NEW.actual_score_b) THEN
    PERFORM polla_score_match(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS polla_trg_score_on_match_update ON matches;
CREATE TRIGGER polla_trg_score_on_match_update
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION polla_trigger_score_on_match_update();
