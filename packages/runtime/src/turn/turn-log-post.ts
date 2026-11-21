import { markTurnOnce } from "./turn-network-marks";

export type TurnLogPostResult = "stored" | "retry" | "refused" | "route_absent";

const RETRYABLE = new Set([502, 503, 504]);
const STALL_MS = 100;
const MAX_STALL_WINDOWS = 2;

export function liveDeadline(
  ms: number,
  now: () => number = () => performance.now(),
): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let windows = 0;
  const arm = () => {
    const due = now() + ms;
    timer = setTimeout(() => {
      if (now() - due > STALL_MS && windows < MAX_STALL_WINDOWS) {
        windows += 1;
        arm();
        return;
      }
      controller.abort(
        new DOMException(`timed out after ${ms} ms`, "TimeoutError"),
      );
    }, ms);
    timer.unref?.();
  };
  arm();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export async function postTurnLogBatch(input: {
  fetchImpl: typeof fetch;
  url: string;
  init: Omit<RequestInit, "method" | "signal">;
  timeoutMs: number;
  carriesText: boolean;
}): Promise<TurnLogPostResult> {
  const deadline = liveDeadline(input.timeoutMs);
  try {
    const response = await input.fetchImpl(input.url, {
      ...input.init,
      method: "POST",
      signal: deadline.signal,
    });
    markTurnOnce("t_turnlog_first_post_done");
    if (input.carriesText) markTurnOnce("t_turnlog_text_post_done");
    if (response.ok) return "stored";
    if (response.status === 404) return "route_absent";
    const result = RETRYABLE.has(response.status) ? "retry" : "refused";
    console.warn(
      `[turnlog] batch failed (${response.status}): ${await bodyExcerpt(response)}`,
    );
    return result;
  } catch (error) {
    console.warn(
      "[turnlog] batch failed:",
      error instanceof Error ? error.message : String(error),
    );
    return "retry";
  } finally {
    deadline.clear();
  }
}

async function bodyExcerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch (error) {
    return `unreadable body (${error instanceof Error ? error.message : String(error)})`;
  }
}
