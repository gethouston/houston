import { existsSync } from "node:fs";
import path from "node:path";

export function worktreePortOffset(startDir: string = process.cwd()): number {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let hash = 5381;
  for (const ch of dir) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash % 100;
}

export const WORKTREE_PORT_STRIDE = 40;

export function resolveFakeHostPort(
  env: Record<string, string | undefined>,
): number {
  const base = Number(
    env.HOUSTON_E2E_FAKE_HOST_PORT ||
      28100 + worktreePortOffset() * WORKTREE_PORT_STRIDE,
  );
  const slot = env.TEST_PARALLEL_INDEX;
  return slot === undefined ? base : base + 1 + Number(slot);
}

export const FAKE_HOST_PORT = resolveFakeHostPort(process.env);

export const FAKE_HOST_URL = `http://localhost:${FAKE_HOST_PORT}`;

export const FAKE_TOKEN = "e2e-token";

export const SEED_AGENT_ID = "houston-assistant";

export const ASSISTANT_AGENT_ID = ".assistant";

export const SEED_AGENT_NAME = "Nova";
export const SEED_WORKSPACE_ID = "default";
