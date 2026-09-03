import { isSignedOutEngineError } from "@houston-ai/engine-client";
import { useUIStore } from "../stores/ui";
import { isAgentWarmingRefusal } from "./agent-warming-refusal";
import { analytics, classifyAnalyticsError } from "./analytics";
import { createBurstGate } from "./error-burst";
import i18n from "./i18n";
import { reportQuietError } from "./quiet-error-report";
import {
  captureException as sentryCapture,
  sentrySuppressedInDev,
} from "./sentry";
import { createSentryReportError } from "./sentry-report-error";
import { markReportedToSentry } from "./sentry-reported-mark";

/** Collapses one root cause's burst of failures into a single counted event. */
const errorBurst = createBurstGate();

export interface ErrorToastOptions {
  /** Authored, localized product copy for this specific failure (a `t()`
   *  result, never a raw `err.message`). Since HOU-1245 it is no longer
   *  displayed; it survives as the burst key, which is what keeps two
   *  genuinely different failures counted separately while one failure hitting
   *  N callers counts once. */
  userMessage?: string;
}

/**
 * Surface an EXPECTED, explainable business state as a plain informational
 * toast — NOT the red "we have a problem" + auto-report pair. Used for gateway
 * states a user can understand and act on (C8 `needs_upgrade`: a write blocked
 * because the team's trial expired), where the report-a-bug framing would be
 * wrong: nothing is broken. No Sentry capture, no green report toast. The raw
 * diagnostic still reaches the frontend log via the caller's `logger.error`.
 */
export function showExpectedStateToast(
  title: string,
  description: string,
): void {
  useUIStore.getState().addToast({ title, description, variant: "info" });
}

/**
 * Surface a transport-level network failure (device offline, host unreachable
 * — HOU-1085) as ONE informational connectivity toast. A connectivity drop
 * fails every live query at once, so the toast dedupes on its (constant)
 * displayed body: the burst reads as one problem. No green "report sent"
 * toast — nothing in Houston broke and there is nothing for us to fix — but
 * the drop still reaches Sentry as a burst-collapsed warning in the single
 * fingerprinted `offline` issue (PRODUCT-1640), so its raw diagnostic is
 * findable beyond the caller's `logger.error` and the `[toast:…]` line here.
 * The analytics event fires only past the dedupe, mirroring `showErrorToast`.
 */
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

/**
 * Surface a client whose update checks keep failing (PRODUCT-1386). The
 * forced updater is fail-open — a check failure only console.warns — so a
 * client that can NEVER reach the release feed (a proxy or region block
 * between it and GitHub) would strand on an old build invisibly, with no
 * server-side floor to catch it since the 426 gate was retired
 * (PRODUCT-1144). The checker calls this once per failure streak, after
 * `UPDATE_CHECK_STUCK_THRESHOLD` consecutive failures:
 *  - one informational toast pointing at the manual download, so the user
 *    can act;
 *  - a dedicated `update_check_failed` analytics event (its own name, not
 *    `app_error_shown`, so a fleet-staleness dashboard can count stuck
 *    clients directly);
 *  - a Sentry capture, so stranded clients get an issue with a user count —
 *    this also surfaces any leaked staging QA build, whose no-op updater
 *    endpoint 404s every check by design.
 */
