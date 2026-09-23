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
import { jobDescriptionRoleContext } from "../../lib/agent-role-context";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import { analytics } from "../../lib/analytics";
import { getEngine } from "../../lib/engine";
import type { KickoffPin } from "../../lib/kickoff-pin";
import { logger } from "../../lib/logger";
import { tauriAgent, tauriProvider } from "../../lib/tauri";
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
  void startImportedSetupMission(installed, kickoffPin);
}

/**
 * An imported agent arrives with the source agent's own job description instead
 * of answers, so the brief is READ off it before the mission starts. That one
 * read is what keeps the three places naming the job in agreement: the creation
 * record, the hidden prompt's quoted hello, and the derivation that takes over
 * once the record expires (`lib/setup-hello.ts`), which reads this same
 * description. Guessing "no role" here instead would have the hello change
 * sentence half an hour later, when the record expires and that derivation
 * takes over.
 *
 * The read is served by the agent's own engine, so a hosted agent whose pod is
 * still being provisioned answers it empty (`isAgentPathCreating`) — as does a
 * package that carried no job description. Either way the mission starts
 * naming the agent alone, which is a sentence, never a wrong one. A real
 * failure is surfaced by the read's own wrapper.
 */
async function startImportedSetupMission(
  installed: PortableInstalledAgent,
  kickoffPin: KickoffPin,
): Promise<void> {
  let instructions: string | undefined;
  try {
    instructions = await tauriAgent.readFile(installed.agentPath, "CLAUDE.md");
  } catch (e) {
    logger.error(`[import-install] job description read failed: ${e}`);
  }
  await startAgentSetupMission(
    {
      id: installed.agent.id,
      name: installed.agentName,
      color: installed.agent.color,
      folderPath: installed.agentPath,
    },
    kickoffPin,
    "imported",
    jobDescriptionRoleContext(instructions),
  );
}
