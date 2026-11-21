import type { Schema } from "ajv";
import { logger } from "../lib/logger";
import { tauriAgent } from "../lib/tauri";
import { getValidator, parseAgentJson } from "./agent-json";

export function relPath(name: string): string {
  return `.houston/${name}/${name}.json`;
}

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

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
