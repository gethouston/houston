import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentId } from "../domain/types";

/**
 * Shared file-layout helpers for the per-agent integration stores
 * (`action-approval-store.ts`). The record lives INSIDE the agent's own
 * directory so it survives restarts and is removed for free when the agent dir
 * is deleted — one derivation + one atomic write.
 */

/**
 * `<root>/<Workspace>/<Agent>/.houston/<filename>`, or null on a bad agent id —
 * a `..` traversal, or anything that is not a two-segment `Workspace/Agent` id.
 * The null return lets a read treat a bad id as "no record" and a write reject
 * it, exactly as the stores need.
 */
export function agentDotHoustonFile(
  root: string,
  agentId: AgentId,
  filename: string,
): string | null {
  if (agentId.includes("..")) return null;
  const parts = agentId.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return join(root, parts[0], parts[1], ".houston", filename);
}

/**
 * Atomically write `value` as pretty JSON to `path`: create the parent dirs,
 * write a `.tmp` sibling, then rename it over `path`. The rename is the atomic
 * swap, so a concurrent reader never observes a half-written file.
 */
export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}
