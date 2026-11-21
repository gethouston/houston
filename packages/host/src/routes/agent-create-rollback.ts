import type { Agent } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

export async function seedOrRollBack(
  deps: { store: WorkspaceStore; vfs: Vfs },
  agent: Agent,
  root: string,
  seed: () => Promise<void>,
): Promise<void> {
  try {
    await seed();
  } catch (err) {
    try {
      await deps.store.deleteAgent(agent.id);
      await deps.vfs.deletePrefix(root);
    } catch (rollbackErr) {
      console.error(
        `[agents] seed rollback failed for ${agent.id}:`,
        rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
      );
    }
    throw err;
  }
}
