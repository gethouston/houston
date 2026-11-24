import { logAndReportError } from "./error-report";
import { reportQuietError } from "./quiet-error-report";
import {
  pinStallQuietClass,
  type SendPinSignals,
  unsettledPinInputs,
} from "./send-pin-gate";

const COMMAND = "chat.send-pin-settle";

/**
 * Report a send that gave up waiting for the composer's pin (PRODUCT-1771)
 * and went out with the current one. The report names the inputs still
 * unsettled, in the message, a tag and the fingerprint, so each cause is its
 * own issue (HOUSTON-APP-5EX). A stall while the device is offline or the
 * engine is waking is that quiet class's one warning, not a bug.
 */
export function reportSendPinStall(
  signals: SendPinSignals,
  env: Parameters<typeof pinStallQuietClass>[1],
  agentId: string | null,
): void {
  const unsettled = unsettledPinInputs(signals);
  const names = unsettled.join(",") || "none";
  const message = `composer pin never settled (waiting on ${names}); sent the current pin`;
  const err = new Error(message);
  const quiet = pinStallQuietClass(signals, env);
  if (quiet) {
    console.warn(`[${COMMAND}] ${message} (${quiet})`);
    // No agent context: a stall is not an answer from the agent's engine, so
    // it must not count toward that agent's waking_stuck escalation.
    reportQuietError(quiet, COMMAND, message, err, undefined, {
      unsettled_inputs: unsettled,
      stalled_agent_id: agentId,
    });
    return;
  }
  logAndReportError(COMMAND, err, {
    tags: { unsettled_inputs: names },
    fingerprint: [COMMAND, names],
  });
}
