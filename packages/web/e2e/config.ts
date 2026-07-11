/**
 * Harness-local constants for the Playwright run.
 *
 * These describe the vite web server the browser is pointed at — pure e2e glue,
 * so they live with the harness. The fake host's own constants (its port, token,
 * seeded agent) come from `@houston/fake-host`.
 */

/** Vite dev server (packages/web). Matches `server.port` in vite.config.ts,
 *  including its HOUSTON_E2E_WEB_PORT override (distinct ports per parallel
 *  worktree keep e2e runs from silently reusing a foreign worktree's server). */
export const WEB_PORT = Number(process.env.HOUSTON_E2E_WEB_PORT || 1430);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
