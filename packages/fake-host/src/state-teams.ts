/**
 * Teams v2 state helpers: the advertised capabilities and the agent/org
 * integration ceilings the gateway serves. These back the Teams-mode arming
 * controls (`/__test__/capabilities`, `/__test__/agent-settings`) and the
 * `/v1/agents/:slug/settings` + `/v1/org/settings` gateway routes, so a spec can
 * put the app into a Teams-shaped state (multiplayer + a restrictive allowlist)
 * that single-player alone can't reach — the fixture arming the locked browse
 * rows and, later, the admin policy pages.
 *
 * The fields live on `HostState` (state-store.ts); this module is the read/write
 * surface, mirroring how `state-integrations.ts` operates on the shared `state`.
 */

import type {
  ComputeUsageSeed,
  FakeCapabilities,
  TeamsSettings,
} from "./state-store";
import { state } from "./state-store";

/** The capabilities served at `GET /v1/capabilities`. */
export function getCapabilities(): FakeCapabilities {
  return state.capabilities;
}

/**
 * Merge a partial capabilities patch into the advertised set (the
 * `/__test__/capabilities` control). Arm integrations + `multiplayer`/`teams`/
 * `role` for Teams e2e, or just `integrations` for a single-player-with-apps run.
 */
export function setCapabilities(
  patch: Partial<FakeCapabilities>,
): FakeCapabilities {
  state.capabilities = { ...state.capabilities, ...patch };
  return state.capabilities;
}

/** The Teams settings behind the agent/org settings routes. */
export function getTeamsSettings(): TeamsSettings {
  return state.teamsSettings;
}

/**
 * Merge a partial into the Teams settings (the `/__test__/agent-settings`
 * control and the `PUT` settings routes). Only the fields present are changed,
 * so a caller can set the agent ceiling without touching the org one.
 */
export function setTeamsSettings(patch: Partial<TeamsSettings>): TeamsSettings {
  state.teamsSettings = { ...state.teamsSettings, ...patch };
  return state.teamsSettings;
}

/** The armed compute-usage dataset; `null` = the route 404s (feature off). */
export function getComputeUsage(): ComputeUsageSeed | null {
  return state.computeUsage;
}

/**
 * Arm (or disarm with `null`) the compute-usage dataset the gateway serves at
 * `GET /v1/org/compute-usage` (the `/__test__/compute-usage` control). Specs
 * usually pair it with `/__test__/capabilities` `{ computeUsage: true }`.
 */
export function setComputeUsage(
  seed: ComputeUsageSeed | null,
): ComputeUsageSeed | null {
  state.computeUsage = seed;
  return state.computeUsage;
}
