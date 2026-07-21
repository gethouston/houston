/**
 * Shared helpers for reading/writing typed JSON files under `.houston/<type>/<type>.json`.
 *
 * Read/write go through `tauriAgent` (in `lib/tauri.ts`) so they respect the
 * `VITE_HOUSTON_USE_ENGINE_SERVER` flag — same code runs over Tauri IPC today
 * and over the engine REST route tomorrow.
 */

import type { Schema } from "ajv";
import { logger } from "../lib/logger";
import { tauriAgent } from "../lib/tauri";
import { getValidator, parseAgentJson } from "./agent-json";

/** Relative path convention: `.houston/<name>/<name>.json`. */
export function relPath(name: string): string {
  return `.houston/${name}/${name}.json`;
}

/**
 * Read + parse `.houston/<name>/<name>.json`. Returns `fallback` when the file
 * is missing, empty, unparseable, or has the wrong top-level container shape
 * (agents write these files directly). Item-level schema mismatches only log —
 * they should surface data bugs, not block the UI.
 */
export async function readAgentJson<T>(
  agentPath: string,
  name: string,
  schema: Schema,
  fallback: T,
): Promise<T> {
  const raw = await tauriAgent.readFile(agentPath, relPath(name));
  if (!raw) return fallback;
  return parseAgentJson(name, raw, schema, fallback, (message, detail) =>
    logger.warn(`[agent-file] ${message}`, detail),
  );
}

/** Serialize + atomically write `.houston/<name>/<name>.json`. */
export async function writeAgentJson<T>(
  agentPath: string,
  name: string,
  schema: Schema,
  data: T,
  opts?: import("../lib/agent-warming-guard").WarmingWriteOptions,
): Promise<void> {
  const validate = getValidator(name, schema);
  if (!validate(data)) {
    logger.warn(
      `[agent-file] ${name}: writing data that fails validation`,
      JSON.stringify(validate.errors),
    );
  }
  await tauriAgent.writeFile(
    agentPath,
    relPath(name),
    JSON.stringify(data, null, 2),
    opts,
  );
}

/** UUID via the Web Crypto API — good enough for in-UI ids. */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO-8601 timestamp. */
export function now(): string {
  return new Date().toISOString();
}
