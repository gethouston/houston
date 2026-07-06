/**
 * Shared helpers for reading/writing typed JSON files under `.houston/<type>/<type>.json`.
 *
 * Read/write go through `tauriAgent` (in `lib/tauri.ts`) so they respect the
 * `VITE_HOUSTON_USE_ENGINE_SERVER` flag — same code runs over Tauri IPC today
 * and over the engine REST route tomorrow.
 */

import Ajv, { type Schema, type ValidateFunction } from "ajv";
import { logger } from "../lib/logger";
import { tauriAgent } from "../lib/tauri";

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

function getValidator(name: string, schema: Schema): ValidateFunction {
  let v = validators.get(name);
  if (!v) {
    v = ajv.compile(schema);
    validators.set(name, v);
  }
  return v;
}

/** Relative path convention: `.houston/<name>/<name>.json`. */
export function relPath(name: string): string {
  return `.houston/${name}/${name}.json`;
}

/**
 * Read + parse `.houston/<name>/<name>.json`. Returns `fallback` when the file
 * is missing or empty. Validates against the JSON Schema and logs (but doesn't
 * throw) on mismatch — validation failures should surface data bugs, not block
 * the UI.
 */
export async function readAgentJson<T>(
  agentPath: string,
  name: string,
  schema: Schema,
  fallback: T,
): Promise<T> {
  const raw = await tauriAgent.readFile(agentPath, relPath(name));
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn(`[agent-file] ${name}: invalid JSON, falling back`, String(e));
    return fallback;
  }
  const validate = getValidator(name, schema);
  if (!validate(parsed)) {
    logger.warn(
      `[agent-file] ${name}: schema validation failed`,
      JSON.stringify(validate.errors),
    );
  }
  return parsed as T;
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
