// Human copy for provider sign-in failures announced on the login bus.
//
// The `ProviderLoginComplete` bus carries a plain error STRING, so the mapping
// must happen where the failure is still typed: a gateway/engine 5xx
// (`HoustonEngineError`-shaped, carries `status`) stringifies to raw JSON —
// `engine request failed (503): {"detail":...}` — which is noise to the
// non-technical audience. It collapses to a localized "couldn't reach your
// workspace" line; the raw detail is logged FIRST so the bug-report log tail
// keeps it. Anything else keeps its real message (beta policy: the real
// reason, never a generic swallow).

import {
  PROVIDER_CONNECT_TIMEOUT_ERROR,
  PROVIDER_COPILOT_NO_ACCESS_ERROR,
  PROVIDER_LOGIN_PORT_BUSY_ERROR,
  PROVIDER_LOGIN_TIMEOUT_ERROR,
} from "@houston-ai/core";
import i18n from "./i18n";
import { logger } from "./logger";

export function providerLoginFailureText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 500) {
    logger.error(`[provider-login] engine unavailable (${status}): ${raw}`);
    return i18n.t("providers:toast.engineUnavailable");
  }
  return raw;
}

/**
 * Localize a `ProviderLoginComplete.error` string for the failure toast. The
 * engine adapter stays i18n-agnostic and reports its client-side timeouts as
 * stable English sentinels (`@houston-ai/core`); everything else is a real
 * server/CLI message and passes through verbatim (beta policy: the real
 * reason, never a generic swallow).
 */
export function localizedProviderLoginError(error: string): string {
  if (error === PROVIDER_CONNECT_TIMEOUT_ERROR)
    return i18n.t("providers:toast.connectTimedOut");
  if (error === PROVIDER_LOGIN_TIMEOUT_ERROR)
    return i18n.t("providers:toast.loginTimedOut");
  if (error === PROVIDER_LOGIN_PORT_BUSY_ERROR)
    return i18n.t("providers:toast.signInPortBusy");
  if (error === PROVIDER_COPILOT_NO_ACCESS_ERROR)
    return i18n.t("providers:toast.copilotNoAccess");
  return error;
}