export function showUpdateCheckStuckToast(
  message: string,
  consecutiveFailures: number,
  currentVersion: string,
): void {
  const command = "update_check";
  console.error(
    `[toast:${command}] ${consecutiveFailures} consecutive check failures: ${message}`,
  );
  useUIStore.getState().addToast({
    title: i18n.t("shell:errorToast.updateStuckTitle"),
    description: i18n.t("shell:errorToast.updateStuckDescription"),
    variant: "info",
  });
  analytics.track("update_check_failed", {
    source: command,
    consecutive_failures: consecutiveFailures,
    from_version: currentVersion,
    error_kind: classifyAnalyticsError(message),
  });
  if (sentrySuppressedInDev) return;
  void sentryCapture(createSentryReportError(command, message), {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}

/**
 * Surface a gateway "engine unavailable" 503 (HOU-1114) or "engine proxy
 * failed" 502 (PRODUCT-1403) as ONE informational "your agent is waking up"
 * toast. The agent's engine pod is provisioning (a just-installed store
 * agent), cold-starting, or restarting under a roll; every per-agent call fails the
 * same way until it wakes, so the toast dedupes on its constant displayed body
 * and the burst reads as one state, not a storm. No green "report sent"
 * toast: nothing in Houston broke and the request self-heals on retry. The
 * answer still reaches Sentry as a burst-collapsed warning in the single
 * fingerprinted `engine_waking` issue, carrying the raw gateway body, and
 * feeds the per-agent stuck-wake escalation (PRODUCT-1640) — `context` is the
 * engine-call context, whose `agentPath` / `agentId` keys that tracker. The
 * analytics event fires only past the dedupe, mirroring `showErrorToast`.
 */
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

/**
 * Report an unexpected error — WITHOUT showing the user anything (HOU-1245).
 *
 * This used to render a toast pair: the red branded "Houston, we have a
 * problem!" box, then a green "report sent — Reference #<id>" follow-up with a
 * copy-the-code action. Both are gone. A generic red box a non-technical user
 * cannot act on, followed by a Sentry event id that means nothing to them, cost
 * more in alarm than it bought in information — and the errors that a user CAN
 * act on (a name that's already taken, no microphone, an expired trial) never
 * came through here: they have authored copy at their own call sites, and they
 * still toast exactly as before. So do the informational states
 * (`showConnectivityErrorToast`, `showEngineWakingToast`) above.
 *
 * NOTE this is a deliberate, scoped exception to the repo's no-silent-failures
 * beta policy: silent to the USER, never silent to us. Every reporting path is
 * untouched, so the failure still reaches:
 *   - the frontend log, via the `console.error` below (mirrored to the log file
 *     and bundled into a Report-bug submission);
 *   - PostHog, via `app_error_shown` (the event name is kept despite nothing
 *     being shown, so the existing error-rate dashboards stay continuous);
 *   - Sentry, via `captureException` with `command` as the triage tag.
 * Losing the toast means losing the user-reported half of a bug report, which
 * makes those three the whole signal — do not quiet them too.
 *
 * `command` is a short machine-readable tag (e.g. "list_workspaces",
 * "uncaught_error") used as the Sentry tag for triage.
 */
export function showErrorToast(
  command: string,
  message: string,
  originalError?: unknown,
  options?: ErrorToastOptions,
): void {
  // A hosted call answered by the transport's synthetic signed-out 401 is an
  // EXPECTED lifecycle state (sign-out / account switch): the sign-in screen is
  // the surface, nothing is broken, and there is no bug to report — so not even
  // a Sentry capture. A REAL rejected bearer never takes this branch because
  // the transport only mints the synthetic body when no session exists at all.
  if (isSignedOutEngineError(originalError)) {
    console.warn(`[toast:${command}] suppressed: signed-out engine call`);
    return;
  }
  // The app's own warming-guard refusal (HOU-693): the "almost ready" dialog
  // is the surface and nothing failed — no capture either (HOUSTON-APP-53K).
  if (isAgentWarmingRefusal(originalError)) {
    console.debug(`[toast:${command}] write blocked while the agent warms up`);
    return;
  }

  // With no toast left, this line is the failure's only trace on the user's
  // machine — guarantee it here rather than trusting each caller to log.
  console.error(`[toast:${command}] ${message}`);

  // Burst key: the copy this failure WOULD have displayed. Analytics counts a
  // problem, so one root cause failing N concurrent callers (HOU-687) must
  // count once, while two distinct authored failures still count separately.
  const surfacedAs =
    options?.userMessage ?? i18n.t("shell:errorToast.genericDescription");
  if (errorBurst.isFirst(surfacedAs, Date.now())) {
    analytics.track("app_error_shown", {
      source: command,
      error_kind: classifyAnalyticsError(message),
    });
  }

  // Sentry keeps EVERY occurrence (it dedupes server-side, and the per-event
  // context is what tells one user's outage from a fleet-wide one).
  // Dev build with Sentry suppressed: initSentry already bailed, so don't.
  if (sentrySuppressedInDev) return;
  markReportedToSentry(originalError);
  void sentryCapture(createSentryReportError(command, message, originalError), {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}

export function raiseJavascriptSentrySmokeTest(): never {
  return raiseJavascriptSentrySmokeTestLeaf();
}

function raiseJavascriptSentrySmokeTestLeaf(): never {
  throw new Error(`sentry-js-stack-smoke-${Date.now()}`);
}
