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
