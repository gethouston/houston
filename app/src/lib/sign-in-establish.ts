import { analytics } from "./analytics";
import type { Session, SignInOutcome } from "./identity";
import { saveSession, startProactiveRefresh } from "./identity";
import { writeLastSignIn } from "./last-sign-in";
import { logger } from "./logger";
import { cacheSession } from "./session-cache";

export async function establishDesktopSession(
  outcome: SignInOutcome,
  analyticsProvider: string,
): Promise<void> {
  const { session } = outcome;
  await saveSession(session);
  cacheSession(session);
  rememberLastSignIn(session);
  startProactiveRefresh();
  trackSignIn(analyticsProvider, outcome);
  logger.info(`[auth] signed in (${session.provider}) as ${session.email}`);
}

export function establishWebSession(
  outcome: SignInOutcome | null,
  analyticsProvider: string,
): void {
  if (!outcome) return;
  cacheSession(outcome.session);
  rememberLastSignIn(outcome.session);
  trackSignIn(analyticsProvider, outcome);
}

function trackSignIn(
  provider: string,
  { session, isNewUser }: SignInOutcome,
): void {
  if (isNewUser) {
    analytics.identifyUser(session.uid, {
      email: session.email,
      name: session.displayName,
      signupDate: null,
    });
    analytics.track("user_signed_up", { provider });
  }
  analytics.track("user_signed_in", { provider });
}

function rememberLastSignIn(session: Session): void {
  writeLastSignIn({ provider: session.provider, email: session.email });
}
