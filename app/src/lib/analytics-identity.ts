/**
 * WHO the events belong to: resolving the install, stitching a signed-in human
 * across their devices, and letting go of both on sign-out.
 *
 * These three are the front door's identity half (`lib/analytics.ts` spreads
 * them into the `analytics` object every call site uses); the capture half —
 * `track` and friends — lives there. Every one of them is a silent no-op
 * without a PostHog key, like the rest of the pipe.
 */

import posthog from "posthog-js";
import { baseSuperProps, ANALYTICS_KEY as KEY } from "./analytics-bootstrap";
import {
  daysBetween,
  ensureFirstInstallProps,
  todayISODate,
} from "./analytics-install-vintage";
import { getInstallId } from "./install-id";
import { currentPlatformOs } from "./platform";

type UserIdentity = {
  email?: string | null;
  /** Provider display name — person property (like email, never an event prop). */
  name?: string | null;
  /**
   * ISO date (YYYY-MM-DD) acquisition cohort. The GCP Identity Platform
   * session carries no created_at, so post-migration callers pass `null`
   * and the signup_date person property is simply not stamped (harmless).
   */
  signupDate?: string | null;
};

function cleanEmail(email?: string | null): string | undefined {
  const value = email?.trim().toLowerCase();
  const at = value?.lastIndexOf("@") ?? -1;
  return value && at > 0 && at < value.length - 1 ? value : undefined;
}

export const analyticsIdentity = {
  /**
   * Resolve the persistent install_id and identify the PostHog distinct_id.
   * Stamps install-vintage person properties (first_install_version,
   * first_install_date) on first launch, days_since_install on every
   * launch. Call once on app mount. Returns `isNew` so callers can track
   * first install.
   */
  init: async (): Promise<{ installId: string; isNew: boolean }> => {
    if (!KEY) return { installId: "", isNew: false };
    const { id, isNew } = await getInstallId();
    const { firstInstallVersion, firstInstallDate } =
      await ensureFirstInstallProps();
    try {
      posthog.identify(id, {
        first_install_version: firstInstallVersion,
        first_install_date: firstInstallDate,
        install_os: currentPlatformOs,
      });
      posthog.register({
        ...baseSuperProps(),
        install_id: id,
        days_since_install: daysBetween(firstInstallDate, todayISODate()),
      });
    } catch {
      // Analytics unavailable
    }
    return { installId: id, isNew };
  },

  /**
   * Tie the signed-in user's Firebase identity to their PostHog person.
   * Call on sign-in. Does two complementary things:
   *
   * 1. `alias(userId)` — adds the Firebase UID as an alias of the current
   *    install_id person. The distinct_id STAYS install_id (so the website
   *    `/welcome` UTM bridge and the sequential onboarding funnel are untouched),
   *    but because every device/reinstall aliases the SAME Firebase UID, PostHog
   *    stitches a human's separate per-device persons into ONE. alias is the call
   *    that merges; a second `identify()` with a new distinct_id is ignored once
   *    a person is identified, so identify is NOT a substitute here.
   * 2. `setPersonProperties` — also stamps `firebase_uid` (plus email `$set`,
   *    signup_date `$set_once`) so the id is a queryable join key to the identity
   *    platform, not only an internal alias. Email is a person property for
   *    lookup/filtering, never an event prop.
   *
   * Finally flips `auth_status` → "authenticated" and stamps `auth_platform`:
   * "gcp" as super properties so every event going forward is tagged with the
   * signed-in platform. Identity-platform discontinuity is ACCEPTED: the UID is
   * a fresh Firebase UID (not the old Supabase id), so historical Supabase-id
   * joins do not carry over — this is a fresh platform, by design.
   */
  identifyUser: (userId: string, identity?: UserIdentity) => {
    if (!KEY) return;
    try {
      const email = cleanEmail(identity?.email);
      const name = identity?.name?.trim() || undefined;
      posthog.alias(userId);
      posthog.setPersonProperties(
        {
          firebase_uid: userId,
          ...(email ? { email } : {}),
          ...(name ? { name } : {}),
        },
        identity?.signupDate ? { signup_date: identity.signupDate } : undefined,
      );
      posthog.register({
        ...baseSuperProps(),
        auth_status: "authenticated",
        auth_platform: "gcp",
      });
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * Reset to a fresh anonymous distinct_id. Call on sign-out.
   *
   * `posthog.reset()` clears all previously registered super properties, and we
   * re-register only `baseSuperProps()` + `auth_status: "anonymous"`. Because
   * `baseSuperProps()` intentionally omits `auth_platform` (the platform is only
   * known post-sign-in), that property drops naturally here and never leaks
   * across a sign-out — no explicit unset needed.
   */
  reset: () => {
    if (!KEY) return;
    try {
      posthog.reset();
      posthog.register({ ...baseSuperProps(), auth_status: "anonymous" });
    } catch {
      // Analytics unavailable
    }
  },
};
