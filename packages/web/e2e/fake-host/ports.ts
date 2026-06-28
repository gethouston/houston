/**
 * Shared constants for the Playwright UI-test harness.
 *
 * The web dev server (vite) and the fake Houston host (a Node process) both run
 * during an e2e run; the browser is pointed at the fake host as its engine. Keep
 * these in one place so the Playwright config, the seed, and the server agree.
 */

/** Vite dev server (packages/web). Matches `server.port` in vite.config.ts. */
export const WEB_PORT = 1430;
/** The in-memory fake host the app talks to instead of a real host. */
export const FAKE_HOST_PORT = 4399;

export const WEB_URL = `http://localhost:${WEB_PORT}`;
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
