import { SESSION_QUERY_KEY, type Session } from "./identity";
import { identityChanged } from "./identity-change";
import { resetForIdentityChange } from "./identity-reset";
import { queryClient } from "./query-client";

let activeIdentityUid: string | null = null;

export function cacheSession(session: Session | null): void {
  const nextUid = session?.uid ?? null;
  if (identityChanged(activeIdentityUid, nextUid)) {
    resetForIdentityChange();
  }
  activeIdentityUid = nextUid;
  queryClient.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
}

export function forgetActiveIdentity(): void {
  activeIdentityUid = null;
}

export function applyExternalSession(session: Session | null): void {
  cacheSession(session);
}
