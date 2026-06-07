import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const env = process.env;

/**
 * One houston-engine instance = one workspace (a single working directory).
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
  token: env.HOUSTON_ENGINE_TOKEN || "",
  /** Allowed CORS origin for the webapp. "*" (default) or an explicit origin. */
  corsOrigin: env.HOUSTON_CORS_ORIGIN || "*",
  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
