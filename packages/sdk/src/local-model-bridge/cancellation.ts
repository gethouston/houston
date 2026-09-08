import { savedBridge } from "./connection";
import type { LocalModelBridgePorts } from "./types";

export async function cancelPreparedBridge(ports: LocalModelBridgePorts) {
  const journal = await savedBridge(ports);
  if (!journal || journal.phase === "committed") return;
  if (journal.descriptor)
    await ports.management.revoke(journal.descriptor.bridgeId);
  await ports.storage.clear(ports.management.identity);
}
