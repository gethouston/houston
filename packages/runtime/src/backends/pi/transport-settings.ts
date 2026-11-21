import type { Transport } from "@earendil-works/pi-ai";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export function piTransportSettings(
  cwd: string,
  agentDir: string,
  transport: Transport | undefined,
): { settingsManager?: SettingsManager } {
  if (!transport) return {};
  const settingsManager = SettingsManager.create(cwd, agentDir);
  settingsManager.applyOverrides({ transport });
  return { settingsManager };
}
