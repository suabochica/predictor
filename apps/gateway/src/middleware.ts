import { defineMiddleware } from 'astro:middleware';
import { createServerClient } from '@supabase/ssr';
import { resolveServerLang } from '@predictor/i18n';

const PUBLIC_PATHS = ['/login', '/register', '/auth/callback'];

export const onRequest = defineMiddleware(async (context, next) => {
  // Above the PUBLIC_PATHS early return — /login and /register are public and
  // still need translating.
  const { lang, shouldWriteCookie } = resolveServerLang({
    queryLang: context.url.searchParams.get('lang'),
    cookieHeader: context.request.headers.get('cookie'),
    acceptLanguageHeader: context.request.headers.get('accept-language'),
  });
  context.locals.lang = lang;
  if (shouldWriteCookie) {
    context.cookies.set('predictor.lang', lang, { path: '/', maxAge: 31536000, sameSite: 'lax' });
  }

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
              return { name: name.trim(), value: rest.join('=') };
            }) ?? [],
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            context.cookies.set(name, value, options as Parameters<typeof context.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  context.locals.user = user;

  if (!user) {
    return context.redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single();
  context.locals.displayName = profile?.display_name ?? null;

  return next();
});
