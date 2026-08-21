/**
 * Host-side constants for the fake Houston host.
 *
 * These describe the fake host itself (its port, the bearer it accepts, the
 * single seeded agent) and are shared between the server and any harness that
 * talks to it. The web dev server's own constants (vite port/URL) are harness
 * glue and live with the harness, not here.
 */

import { existsSync } from "node:fs";
import path from "node:path";

/**
 * A stable per-worktree port offset, derived from the workspace root's path.
 *
 * Parallel worktrees running e2e at once would otherwise silently reuse EACH
 * OTHER'S servers (Playwright's reuseExistingServer sees a live port and
 * assumes it's ours), producing bogus results against foreign code. Deriving
 * the default from the worktree path makes every checkout land on its own
 * ports with zero configuration; the env overrides still win when set.
 *
 * The root is found by walking up from cwd to `pnpm-workspace.yaml` — every
 * process that resolves ports (playwright main, its workers, the standalone
 * fake host, vite) runs from somewhere inside the worktree, so they all agree.
 *
 * 100 buckets, NOT more: every derived port must stay below 32768, the floor
 * of Linux's default ephemeral range (net.ipv4.ip_local_port_range). A derived
 * port inside that range is a flake factory — any earlier `bind(0)` listener
 * or even the port probe's own self-connect can occupy it, and Playwright's
 * pre-launch check then dies with "already used" before a single test runs
 * (CI shard failure on run 32522005259: the runner path hashed to 35620).
 */
export function worktreePortOffset(startDir: string = process.cwd()): number {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) break;
    const parent = path.dirname(dir);
    // No workspace marker (e.g. an installed consumer): one stable bucket.
    if (parent === dir) break;
    dir = parent;
  }
  let hash = 5381;
  for (const ch of dir) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash % 100;
}

/** ≥ the per-worker fake-host slots (workers + 1) and the +5 auth vite server,
 *  so neighboring offsets can never collide on a derived port. */
export const WORKTREE_PORT_STRIDE = 40;

/**
 * Resolve the fake host's port for the current process.
 *
 * The base port is HOUSTON_E2E_FAKE_HOST_PORT when set, else derived per
 * worktree ({@link worktreePortOffset}) in 28100..32060 — disjoint from the
 * web ports' derived range (packages/web/e2e/config.ts) and, with the worker
 * slots on top (< stride), entirely below the Linux ephemeral-port floor.
 *
 * Playwright sets TEST_PARALLEL_INDEX only inside worker processes, where each
 * parallel slot runs its OWN in-process fake host (e2e/support/fixtures.ts) —
 * one port up per slot (base + 1 + slot), clear of the standalone
 * `pnpm fake-host` process on the base port. A worker's specs, seed, and
 * fixtures all resolve FAKE_HOST_URL in-worker, so they land on that worker's
 * host with no plumbing.
 */
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

/** The in-memory fake host the app talks to instead of a real host. */
export const FAKE_HOST_PORT = resolveFakeHostPort(process.env);

export const FAKE_HOST_URL = `http://localhost:${FAKE_HOST_PORT}`;

/** Bearer the app sends to the fake host. The host accepts anything; this is
 *  only here so the seeded engine config carries a non-empty token. */
export const FAKE_TOKEN = "e2e-token";

/** The single seeded agent. The boot seed selects it as `last_agent_id`, so the
 *  shell opens straight onto it. Id doubles as the runtime-proxy route key
 *  (`/agents/<id>/conversations/...`). */
export const SEED_AGENT_ID = "houston-assistant";
export const SEED_AGENT_NAME = "Houston";
export const SEED_WORKSPACE_ID = "default";
