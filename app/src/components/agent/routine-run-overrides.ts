import { readAgentModelOverrides } from "../../lib/agent-model-overrides";
import { tauriConfig } from "../../lib/tauri";
import { DEFAULT_TURN_MODE } from "../../lib/turn-mode";

export async function readAgentRunOverrides(
  path: string,
  connected: readonly string[] | null,
) {
  return {
    modeOverride: DEFAULT_TURN_MODE,
    ...(await readAgentModelOverrides(path, tauriConfig.read, connected)),
  };
}
