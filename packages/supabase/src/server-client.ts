import { createServerClient as _createServerClient } from '@supabase/ssr';

interface CookieAdapter {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: Record<string, unknown>) => void;
  remove: (name: string, options: Record<string, unknown>) => void;
}

export function createSupabaseServerClient(cookies: CookieAdapter) {
  const url = (import.meta as any).env?.PUBLIC_SUPABASE_URL;
  const key = (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY;
  return _createServerClient(url, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    cookieOptions: {
      sameSite: 'lax',
    },
    // @ts-ignore — ssr v0.x still accepts get/set/remove
    cookies,
  });
}
