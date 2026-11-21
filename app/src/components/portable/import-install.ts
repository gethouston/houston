import type {
  PortableInstalledAgent,
  PortableInstallRequest,
} from "@houston/engine-adapter";
import { seedBornConfig } from "../../lib/agent-provisioning/born-config";
import { analytics } from "../../lib/analytics";
import { getEngine } from "../../lib/engine";
import type { KickoffPin } from "../../lib/kickoff-pin";
import { queryClient } from "../../lib/query-client";
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
  const request = {
    ...importInstallRequest(args),
    config: { ...kickoffPin, firstDay: "pending", arrival: "imported" },
  } satisfies PortableInstallRequest;
  const installed = await getEngine().importInstall(request);
  seedBornConfig(queryClient, installed.agent.folderPath, request.config);
  const lastUsed = lastUsedFromPin(kickoffPin);
  if (lastUsed) {
    await tauriProvider.setLastUsed(lastUsed.provider, lastUsed.model);
  }
  analytics.track("agent_imported", { agent_slug: installed.agentName });
  return installed;
}
