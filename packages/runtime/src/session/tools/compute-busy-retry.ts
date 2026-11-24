import { setTimeout as sleep } from "node:timers/promises";
import {
  type ComputeRefusal,
  parseComputeRefusalText,
  retryAfterMsOf,
} from "@houston/wire-types";

const DEFAULT_PAUSE_MS = 2_000;
const MAX_PAUSE_MS = 15_000;

export const COMPUTE_BUSY_TOOL_MESSAGE =
  "Houston's shared compute had no room for this right now, so nothing ran. Do not call it again in this turn. Tell the user it is busy and to try again in a few minutes.";

export const POD_WAKE_REFUSED_TOOL_MESSAGE =
  "This Houston cannot do that for this AI Employee right now, so nothing ran. Do not retry it. Tell the user plainly and offer what you can do instead.";

export async function computeRefusalOf(
  res: Response,
): Promise<ComputeRefusal | null> {
  if (res.status !== 503) return null;
  return parseComputeRefusalText(await res.clone().text());
}

export async function retryComputeBusyOnce(
  send: () => Promise<Response>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const first = await send();
  const refusal = await computeRefusalOf(first);
  if (refusal?.code !== "compute_busy") return first;
  const pause = Math.min(
    MAX_PAUSE_MS,
    refusal.retryAfterMs ?? retryAfterMsOf(first.headers) ?? DEFAULT_PAUSE_MS,
  );
  await sleep(pause, undefined, signal ? { signal } : undefined);
  return send();
}
