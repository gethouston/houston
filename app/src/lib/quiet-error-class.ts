// The classifiers that NAME a quiet class (the vocabulary and the burst rule
// are the SDK's `@houston/sdk/quiet-error-class`), and the context a low-noise
// Sentry event for one of them carries. Dependency-free (only the classifiers)
// so it is node-testable directly (app/tests/quiet-error-class.test.ts).
//
// A quiet class is an expected environment state — the agent's pod waking
// (`isEngineWakingError`) or the device offline (`isNetworkTransportError`) —
// that the user sees as ONE informational toast, never the bug pair. Until
// PRODUCT-1640 the same classes were declined by every Sentry path outright,
// so a raw gateway body (a DNS dial error against a cold pod, say) existed
// only in the user's local frontend log: hidden from the user had become
// hidden from us. They now capture as a warning with a FIXED fingerprint per
// class (`quiet-error-report.ts`), so each class is one Sentry issue with a
// count and searchable bodies, and a deploy roll can never file new issues.

// Dependency-free subpath: the app's node:test entry points cannot load the
// SDK root (it pulls @houston/domain, whose extensionless imports node rejects).
import { isFirstDayNoProvider } from "@houston/sdk/agents/first-day-refusal";
import {
  isComputeBusyRefusal,
  isConversationEditRefused,
  isPodWakeRefused,
} from "@houston/sdk/compute-quiet";
import { isUploadInterruptedError } from "@houston/sdk/files/upload-interrupted";
import { bridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";
import type { QuietErrorClass } from "@houston/sdk/quiet-error-class";
import { isPlanMinIntervalRefusal } from "@houston/sdk/routines/plan-floor-quiet";
import { isRoutineGone } from "@houston/sdk/routines/routine-gone";
import { isWebhookKeyNotCreatorRefusal } from "@houston/sdk/routines/webhook-key-access";
import { isBugIntakeUnavailable } from "./bug-report-failure.ts";
import {
  isAgentDataBusyError,
  isEngineWakingError,
} from "./engine-waking-error.ts";
import { isNetworkTransportError } from "./network-transport-error.ts";
import { isNoBrowserFailure } from "./url-open-failure.ts";

export type { QuietErrorClass } from "@houston/sdk/quiet-error-class";

/**
 * The bridge classes (`bridge_unsupported`, `bridge_no_agent`, `bridge_state`)
 * are the SDK's call (`bridgeQuietClass`, PRODUCT-1833): expected bridge
 * states every surface reports the same way. Every desktop boot asks, so each
 * is one fingerprinted warning, never a per-user bug. They are checked before
 * the waking class because `bridge_unsupported` also rides a 503.
 *
 * `no_url_handler` is the shell's `open_url` answering that nothing on the
 * machine opens a URL (no default browser, Windows `ShellExecuteW` code 31).
 * `openExternalUrl` already turns that into the remedy toast for the
 * fire-and-forget sites; this class catches the paths that keep the
 * rejection and report it, the codex loopback relay above all
 * (HOUSTON-APP-5EV, PRODUCT-1814): one fingerprinted warning, never a bug.
 *
 * `plan_min_interval` is a routine save the engine refused under the saver's
 * plan floor (the SDK's `isPlanMinIntervalRefusal`): a business state with the
 * plan's own copy, so every reporting path skips it outright.
 *
 * `webhook_not_creator` is a webhook-key mint or rotate the gateway refused
 * because the caller is not the routine's creator (the SDK's
 * `isWebhookKeyNotCreatorRefusal`): the chip already hides the action for
 * them, so this covers a stale routine row, with authored copy and no report.
 *
 * `routine_gone` is a routine write or run-now refused because the routine no
 * longer exists (the SDK's `isRoutineGone`): deleted elsewhere, or a list a
 * stale mirror served (HOUSTON-APP-5JZ / 5K0). Authored copy, plus one
 * fingerprinted warning, since a burst of them means the mirror is stale.
 *
 * `first_day_no_provider` is a first-day start refused because the person has
 * no AI connected (the SDK's `isFirstDayNoProvider`): the start button offers
 * the connect flow instead when it can tell, so this covers a stale provider
 * scan, with authored copy and no report.
 *
 * `bug_intake_unavailable` is the bug-report intake refusing everyone on our
 * side (Linear's plan cap, HOUSTON-APP-5FT). `submitBugReport` reports it
 * itself and delivers the report through the fallback; this catches any other
 * path that reports the typed rejection, so it can never file a per-user bug.
 *
 * `upload_interrupted` is an upload the transport cut before any answer (the
 * SDK's `isUploadInterruptedError`). It used to read as offline while the
 * rest of the app answered fine (HOUSTON-APP-5CG: the edge proxy cut slow
 * uploads at 60 s), so it is checked before the offline class.
 *
 * `agent_data_busy` is a read of a sleeping agent's data the gateway cannot
 * serve yet (HOUSTON-APP-5HP). Reads never wake the agent, so it is report-only:
 * no waking notice, one fingerprinted warning per burst.
 */
export function classifyQuietError(err: unknown): QuietErrorClass | null {
  if (isNoBrowserFailure(err)) return "no_url_handler";
  if (isPlanMinIntervalRefusal(err)) return "plan_min_interval";
  if (isWebhookKeyNotCreatorRefusal(err)) return "webhook_not_creator";
  if (isRoutineGone(err)) return "routine_gone";
  if (isFirstDayNoProvider(err)) return "first_day_no_provider";
  if (isBugIntakeUnavailable(err)) return "bug_intake_unavailable";
  const bridge = bridgeQuietClass(err);
  if (bridge) return bridge;
  if (isComputeBusyRefusal(err)) return "compute_busy";
  if (isConversationEditRefused(err)) return "conversation_edit_refused";
  if (isPodWakeRefused(err)) return null;
  if (isAgentDataBusyError(err)) return "agent_data_busy";
  if (isEngineWakingError(err)) return "engine_waking";
  if (isUploadInterruptedError(err)) return "upload_interrupted";
  if (isNetworkTransportError(err)) return "offline";
  return null;
}

export interface QuietErrorDetails {
  /** HTTP status of the gateway answer; null for a transport drop. */
  status: number | null;
  /** The raw response body, whatever shape the client stack kept it in. */
  body: string | null;
}

/**
 * The status and RAW body off any of the three gateway error shapes
 * (`HoustonEngineError` keeps the parsed JSON on `body`, `AgentsHttpError`
 * carries the raw text as its message, the runtime client's `EngineError`
 * keeps the raw text on `body`) — the searchable payload the Sentry event
 * exists to carry. A transport `TypeError` has no status and its message IS
 * the diagnostic; a status-0 wrapper around one reads the same way, since `0`
 * is "no response", not an HTTP status, and its `body` is the thrown error
 * itself.
 */
export function quietErrorDetails(err: unknown): QuietErrorDetails {
  if (!(err instanceof Error)) return { status: null, body: null };
  const status = (err as { status?: unknown }).status;
  const body = (err as { body?: unknown }).body;
  const rawBody =
    typeof body === "string"
      ? body
      : body instanceof Error
        ? body.message
        : body !== null && body !== undefined
          ? JSON.stringify(body)
          : err.message;
  return {
    status: typeof status === "number" && status > 0 ? status : null,
    body: rawBody,
  };
}

/**
 * The agent a failed call was scoped to, when anything on the way knows it:
 * the `agentId` the gateway fetch stamps on a per-agent `HoustonEngineError`
 * first — it is the SAME id the fetch reports successes under, so an episode
 * keyed on it is the one a later success closes — else the engine-call
 * `context` (some `call()` sites pass `agentPath` / `agentId`). Null for
 * calls no layer could scope (the SDK agent-write path, the runtime client):
 * those still capture, they just cannot feed the per-agent stuck-wake tracker.
 */
export function agentKeyOf(
  err: unknown,
  context?: Record<string, unknown>,
): string | null {
  const stamped = (err as { agentId?: unknown } | null)?.agentId;
  if (typeof stamped === "string" && stamped) return stamped;
  for (const key of ["agentId", "agentPath"]) {
    const value = context?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
