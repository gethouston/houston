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
 */
export async function readAgentRunOverrides(path: string) {
  return {
    modeOverride: DEFAULT_TURN_MODE,
    ...(await readAgentModelOverrides(path, tauriConfig.read)),
  };
}
