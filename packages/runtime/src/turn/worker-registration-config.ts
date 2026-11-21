import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const ENV_NAMES = [
  "HOUSTON_POOL_REGISTER_URL",
  "HOUSTON_POOL_WORKER_ID",
  "HOUSTON_POOL_WORKER_TOKEN_FILE",
  "HOUSTON_POOL_ENDPOINT",
] as const;

type RegistrationEnv = Partial<Record<(typeof ENV_NAMES)[number], string>>;

export interface WorkerRegistrationConfig {
  heartbeatUrl: string;
  workerId: string;
  endpoint: string;
  token: string;
}

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

export function turnServerToken(
  explicitToken: string,
  registration: WorkerRegistrationConfig | null,
): string {
  return explicitToken || registration?.token || "";
}
