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

/**
 * A SECOND vite dev server, five ports up, baked with a (fake) Firebase API key
 * so `isIdentityConfigured()` is true and the GCIP `SignInScreen` renders. The
 * default server bakes NO key (identity off), so the whole existing suite still
 * boots straight to the shell — only the `auth` Playwright project points here.
 * Offset from WEB_PORT so per-worktree `HOUSTON_E2E_WEB_PORT` overrides stay
 * collision-free (mirrors the fake-host port offset rationale).
 */
export const AUTH_WEB_PORT = WEB_PORT + 5;
export const AUTH_WEB_URL = `http://localhost:${AUTH_WEB_PORT}`;

/**
 * A syntactically-valid but non-functional Firebase Web API key. It only has to
 * make `identityConfigured()` return true (apiKey + projectId present) and let
 * `initializeApp`/`onIdTokenChanged` resolve a null user WITHOUT a network call —
 * the sign-in spec never completes a real Firebase exchange (OTP is mocked, the
 * OAuth buttons are only asserted-rendered, never clicked).
 */
export const FAKE_FIREBASE_API_KEY = "AIzaSyE2E-fake-key-for-signin-spec-00000";
