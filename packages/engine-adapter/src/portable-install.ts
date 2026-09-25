/**
 * The import wizard's confirm step.
 *
 * Installing a parked `.houstonagent` is an ordinary agent create carrying the
 * selected content as its seed payload (CLAUDE.md + file map) — a pipeline both
 * backends have: the local host writes the seeds on create, and the hosted-cloud
 * gateway (which serves no account-level portable route) persists them and seeds
 * the new agent's pod with them. So this module issues no request of its own; it
 * filters the parked package and hands the seed to the create it is given.
 */

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

/**
 * How {@link install} creates the installed agent. Injected because the adapter
 * holds the SDK handle and this module does not, and every agent create in the
 * app is one SDK write.
 */
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
  // The installed agent is a NEW identity: its routines never keep the
  // package's ids (see remintRoutineIds).
  const { pkg, routineIds } = remintRoutineIds(
    filterPackage(parkedUpload(req.packageId), toWireSelection(req.selection)),
    () => crypto.randomUUID(),
  );
  const agent = await createAgent(
    req.agentName,
    // The request carries whatever the source agent stored — a palette id, or
    // one of the palette's hexes for an agent that predates ids. Canonicalize
    // to the id the picker and the assistant both speak; the rendered color is
    // the same either way.
    req.agentColor ? agentColorId(req.agentColor) : undefined,
    { ...packageSeed(pkg), config: req.config },
  );
  dropUpload(req.packageId);
  return {
    agentPath: agent.id, // in control-plane mode the agent id IS the path key
    agentName: agent.name,
    workspaceName: req.workspaceName,
    requiredIntegrations: [],
    routineIds,
    agent,
  };
}
