import { seedSchemas } from "@houston/domain";
import type { Agent } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { seedOrRollBack } from "./agent-create-rollback";
import { type AgentSeed, writeAgentSeeds } from "./agent-seed";

export async function seedAgentTree(
  deps: { store: WorkspaceStore; vfs: Vfs },
  agent: Agent,
  root: string,
  seed: AgentSeed,
  routineCreatedBy?: string,
): Promise<void> {
  await seedOrRollBack(deps, agent, root, async () => {
    await seedSchemas(deps.vfs, root);
    await writeAgentSeeds(deps.vfs, root, seed, routineCreatedBy);
  });
}
