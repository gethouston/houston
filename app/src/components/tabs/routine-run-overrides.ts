import { readAgentModelOverrides } from "../../lib/agent-model-overrides";
import { tauriConfig } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";

/**
 * The agent's configured turn mode plus its provider/model/effort pins, read
 * from disk and folded into a `createMission` options object. A routine setup
 * chat's kickoff turn must run on the brain the user picked for the agent — an
 * unpinned send resolves inside the runtime and lands on the provider default
 * (Sonnet), not their choice. Shared by every setup-chat start so the pin is
 * applied identically.
 */
export async function readAgentRunOverrides(path: string) {
  return {
    modeOverride: await readAgentTurnMode(path, tauriConfig.read),
    ...(await readAgentModelOverrides(path, tauriConfig.read)),
  };
}
