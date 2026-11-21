import { PROVISIONING_TTL_MS, type ProvisioningEntry } from "./entry.ts";

export const PROVISIONING_PROBE_FILE = ".houston/config/config.json";

export const PROVISIONING_RETRY_MS = 3_000;

export function probeSaysStillStarting(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== "number") return true;
  return status === 502 || status === 503 || status === 504;
}

export function probeSaysAgentGone(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}

export interface ProbeDeps {
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  isMarked: (agentId: string) => boolean;
  onReady: (agentId: string) => void;
  onGone: (agentId: string, err: unknown) => void;
  onTimeout: (agentId: string, error: ProvisioningTimeoutError) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export class ProvisioningTimeoutError extends Error {
  readonly attempts: number;
  readonly heldOpen: boolean;
  constructor(attempts: number, lastError: unknown) {
    const heldOpen = lastError === undefined;
    const last = heldOpen
      ? "the last attempt was still held open, the engine never answered"
      : `last failure: ${describeProbeFailure(lastError)}`;
    super(
      `engine did not answer within ${PROVISIONING_TTL_MS / 60_000} min (${attempts} attempts; ${last})`,
      { cause: lastError },
    );
    this.name = "ProvisioningTimeoutError";
    this.attempts = attempts;
    this.heldOpen = heldOpen;
  }
}

function describeProbeFailure(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number"
      ? `HTTP ${status} ${err.message}`
      : `${err.name}: ${err.message}`;
  }
  return String(err);
}

export async function runProvisioningProbe(
  entry: ProvisioningEntry,
  deps: ProbeDeps,
): Promise<void> {
  let lastError: unknown;
  let attempts = 0;
  const initialRemaining = entry.since + PROVISIONING_TTL_MS - deps.now();
  const deadline = deps
    .sleep(Math.max(initialRemaining, 0))
    .then(() => "timeout" as const);
  while (deps.isMarked(entry.agentId)) {
    if (deps.now() - entry.since >= PROVISIONING_TTL_MS) {
      deps.onTimeout(
        entry.agentId,
        new ProvisioningTimeoutError(attempts, lastError),
      );
      return;
    }
    attempts++;
    const attempt = deps
      .readFile(entry.agentPath, PROVISIONING_PROBE_FILE)
      .then(
        () => "ready" as const,
        (err) => {
          lastError = err;
          if (probeSaysAgentGone(err)) return "gone" as const;
          return probeSaysStillStarting(err)
            ? ("still-starting" as const)
            : ("ready" as const);
        },
      );
    const outcome = await Promise.race([attempt, deadline]);
    if (outcome === "timeout") {
      deps.onTimeout(
        entry.agentId,
        new ProvisioningTimeoutError(attempts, lastError),
      );
      return;
    }
    if (outcome === "gone") {
      deps.onGone(entry.agentId, lastError);
      return;
    }
    if (outcome === "ready") {
      deps.onReady(entry.agentId);
      return;
    }
    await deps.sleep(PROVISIONING_RETRY_MS);
  }
}
