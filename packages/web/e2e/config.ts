/**
 * Harness-local constants for the Playwright run.
 *
 * These describe the vite web server the browser is pointed at — pure e2e glue,
 * so they live with the harness. The fake host's own constants (its port, token,
 * seeded agent) come from `@houston/fake-host`.
 */

/** Vite dev server (packages/web). Matches `server.port` in vite.config.ts. */
export const WEB_PORT = 1430;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
