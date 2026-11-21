import { parseComputeRefusalText } from "@houston/wire-types";
import type { Clock } from "../../ports";
import { SdkHttpError } from "../http";
import { isWakingAnswer } from "../waking-answer";

export const WRITE_RETRY_BUDGET_MS = 20_000;
export const WAKING_CREATE_RETRY_MS: readonly number[] = [
  5_000, 15_000, 30_000,
];
const DEFAULT_PAUSE_MS = 2_000;
const MIN_PAUSE_MS = 500;

const AGENT_BUSY_503 = "agent busy; retry in a moment";

function jsonReasonOf(text: string): string | null {
  if (!text.startsWith("{")) return null;
  try {
    const reason = (JSON.parse(text) as { error?: unknown } | null)?.error;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

export function isAgentBusyRefusal(e: unknown): e is SdkHttpError {
  if (!(e instanceof SdkHttpError) || e.status !== 503) return false;
  const text = e.message.trim();
  if (parseComputeRefusalText(text)) return false;
  return (jsonReasonOf(text) ?? text) === AGENT_BUSY_503;
}

export function isWakingWriteRefusal(e: unknown): e is SdkHttpError {
  if (!(e instanceof SdkHttpError)) return false;
  const text = e.message.trim();
  if (parseComputeRefusalText(text)) return false;
  const reason = jsonReasonOf(text);
  return reason !== null && isWakingAnswer(e.status, reason);
}

export interface WriteRetryPolicy {
  wakingLadderMs: readonly number[];
}

export async function retryWriteWhileRefused<T>(
  clock: Clock,
  write: () => Promise<T>,
  policy: WriteRetryPolicy = { wakingLadderMs: [] },
): Promise<T> {
  let busyPaused = 0;
  let wakingRung = 0;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => clock.setTimeout(resolve, ms));
  for (;;) {
    try {
      return await write();
    } catch (e) {
      if (isAgentBusyRefusal(e)) {
        const pause = Math.max(
          MIN_PAUSE_MS,
          e.retryAfterMs ?? DEFAULT_PAUSE_MS,
        );
        if (busyPaused + pause > WRITE_RETRY_BUDGET_MS) throw e;
        busyPaused += pause;
        await sleep(pause);
        continue;
      }
      const rung = isWakingWriteRefusal(e)
        ? policy.wakingLadderMs[wakingRung]
        : undefined;
      if (rung === undefined) throw e;
      wakingRung += 1;
      await sleep(rung);
    }
  }
}
