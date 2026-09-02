import { classifyAnalyticsError } from "./analytics";
import { createBurstGate } from "./error-burst";
import {
  agentKeyOf,
  type QuietErrorClass,
  quietErrorDetails,
} from "./quiet-error-class";
import { captureQuietEvent } from "./sentry-quiet";
import { createSentryReportError } from "./sentry-report-error";
import { markReportedToSentry } from "./sentry-reported-mark";
import { wakingStuckTracker } from "./waking-stuck-tracker";

/**
 * The Sentry half of a quiet-class failure (PRODUCT-1640): the user got the
 * deduped informational toast (or nothing, for a `{ toast: false }` path), we
 * get ONE warning-level event per burst in the class's single fingerprinted
 * issue, carrying the command, agent, status and raw gateway body.
 *
 * Burst-collapsed on (class, command, agent) with the toast layer's window:
 * a dozen concurrent reads of one waking agent are one occurrence of one
 * problem, and counting them twelve times would only inflate the issue's
 * numbers against a Sentry quota. Distinct commands and distinct agents still
 * count separately, so the issue's event list reads as a per-agent timeline.
 *
 * For the waking class the answer also feeds the per-agent stuck-wake tracker;
 * an agent answering nothing but waking past the threshold escalates once, as
 * an error-level `waking_stuck` event with the first and last raw bodies.
 */
const captureBurst = createBurstGate();

export function reportQuietError(
  kind: QuietErrorClass,
  command: string,
  message: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  markReportedToSentry(err);
  const { status, body } = quietErrorDetails(err);
  const agent = agentKeyOf(err, context);
  const now = Date.now();
  if (captureBurst.isFirst(`${kind}:${command}:${agent ?? ""}`, now)) {
    captureQuietEvent(createSentryReportError(command, message, err), {
      level: "warning",
      fingerprint: [kind],
      tags: {
        source: command,
        quiet_class: kind,
        error_kind: classifyAnalyticsError(message),
        ...(agent ? { agent_id: agent } : {}),
        ...(status !== null ? { http_status: String(status) } : {}),
      },
      extra: { command, agent_id: agent, http_status: status, body },
    });
  }
  if (kind !== "engine_waking" || !agent) return;
  const stuck = wakingStuckTracker.noteWaking(agent, body ?? message, now);
  if (!stuck) return;
  console.error(
    `[waking_stuck] ${agent} has answered waking for ${Math.round(stuck.sinceMs / 1000)}s (${stuck.answers} answers): ${stuck.lastBody}`,
  );
  captureQuietEvent(
    createSentryReportError(
      "waking_stuck",
      `agent answering waking for ${Math.round(stuck.sinceMs / 1000)}s: ${stuck.lastBody}`,
      err,
    ),
    {
      level: "error",
      fingerprint: ["waking_stuck"],
      tags: {
        source: command,
        quiet_class: "waking_stuck",
        agent_id: agent,
        ...(status !== null ? { http_status: String(status) } : {}),
      },
      extra: {
        command,
        agent_id: agent,
        since_ms: stuck.sinceMs,
        answers: stuck.answers,
        first_body: stuck.firstBody,
        last_body: stuck.lastBody,
      },
    },
  );
}
