import type { Transport } from "@earendil-works/pi-ai";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

// WHY: pi reads transport once at agent build; apply before session construction, never write settings.json. ADR-0010
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
