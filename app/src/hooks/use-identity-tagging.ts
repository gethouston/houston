import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import type { Session } from "../lib/identity";
import {
  clearUser as clearSentryUser,
  setUser as setSentryUser,
} from "../lib/sentry";

/**
 * Tags the user in PostHog AND Sentry on sign-in; resets both on sign-out. The
 * install_id stays PostHog's distinct_id (the website UTM bridge + onboarding
 * funnel depend on it); `identifyUser` aliases the Firebase uid onto that person
 * (merging the same human across devices/reinstalls) AND attaches
 * firebase_uid / email as person properties, so every authenticated person is
 * both one PostHog person and joinable to a Firebase account. Sentry gets the
 * same identity so crashes are attributable to a user when triaging. The
 * identity Session carries no created_at, so signupDate is null.
 */
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
