import { loadScopedBridge, retireBridge } from "./retirement";
import type { LocalModelBridgePorts } from "./types";

export async function cancelPreparedBridge(ports: LocalModelBridgePorts) {
  try {
    const journal = await loadScopedBridge(ports);
    if (journal && journal.phase !== "committed")
      await retireBridge(ports, journal);
  } catch (error) {
    ports.report(error);
  }
}
