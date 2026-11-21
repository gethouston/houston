import {
  type AgentColorId,
  filterPackage,
  packageSeed,
  remintRoutineIds,
} from "@houston/domain";
import type {
  Agent,
  AgentInitialConfig,
  PortableInstalledAgent,
  PortableInstallRequest,
} from "@houston/wire-types";
import { agentColorId } from "@houston-ai/core";
import { dropUpload, parkedUpload } from "./portable";
import { toWireSelection } from "./portable-map";

export type InstallCreateAgent = (
  name: string,
  color: AgentColorId | undefined,
  seed: {
    claudeMd?: string;
    seeds?: Record<string, string>;
    config?: AgentInitialConfig;
  },
) => Promise<Agent>;

export async function install(
  req: PortableInstallRequest,
  createAgent: InstallCreateAgent,
): Promise<PortableInstalledAgent> {
  const { pkg, routineIds } = remintRoutineIds(
    filterPackage(parkedUpload(req.packageId), toWireSelection(req.selection)),
    () => crypto.randomUUID(),
  );
  const agent = await createAgent(
    req.agentName,
    req.agentColor ? agentColorId(req.agentColor) : undefined,
    { ...packageSeed(pkg), config: req.config },
  );
  dropUpload(req.packageId);
  return {
    agentPath: agent.id,
    agentName: agent.name,
    workspaceName: req.workspaceName,
    requiredIntegrations: [],
    routineIds,
    agent,
  };
}
