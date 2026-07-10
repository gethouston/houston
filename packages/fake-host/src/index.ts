/**
 * `@houston/fake-host` — an in-memory, protocol-v3 Houston host for UI/e2e
 * tests. It shares the REAL server streaming pieces (`StreamChannel`,
 * `serveResumableStream`, `formatSseFrame` from `@houston/runtime-client`) so
 * the mock cannot drift from the wire contract.
 *
 * Public surface:
 *  - {@link startFakeHost} / {@link FakeHost} — start and stop the server.
 *  - The host + seed constants (ports, token, seeded agent) from `./config`.
 *
 * The server's `POST /__test__/*` control endpoints (reset, emit, chat-config,
 * chat-interaction, drop-chat-streams, kill-turn, turn-boundary, capabilities,
 * agent-settings) are HTTP routes documented in this package's README; the
 * harness drives them over HTTP, not via exports.
 */

export {
  FAKE_HOST_PORT,
  FAKE_HOST_URL,
  FAKE_TOKEN,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
} from "./config";
export type { FakeHost } from "./server";
export { startFakeHost } from "./server";
/** The seeded integration catalog's toolkit slugs (A-Z) — for specs arming
 *  Teams allowlists over the catalog. */
export { SEED_TOOLKIT_SLUGS } from "./state-integrations";
