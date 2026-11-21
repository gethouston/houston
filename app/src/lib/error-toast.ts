import { isSignedOutEngineError } from "@houston/engine-adapter";
import { useUIStore } from "../stores/ui";
import { isAgentWarmingRefusal } from "./agent-warming-refusal";
import { analytics, classifyAnalyticsError } from "./analytics";
import { createBurstGate } from "./error-burst";
import i18n from "./i18n";
import { classifyQuietError } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";
import { surfaceQuietState } from "./quiet-state-surface";
import {
  captureException as sentryCapture,
  sentrySuppressedInDev,
} from "./sentry";
import { createSentryReportError } from "./sentry-report-error";
import { markReportedToSentry } from "./sentry-reported-mark";

const errorBurst = createBurstGate();

export interface ErrorToastOptions {
  userMessage?: string;
  extra?: Record<string, unknown>;
}

export function showExpectedStateToast(
  title: string,
  description: string,
): void {
  useUIStore.getState().addToast({ title, description, variant: "info" });
}

export function showConnectivityErrorToast(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  console.error(`[toast:${command}] ${message}`);
  reportQuietError("offline", command, message, originalError);
  const description = i18n.t("shell:errorToast.offlineDescription");
  if (!errorBurst.isFirst(description, Date.now())) return;
  analytics.track("app_error_shown", {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });
  useUIStore.getState().addToast({
    title: i18n.t("shell:errorToast.offlineTitle"),
    description,
    variant: "info",
  });
}

export function showEngineWakingToast(
  command: string,
  message: string,
  originalError?: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(`[toast:${command}] ${message}`);
  reportQuietError("engine_waking", command, message, originalError, context);
  const description = i18n.t("shell:errorToast.engineWakingDescription");
  if (!errorBurst.isFirst(description, Date.now())) return;
  analytics.track("app_error_shown", {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });
  useUIStore.getState().addToast({
    title: i18n.t("shell:errorToast.engineWakingTitle"),
    description,
    variant: "info",
  });
}

export function showErrorToast(
  command: string,
  message: string,
  originalError?: unknown,
  options?: ErrorToastOptions,
): boolean {
  if (isSignedOutEngineError(originalError)) {
    console.warn(`[toast:${command}] suppressed: signed-out engine call`);
    return true;
  }
  if (isAgentWarmingRefusal(originalError)) {
    console.debug(`[toast:${command}] write blocked while the agent warms up`);
    return true;
  }
  const quiet = classifyQuietError(originalError);
  if (quiet === "offline") {
    showConnectivityErrorToast(command, message, originalError);
    return true;
  }
  if (quiet === "engine_waking") {
    showEngineWakingToast(command, message, originalError);
    return true;
  }
  if (quiet && surfaceQuietState(quiet, command, message, originalError))
    return true;

  console.error(`[toast:${command}] ${message}`);

  const surfacedAs =
    options?.userMessage ?? i18n.t("shell:errorToast.genericDescription");
  if (errorBurst.isFirst(surfacedAs, Date.now())) {
    analytics.track("app_error_shown", {
      source: command,
      error_kind: classifyAnalyticsError(message),
    });
  }

  if (sentrySuppressedInDev) return false;
  markReportedToSentry(originalError);
  void sentryCapture(
    createSentryReportError(command, message, originalError),
    {
      source: command,
      error_kind: classifyAnalyticsError(message),
    },
    options?.extra,
  ).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
  return false;
}
