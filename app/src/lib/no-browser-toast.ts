import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import { createBurstGate } from "./error-burst";
import i18n from "./i18n";
import { isNoUrlHandlerError } from "./open-url-failure.ts";
import { reportQuietError } from "./quiet-error-report";

/** Collapses a sign-in's burst of failed opens into one toast. */
const noBrowserBurst = createBurstGate();

/**
 * Surface the shell's "nothing on this machine opens a URL" answer as ONE
 * informational toast with the remedy (set a default browser, or copy the
 * link): PRODUCT-1814, a Windows machine with no `https` association
 * (`ShellExecuteW` code 31). Every open-URL surface in a sign-in fails the
 * same way, so the toast dedupes on its constant body. No Sentry error:
 * nothing in Houston broke; the answer still lands as a burst-collapsed
 * warning in the single fingerprinted `no_url_handler` issue.
 */
export function showNoBrowserToast(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  console.error(`[toast:${command}] ${message}`);
  reportQuietError("no_url_handler", command, message, originalError);
  const description = i18n.t("shell:errorToast.noBrowserDescription");
  if (!noBrowserBurst.isFirst(description, Date.now())) return;
  analytics.track("app_error_shown", {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });
  useUIStore.getState().addToast({
    title: i18n.t("shell:errorToast.noBrowserTitle"),
    description,
    variant: "info",
  });
}

/**
 * The one decision an open-URL call site with its OWN failure toast makes:
 * a missing default browser takes the remedy toast above (true, handled);
 * anything else is the caller's authored failure copy plus a report (false).
 * The fire-and-forget click sites need nothing: their rejection reaches the
 * global handler and `showErrorToast`, which both classify the same way.
 */
export function surfaceNoBrowser(command: string, err: unknown): boolean {
  if (!isNoUrlHandlerError(err)) return false;
  showNoBrowserToast(
    command,
    err instanceof Error ? err.message : String(err),
    err,
  );
  return true;
}
