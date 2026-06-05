-- 036_users_rls.sql
-- Codifies row-level security for public.users.
--
-- Background: RLS was enabled on `users` outside of migrations (via the dashboard)
-- with only a "read your own row" policy. As a result the Admin panel's participant
-- list (`from('users').select(...)`) and every `users(...)` embed returned ONLY the
-- current user's row — which is why the admin saw nobody but themselves.
--
-- This migration makes the policies explicit and adds an admin read path so the
-- Admin panel can list all participants. The admin check goes through a
-- SECURITY DEFINER helper to avoid the self-referential RLS recursion you'd hit
-- with `EXISTS (SELECT 1 FROM users ...)` written directly inside a users policy.

-- ── Admin check helper (SECURITY DEFINER → bypasses RLS, no recursion) ─────────
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = uid AND is_admin);
$$;

-- ── RLS policies on users ─────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop our own policies if re-running; legacy/dashboard policies are left in place
-- (RLS is permissive/OR'd, so an extra self-only policy can't tighten access).
DROP POLICY IF EXISTS users_select_self_or_admin ON public.users;
DROP POLICY IF EXISTS users_insert_self          ON public.users;
DROP POLICY IF EXISTS users_update_self          ON public.users;

-- Self + admin can read. Admins need the full list for the Admin panel.
CREATE POLICY users_select_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Users may create their own row, bound to their auth id (registration / backfill).
CREATE POLICY users_insert_self ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Users may update their own row.
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
