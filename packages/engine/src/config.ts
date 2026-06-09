import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const env = process.env;

const host = env.HOUSTON_HOST || "127.0.0.1";

/** Loopback addresses — browser and engine must be co-located to reach these. */
function isLoopbackHost(h: string): boolean {
  const v = h.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return v === "127.0.0.1" || v === "localhost" || v === "::1";
}

/**
 * Headless = no usable loopback between the user's browser and the engine, so
 * Claude's loopback OAuth can't catch its redirect. Explicit `HOUSTON_HEADLESS`
 * wins; otherwise inferred from a non-loopback bind host.
 */
function isHeadless(): boolean {
  const flag = env.HOUSTON_HEADLESS;
  if (flag === undefined || flag === "") return !isLoopbackHost(host);
  return /^(1|true|yes|on)$/i.test(flag);
}

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
  host,
  port: Number(env.HOUSTON_PORT || 4317),
  /** Use the headless OAuth flows (Claude via copy-paste code, no loopback). */
  headless: isHeadless(),
  /** Default Anthropic model (Claude Pro/Max subscription). */
  model: env.HOUSTON_MODEL || "claude-sonnet-4-6",
  /** Optional bearer token. Empty = no auth (local dev on loopback). */
  token: env.HOUSTON_ENGINE_TOKEN || "",
  /** Allowed CORS origin for the webapp. "*" (default) or an explicit origin. */
  corsOrigin: env.HOUSTON_CORS_ORIGIN || "*",
  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
