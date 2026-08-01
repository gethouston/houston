// What happens the moment a sign-in SUCCEEDS: persist (desktop) or mirror (web)
// the session, flip the app cache, remember the method for the returning-user
// button, arm the refresh timer, and fire the analytics pair.
//
// Split out of auth.ts so that file stays the thin provider dispatcher its
// header promises; every provider path lands here, so the ordering guarantees
// (identify BEFORE `user_signed_up`) live in exactly one place.

import { analytics } from "./analytics";
import type { Session, SignInOutcome } from "./identity";
import { saveSession, startProactiveRefresh } from "./identity";
import { writeLastSignIn } from "./last-sign-in";
import { logger } from "./logger";
import { cacheSession } from "./session-cache";

/** Desktop: persist to the Keychain, flip the gate, start proactive refresh. */
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

/** Web: cache the SDK session (or a benign null popup-cancel) and track it. */
export function establishWebSession(
  outcome: SignInOutcome | null,
  analyticsProvider: string,
): void {
  if (!outcome) return; // popup cancelled — no error, no cache write
  cacheSession(outcome.session);
  rememberLastSignIn(outcome.session);
  trackSignIn(analyticsProvider, outcome);
}

// A sign-in that CREATED the account also emits `user_signed_up` — the
// once-per-account event the PostHog → Slack new-user notification and the
// activation funnel key on. `user_signed_in` still fires on every sign-in.
function trackSignIn(
  provider: string,
  { session, isNewUser }: SignInOutcome,
): void {
  if (isNewUser) {
    // Identify BEFORE the sign-up event: the Slack destination renders
    // person.properties.name/email from the person snapshot AT event
    // ingestion (person-on-events), so the $set must precede the event on
    // the wire — App.tsx's identify effect runs a render later, too late.
    analytics.identifyUser(session.uid, {
      email: session.email,
      name: session.displayName,
      signupDate: null,
    });
    analytics.track("user_signed_up", { provider });
  }
  analytics.track("user_signed_in", { provider });
}

// Device-local hint for the sign-in screen, stamped at BOTH terminal success
// points (desktop + web) so every path — OAuth loopback, deep-link, email OTP —
// records it once. Deliberately NOT cleared by `signOut()`: it must survive so
// the next sign-in can suggest how the user signed in last time.
function rememberLastSignIn(session: Session): void {
  writeLastSignIn({ provider: session.provider, email: session.email });
}
