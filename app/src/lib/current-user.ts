import { isAuthConfigured, supabase } from "./supabase";

/**
 * Synchronous accessor for the signed-in user's email. Returns `null`
 * when signed out or when Supabase isn't configured (dev builds without
 * SUPABASE_URL).
 *
 * Why a module-level cache instead of `supabase.auth.getSession()`:
 * call sites are inside non-async UI callbacks (toast actions) and
 * bug-report payload construction. The cache is kept fresh by
 * subscribing once to `onAuthStateChange` at module load, mirroring
 * how `useSession` keeps the React tree in sync.
 */
let cachedEmail: string | null = null;

if (isAuthConfigured()) {
  // Seed from any persisted session so reports fired before the first
  // auth-state event still carry the email.
  supabase.auth.getSession().then(({ data }) => {
    cachedEmail = data.session?.user?.email ?? null;
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedEmail = session?.user?.email ?? null;
  });
}

export function getCurrentUserEmail(): string | null {
  return cachedEmail;
}
