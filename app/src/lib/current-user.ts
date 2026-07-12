import {
  isIdentityConfigured,
  SESSION_QUERY_KEY,
  type Session,
} from "./identity";
import { queryClient } from "./query-client";

/**
 * Synchronous accessor for the signed-in user's email. Returns `null` when
 * signed out or when identity isn't configured (dev builds without Firebase creds).
 *
 * Why a module-level cache instead of an async session read: call sites are
 * inside non-async UI callbacks (toast actions) and bug-report payload
 * construction. The cache subscribes once to the `["session"]` TanStack cache —
 * the single source both surfaces write (desktop `useSession`/refresh, web
 * `cloud-login`/`useSession`) — so it stays fresh without a second auth channel.
 */
let cachedEmail: string | null = null;

if (isIdentityConfigured()) {
  const read = () => {
    const session = queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY);
    cachedEmail = session?.email ?? null;
  };
  read(); // seed from anything already cached
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === SESSION_QUERY_KEY[0]) read();
  });
}

export function getCurrentUserEmail(): string | null {
  return cachedEmail;
}
