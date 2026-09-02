/**
 * The web entry's host-mode boot contract.
 *
 * BOTH web boot paths — the managed cloud (a baked control plane) and the
 * self-host Connect screen — run the desktop UI against the Houston host
 * through the v3 adapter, and the adapter decides host mode from
 * `window.__HOUSTON_CP__` at CONSTRUCTION (`engine-adapter/client/context.ts`,
 * plus `cp/fetch.ts` and `shims/tauri-core.ts`). Nothing re-reads the flag
 * later, so it has to be on the window before the app module graph loads.
 *
 * The self-host path used to get the flag only as a side effect of app code:
 * `app/src/lib/engine.ts` bakes it at module eval to close the desktop sidecar
 * race (HOU-546). That made a web boot contract depend on an app-side
 * statement — if it ever moved, went lazy, or got gated, self-host web would
 * boot OUT of host mode and every control-plane-routed read (routines, skills)
 * would silently answer an empty list with no error. The entry owns its own
 * contract here; the app-side bake stays for desktop.
 */
import type { EngineConfig } from "./engine-config";

/** The window fields the boot contract writes (a subset of `Window`). */
export interface HostModeGlobals {
  __HOUSTON_CP__?: boolean;
  __HOUSTON_ENGINE__?: EngineConfig;
}

/**
 * Publish host mode (and the engine endpoint, when one is already known) on the
 * target window. Call BEFORE importing the app tree.
 *
 * `engine` is null on a first self-host visit: the Connect screen prompts for
 * the URL + token and stores them itself, so the global stays absent rather
 * than holding a placeholder endpoint the adapter would try to reach.
 */
export function applyHostModeGlobals(
  target: HostModeGlobals,
  engine: EngineConfig | null,
): void {
  target.__HOUSTON_CP__ = true;
  if (engine) target.__HOUSTON_ENGINE__ = engine;
}
