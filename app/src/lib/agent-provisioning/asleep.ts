import { PROVISIONING_PROBE_FILE } from "./probe.ts";

/**
 * How long the asleep-check waits before calling the engine asleep (HOU-730).
 * An awake engine answers the tiny probe read in well under a second; a pod
 * scaled to zero is held by the gateway for its whole cold start.
 */
export const ASLEEP_DETECT_TIMEOUT_MS = 2_000;

export interface AsleepDetectDeps {
  /** The same cheap per-agent read the readiness probe uses. */
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

/**
 * One-shot asleep check for an EXISTING agent (HOU-730). A hosted pod scaled
 * to zero holds every per-agent request for its whole cold start — a first
 * message sent then hangs with no bubble and dies with a reload. Asleep =
 * the probe read is still held past the window, or the gateway answered a
 * warm-up status (502/503/504). A fast transport failure is NOT asleep: the
 * user's own request should surface the real network error instead of
 * silently parking messages for an engine that isn't coming.
 */
export async function detectEngineAsleep(
  agentPath: string,
  deps: AsleepDetectDeps,
): Promise<boolean> {
  const attempt = deps.readFile(agentPath, PROVISIONING_PROBE_FILE).then(
    () => false,
    (err) => {
      const status = (err as { status?: unknown } | null)?.status;
      return status === 502 || status === 503 || status === 504;
    },
  );
  const timer = deps.sleep(ASLEEP_DETECT_TIMEOUT_MS).then(() => true);
  return Promise.race([attempt, timer]);
}
