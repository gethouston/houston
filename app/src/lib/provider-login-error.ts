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
