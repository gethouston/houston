/**
 * Host-side constants for the fake Houston host.
 *
 * These describe the fake host itself (its port, the bearer it accepts, the
 * single seeded agent) and are shared between the server and any harness that
 * talks to it. The web dev server's own constants (vite port/URL) are harness
 * glue and live with the harness, not here.
 */

/**
 * Resolve the fake host's port for the current process.
 *
 * The base port is overridable via HOUSTON_E2E_FAKE_HOST_PORT: parallel
 * worktrees running e2e at once would otherwise silently reuse EACH OTHER'S
 * servers (Playwright's reuseExistingServer sees a live port and assumes it's
 * ours), producing bogus results against foreign code. Set a distinct base per
 * worktree, spaced ≥ 32 apart so the per-worker slots below can't overlap.
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
  const base = Number(env.HOUSTON_E2E_FAKE_HOST_PORT || 4399);
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
