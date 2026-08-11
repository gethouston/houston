/**
 * Build identity for gateway requests: the desktop app identifies itself as
 * `<semver>+<channel>` via `X-Houston-App-Version` on every gateway call (the
 * shared adapter transport, `packages/web/src/engine-adapter/cp/fetch.ts`, and
 * its app-side peer `gateway-fetch.ts` both attach it). The gateway no longer
 * acts on it — the server-side min-app-version 426 gate was retired
 * (PRODUCT-1144) — but the header stays: it gives gateway logs a build
 * identity, and the CORS allow-set on every target already admits it, so
 * keeping it costs nothing while dropping it would need another coordinated
 * header/CORS dance (HOU-825) to ever bring back.
 *
 * The adapter must not import desktop code (it is bundled into the web app
 * too), so the value rides a window global — the `__HOUSTON_SESSION_REFRESH__`
 * idiom. `installAppVersionBridge` (called from `engine.ts` at module load,
 * before any client is built) installs it — gated on `osIsTauri()`, because
 * the web bundle loads `engine.ts` too and a browser tab must never identify
 * as an app build: web requests carry no header (which would force CORS
 * preflights on every target).
 */

import { resolveEngine } from "./engine-mode.ts";

/** The release channel baked into a desktop build. */
export type AppUpdateChannel = "cloud" | "local";

declare global {
  interface Window {
    /** Full header value `<semver>+<channel>` (e.g. `0.5.9+cloud`), read live
     *  by the adapter's gatewayAuthFetch. Desktop-only — web never sets it. */
    __HOUSTON_APP_VERSION__?: string;
  }
}

/**
 * This build's release channel. Derived from the SAME build-time flag that
 * makes a build a cloud build: release.yml bakes `VITE_HOSTED_ENGINE_URL` into
 * exactly the `cloud-*` tag builds — the ones whose updater
 * scripts/ci/point-updater-at-cloud-manifest.sh points at the cloud manifest —
 * so channel and updater feed cannot drift and no extra baked flag is needed.
 * Routed through `resolveEngine` so a dev override (`VITE_NEW_ENGINE_URL`,
 * which wins there and bypasses the gateway) reads as `local` here too.
 * Dev with no flags → sidecar → `local`.
 */
export function appUpdateChannel(env: {
  VITE_NEW_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_URL?: string;
  VITE_HOSTED_ENGINE_AUTH?: string;
}): AppUpdateChannel {
  const kind = resolveEngine(env).kind;
  return kind === "hosted-oauth" || kind === "hosted-static"
    ? "cloud"
    : "local";
}

/** The `X-Houston-App-Version` value: `<semver>+<channel>`. The version may
 *  carry a `-dev` prerelease (vite dev builds) — consumers parse semver with
 *  prerelease or ignore the header entirely. */
export function formatAppVersionHeader(
  version: string,
  channel: AppUpdateChannel,
): string {
  return `${version}+${channel}`;
}

/** This build's own version (`__APP_VERSION__`, baked by app/vite.config.ts
 *  from package.json — `<x.y.z>` in production, `<x.y.z>-dev` in dev). The
 *  typeof guard keeps the module importable under plain node (unit tests). */
export function currentAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
}

/**
 * Install the window global the shared adapter reads: the baked header value.
 * Must run before any gateway request fires — engine.ts calls it at module
 * load, alongside the `__HOUSTON_CP__` bake.
 */
export function installAppVersionBridge(opts: {
  version: string;
  channel: AppUpdateChannel;
}): void {
  if (typeof window === "undefined") return;
  window.__HOUSTON_APP_VERSION__ = formatAppVersionHeader(
    opts.version,
    opts.channel,
  );
}
