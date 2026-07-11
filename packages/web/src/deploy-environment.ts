/**
 * Runtime deploy-environment detection (web only).
 *
 * ONE web bundle is built and promoted byte-for-byte from the preview site to
 * the production site (see .github/workflows/web-promote.yml), so the
 * environment can NOT be baked in at build time — it is derived at runtime from
 * the hostname the tab is actually served from. The same bytes therefore report
 * `preview` on preview.gethouston.ai and `production` on app.gethouston.ai.
 *
 * Consumers:
 *  - `main.tsx` publishes the result on `window.__HOUSTON_DEPLOY_ENV__` before
 *    the app graph loads, so the shared Sentry (`app/src/lib/sentry.ts`) and
 *    PostHog (`app/src/lib/analytics.ts`) init can tag their `environment`.
 *  - `preview-badge.tsx` renders the "Preview" pill only when this is `preview`.
 */

export type DeployEnvironment = "production" | "preview" | "development";

/**
 * Classify a hostname into a deploy environment. Pure + exported for testing.
 *
 * Rules (production is intentionally the single canonical domain — everything
 * that is not clearly production or local development is treated as preview, so
 * an unrecognized host is never mistaken for production):
 *  - `production`  → app.gethouston.ai
 *  - `development` → localhost / loopback (and `*.localhost`)
 *  - `preview`     → preview.gethouston.ai, the Firebase default domains
 *                    (`*.web.app`, `*.firebaseapp.com`), and anything else
 */
export function classifyDeployEnvironment(hostname: string): DeployEnvironment {
  const host = hostname.toLowerCase();

  if (host === "app.gethouston.ai") return "production";

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return "development";
  }

  // preview.gethouston.ai, houston-web(-preview).web.app, *.firebaseapp.com,
  // and any not-yet-mapped host — never silently promoted to `production`.
  return "preview";
}

/** The current tab's deploy environment, derived from `window.location`. */
export function currentDeployEnvironment(): DeployEnvironment {
  if (typeof window === "undefined") return "development";
  return classifyDeployEnvironment(window.location.hostname);
}
