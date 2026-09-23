/**
 * The install half of the "From a friend" flow: the engine round-trip, and the
 * setup the freshly imported agent starts on its own once the sheet is gone.
 * What the round-trip asks for is decided in `import-install-request.ts`.
 *
 * Split from the wizard's state so the ORDER stays legible. Neither background
 * task is awaited — both dispatch to the agent's own engine, which on the
 * hosted profile may still be cold-starting, so awaiting would freeze the flow
 * for the whole warm-up. Each surfaces its own error toast.
 */

import type { PortableInstalledAgent } from "@houston/engine-adapter";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import { analytics } from "../../lib/analytics";
import { getEngine } from "../../lib/engine";
import type { KickoffPin } from "../../lib/kickoff-pin";
import { tauriProvider } from "../../lib/tauri";
import {
  type InstallImportedAgentArgs,
  importInstallRequest,
  lastUsedFromPin,
} from "./import-install-request";

export async function installImportedAgent(
  args: InstallImportedAgentArgs,
  kickoffPin: KickoffPin,
): Promise<PortableInstalledAgent> {
  const installed = await getEngine().importInstall(importInstallRequest(args));
  // Keep the sticky last-used in sync (local, so it's cheap to await).
  const lastUsed = lastUsedFromPin(kickoffPin);
  if (lastUsed) {
    await tauriProvider.setLastUsed(lastUsed.provider, lastUsed.model);
  }
  analytics.track("agent_imported", { agent_slug: installed.agentName });
  return installed;
}

/**
 * Runs with the sheet already dismissed: write the agent's provider/model, then
 * let it introduce itself and interview the user in the normal shell. There is
 * no connect step on import.
 */
export function startImportedAgentSetup(
  installed: PortableInstalledAgent,
  kickoffPin: KickoffPin,
): void {
  void finishAgentSetup(installed.agentPath, { ...kickoffPin, routine: null });
  void startAgentSetupMission(
    {
      id: installed.agent.id,
      name: installed.agentName,
      color: installed.agent.color,
      folderPath: installed.agentPath,
    },
    kickoffPin,
    "imported",
  );
}
