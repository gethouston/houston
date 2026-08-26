import { readFile } from "node:fs/promises";
import { basename } from "node:path";

// HOUSTON_POOL_WORKER_TOKEN_FILE points at a SINGLE file holding THIS worker's
// token — never a directory of every ordinal's token. The pod projects only
// its own ordinal (pool.yaml subPathExpr), so a compromised turn's bash, which
// runs as the same uid as the runtime, cannot read another worker's token off
// disk and register an attacker endpoint under its id (2026-08-25 review,
// Critical 1). Reading its OWN token is harmless: a single-use worker that has
// already served is refused any further claim server-side (Critical 2 guard).
const ENV_NAMES = [
  "HOUSTON_POOL_REGISTER_URL",
  "HOUSTON_POOL_WORKER_ID",
  "HOUSTON_POOL_WORKER_TOKEN_FILE",
  "HOUSTON_POOL_ENDPOINT",
] as const;

type RegistrationEnv = Partial<Record<(typeof ENV_NAMES)[number], string>>;

/** Parsed registration settings plus the per-worker secret. */
export interface WorkerRegistrationConfig {
  heartbeatUrl: string;
  workerId: string;
  endpoint: string;
  token: string;
  // No pod identity or single-use flag is reported to the gateway: the
  // heartbeat is authenticated by this worker's own token, which the sandboxed
  // turn shares a uid with and can read, so self-reported single-use state is
  // attacker-controllable. The gateway derives those facts from the Kubernetes
  // API instead (2026-08-25 review, Critical 2). The runtime's OWN single-use
  // behavior keys off HOUSTON_POOL_SINGLE_USE (config.poolSingleUse), which a
  // tenant lying to itself gains nothing from.
}

/** Parse all-or-none pool registration env and load this worker's token. */
export async function loadWorkerRegistrationConfig(
  env: RegistrationEnv = process.env,
): Promise<WorkerRegistrationConfig | null> {
  const values = {
    HOUSTON_POOL_REGISTER_URL: env.HOUSTON_POOL_REGISTER_URL?.trim() ?? "",
    HOUSTON_POOL_WORKER_ID: env.HOUSTON_POOL_WORKER_ID?.trim() ?? "",
    HOUSTON_POOL_WORKER_TOKEN_FILE:
      env.HOUSTON_POOL_WORKER_TOKEN_FILE?.trim() ?? "",
    HOUSTON_POOL_ENDPOINT: env.HOUSTON_POOL_ENDPOINT?.trim() ?? "",
  };
  const configured = ENV_NAMES.filter((name) => values[name]);
  if (configured.length === 0) return null;
  const missing = ENV_NAMES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`pool registration is missing: ${missing.join(", ")}`);
  }
  const workerId = values.HOUSTON_POOL_WORKER_ID;
  if (
    basename(workerId) !== workerId ||
    workerId === "." ||
    workerId === ".."
  ) {
    throw new Error("HOUSTON_POOL_WORKER_ID must be a file name");
  }
  const token = (
    await readFile(values.HOUSTON_POOL_WORKER_TOKEN_FILE, "utf8")
  ).trim();
  if (!token)
    throw new Error(`pool worker token file is empty for ${workerId}`);
  const origin = new URL(values.HOUSTON_POOL_REGISTER_URL);
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("HOUSTON_POOL_REGISTER_URL must be an origin");
  }
  new URL(values.HOUSTON_POOL_ENDPOINT);
  return {
    heartbeatUrl: `${origin.origin}/v1/pool/workers/heartbeat`,
    workerId,
    endpoint: values.HOUSTON_POOL_ENDPOINT,
    token,
  };
}

/** Prefer the explicit development token over the registered worker token. */
export function turnServerToken(
  explicitToken: string,
  registration: WorkerRegistrationConfig | null,
): string {
  return explicitToken || registration?.token || "";
}
