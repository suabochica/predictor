import { defineMiddleware } from 'astro:middleware';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/polla/login', '/polla/register', '/polla/auth'];

export const onRequest = defineMiddleware(async (context, next) => {
  if (PUBLIC_PATHS.some((p) => context.url.pathname.startsWith(p))) {
    return next();
  }

  const supabase = createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () =>
          context.request.headers
            .get('cookie')
            ?.split(';')
            .map((c) => {
              const [name, ...rest] = c.trim().split('=');
              return { name, value: rest.join('=') };
            }) ?? [],
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            context.cookies.set(name, value, options as Parameters<typeof context.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  context.locals.user = user;

  if (!user) {
    return context.redirect('/polla/login');
  }

  // Fetch display name & admin status
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, is_admin')
    .eq('id', user.id)
    .single();
  context.locals.displayName = profile?.display_name ?? null;
  context.locals.isAdmin = profile?.is_admin ?? false;

  // Fetch leaderboard rank
  const { data: leaderboard } = await supabase.rpc('get_leaderboard');
  const userEntry = (leaderboard as any[])?.find((row) => row.user_id === user.id);
  context.locals.leaderboardRank = userEntry ? (leaderboard as any[]).indexOf(userEntry) + 1 : null;
  context.locals.totalPoints = userEntry?.total_points ?? null;

  return next();
});
