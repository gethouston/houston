import {
  isIdentityConfigured,
  SESSION_QUERY_KEY,
  type Session,
} from "./identity";
import { queryClient } from "./query-client";

let cachedEmail: string | null = null;

if (isIdentityConfigured()) {
  const read = () => {
    const session = queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY);
    cachedEmail = session?.email ?? null;
  };
  read();
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === SESSION_QUERY_KEY[0]) read();
  });
}

export function getCurrentUserEmail(): string | null {
  return cachedEmail;
}
