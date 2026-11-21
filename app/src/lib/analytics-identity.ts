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
  name?: string | null;
  signupDate?: string | null;
};

function cleanEmail(email?: string | null): string | undefined {
  const value = email?.trim().toLowerCase();
  const at = value?.lastIndexOf("@") ?? -1;
  return value && at > 0 && at < value.length - 1 ? value : undefined;
}

export const analyticsIdentity = {
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
    } catch {}
    return { installId: id, isNew };
  },

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
    } catch {}
  },

  reset: () => {
    if (!KEY) return;
    try {
      posthog.reset();
      posthog.register({ ...baseSuperProps(), auth_status: "anonymous" });
    } catch {}
  },
};
