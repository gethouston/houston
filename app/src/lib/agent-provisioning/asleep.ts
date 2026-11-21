import { PROVISIONING_PROBE_FILE } from "./probe.ts";

export const ASLEEP_DETECT_TIMEOUT_MS = 2_000;

export interface AsleepDetectDeps {
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

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
