-- 066_users_active_competition.sql
-- Phase 3 of "add a second competition (UEFA Champions League) to Fantasy".
--
-- Durable per-user "which competition am I looking at" preference, so the choice
-- survives devices (a league people open on both phone and laptop). The client
-- keeps a localStorage hint in front of this and a ?competition=<slug> deep link
-- overrides both; this column is the fallback that actually persists.
--
-- No new RLS policy is needed: `packages/supabase/src/auth-context.tsx` already
-- does `from('users').select('*')`, so the column arrives in `profile` for free,
-- and 036_users_rls.sql's `users_update_self` already grants the UPDATE.

ALTER TABLE users ADD COLUMN active_competition_id INTEGER REFERENCES competitions(id);

COMMENT ON COLUMN users.active_competition_id IS
  'Last competition this user selected in the fantasy switcher. Display preference '
  'only — it grants no access and nothing branches on it server-side. NULL = let the '
  'client resolve a default (is_default, then lowest sort_order).';
