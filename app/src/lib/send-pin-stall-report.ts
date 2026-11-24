import { logAndReportError } from "./error-report";
import { reportQuietError } from "./quiet-error-report";
import {
  pinStallQuietClass,
  type SendPinSignals,
  unsettledPinInputs,
} from "./send-pin-gate";

const COMMAND = "chat.send-pin-settle";

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
