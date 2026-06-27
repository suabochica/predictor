CREATE OR REPLACE FUNCTION set_country_eliminated(p_country_code text, p_eliminated boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE players SET is_eliminated = p_eliminated WHERE country_code = p_country_code;
END $$;
