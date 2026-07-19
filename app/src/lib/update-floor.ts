/**
 * App-update floor (hosted gateway): the gateway may enforce an OPTIONAL
 * per-channel minimum app version. This module is the desktop half of that
 * contract:
 *
 * - It bakes the identity header value `<semver>+<channel>` the shared
 *   adapter transport (`packages/web/src/engine-adapter/cp/fetch.ts`) sends as
 *   `X-Houston-App-Version` on every gateway request.
 * - It is the listener registry a gateway `426 Upgrade Required` (or a
 *   `minAppVersion` on `/v1/version`) is broadcast through — the same tiny
 *   pub/sub shape as `auth-error-bus.ts`. `useUpdateChecker` subscribes and
 *   renders the blocking update screen.
 *
 * The adapter must not import desktop code (it is bundled into the web app
 * too), so both directions ride window globals — the `__HOUSTON_SESSION_REFRESH__`
 * idiom. `installUpdateFloorBridge` (called from `engine.ts` at module load,
 * before any client is built) installs them; the web build never does, so web
 * requests carry no header and can never trip the blocking screen.
 */

import { resolveEngine } from "./engine-mode.ts";

/** The release channel baked into a desktop build — the gateway keys its
 *  version floor on exactly these two strings. */
export type AppUpdateChannel = "cloud" | "local";

/** What a floor violation tells the app. Either field may be unknown: a 426
 *  body can omit them, and the `/v1/version` probe has no updateUrl. */
export interface UpdateRequiredSignal {
  minVersion: string | null;
  updateUrl: string | null;
}

declare global {
  interface Window {
    /** Full header value `<semver>+<channel>` (e.g. `0.5.9+cloud`), read live
     *  by the adapter's gatewayAuthFetch. Desktop-only — web never sets it. */
    __HOUSTON_APP_VERSION__?: string;
    /** The adapter's 426 forwarder — points at {@link emitUpdateRequired}. */
    __HOUSTON_UPDATE_REQUIRED__?: (signal: {
      minVersion: string | null;
      updateUrl: string | null;
    }) => void;
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
 *  carry a `-dev` prerelease (vite dev builds) — the gateway parses semver
 *  with prerelease and fails open on anything it can't read. */
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

/** `major.minor.patch` as numbers, or null when `v` isn't semver-shaped.
 *  Prerelease/build suffixes are accepted and ignored — see isBelowMinVersion. */
function versionTriple(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * True when `current` is semver-below `min`. Compares the numeric triple only:
 * a `-dev` prerelease whose numbers meet the floor must not self-block a
 * developer (strict semver would order 0.5.9-dev < 0.5.9), and the gateway's
 * own 426 stays the authority for edge cases. Unparseable input reads as NOT
 * below — fail open, matching the gateway's treatment of malformed headers.
 */
export function isBelowMinVersion(current: string, min: string): boolean {
  const c = versionTriple(current);
  const m = versionTriple(min);
  if (!c || !m) return false;
  for (let i = 0; i < 3; i++) {
    if (c[i] !== m[i]) return c[i] < m[i];
  }
  return false;
}

/**
 * The early-warning trigger: a gateway `/v1/version` payload names a
 * `minAppVersion` ONLY when a floor is enforced for this channel (the route
 * itself is exempt from the 426, so it answers even below the floor). Returns
 * the update-required signal when this build is below that floor, else null —
 * including for local hosts and floor-less gateways, which omit the field.
 */
export function minVersionSignal(
  payload: unknown,
  currentVersion: string,
): UpdateRequiredSignal | null {
  const min = (payload as { minAppVersion?: unknown } | null)?.minAppVersion;
  if (typeof min !== "string" || !min) return null;
  if (!isBelowMinVersion(currentVersion, min)) return null;
  return { minVersion: min, updateUrl: null };
}

type UpdateRequiredListener = (signal: UpdateRequiredSignal) => void;
const updateRequiredListeners = new Set<UpdateRequiredListener>();
/** Latched last signal: boot-time gateway calls can 426 BEFORE the shell (and
 *  useUpdateChecker's subscription) has mounted, and a floor never un-trips
 *  within a process — so late subscribers get the signal replayed instead of
 *  a silently lost broadcast. */
let lastSignal: UpdateRequiredSignal | null = null;

const deliver = (cb: UpdateRequiredListener, signal: UpdateRequiredSignal) => {
  try {
    cb(signal);
  } catch (e) {
    console.warn("[updater] update-required listener threw", e);
  }
};

/** Subscribe to update-required signals (replaying a pre-subscription one).
 *  Returns an unsubscribe fn. */
export function onUpdateRequired(cb: UpdateRequiredListener): () => void {
  updateRequiredListeners.add(cb);
  if (lastSignal) deliver(cb, lastSignal);
  return () => updateRequiredListeners.delete(cb);
}

/** Broadcast a floor violation to every subscriber (a throwing one is logged). */
export function emitUpdateRequired(signal: UpdateRequiredSignal): void {
  lastSignal = signal;
  for (const cb of updateRequiredListeners) {
    deliver(cb, signal);
  }
}

/**
 * Install the window globals the shared adapter reads: the baked header value
 * and the 426 forwarder. Must run before any gateway request fires — engine.ts
 * calls it at module load, alongside the `__HOUSTON_CP__` bake.
 */
export function installUpdateFloorBridge(opts: {
  version: string;
  channel: AppUpdateChannel;
}): void {
  if (typeof window === "undefined") return;
  window.__HOUSTON_APP_VERSION__ = formatAppVersionHeader(
    opts.version,
    opts.channel,
  );
  window.__HOUSTON_UPDATE_REQUIRED__ = emitUpdateRequired;
}
