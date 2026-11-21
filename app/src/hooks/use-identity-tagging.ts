import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import type { Session } from "../lib/identity";
import {
  clearUser as clearSentryUser,
  setUser as setSentryUser,
} from "../lib/sentry";

export function useIdentityTagging(session: Session | null | undefined): void {
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.uid ?? null;
    const userEmail = session?.email ?? null;
    const signupDate = null;
    if (userId && userId !== prevUserIdRef.current) {
      analytics.identifyUser(userId, {
        email: userEmail,
        name: session?.displayName ?? null,
        signupDate,
      });
      setSentryUser({
        id: userId,
        email: userEmail,
        name: session?.displayName ?? null,
      });
      prevUserIdRef.current = userId;
    } else if (!userId && prevUserIdRef.current) {
      analytics.reset();
      clearSentryUser();
      prevUserIdRef.current = null;
    }
  }, [session]);
}
