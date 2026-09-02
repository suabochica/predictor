-- 069_users_language.sql
-- Phase 0 of the ES/EN i18n plan. See apps/fantasy/I18N_PLAN.md.
--
-- Durable per-user language preference, mirroring 066_users_active_competition.sql
-- line for line. A `predictor.lang` cookie sits in front of this (so the two SSR
-- apps never need a DB round-trip to pick a language) and wins whenever present;
-- this column is what a new device without the cookie falls back to.
--
-- No new RLS policy is needed: `packages/supabase/src/auth-context.tsx` already
-- does `from('users').select('*')`, so the column arrives in `profile` for free,
-- and 036_users_rls.sql's `users_update_self` already grants the UPDATE.

ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'es'
  CHECK (language IN ('es', 'en'));

COMMENT ON COLUMN users.language IS
  'ES/EN UI language preference. Display-only — nothing branches on it server-side '
  'except the two Astro middlewares choosing which catalogue to render. The '
  'predictor.lang cookie takes precedence when present; this is the cross-device fallback.';
