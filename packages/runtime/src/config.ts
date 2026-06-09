import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const env = process.env;

/**
 * One houston-runtime instance = one workspace (a single working directory).
 * Everything is single-user; there is no workspace management here.
 */
export const config = {
  /** The working directory the agent operates in. */
  workspaceDir: env.HOUSTON_WORKSPACE_DIR || process.cwd(),
  /** Where auth.json + per-conversation session JSONL live. */
  dataDir:
    env.HOUSTON_DATA_DIR ||
    join(env.HOUSTON_HOME || join(homedir(), ".houston-ts"), "data"),
  host: env.HOUSTON_HOST || "127.0.0.1",
  port: Number(env.HOUSTON_PORT || 4317),
  /** Default Anthropic model (Claude Pro/Max subscription). */
  model: env.HOUSTON_MODEL || "claude-sonnet-4-5",
  /** Optional bearer token. Empty = no auth (local dev on loopback). */
  token: env.HOUSTON_RUNTIME_TOKEN || "",
  /** Allowed CORS origin for the webapp. "*" (default) or an explicit origin. */
  corsOrigin: env.HOUSTON_CORS_ORIGIN || "*",

  /**
   * Cloud mode (HOUSTON_CLOUD=1). When on, the runtime runs KEYLESS inside a
   * control plane sandbox: it never holds a real provider key and never does
   * interactive OAuth. Turns are routed through the control plane keyless proxy
   * (`proxyBaseUrl`) and carry only the non-secret, control-plane-issued sandbox
   * token. The proxy swaps in the real key.
   */
  cloud: env.HOUSTON_CLOUD === "1",
  /** Base URL of the control plane keyless proxy that pi-ai's `model.baseUrl` points at. */
  proxyBaseUrl: env.HOUSTON_PROXY_BASE_URL || "",
  /** Control-plane-issued sandbox token (proves "workspace W's agent A" to the control plane). */
  sandboxToken: env.HOUSTON_SANDBOX_TOKEN || "",
  /** Connect-once: where the sandbox fetches its workspace's central subscription token. */
  controlPlaneUrl: env.HOUSTON_CONTROL_PLANE_URL || "",
  /** Provider the cloud sandbox talks to (matches the proxy's upstream). */
  cloudProvider: env.HOUSTON_CLOUD_PROVIDER || "anthropic",
  /** Model id used in cloud mode. Falls back to the desktop default model. */
  cloudModel: env.HOUSTON_CLOUD_MODEL || env.HOUSTON_MODEL || "claude-sonnet-4-5",

  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
// The agent's working directory must exist before pi opens it as the bash/ls cwd,
// or every file tool reports "Path not found". On a fresh PVC it does not yet.
mkdirSync(config.workspaceDir, { recursive: true });
