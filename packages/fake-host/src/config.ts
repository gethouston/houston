/**
 * Host-side constants for the fake Houston host.
 *
 * These describe the fake host itself (its port, the bearer it accepts, the
 * single seeded agent) and are shared between the server and any harness that
 * talks to it. The web dev server's own constants (vite port/URL) are harness
 * glue and live with the harness, not here.
 */

/** The in-memory fake host the app talks to instead of a real host.
 *  Overridable via HOUSTON_E2E_FAKE_HOST_PORT: parallel worktrees running e2e
 *  at once would otherwise silently reuse EACH OTHER'S servers (Playwright's
 *  reuseExistingServer sees a live port and assumes it's ours), producing
 *  bogus results against foreign code. Set a distinct port per worktree. */
export const FAKE_HOST_PORT = Number(
  process.env.HOUSTON_E2E_FAKE_HOST_PORT || 4399,
);

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
