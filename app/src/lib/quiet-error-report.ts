import {
  type QuietErrorClass,
  quietBurstKey,
} from "@houston/sdk/quiet-error-class";
import { classifyAnalyticsError } from "./analytics";
import { createBurstGate } from "./error-burst";
import { agentKeyOf, quietErrorDetails } from "./quiet-error-class";
import { captureQuietEvent } from "./sentry-quiet";
import { createSentryReportError } from "./sentry-report-error";
import { markReportedToSentry } from "./sentry-reported-mark";
import { wakingStuckTracker } from "./waking-stuck-tracker";

const captureBurst = createBurstGate();

export function reportQuietError(
  kind: QuietErrorClass,
  command: string,
  message: string,
  err: unknown,
  context?: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  markReportedToSentry(err);
  const { status, body } = quietErrorDetails(err);
  const agent = agentKeyOf(err, context);
  const now = Date.now();
  if (captureBurst.isFirst(quietBurstKey(kind, command, agent), now)) {
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
      extra: { ...extra, command, agent_id: agent, http_status: status, body },
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
