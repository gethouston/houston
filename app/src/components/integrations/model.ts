import type {
  Capabilities,
  IntegrationConnection,
} from "@houston/engine-adapter";
import type { IntegrationProviderId } from "@houston/protocol";
import { isIntegrationConnectionGoneError } from "../../lib/integration-connection-gone.ts";

export const INTEGRATION_PROVIDER: IntegrationProviderId = "composio";

export function integrationsSupported(
  capabilities: Pick<Capabilities, "integrations"> | null,
): boolean {
  return (capabilities?.integrations.length ?? 0) > 0;
}

export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150;

export type PollOutcome = "active" | "error" | "timeout" | "cancelled" | "gone";

export async function pollConnectionUntilActive(deps: {
  poll: () => Promise<IntegrationConnection>;
  sleep: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<PollOutcome> {
  const maxAttempts = deps.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (deps.isCancelled()) return "cancelled";
    await deps.sleep(intervalMs);
    if (deps.isCancelled()) return "cancelled";
    let conn: IntegrationConnection;
    try {
      conn = await deps.poll();
    } catch (err) {
      if (!isIntegrationConnectionGoneError(err)) throw err;
      return deps.isCancelled() ? "cancelled" : "gone";
    }
    if (conn.status === "active") return "active";
    if (conn.status === "error") return "error";
  }
  return "timeout";
}

export interface Waker {
  wait: (ms: number) => Promise<void>;
  wake: () => void;
}

interface WakerTimer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMER: WakerTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createWaker(timer: WakerTimer = REAL_TIMER): Waker {
  let resolveCurrent: (() => void) | null = null;
  let handle: unknown = null;
  const settle = () => {
    if (handle !== null) {
      timer.clear(handle);
      handle = null;
    }
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.();
  };
  return {
    wait: (ms) =>
      new Promise<void>((resolve) => {
        resolveCurrent = resolve;
        handle = timer.set(settle, ms);
      }),
    wake: settle,
  };
}
