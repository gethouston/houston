import { readAgentModelOverrides } from "../../lib/agent-model-overrides";
import { tauriConfig } from "../../lib/tauri";
import { DEFAULT_TURN_MODE } from "../../lib/turn-mode";

/**
 * The default turn mode plus the agent's provider/model/effort pins, folded
 * into a `createMission` options object. A routine setup
 * chat's kickoff turn must run on the brain the user picked for the agent — an
 * unpinned send resolves inside the runtime and lands on the provider default
 * (Sonnet), not their choice. Shared by every setup-chat start so the pin is
 * applied identically.
 *
 * `connected` is REQUIRED (never optional): a kickoff that cannot say which
 * providers the user is signed into is exactly the bug PRODUCT-1236 reported —
 * the pin then lands on the agent's stored provider even when the user never
 * connected it. Pass the confirmed set, or `null` when it could not be
 * confirmed (see `useConnectedProviders`).
 */
export async function readAgentRunOverrides(
  path: string,
  connected: readonly string[] | null,
) {
  return {
    modeOverride: DEFAULT_TURN_MODE,
    ...(await readAgentModelOverrides(path, tauriConfig.read, connected)),
  };
}
