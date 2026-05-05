# Auth Session Sharing Issue — Gateway ↔ Fantasy

## Status
Unresolved. Documented after session on branch `fix/gateway-dev-proxy`.

---

## What Works, What Doesn't

| App | Status | Reason |
|-----|--------|--------|
| Gateway login | ✅ Works | Owns the auth flow |
| Polla (after gateway login) | ✅ Works | Astro SSR — reads `Cookie` HTTP header server-side |
| Fantasy (after gateway login) | ❌ Fails | React SPA — reads `document.cookie` in browser |

---

## Root Cause

The three apps use two fundamentally different session-reading mechanisms:

**Polla** is Astro SSR. Its middleware uses `createServerClient` which reads the `Cookie`
request header on every HTTP request. Cookies are always in this header regardless of
their `httpOnly` flag. Session is always visible.

**Fantasy** is a React SPA. Its `AuthProvider` uses `createBrowserClient` which reads
`document.cookie` in the browser. If session cookies have the `httpOnly` flag set,
JavaScript cannot read them — session appears null.

### The Cookie Lifecycle

1. **Login** — `LoginForm.tsx` calls `supabase.auth.signInWithPassword()` via
   `createBrowserClient` → session stored in **non-HttpOnly** cookies → JS can read them ✅

2. **Navigate to gateway `/`** — gateway middleware (`createServerClient`) runs,
   calls `supabase.auth.getSession()`, session gets refreshed, `setAll` callback fires,
   Astro's `context.cookies.set()` is called with options from `@supabase/ssr`.
   If those options include `httpOnly: true`, the cookies are now invisible to JS.

3. **Navigate to `/fantasy/`** — Fantasy's `AuthProvider` calls `getSession()` via
   `createBrowserClient` → reads `document.cookie` → finds nothing (HttpOnly) → `user`
   is null → redirects to gateway.

### Why Polla doesn't have this problem
Polla's session check is 100% server-side. It never needs `document.cookie`. The `httpOnly`
flag is irrelevant when reading from HTTP request headers.

---

## Fixes Considered

### Option A — `httpOnly: false` override in gateway middleware
In `apps/gateway/src/middleware.ts`, override the cookie options in `setAll`:

```ts
setAll: (cookiesToSet) => {
  cookiesToSet.forEach(({ name, value, options }) =>
    context.cookies.set(name, value, { ...options, httpOnly: false })
  );
},
```

- **Pros**: One line, fixes it immediately
- **Cons**: Security trade-off — XSS attacks can steal auth tokens. Also doesn't address
  whether the gateway middleware should even be running for proxy routes.

---

### Option B — Exclude proxy paths from gateway middleware (recommended short-term)
The gateway middleware has no business refreshing/rewriting cookies for requests
that belong to Polla or Fantasy. Add proxy paths to the exclusion list:

In `apps/gateway/src/middleware.ts`:
```ts
const PUBLIC_PATHS = ['/login', '/register', '/auth/callback'];
const PROXY_PATHS = ['/polla', '/fantasy'];

export const onRequest = defineMiddleware(async (context, next) => {
  if (
    PUBLIC_PATHS.some((p) => context.url.pathname.startsWith(p)) ||
    PROXY_PATHS.some((p) => context.url.pathname.startsWith(p))
  ) {
    return next();
  }
  // ... rest of middleware unchanged
```

- **Pros**: Architecturally correct — each app owns its auth boundary. No security
  trade-off. Stops the middleware from overwriting login cookies for proxy routes.
- **Cons**: Dev-only fix (production needs separate work). Unauthenticated users
  hitting `/fantasy/` directly get a client-side redirect instead of server-side,
  but Fantasy's `ProtectedRoute` already handles this via `redirectToGateway()`.
- **Uncertainty**: Need to confirm whether Astro middleware runs before or after
  Vite's proxy in the dev server middleware chain. If Vite proxies first (before
  Astro middleware), this fix is a no-op (middleware never runs for proxy routes
  anyway and the real cause is something else).

---

### Option C — Migrate Fantasy from Vite+React SPA to Astro+React (long-term)
Convert Fantasy to an Astro SSR app with React islands, matching Polla's architecture.

- **Pros**: Eliminates the problem entirely. All three apps read session server-side.
  Consistent architecture. Works in production with the same adapter pattern as Polla.
- **Cons**: Significant refactor. Fantasy has many React components, contexts, hooks,
  and React Router routes. Not a quick fix.

---

### Option D — Session endpoint on gateway (recommended long-term for SPA)
Gateway exposes a `/api/session` endpoint. Fantasy fetches it on load to initialize
auth state, instead of reading cookies directly.

Flow:
1. Fantasy mounts → fetches `GET /api/session` (same origin, cookies ride along)
2. Gateway endpoint reads session server-side (can see HttpOnly cookies)
3. Returns `{ user, profile }` JSON
4. Fantasy initializes `AuthProvider` state from this response

```ts
// apps/gateway/src/pages/api/session.ts
import { createServerClient } from '@supabase/ssr';

export async function GET({ request, cookies }) {
  const supabase = createServerClient(/* ... */);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response(JSON.stringify(null), { status: 401 });
  const { data: profile } = await supabase
    .from('users').select('*').eq('id', session.user.id).single();
  return new Response(JSON.stringify({ user: session.user, profile }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- **Pros**: Keeps cookies HttpOnly (secure). No refactor of Fantasy components.
  Works in both dev and production. Single source of truth for session state.
- **Cons**: Extra network request on Fantasy load. Requires changes to `AuthProvider`
  to accept externally-initialized state, or a new wrapper component.

---

## Recommendation

| Timeline | Action |
|----------|--------|
| **Next session (unblock dev)** | Try Option B first — exclude proxy paths from gateway middleware. Verify whether it fixes Fantasy. If middleware isn't running for proxy routes anyway, move to Option A as a quick unblock. |
| **Production / long-term** | Implement Option D (session endpoint). It's the only option that works correctly in both dev and production without a security trade-off or a major refactor. |

---

## Related Files

| File | Role |
|------|------|
| `apps/gateway/src/middleware.ts` | Gateway session guard — where cookie refresh happens |
| `apps/gateway/astro.config.mjs` | Vite dev proxy config (`/polla` → 4322, `/fantasy` → 4323) |
| `packages/supabase/src/client.ts` | Shared `createBrowserClient` singleton |
| `packages/supabase/src/auth-context.tsx` | `AuthProvider` — calls `getSession()` via browser client |
| `apps/fantasy/src/App.jsx` | `ProtectedRoute` + `HomeRedirect` — client-side auth guards |
| `apps/gateway/src/pages/auth/signout.astro` | Signout endpoint (POST only) |

---

## Also Note — Profile Data Not Loading

Separate from the session issue: even when `user` is non-null in Fantasy's `AuthProvider`,
`profile` may be null because `fetchProfile` queries the `users` table and finds no row.

Check: Supabase dashboard → Table Editor → `users` table → verify a row exists for the
test user's ID (matching `auth.users`).

If missing, insert manually or re-register via the gateway's `/register` page, which
handles the `users` table insert automatically via `RegisterForm.tsx`.
