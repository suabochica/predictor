CREATE OR REPLACE FUNCTION public.sync_auth_with_users()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, is_admin, created_at)
  VALUES (NEW.id, NEW.email, , false, now())
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_with_users();